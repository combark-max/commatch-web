-- Enforce current required consent and member restriction state at the database
-- boundary for ordinary member-service RPCs and direct REST reads.
--
-- Apply after user-consents.sql, member-service-write-guards.sql,
-- received-likes-premium-migration.sql, message-moderation.sql, and
-- member-candidate-admin-exclusion.sql.

begin;

do $preflight$
declare
  v_signature text;
begin
  if pg_catalog.to_regclass('public.user_consent_events') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.preferences') is null
     or pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null then
    raise exception 'Required member service tables are missing';
  end if;

  foreach v_signature in array array[
    'public.get_my_member_access()',
    'public.lock_member_service_write(uuid)',
    'public.is_member_service_allowed()',
    'public.is_member_profile_visible(uuid)',
    'public.get_visible_member_summaries()',
    'public.get_visible_member_detail(uuid)',
    'public.get_ai_match_candidates()',
    'public.get_my_favorite_members()',
    'public.get_my_favorite_members_with_likes()',
    'public.get_my_matches()',
    'public.get_my_match_summary()',
    'public.get_match_messages(uuid)'
  ]::text[] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Required function % is missing', v_signature;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass,
      'public.favorites'::pg_catalog.regclass,
      'public.likes'::pg_catalog.regclass,
      'public.matches'::pg_catalog.regclass,
      'public.messages'::pg_catalog.regclass
    )
      and not relation_info.relrowsecurity
  ) then
    raise exception 'Every protected member REST table must have RLS enabled';
  end if;

  if exists (
    select protected_table.table_oid
    from (values
      ('public.profiles'::pg_catalog.regclass),
      ('public.preferences'::pg_catalog.regclass),
      ('public.favorites'::pg_catalog.regclass),
      ('public.likes'::pg_catalog.regclass),
      ('public.matches'::pg_catalog.regclass),
      ('public.messages'::pg_catalog.regclass)
    ) as protected_table(table_oid)
    where not exists (
      select 1
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid = protected_table.table_oid
        and policy_info.polcmd = 'r'
    )
  ) then
    raise exception 'A protected member REST table has no SELECT policy';
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated', 'public.messages', 'content', 'SELECT'
     ) then
    raise exception 'messages.content must be blocked before installing member access guards';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.likes', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.likes', 'DELETE') then
    raise exception 'Direct authenticated likes INSERT/DELETE must remain blocked';
  end if;
end
$preflight$;

-- Snapshot externally visible function contracts before recreating bodies. The
-- postflight check permits only the approved volatility/body changes.
create temporary table _commatch_member_access_function_contract
on commit drop
as
select
  expected.signature,
  pg_catalog.pg_get_function_result(function_info.oid) as result_type,
  function_info.proacl,
  pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name,
  pg_catalog.obj_description(function_info.oid, 'pg_proc') as description
from (values
  ('public.is_member_service_allowed()'),
  ('public.get_visible_member_summaries()'),
  ('public.get_visible_member_detail(uuid)'),
  ('public.get_ai_match_candidates()'),
  ('public.get_my_favorite_members()'),
  ('public.get_my_favorite_members_with_likes()'),
  ('public.get_my_matches()'),
  ('public.get_my_match_summary()'),
  ('public.get_match_messages(uuid)')
) as expected(signature)
join pg_catalog.pg_proc as function_info
  on function_info.oid = pg_catalog.to_regprocedure(expected.signature);

create or replace function public.has_completed_required_member_consents()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with latest_required_consent as (
    select distinct on (consent_event.consent_type)
      consent_event.consent_type,
      consent_event.action,
      consent_event.document_version
    from public.user_consent_events as consent_event
    where consent_event.user_id = auth.uid()
      and consent_event.consent_type in (
        'terms', 'privacy', 'adult_confirmation'
      )
    order by
      consent_event.consent_type,
      consent_event.created_at desc,
      consent_event.id desc
  )
  select auth.uid() is not null
    and pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      latest_consent.action = 'accepted'
      and case latest_consent.consent_type
        when 'terms' then latest_consent.document_version = 'terms-v1.0'
        when 'privacy' then latest_consent.document_version = 'privacy-v1.0'
        when 'adult_confirmation' then
          latest_consent.document_version = 'adult-confirmation-v1.0'
        else false
      end
    )
  from latest_required_consent as latest_consent
