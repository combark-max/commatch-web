-- ComMatch member profile visibility enforcement.
--
-- Run after admin-member-restrictions.sql, favorites.sql, matching-chat.sql,
-- premium-feature-access.sql, received-favorites.sql, advanced-member-search.sql,
-- and reports.sql. This script deliberately removes broad direct profile reads
-- only after every replacement RPC and database guard has been installed.

begin;

create temporary table _commatch_profile_visibility_admin_fingerprints (
  function_oid oid,
  expected_signature text,
  identity_arguments text,
  owner_name name,
  prokind "char",
  definition_hash text
) on commit drop;

insert into _commatch_profile_visibility_admin_fingerprints (
  function_oid,
  expected_signature,
  identity_arguments,
  owner_name,
  prokind
)
select
  resolved_function.function_oid,
  expected_function.expected_signature,
  pg_catalog.pg_get_function_identity_arguments(function_info.oid),
  pg_catalog.pg_get_userbyid(function_info.proowner),
  function_info.prokind
from (values
  ('public.get_admin_reports(text,text,integer,integer)'),
  ('public.get_admin_report_detail(uuid)'),
  ('public.get_admin_member_restriction(uuid)'),
  ('public.get_admin_member_restriction_actions(uuid)')
) as expected_function(expected_signature)
cross join lateral (
  select pg_catalog.to_regprocedure(
    expected_function.expected_signature
  )::oid as function_oid
) as resolved_function
left join pg_catalog.pg_proc as function_info
  on function_info.oid = resolved_function.function_oid;

do $admin_function_fingerprint_preflight$
begin
  if (
    select pg_catalog.count(*)
    from _commatch_profile_visibility_admin_fingerprints
  ) <> 4 or (
    select pg_catalog.count(distinct fingerprint.expected_signature)
    from _commatch_profile_visibility_admin_fingerprints as fingerprint
  ) <> 4 or (
    select pg_catalog.count(distinct fingerprint.function_oid)
    from _commatch_profile_visibility_admin_fingerprints as fingerprint
  ) <> 4 or exists (
    select 1
    from _commatch_profile_visibility_admin_fingerprints as fingerprint
    left join pg_catalog.pg_proc as function_info
      on function_info.oid = fingerprint.function_oid
    where fingerprint.function_oid is null
      or function_info.oid is null
      or fingerprint.function_oid is distinct from pg_catalog.to_regprocedure(
        fingerprint.expected_signature
      )::oid
      or fingerprint.prokind is distinct from 'f'::"char"
      or function_info.prokind is distinct from 'f'::"char"
      or fingerprint.owner_name is distinct from 'postgres'::name
      or pg_catalog.pg_get_userbyid(function_info.proowner)
        is distinct from fingerprint.owner_name
      or fingerprint.identity_arguments is null
      or pg_catalog.pg_get_function_identity_arguments(function_info.oid)
        is distinct from fingerprint.identity_arguments
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Required administrator RPC catalog metadata is missing or incompatible';
  end if;
end
$admin_function_fingerprint_preflight$;

-- The preceding statement has already proved that these four OIDs are normal
-- functions. Only now is it safe to ask PostgreSQL to render their definitions.
update _commatch_profile_visibility_admin_fingerprints as fingerprint
set definition_hash = pg_catalog.md5(
  pg_catalog.pg_get_functiondef(fingerprint.function_oid)
);

do $admin_function_fingerprint_capture_validation$
begin
  if (
    select pg_catalog.count(*)
    from _commatch_profile_visibility_admin_fingerprints as fingerprint
    where fingerprint.definition_hash is not null
  ) <> 4 then
    raise exception using
      errcode = 'P0001',
      message = 'Required administrator RPC definitions could not be fingerprinted';
  end if;
end
$admin_function_fingerprint_capture_validation$;

do $preflight$
declare
  v_authenticated_oid oid;
  v_public_oid oid := 0;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if v_authenticated_oid is null then
    raise exception 'Required authenticated role is missing';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd = 'r'
  ) <> 2 then
    raise exception 'public.profiles SELECT policy count differs from the approved baseline';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polname = 'Authenticated users can view all profiles'
      and policy_info.polcmd = 'r'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_authenticated_oid]
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = 'true'
      and policy_info.polwithcheck is null
  ) then
    raise exception 'The broad public.profiles SELECT policy differs from the approved baseline';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polname = 'Users can view their own profile'
      and policy_info.polcmd = 'r'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_public_oid]
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = 'auth.uid=id'
      and policy_info.polwithcheck is null
  ) then
    raise exception 'The self public.profiles SELECT policy differs from the approved baseline';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polname = 'Users can insert own favorites'
      and policy_info.polcmd = 'a'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_authenticated_oid]
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)),
        'is_member_service_allowed'
      ) > 0
  ) then
    raise exception 'The favorites INSERT policy differs from the approved guarded definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.favorites'::pg_catalog.regclass
      and trigger_info.tgname = 'favorites_create_mutual_match'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.handle_mutual_favorite_match()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 5
      and trigger_info.tgenabled = 'O'
  ) then
    raise exception 'The favorites mutual-match trigger differs from the approved definition';
  end if;

  if (
    select pg_catalog.count(*)
    from _commatch_profile_visibility_admin_fingerprints
  ) <> 4 or exists (
    select 1
    from _commatch_profile_visibility_admin_fingerprints as fingerprint
    where fingerprint.function_oid is null
      or fingerprint.definition_hash is null
      or fingerprint.prokind is distinct from 'f'::"char"
      or fingerprint.owner_name is distinct from 'postgres'::name
      or fingerprint.identity_arguments is null
  ) then
    raise exception 'Required administrator RPC definitions are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.lock_member_service_write(uuid)'::pg_catalog.regprocedure
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and not function_info.prosecdef
      and function_info.provolatile = 'v'
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        function_info.oid,
        'EXECUTE'
      )
  ) then
    raise exception 'public.lock_member_service_write(uuid) differs from the approved definition';
  end if;
