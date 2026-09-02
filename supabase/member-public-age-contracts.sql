begin;

create temporary table pg_temp.commatch_member_public_age_functions (
  function_name text primary key,
  identity_arguments text not null,
  old_result text not null,
  new_result text not null,
  object_comment text not null,
  service_role_execute boolean not null,
  parallel_mode "char" not null default 'u'
) on commit drop;

insert into pg_temp.commatch_member_public_age_functions (
  function_name,
  identity_arguments,
  old_result,
  new_result,
  object_comment,
  service_role_execute,
  parallel_mode
)
values
  (
    'get_visible_member_summaries',
    '',
    'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)',
    'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)',
    'commatch_member_candidate_admin_exclusion_v1',
    true,
    'u'
  ),
  (
    'search_members_advanced',
    'p_height_min integer, p_height_max integer, p_education text, p_drinking text, p_hobby text',
    'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)',
    'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)',
    'commatch_member_candidate_admin_exclusion_v1',
    true,
    'u'
  ),
  (
    'get_visible_member_detail',
    'p_target_user_id uuid',
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)',
    'TABLE(id uuid, nickname text, age integer, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)',
    'commatch_member_candidate_admin_exclusion_v1',
    true,
    'u'
  ),
  (
    'get_ai_match_candidates',
    '',
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)',
    'TABLE(id uuid, nickname text, age integer, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)',
    'commatch_member_candidate_admin_exclusion_v1',
    true,
    'u'
  ),
  (
    'get_received_favorites',
    '',
    'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)',
    'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, age integer, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)',
    'Returns received favorites for auth.uid() with member service and Premium feature access',
    true,
    'u'
  ),
  (
    'get_received_likes',
    '',
    'TABLE(like_id uuid, sender_user_id uuid, liked_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], has_liked boolean, is_mutual_like boolean, match_id uuid, match_status text, matched_at timestamp with time zone)',
    'TABLE(like_id uuid, sender_user_id uuid, liked_at timestamp with time zone, nickname text, age integer, region text, job text, profile_image text, profile_images text[], has_liked boolean, is_mutual_like boolean, match_id uuid, match_status text, matched_at timestamp with time zone)',
    'Returns Premium received likes for auth.uid() while enforcing member access and sender availability',
    false,
    'u'
  ),
  (
    'get_my_matches',
    '',
    'TABLE(match_id uuid, match_status text, matched_at timestamp with time zone, ended_at timestamp with time zone, last_message_at timestamp with time zone, other_user_id uuid, other_nickname text, other_birth_date date, other_profile_image text, other_region text, other_job text, latest_message_content text, latest_message_at timestamp with time zone, latest_message_sender_id uuid, unread_count bigint)',
    'TABLE(match_id uuid, match_status text, matched_at timestamp with time zone, ended_at timestamp with time zone, last_message_at timestamp with time zone, other_user_id uuid, other_nickname text, other_age integer, other_profile_image text, other_region text, other_job text, latest_message_content text, latest_message_at timestamp with time zone, latest_message_sender_id uuid, unread_count bigint)',
    'commatch_message_moderation_v1',
    true,
    'u'
  );

do $preflight$
declare
  expected record;
  function_oid oid;
  unexpected_dependency text;
  direct_execute_roles text[];