$function$;

comment on function public.has_completed_required_member_consents()
  is 'Returns whether auth.uid() has accepted every current required consent document version';

alter function public.has_completed_required_member_consents() owner to postgres;
revoke all on function public.has_completed_required_member_consents()
  from public, anon, authenticated, service_role;
grant execute on function public.has_completed_required_member_consents()
  to authenticated, service_role;

create or replace function public.is_member_service_allowed()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_is_allowed boolean;
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    return false;
  end if;

  perform public.lock_member_service_write(v_user_id);

  -- Preserve the existing READ COMMITTED restriction check after the blocking
  -- lock so a restriction committed while waiting is observed.
  select member_access.is_allowed
  into v_is_allowed
  from public.get_my_member_access() as member_access;

  if not coalesce(v_is_allowed, false) then
    return false;
  end if;

  return coalesce(
    public.has_completed_required_member_consents(),
    false
  );
end
$function$;

-- Preserve the established object description consumed by existing restriction
-- migrations and tests. The implementation marker lives in prosrc above.
comment on function public.is_member_service_allowed()
  is 'commatch_admin_member_restrictions_v1';
alter function public.is_member_service_allowed() owner to postgres;

create or replace function public.get_visible_member_summaries()
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  region text,
  job text,
  introduction text,
  profile_image text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

  return query
  select
    member_profile.id,
    member_profile.nickname,
    member_profile.birth_date::text,
    member_profile.gender,
    member_profile.region,
    member_profile.job,
    member_profile.introduction,
    member_profile.profile_image
  from public.profiles as member_profile
  where member_profile.id <> v_user_id
    and member_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (
              restriction.suspended_until is null
              or restriction.suspended_until > pg_catalog.now()
            )
          )
        )
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
  order by member_profile.id;
end
$function$;

create or replace function public.get_ai_match_candidates()
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  height integer,
  region text,
  job text,
  education text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  introduction text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  is_priority_recommendation boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

  return query
  select
    candidate_profile.id,
    candidate_profile.nickname,
    candidate_profile.birth_date::text,
    candidate_profile.gender,
    candidate_profile.height,
    candidate_profile.region,
    candidate_profile.job,
    candidate_profile.education,
    candidate_profile.hobby,
    candidate_profile.drinking,
    candidate_profile.smoking,
    candidate_profile.marriage_history,
    candidate_profile.introduction,
    candidate_profile.marriage_values,
    candidate_profile.profile_image,
    candidate_profile.profile_images,
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = candidate_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
        and 'priority_recommendation' = any(membership.feature_keys)
    )
  from public.profiles as candidate_profile
  where candidate_profile.id <> v_user_id
    and candidate_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = candidate_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (
              restriction.suspended_until is null
              or restriction.suspended_until > pg_catalog.now()
            )
          )
        )
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = candidate_profile.id
    )
  order by candidate_profile.id;
end
$function$;

create or replace function public.get_visible_member_detail(p_target_user_id uuid)
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  height integer,
  job text,
  region text,
  introduction text,
  education text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  is_premium_available boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    return;
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

  perform public.lock_member_service_write(p_target_user_id);

  return query
  select
    target_profile.id,
    target_profile.nickname,
    target_profile.birth_date::text,
    target_profile.gender,
    target_profile.height,
    target_profile.job,
    target_profile.region,
    target_profile.introduction,
    target_profile.education,
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_history,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images,
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = target_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
    ) as is_premium_available
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and target_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and public.is_member_profile_visible(target_profile.id)
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = target_profile.id
        and restriction.account_status = 'suspended'
        and (
          restriction.suspended_until is null
          or restriction.suspended_until > pg_catalog.now()
        )
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = target_profile.id
    );
end
$function$;