end
$preflight$;

create or replace function public.is_member_profile_visible(p_user_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_is_visible boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  select coalesce(restriction.profile_visibility = 'visible', true)
  into v_is_visible
  from (select 1) as singleton
  left join public.member_restrictions as restriction
    on restriction.user_id = p_user_id;

  return coalesce(v_is_visible, false);
end
$function$;

comment on function public.is_member_profile_visible(uuid)
  is 'commatch_member_profile_visibility_v1';

create or replace function public.lock_member_service_write_pair(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_first_user_id uuid;
  v_second_user_id uuid;
begin
  if p_first_user_id is null or p_second_user_id is null then
    raise exception using errcode = '22023', message = 'Both member IDs are required';
  end if;

  v_first_user_id := least(p_first_user_id, p_second_user_id);
  v_second_user_id := greatest(p_first_user_id, p_second_user_id);

  perform public.lock_member_service_write(v_first_user_id);
  if v_second_user_id <> v_first_user_id then
    perform public.lock_member_service_write(v_second_user_id);
  end if;
end
$function$;

comment on function public.lock_member_service_write_pair(uuid, uuid)
  is 'commatch_member_profile_visibility_v1';

create or replace function public.guard_favorite_profile_visibility()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_allowed boolean;
begin
  if auth.uid() is null
     or new.user_id is null
     or new.favorite_user_id is null
     or auth.uid() <> new.user_id
     or new.user_id = new.favorite_user_id then
    raise exception using errcode = '42501', message = 'Favorite cannot be created';
  end if;

  perform public.lock_member_service_write_pair(new.user_id, new.favorite_user_id);

  select
    exists (select 1 from public.profiles as profile where profile.id = new.user_id)
    and exists (select 1 from public.profiles as profile where profile.id = new.favorite_user_id)
    and public.is_member_profile_visible(new.user_id)
    and public.is_member_profile_visible(new.favorite_user_id)
  into v_is_allowed;

  if not coalesce(v_is_allowed, false) then
    raise exception using errcode = '42501', message = 'Favorite cannot be created';
  end if;

  return new;
end
$function$;

comment on function public.guard_favorite_profile_visibility()
  is 'commatch_member_profile_visibility_v1';

drop trigger if exists favorites_guard_profile_visibility on public.favorites;
create trigger favorites_guard_profile_visibility
  before insert on public.favorites
  for each row
  execute function public.guard_favorite_profile_visibility();

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
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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
        and restriction.profile_visibility = 'hidden'
    )
  order by member_profile.id;
end
$function$;

comment on function public.get_visible_member_summaries()
  is 'commatch_member_profile_visibility_v1';

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
  religion text,
  hobby text,
  drinking text,
  smoking text,
  marriage_values text,
  profile_image text,
  profile_images text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
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
    target_profile.religion,
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and public.is_member_profile_visible(target_profile.id);
end
$function$;

comment on function public.get_visible_member_detail(uuid)
  is 'commatch_member_profile_visibility_v1';

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
  religion text,
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
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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
    candidate_profile.religion,
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
      from public.premium_feature_access as feature_access
      where feature_access.user_id = candidate_profile.id
        and feature_access.feature_key = 'priority_recommendation'
        and feature_access.is_active
        and feature_access.starts_at <= pg_catalog.now()
        and feature_access.ends_at > pg_catalog.now()
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
        and restriction.profile_visibility = 'hidden'
    )
  order by candidate_profile.id;