begin
  for expected in select * from pg_temp.commatch_member_public_age_functions loop
    select procedure_row.oid
    into function_oid
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = expected.function_name
      and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) = expected.identity_arguments;

    if function_oid is null then
      raise exception 'Preflight failed: public.%(%) does not exist',
        expected.function_name, expected.identity_arguments;
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as procedure_row
      join pg_catalog.pg_namespace as namespace_row
        on namespace_row.oid = procedure_row.pronamespace
      where namespace_row.nspname = 'public'
        and procedure_row.proname = expected.function_name
    ) <> 1 then
      raise exception 'Preflight failed: unexpected overload for public.%', expected.function_name;
    end if;

    if pg_catalog.pg_get_function_result(function_oid) <> expected.old_result then
      raise exception 'Preflight failed: unexpected return contract for public.%: %',
        expected.function_name, pg_catalog.pg_get_function_result(function_oid);
    end if;

    if (
      select language_row.lanname <> 'plpgsql'
        or not procedure_row.prosecdef
        or procedure_row.provolatile <> 'v'
        or procedure_row.proparallel <> expected.parallel_mode
        or procedure_row.pronargdefaults <> case
          when expected.function_name = 'search_members_advanced' then 5 else 0
        end
        or procedure_row.proowner <> 'postgres'::regrole
        or procedure_row.proconfig is distinct from array['search_path=""']::text[]
      from pg_catalog.pg_proc as procedure_row
      join pg_catalog.pg_language as language_row on language_row.oid = procedure_row.prolang
      where procedure_row.oid = function_oid
    ) then
      raise exception 'Preflight failed: metadata drift for public.%', expected.function_name;
    end if;

    if pg_catalog.obj_description(function_oid, 'pg_proc') is distinct from expected.object_comment then
      raise exception 'Preflight failed: comment drift for public.%', expected.function_name;
    end if;

    select pg_catalog.array_agg(role_row.rolname order by role_row.rolname)
    into direct_execute_roles
    from pg_catalog.aclexplode(coalesce(
      (select procedure_row.proacl from pg_catalog.pg_proc as procedure_row where procedure_row.oid = function_oid),
      pg_catalog.acldefault('f', 'postgres'::regrole)
    )) as privilege_row
    join pg_catalog.pg_roles as role_row on role_row.oid = privilege_row.grantee
    where privilege_row.privilege_type = 'EXECUTE'
      and privilege_row.grantee <> 'postgres'::regrole;

    if direct_execute_roles is distinct from (
      case
        when expected.service_role_execute then array['authenticated', 'service_role']::text[]
        else array['authenticated']::text[]
      end
    ) then
      raise exception 'Preflight failed: ACL drift for public.%: %',
        expected.function_name, direct_execute_roles;
    end if;

    if exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select procedure_row.proacl from pg_catalog.pg_proc as procedure_row where procedure_row.oid = function_oid),
        pg_catalog.acldefault('f', 'postgres'::regrole)
      )) as privilege_row
      where privilege_row.privilege_type = 'EXECUTE'
        and privilege_row.grantee = 0
    ) then
      raise exception 'Preflight failed: PUBLIC can execute public.%', expected.function_name;
    end if;

    select pg_catalog.pg_describe_object(dependency_row.classid, dependency_row.objid, dependency_row.objsubid)
    into unexpected_dependency
    from pg_catalog.pg_depend as dependency_row
    where dependency_row.refclassid = 'pg_proc'::regclass
      and dependency_row.refobjid = function_oid
      and dependency_row.deptype in ('n', 'a')
    limit 1;

    if unexpected_dependency is not null then
      raise exception 'Preflight failed: public.% has dependency %',
        expected.function_name, unexpected_dependency;
    end if;
  end loop;
end
$preflight$;

drop function public.get_visible_member_summaries();
drop function public.search_members_advanced(integer, integer, text, text, text);
drop function public.get_visible_member_detail(uuid);
drop function public.get_ai_match_candidates();
drop function public.get_received_favorites();
drop function public.get_received_likes();
drop function public.get_my_matches();