create or replace function public.get_my_favorite_members()
returns table (
  favorite_id uuid,
  favorited_at timestamptz,
  member_id uuid,
  nickname text,
  age integer,
  profile_image_url text,
  region text,
  job text,
  is_mutual boolean,
  match_id uuid,
  match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    favorite_row.id,
    favorite_row.created_at,
    target_profile.id,
    target_profile.nickname,
    case
      when target_profile.birth_date is null then null::integer
      else pg_catalog.date_part(
        'year',
        pg_catalog.age(current_date, target_profile.birth_date)
      )::integer
    end,
    coalesce(
      nullif(pg_catalog.btrim(target_profile.profile_image), ''),
      fallback_image.path
    ),
    target_profile.region,
    target_profile.job,
    exists (
      select 1
      from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = target_profile.id
        and reciprocal_favorite.favorite_user_id = v_user_id
    ),
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.favorites as favorite_row
  join public.profiles as target_profile
    on target_profile.id = favorite_row.favorite_user_id
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(target_profile.profile_images)
      with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (
      match_row.user_1_id = v_user_id
      and match_row.user_2_id = target_profile.id
    ) or (
      match_row.user_1_id = target_profile.id
      and match_row.user_2_id = v_user_id
    )
    order by
      (match_row.status = 'active') desc,
      match_row.matched_at desc,
      match_row.id
    limit 1
  ) as existing_match on true
  where favorite_row.user_id = v_user_id
  order by favorite_row.created_at desc, favorite_row.id;
end
$function$;

create or replace function public.get_my_favorite_members_with_likes()
returns table (
  favorite_id uuid,
  favorited_at timestamptz,
  member_id uuid,
  nickname text,
  age integer,
  profile_image_url text,
  region text,
  job text,
  is_mutual boolean,
  has_liked boolean,
  liked_by_member boolean,
  match_id uuid,
  match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    favorite_row.id,
    favorite_row.created_at,
    target_profile.id,
    target_profile.nickname,
    case when target_profile.birth_date is null then null::integer
      else pg_catalog.date_part(
        'year', pg_catalog.age(current_date, target_profile.birth_date)
      )::integer end,
    coalesce(
      nullif(pg_catalog.btrim(target_profile.profile_image), ''),
      fallback_image.path
    ),
    target_profile.region,
    target_profile.job,
    exists (
      select 1 from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = target_profile.id
        and reciprocal_favorite.favorite_user_id = v_user_id
    ),
    exists (
      select 1 from public.likes as sent_like
      where sent_like.user_id = v_user_id
        and sent_like.liked_user_id = target_profile.id
    ),
    false,
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.favorites as favorite_row
  join public.profiles as target_profile
    on target_profile.id = favorite_row.favorite_user_id
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(target_profile.profile_images)
      with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (match_row.user_1_id = v_user_id
      and match_row.user_2_id = target_profile.id)
       or (match_row.user_1_id = target_profile.id
      and match_row.user_2_id = v_user_id)
    order by
      (match_row.status = 'active') desc,
      match_row.matched_at desc,
      match_row.id
    limit 1
  ) as existing_match on true
  where favorite_row.user_id = v_user_id
    and public.is_member_profile_visible(target_profile.id)
  order by favorite_row.created_at desc, favorite_row.id;
end
$function$;

create or replace function public.get_my_matches()
returns table (
  match_id uuid,
  match_status text,
  matched_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  other_user_id uuid,
  other_nickname text,
  other_birth_date date,
  other_profile_image text,
  other_region text,
  other_job text,
  latest_message_content text,
  latest_message_at timestamptz,
  latest_message_sender_id uuid,
  unread_count bigint
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    match_row.id,
    match_row.status,
    match_row.matched_at,
    match_row.ended_at,
    match_row.last_message_at,
    other_profile.id,
    other_profile.nickname,
    other_profile.birth_date,
    coalesce(
      nullif(pg_catalog.btrim(other_profile.profile_image), ''),
      fallback_image.path
    ),
    other_profile.region,
    other_profile.job,
    latest_message.content,
    latest_message.created_at,
    latest_message.sender_id,
    coalesce(unread_messages.unread_count, 0::bigint)
  from public.matches as match_row
  join public.profiles as other_profile
    on other_profile.id = case
      when match_row.user_1_id = v_user_id then match_row.user_2_id
      else match_row.user_1_id
    end
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(other_profile.profile_images)
      with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select
      case
        when message_row.moderation_visibility = 'hidden'
          then '관리자에 의해 비노출된 메시지입니다.'::text
        else message_row.content
      end as content,
      message_row.created_at,
      message_row.sender_id
    from public.messages as message_row
    where message_row.match_id = match_row.id
    order by message_row.created_at desc, message_row.id desc
    limit 1
  ) as latest_message on true
  left join lateral (
    select pg_catalog.count(*)::bigint as unread_count
    from public.messages as unread_message
    where unread_message.match_id = match_row.id
      and unread_message.sender_id <> v_user_id
      and unread_message.read_at is null
  ) as unread_messages on true
  where match_row.user_1_id = v_user_id
     or match_row.user_2_id = v_user_id
  order by
    (match_row.status = 'active') desc,
    coalesce(match_row.last_message_at, match_row.matched_at) desc,
    match_row.id;