end
$function$;

comment on function public.get_ai_match_candidates()
  is 'commatch_member_profile_visibility_v1';

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
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

comment on function public.get_my_favorite_members()
  is 'commatch_member_profile_visibility_v1';

create or replace function public.get_my_match_summary()
returns table (
  total_unread_count bigint,
  active_match_count bigint,
  total_match_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select
    coalesce((
      select pg_catalog.count(*)::bigint
      from public.messages as message_row
      join public.matches as message_match on message_match.id = message_row.match_id
      where (message_match.user_1_id = v_user_id or message_match.user_2_id = v_user_id)
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

comment on function public.get_my_match_summary()
  is 'commatch_member_profile_visibility_v1';

-- Recreate the existing advanced search interface with an explicit visibility
-- predicate because the function must bypass the new self-only profiles RLS.
create or replace function public.search_members_advanced(
  p_height_min integer default null,
  p_height_max integer default null,
  p_education text default null,
  p_religion text default null,
  p_drinking text default null,
  p_hobby text default null
)
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
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
  v_education text := nullif(pg_catalog.btrim(p_education), '');
  v_religion text := nullif(pg_catalog.btrim(p_religion), '');
  v_drinking text := nullif(pg_catalog.btrim(p_drinking), '');
  v_hobby text := nullif(pg_catalog.btrim(p_hobby), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.has_premium_feature('advanced_member_search'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  if p_height_min is not null and p_height_min < 0
     or p_height_max is not null and p_height_max < 0
     or p_height_min is not null and p_height_max is not null and p_height_min > p_height_max
     or v_education is not null
       and v_education <> all (array['고졸', '전문대졸', '대졸', '석사', '박사']::text[])
     or v_religion is not null
       and v_religion <> all (array['무교', '기독교', '천주교', '불교', '기타']::text[])
     or v_drinking is not null
       and v_drinking <> all (array['전혀 안 함', '가끔 함', '자주 함']::text[]) then
    raise exception using errcode = '22023', message = 'Invalid advanced search filters';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

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
    and member_profile.gender = case when v_gender = '남성' then '여성' else '남성' end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and restriction.profile_visibility = 'hidden'
    )
    and (p_height_min is null or member_profile.height >= p_height_min)
    and (p_height_max is null or member_profile.height <= p_height_max)
    and (v_education is null or member_profile.education = v_education)
    and (v_religion is null or member_profile.religion = v_religion)
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

comment on function public.search_members_advanced(integer, integer, text, text, text, text)
  is 'commatch_advanced_member_search_v1';

create or replace function public.get_priority_recommendation_candidate_ids()
returns table (user_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

  return query
  select access_row.user_id
  from public.premium_feature_access as access_row
  join public.profiles as candidate_profile on candidate_profile.id = access_row.user_id
  where access_row.feature_key = 'priority_recommendation'
    and access_row.is_active
    and access_row.starts_at <= pg_catalog.now()
    and access_row.ends_at > pg_catalog.now()
    and access_row.user_id <> v_user_id
    and candidate_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = access_row.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by access_row.user_id;
end
$function$;

comment on function public.get_priority_recommendation_candidate_ids()
  is 'commatch_priority_recommendation_pilot_v1';

create or replace function public.get_received_favorites()
returns table (
  favorite_id uuid,
  sender_user_id uuid,
  created_at timestamptz,
  nickname text,
  birth_date text,
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
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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
    sender_profile.birth_date::text,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    exists (
      select 1
      from public.favorites as reciprocal_favorite
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
      match_row.user_1_id = received_favorite.user_id
      and match_row.user_2_id = v_user_id
    ) or (
      match_row.user_1_id = v_user_id
      and match_row.user_2_id = received_favorite.user_id
    )
    order by
      (match_row.status = 'active') desc,
      match_row.matched_at desc,
      match_row.id
    limit 1
  ) as existing_match on true
  where received_favorite.favorite_user_id = v_user_id
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = received_favorite.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by received_favorite.created_at desc, received_favorite.id;
end
$function$;

comment on function public.get_received_favorites()
  is 'Returns received favorites for auth.uid() with Premium feature access';

create or replace function public.handle_mutual_favorite_match()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_1_id uuid;
  v_user_2_id uuid;
begin
  -- commatch_matching_chat_v1
  if new.user_id is null
     or new.favorite_user_id is null
     or new.user_id = new.favorite_user_id then
    return new;
  end if;

  v_user_1_id := least(new.user_id, new.favorite_user_id);
  v_user_2_id := greatest(new.user_id, new.favorite_user_id);

  perform public.lock_member_service_write_pair(v_user_1_id, v_user_2_id);

  if not public.is_member_profile_visible(v_user_1_id)
     or not public.is_member_profile_visible(v_user_2_id) then
    return new;
  end if;

  -- Serialize the same normalized pair. The subsequent SPI query receives a
  -- current READ COMMITTED snapshot after a concurrent favorite transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_1_id::text || ':' || v_user_2_id::text, 0)
  );

  if exists (
    select 1
    from public.favorites as reciprocal
    where reciprocal.user_id = new.favorite_user_id
      and reciprocal.favorite_user_id = new.user_id
  ) then
    insert into public.matches (user_1_id, user_2_id, status, matched_at)
    values (v_user_1_id, v_user_2_id, 'active', pg_catalog.now())
    on conflict (user_1_id, user_2_id) do nothing;
  end if;

  return new;
end
$function$;

comment on function public.handle_mutual_favorite_match()
  is 'commatch_matching_chat_v1';

-- Block new profile reports for hidden targets without changing existing rows,
-- snapshots, message reports, or administrator read functions.
create or replace function public.guard_profile_report_visibility()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if new.target_type = 'profile'
     and (
       new.target_user_id is null
       or not exists (
         select 1
         from public.profiles as target_profile
         where target_profile.id = new.target_user_id
           and public.is_member_profile_visible(target_profile.id)
       )
     ) then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  return new;
end
$function$;

comment on function public.guard_profile_report_visibility()
  is 'commatch_member_profile_visibility_v1';

drop trigger if exists reports_guard_profile_visibility on public.reports;
create trigger reports_guard_profile_visibility
  before insert on public.reports
  for each row
  execute function public.guard_profile_report_visibility();

alter function public.is_member_profile_visible(uuid) owner to postgres;
alter function public.lock_member_service_write_pair(uuid, uuid) owner to postgres;
alter function public.guard_favorite_profile_visibility() owner to postgres;
alter function public.get_visible_member_summaries() owner to postgres;
alter function public.get_visible_member_detail(uuid) owner to postgres;
alter function public.get_ai_match_candidates() owner to postgres;
alter function public.get_my_favorite_members() owner to postgres;
alter function public.get_my_match_summary() owner to postgres;
alter function public.search_members_advanced(integer, integer, text, text, text, text) owner to postgres;
alter function public.get_priority_recommendation_candidate_ids() owner to postgres;
alter function public.get_received_favorites() owner to postgres;
alter function public.handle_mutual_favorite_match() owner to postgres;
alter function public.guard_profile_report_visibility() owner to postgres;

revoke all on function public.is_member_profile_visible(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_member_service_write_pair(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.guard_favorite_profile_visibility()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_profile_report_visibility()
  from public, anon, authenticated, service_role;
revoke all on function public.handle_mutual_favorite_match()
  from public, anon, authenticated, service_role;
revoke all on function public.get_visible_member_summaries()
  from public, anon, authenticated, service_role;
revoke all on function public.get_visible_member_detail(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_ai_match_candidates()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_favorite_members()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_match_summary()
  from public, anon, authenticated, service_role;
revoke all on function public.search_members_advanced(integer, integer, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_priority_recommendation_candidate_ids()
  from public, anon, authenticated, service_role;
revoke all on function public.get_received_favorites()
  from public, anon, authenticated, service_role;

grant execute on function public.get_visible_member_summaries()
  to authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid)
  to authenticated, service_role;
grant execute on function public.get_ai_match_candidates()
  to authenticated, service_role;
grant execute on function public.get_my_favorite_members()
  to authenticated, service_role;
grant execute on function public.get_my_match_summary()
  to authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text, text)
  to authenticated, service_role;
grant execute on function public.get_priority_recommendation_candidate_ids()
  to authenticated, service_role;
grant execute on function public.get_received_favorites()
  to authenticated, service_role;

-- Remove broad direct reads only after every guarded RPC and trigger exists.
drop policy "Authenticated users can view all profiles" on public.profiles;

do $post_installation_validation$
declare
  v_authenticated_oid oid;
  v_function record;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd = 'r'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polname = 'Users can view their own profile'
      and policy_info.polcmd = 'r'
      and policy_info.polpermissive
      and policy_info.polroles = array[0::oid]
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        '[[:space:]()]',
        '',
        'g'
      ) = 'auth.uid=id'
  ) then
    raise exception 'public.profiles is not protected by the approved self-only SELECT policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.favorites'::pg_catalog.regclass
      and trigger_info.tgname = 'favorites_guard_profile_visibility'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.guard_favorite_profile_visibility()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 7
      and trigger_info.tgenabled = 'O'
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.favorites'::pg_catalog.regclass
      and trigger_info.tgname = 'favorites_create_mutual_match'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.handle_mutual_favorite_match()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 5
      and trigger_info.tgenabled = 'O'
  ) then
    raise exception 'Favorite visibility or mutual-match trigger differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.reports'::pg_catalog.regclass
      and trigger_info.tgname = 'reports_guard_profile_visibility'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.guard_profile_report_visibility()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 7
      and trigger_info.tgenabled = 'O'
  ) then
    raise exception 'Profile report visibility trigger differs from the approved definition';
  end if;

  for v_function in
    with expected_function(
      oid,
      function_kind,
      expected_security_definer,
      expected_volatility,
      expected_return_set,
      expected_return_type
    ) as (
      values
        ('public.is_member_profile_visible(uuid)'::pg_catalog.regprocedure, 'internal', false, 'v'::"char", false, 'pg_catalog.bool'::pg_catalog.regtype),
        ('public.lock_member_service_write_pair(uuid,uuid)'::pg_catalog.regprocedure, 'internal', false, 'v'::"char", false, 'pg_catalog.void'::pg_catalog.regtype),
        ('public.guard_favorite_profile_visibility()'::pg_catalog.regprocedure, 'trigger', true, 'v'::"char", false, 'pg_catalog.trigger'::pg_catalog.regtype),
        ('public.get_visible_member_summaries()'::pg_catalog.regprocedure, 'rpc', true, 's'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure, 'rpc', true, 'v'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.get_ai_match_candidates()'::pg_catalog.regprocedure, 'rpc', true, 's'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.get_my_favorite_members()'::pg_catalog.regprocedure, 'rpc', true, 's'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.get_my_match_summary()'::pg_catalog.regprocedure, 'rpc', true, 's'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.search_members_advanced(integer,integer,text,text,text,text)'::pg_catalog.regprocedure, 'rpc', true, 's'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.get_priority_recommendation_candidate_ids()'::pg_catalog.regprocedure, 'rpc', true, 'v'::"char", true, 'pg_catalog.uuid'::pg_catalog.regtype),
        ('public.get_received_favorites()'::pg_catalog.regprocedure, 'rpc', true, 'v'::"char", true, 'pg_catalog.record'::pg_catalog.regtype),
        ('public.handle_mutual_favorite_match()'::pg_catalog.regprocedure, 'trigger', true, 'v'::"char", false, 'pg_catalog.trigger'::pg_catalog.regtype),
        ('public.guard_profile_report_visibility()'::pg_catalog.regprocedure, 'trigger', true, 'v'::"char", false, 'pg_catalog.trigger'::pg_catalog.regtype)
    )
    select
      function_info.oid,
      function_info.oid::pg_catalog.regprocedure::text as identity,
      function_info.prosecdef,
      function_info.provolatile,
      function_info.proconfig,
      function_info.proretset,
      function_info.prorettype,
      expected_function.function_kind,
      expected_function.expected_security_definer,
      expected_function.expected_volatility,
      expected_function.expected_return_set,
      expected_function.expected_return_type,
      pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name
    from pg_catalog.pg_proc as function_info
    join expected_function on expected_function.oid = function_info.oid
  loop
    if v_function.owner_name <> 'postgres'
       or not exists (
         select 1
         from pg_catalog.unnest(v_function.proconfig) as function_config(setting)
         where function_config.setting = 'search_path=""'
       )
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or v_function.prosecdef <> v_function.expected_security_definer
       or v_function.provolatile <> v_function.expected_volatility
       or v_function.proretset <> v_function.expected_return_set
       or v_function.prorettype <> v_function.expected_return_type then
      raise exception '% metadata or anon ACL differs from the approved definition', v_function.identity;
    end if;

    if v_function.function_kind <> 'rpc' and (
      pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
    ) then
      raise exception '% internal security differs from the approved definition', v_function.identity;
    end if;

    if v_function.function_kind = 'rpc' and (
      not pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
      or not pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
    ) then
      raise exception '% RPC security differs from the approved definition', v_function.identity;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
       'public.get_visible_member_summaries()'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)'
     or pg_catalog.pg_get_function_result(
       'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, religion text, hobby text, drinking text, smoking text, marriage_values text, profile_image text, profile_images text[])'
     or pg_catalog.pg_get_function_result(
       'public.get_ai_match_candidates()'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)'
     or pg_catalog.pg_get_function_result(
       'public.get_my_favorite_members()'::pg_catalog.regprocedure
     ) <> 'TABLE(favorite_id uuid, favorited_at timestamp with time zone, member_id uuid, nickname text, age integer, profile_image_url text, region text, job text, is_mutual boolean, match_id uuid, match_status text, matched_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(
       'public.get_my_match_summary()'::pg_catalog.regprocedure
     ) <> 'TABLE(total_unread_count bigint, active_match_count bigint, total_match_count bigint)'
     or pg_catalog.pg_get_function_result(
       'public.search_members_advanced(integer,integer,text,text,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)'
     or pg_catalog.pg_get_function_result(
       'public.get_priority_recommendation_candidate_ids()'::pg_catalog.regprocedure
     ) <> 'TABLE(user_id uuid)'
     or pg_catalog.pg_get_function_result(
       'public.get_received_favorites()'::pg_catalog.regprocedure
     ) <> 'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)' then
    raise exception 'A member visibility RPC return contract differs from the approved definition';
  end if;

  -- First verify catalog identity without calling pg_get_functiondef(). A
  -- dropped/recreated administrator function must fail because its OID changes.
  if (
    select pg_catalog.count(*)
    from _commatch_profile_visibility_admin_fingerprints
  ) <> 4 or exists (
    select 1
    from _commatch_profile_visibility_admin_fingerprints as before_definition
    left join pg_catalog.pg_proc as function_info
      on function_info.oid = before_definition.function_oid
    where before_definition.function_oid is null
      or function_info.oid is null
      or before_definition.function_oid is distinct from pg_catalog.to_regprocedure(
        before_definition.expected_signature
      )::oid
      or function_info.prokind is distinct from 'f'::"char"
      or function_info.prokind is distinct from before_definition.prokind
      or pg_catalog.pg_get_userbyid(function_info.proowner)
        is distinct from before_definition.owner_name
      or pg_catalog.pg_get_function_identity_arguments(function_info.oid)
        is distinct from before_definition.identity_arguments
  ) then
    raise exception 'An administrator RPC definition changed unexpectedly';
  end if;

  -- The first phase proved that every stored OID still identifies the same
  -- normal function. This second phase calls pg_get_functiondef() only for the
  -- four validated OIDs held by the temporary table, never for pg_proc rows.
  if exists (
    select 1
    from _commatch_profile_visibility_admin_fingerprints as before_definition
    where pg_catalog.md5(
      pg_catalog.pg_get_functiondef(before_definition.function_oid)
    ) is distinct from before_definition.definition_hash
  ) then
    raise exception 'An administrator RPC definition changed unexpectedly';
  end if;
end
$post_installation_validation$;

commit;