create function public.get_visible_member_summaries()
returns table (
  id uuid,
  nickname text,
  age integer,
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
    case
      when member_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, member_profile.birth_date))::integer
    end,
    member_profile.gender,
    member_profile.region,
    member_profile.job,
    member_profile.introduction,
    member_profile.profile_image
  from public.profiles as member_profile
  where member_profile.id <> v_user_id
    and member_profile.gender = case v_gender when '남성' then '여성' when '여성' then '남성' end
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
          )
        )
    )
    and not exists (
      select 1 from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
  order by member_profile.id;
end
$function$;

create function public.search_members_advanced(
  p_height_min integer default null,
  p_height_max integer default null,
  p_education text default null,
  p_drinking text default null,
  p_hobby text default null
)
returns table (
  id uuid,
  nickname text,
  age integer,
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
  v_education text := nullif(pg_catalog.btrim(p_education), '');
  v_drinking text := nullif(pg_catalog.btrim(p_drinking), '');
  v_hobby text := nullif(pg_catalog.btrim(p_hobby), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if not coalesce(public.has_premium_feature('advanced_member_search'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  if p_height_min is not null and p_height_min < 0
     or p_height_max is not null and p_height_max < 0
     or p_height_min is not null and p_height_max is not null and p_height_min > p_height_max
     or v_education is not null
       and v_education <> all (array['고졸', '전문대졸', '대졸', '석사', '박사']::text[])
     or v_drinking is not null
       and v_drinking <> all (array['전혀 안 함', '가끔 함', '자주 함']::text[]) then
    raise exception using errcode = '22023', message = 'Invalid advanced search filters';
  end if;

  select viewer_profile.gender into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  return query
  select
    member_profile.id,
    member_profile.nickname,
    case
      when member_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, member_profile.birth_date))::integer
    end,
    member_profile.gender,
    member_profile.region,
    member_profile.job,
    member_profile.introduction,
    member_profile.profile_image
  from public.profiles as member_profile
  where member_profile.id <> v_user_id
    and member_profile.gender = case when v_gender = '남성' then '여성' else '남성' end
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and restriction.profile_visibility = 'hidden'
    )
    and not exists (
      select 1 from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
    and (p_height_min is null or member_profile.height >= p_height_min)
    and (p_height_max is null or member_profile.height <= p_height_max)
    and (v_education is null or member_profile.education = v_education)
    and (v_drinking is null or member_profile.drinking = v_drinking)
    and (
      v_hobby is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(member_profile.hobby, '')),
        pg_catalog.lower(v_hobby)
      ) > 0
    );
end
$function$;

create function public.get_visible_member_detail(p_target_user_id uuid)
returns table (
  id uuid,
  nickname text,
  age integer,
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

  if p_target_user_id is null or p_target_user_id = v_user_id then return; end if;

  select viewer_profile.gender into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then return; end if;

  perform public.lock_member_service_write(p_target_user_id);

  return query
  select
    target_profile.id,
    target_profile.nickname,
    case
      when target_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, target_profile.birth_date))::integer
    end,
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
      select 1 from public.premium_memberships as membership
      where membership.user_id = target_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (membership.expires_at is null or membership.expires_at > pg_catalog.now())
    ) as is_premium_available
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and target_profile.gender = case v_gender when '남성' then '여성' when '여성' then '남성' end
    and public.is_member_profile_visible(target_profile.id)
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = target_profile.id
        and restriction.account_status = 'suspended'
        and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
    )
    and not exists (
      select 1 from public.admin_accounts as admin_account
      where admin_account.user_id = target_profile.id
    );
end
$function$;

create function public.get_ai_match_candidates()
returns table (
  id uuid,
  nickname text,
  age integer,
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

  select viewer_profile.gender into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then return; end if;

  return query
  select
    candidate_profile.id,
    candidate_profile.nickname,
    case
      when candidate_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, candidate_profile.birth_date))::integer
    end,
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
      select 1 from public.premium_memberships as membership
      where membership.user_id = candidate_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (membership.expires_at is null or membership.expires_at > pg_catalog.now())
        and 'priority_recommendation' = any(membership.feature_keys)
    )
  from public.profiles as candidate_profile
  where candidate_profile.id <> v_user_id
    and candidate_profile.gender = case v_gender when '남성' then '여성' when '여성' then '남성' end
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = candidate_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
          )
        )
    )
    and not exists (
      select 1 from public.admin_accounts as admin_account
      where admin_account.user_id = candidate_profile.id
    )
  order by candidate_profile.id;
end
$function$;