end
$function$;

create or replace function public.get_my_match_summary()
returns table (
  total_unread_count bigint,
  active_match_count bigint,
  total_match_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    coalesce((
      select pg_catalog.count(*)::bigint
      from public.messages as message_row
      join public.matches as message_match
        on message_match.id = message_row.match_id
      where (
        message_match.user_1_id = v_user_id
        or message_match.user_2_id = v_user_id
      )
        and message_row.sender_id <> v_user_id
        and message_row.read_at is null
    ), 0::bigint),
    pg_catalog.count(*) filter (where match_row.status = 'active')::bigint,
    pg_catalog.count(*)::bigint
  from public.matches as match_row
  where match_row.user_1_id = v_user_id
     or match_row.user_2_id = v_user_id;
end
$function$;

create or replace function public.get_match_messages(p_match_id uuid)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  content text,
  moderation_visibility text,
  message_type text,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  -- commatch_member_service_consent_access_guards_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if p_match_id is null then
    raise exception using errcode = '22023', message = 'Match ID is required';
  end if;
  if not exists (
    select 1
    from public.matches as match_row
    where match_row.id = p_match_id
      and (
        match_row.user_1_id = v_user_id
        or match_row.user_2_id = v_user_id
      )
  ) then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  return query
  select
    message_row.id,
    message_row.match_id,
    message_row.sender_id,
    case
      when message_row.moderation_visibility = 'hidden'
        then '관리자에 의해 비노출된 메시지입니다.'::text
      else message_row.content
    end,
    message_row.moderation_visibility,
    message_row.message_type,
    message_row.read_at,
    message_row.created_at
  from public.messages as message_row
  where message_row.match_id = p_match_id
  order by message_row.created_at, message_row.id;
end
$function$;

-- CREATE OR REPLACE preserves the established owners, comments, and ACLs. Make
-- the ownership requirement explicit without changing grants.
alter function public.get_visible_member_summaries() owner to postgres;
alter function public.get_visible_member_detail(uuid) owner to postgres;
alter function public.get_ai_match_candidates() owner to postgres;
alter function public.get_my_favorite_members() owner to postgres;
alter function public.get_my_favorite_members_with_likes() owner to postgres;
alter function public.get_my_matches() owner to postgres;
alter function public.get_my_match_summary() owner to postgres;
alter function public.get_match_messages(uuid) owner to postgres;

-- Preserve every existing SELECT policy's role, permissive/restrictive mode,
-- and ownership/participant predicate. Only append the common member gate.
do $select_policies$
declare
  v_authenticated_oid oid;
  v_policy record;
  v_using_expression text;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  for v_policy in
    select
      namespace_info.nspname as schema_name,
      relation_info.relname as table_name,
      policy_info.polname as policy_name,
      policy_info.polrelid,
      policy_info.polqual
    from pg_catalog.pg_policy as policy_info
    join pg_catalog.pg_class as relation_info
      on relation_info.oid = policy_info.polrelid
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = relation_info.relnamespace
    where policy_info.polrelid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass,
      'public.favorites'::pg_catalog.regclass,
      'public.likes'::pg_catalog.regclass,
      'public.matches'::pg_catalog.regclass,
      'public.messages'::pg_catalog.regclass
    )
      and policy_info.polcmd = 'r'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
    order by namespace_info.nspname, relation_info.relname, policy_info.polname
  loop
    v_using_expression := case
      when v_policy.polqual is null then 'true'
      else pg_catalog.pg_get_expr(v_policy.polqual, v_policy.polrelid)
    end;

    if pg_catalog.strpos(
         pg_catalog.lower(v_using_expression),
         'is_member_service_allowed'
       ) = 0 then
      execute pg_catalog.format(
        'alter policy %I on %I.%I using ((%s) and (select public.is_member_service_allowed()))',
        v_policy.policy_name,
        v_policy.schema_name,
        v_policy.table_name,
        v_using_expression
      );
    end if;
  end loop;