create function public.get_received_favorites()
returns table (
  favorite_id uuid,
  sender_user_id uuid,
  created_at timestamptz,
  nickname text,
  age integer,
  region text,
  job text,
  profile_image text,
  profile_images text[],
  is_mutual boolean,
  match_id uuid,
  match_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if not coalesce(public.has_premium_feature('likes_received'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_favorite.id,
    received_favorite.user_id,
    received_favorite.created_at,
    sender_profile.nickname,
    case
      when sender_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, sender_profile.birth_date))::integer
    end,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    exists (
      select 1 from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = v_user_id
        and reciprocal_favorite.favorite_user_id = received_favorite.user_id
    ),
    existing_match.id,
    existing_match.status
  from public.favorites as received_favorite
  join public.profiles as sender_profile on sender_profile.id = received_favorite.user_id
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (
      match_row.user_1_id = received_favorite.user_id and match_row.user_2_id = v_user_id
    ) or (
      match_row.user_1_id = v_user_id and match_row.user_2_id = received_favorite.user_id
    )
    order by (match_row.status = 'active') desc, match_row.matched_at desc, match_row.id
    limit 1
  ) as existing_match on true
  where received_favorite.favorite_user_id = v_user_id
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = received_favorite.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by received_favorite.created_at desc, received_favorite.id;
end
$function$;

create function public.get_received_likes()
returns table (
  like_id uuid,
  sender_user_id uuid,
  liked_at timestamptz,
  nickname text,
  age integer,
  region text,
  job text,
  profile_image text,
  profile_images text[],
  has_liked boolean,
  is_mutual_like boolean,
  match_id uuid,
  match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if not coalesce(public.has_premium_feature('received_likes'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_like.id,
    sender_profile.id,
    received_like.created_at,
    sender_profile.nickname,
    case
      when sender_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, sender_profile.birth_date))::integer
    end,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    sent_like.has_liked,
    sent_like.has_liked,
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.likes as received_like
  join public.profiles as sender_profile on sender_profile.id = received_like.user_id
  left join lateral (
    select exists (
      select 1 from public.likes as my_like
      where my_like.user_id = v_user_id
        and my_like.liked_user_id = received_like.user_id
    ) as has_liked
  ) as sent_like on true
  left join public.matches as existing_match
    on existing_match.user_1_id = least(v_user_id, received_like.user_id)
   and existing_match.user_2_id = greatest(v_user_id, received_like.user_id)
  where received_like.liked_user_id = v_user_id
    and public.is_member_profile_visible(sender_profile.id)
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = sender_profile.id
        and restriction.account_status <> 'active'
        and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
    )
  order by received_like.created_at desc, received_like.id desc;
end
$function$;

create function public.get_my_matches()
returns table (
  match_id uuid,
  match_status text,
  matched_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  other_user_id uuid,
  other_nickname text,
  other_age integer,
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
declare v_user_id uuid := auth.uid();
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
    case
      when other_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, other_profile.birth_date))::integer
    end,
    coalesce(nullif(pg_catalog.btrim(other_profile.profile_image), ''), fallback_image.path),
    other_profile.region,
    other_profile.job,
    latest_message.content,
    latest_message.created_at,
    latest_message.sender_id,
    coalesce(unread_messages.unread_count, 0::bigint)
  from public.matches as match_row
  join public.profiles as other_profile
    on other_profile.id = case
      when match_row.user_1_id = v_user_id then match_row.user_2_id else match_row.user_1_id
    end
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(other_profile.profile_images) with ordinality as image_value(path, position)
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
  where match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id
  order by
    (match_row.status = 'active') desc,
    coalesce(match_row.last_message_at, match_row.matched_at) desc,
    match_row.id;
end
$function$;

alter function public.get_visible_member_summaries() owner to postgres;
alter function public.search_members_advanced(integer, integer, text, text, text) owner to postgres;
alter function public.get_visible_member_detail(uuid) owner to postgres;
alter function public.get_ai_match_candidates() owner to postgres;
alter function public.get_received_favorites() owner to postgres;
alter function public.get_received_likes() owner to postgres;
alter function public.get_my_matches() owner to postgres;