end
$select_policies$;

do $post_installation_validation$
declare
  v_authenticated_oid oid;
  v_signature text;
  v_function record;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  select
    function_info.prosecdef,
    function_info.provolatile,
    function_info.proconfig
  into v_function
  from pg_catalog.pg_proc as function_info
  where function_info.oid =
    'public.has_completed_required_member_consents()'::pg_catalog.regprocedure;

  if not v_function.prosecdef
     or v_function.provolatile <> 's'
     or v_function.proconfig is distinct from array['search_path=""']::text[]
     or pg_catalog.has_function_privilege(
       'public', 'public.has_completed_required_member_consents()', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.has_completed_required_member_consents()', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.has_completed_required_member_consents()', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.has_completed_required_member_consents()', 'EXECUTE'
     ) then
    raise exception 'Required consent helper security contract is incompatible';
  end if;

  foreach v_signature in array array[
    'public.is_member_service_allowed()',
    'public.get_visible_member_summaries()',
    'public.get_visible_member_detail(uuid)',
    'public.get_ai_match_candidates()',
    'public.get_my_favorite_members()',
    'public.get_my_favorite_members_with_likes()',
    'public.get_my_matches()',
    'public.get_my_match_summary()',
    'public.get_match_messages(uuid)'
  ]::text[] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      where function_info.oid = pg_catalog.to_regprocedure(v_signature)
        and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
        and function_info.prosecdef
        and function_info.provolatile = 'v'
        and function_info.proconfig is not distinct from
          array['search_path=""']::text[]
        and pg_catalog.strpos(
          function_info.prosrc,
          'commatch_member_service_consent_access_guards_v1'
        ) > 0
    ) then
      raise exception 'Guarded function % has an incompatible contract', v_signature;
    end if;
  end loop;

  if exists (
    select 1
    from pg_temp._commatch_member_access_function_contract as baseline
    join pg_catalog.pg_proc as function_info
      on function_info.oid = pg_catalog.to_regprocedure(baseline.signature)
    where pg_catalog.pg_get_function_result(function_info.oid)
          is distinct from baseline.result_type
       or function_info.proacl is distinct from baseline.proacl
       or pg_catalog.pg_get_userbyid(function_info.proowner)
          is distinct from baseline.owner_name
       or pg_catalog.obj_description(function_info.oid, 'pg_proc')
          is distinct from baseline.description
  ) then
    raise exception 'A guarded function result, ACL, owner, or description changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass,
      'public.favorites'::pg_catalog.regclass,
      'public.likes'::pg_catalog.regclass,
      'public.matches'::pg_catalog.regclass,
      'public.messages'::pg_catalog.regclass
    )
      and policy_info.polcmd = 'r'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
      and (
        policy_info.polqual is null
        or pg_catalog.strpos(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)
          ),
          'is_member_service_allowed'
        ) = 0
      )
  ) then
    raise exception 'A protected member SELECT policy is missing the common gate';
  end if;

  if pg_catalog.has_column_privilege(
       'authenticated', 'public.messages', 'content', 'SELECT'
     ) then
    raise exception 'authenticated regained messages.content SELECT';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.likes', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.likes', 'DELETE') then
    raise exception 'authenticated likes INSERT/DELETE privilege changed';
  end if;
end
$post_installation_validation$;

commit;