revoke all on function public.get_visible_member_summaries() from public, anon, authenticated, service_role;
revoke all on function public.search_members_advanced(integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_visible_member_detail(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_ai_match_candidates() from public, anon, authenticated, service_role;
revoke all on function public.get_received_favorites() from public, anon, authenticated, service_role;
revoke all on function public.get_received_likes() from public, anon, authenticated, service_role;
revoke all on function public.get_my_matches() from public, anon, authenticated, service_role;

grant execute on function public.get_visible_member_summaries() to authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text) to authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid) to authenticated, service_role;
grant execute on function public.get_ai_match_candidates() to authenticated, service_role;
grant execute on function public.get_received_favorites() to authenticated, service_role;
grant execute on function public.get_received_likes() to authenticated;
grant execute on function public.get_my_matches() to authenticated, service_role;

comment on function public.get_visible_member_summaries() is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.search_members_advanced(integer, integer, text, text, text) is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.get_visible_member_detail(uuid) is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.get_ai_match_candidates() is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.get_received_favorites()
  is 'Returns received favorites for auth.uid() with member service and Premium feature access';
comment on function public.get_received_likes()
  is 'Returns Premium received likes for auth.uid() while enforcing member access and sender availability';
comment on function public.get_my_matches() is 'commatch_message_moderation_v1';

do $postflight$
declare
  expected record;
  function_oid oid;
  direct_execute_roles text[];
begin
  for expected in select * from pg_temp.commatch_member_public_age_functions loop
    select procedure_row.oid into function_oid
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = expected.function_name
      and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) = expected.identity_arguments;

    if function_oid is null or pg_catalog.pg_get_function_result(function_oid) <> expected.new_result then
      raise exception 'Postflight failed: return contract for public.%', expected.function_name;
    end if;

    if (
      select language_row.lanname <> 'plpgsql'
        or not procedure_row.prosecdef
        or procedure_row.provolatile <> 'v'
        or procedure_row.proparallel <> expected.parallel_mode
        or procedure_row.pronargdefaults <> case
          when expected.function_name = 'search_members_advanced' then 5 else 0
        end
        or procedure_row.proowner <> 'postgres'::regrole
        or procedure_row.proconfig is distinct from array['search_path=""']::text[]
      from pg_catalog.pg_proc as procedure_row
      join pg_catalog.pg_language as language_row on language_row.oid = procedure_row.prolang
      where procedure_row.oid = function_oid
    ) then
      raise exception 'Postflight failed: metadata for public.%', expected.function_name;
    end if;

    if pg_catalog.obj_description(function_oid, 'pg_proc') is distinct from expected.object_comment then
      raise exception 'Postflight failed: comment for public.%', expected.function_name;
    end if;

    select pg_catalog.array_agg(role_row.rolname order by role_row.rolname)
    into direct_execute_roles
    from pg_catalog.aclexplode(coalesce(
      (select procedure_row.proacl from pg_catalog.pg_proc as procedure_row where procedure_row.oid = function_oid),
      pg_catalog.acldefault('f', 'postgres'::regrole)
    )) as privilege_row
    join pg_catalog.pg_roles as role_row on role_row.oid = privilege_row.grantee
    where privilege_row.privilege_type = 'EXECUTE'
      and privilege_row.grantee <> 'postgres'::regrole;

    if direct_execute_roles is distinct from (
      case
        when expected.service_role_execute then array['authenticated', 'service_role']::text[]
        else array['authenticated']::text[]
      end
    ) then
      raise exception 'Postflight failed: ACL for public.%: %', expected.function_name, direct_execute_roles;
    end if;

    if exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select procedure_row.proacl from pg_catalog.pg_proc as procedure_row where procedure_row.oid = function_oid),
        pg_catalog.acldefault('f', 'postgres'::regrole)
      )) as privilege_row
      where privilege_row.privilege_type = 'EXECUTE'
        and privilege_row.grantee = 0
    ) then
      raise exception 'Postflight failed: PUBLIC can execute public.%', expected.function_name;
    end if;
  end loop;
end
$postflight$;

commit;
