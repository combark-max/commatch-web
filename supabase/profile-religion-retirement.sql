-- ComMatch profile religion retirement, phase 1.
--
-- This migration stops using the nullable legacy column without modifying the
-- column or any stored value. Review before applying it to Supabase.

begin;

do $preflight$
declare
  v_function record;
begin
  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'religion'
      and column_info.data_type = 'text'
      and column_info.udt_name = 'text'
      and column_info.is_nullable = 'YES'
      and column_info.column_default is null
  ) then
    raise exception 'public.profiles.religion must be a nullable text column with no default';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_dashboard_operational_summary',
        'get_admin_member_detail',
        'get_admin_members',
        'get_ai_match_candidates',
        'get_visible_member_detail',
        'search_members_advanced'
      )
  ) <> 6 then
    raise exception 'A religion-dependent function is missing or overloaded';
  end if;

  for v_function in
    with expected(identity, marker, volatility, authenticated_execute, service_execute, result_type) as (
      values
        (
          'public.get_admin_dashboard_operational_summary(integer)',
          'commatch_admin_dashboard_operational_v2', 's'::"char", true, true,
          'TABLE(total_member_count bigint, active_member_count bigint, suspended_member_count bigint, hidden_profile_count bigint, missing_profile_count bigint, completed_profile_count bigint, premium_available_count bigint, premium_not_started_count bigint, premium_expired_count bigint, premium_suspended_count bigint, premium_revoked_count bigint, premium_expiring_soon_count bigint, expiration_window_days integer)'
        ),
        (
          'public.get_admin_member_detail(uuid)',
          'commatch_admin_member_detail_v1', 's'::"char", true, false,
          'TABLE(member_user_id uuid, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, nickname text, gender text, birth_date date, height integer, region text, job text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, premium_started_at timestamp with time zone, premium_expires_at timestamp with time zone)'
        ),
        (
          'public.get_admin_members(text,text,text,text,integer,integer,text,text)',
          'commatch_admin_members_v1', 's'::"char", true, false,
          'TABLE(member_user_id uuid, nickname text, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, total_count bigint)'
        ),
        (
          'public.get_ai_match_candidates()',
          'commatch_member_profile_visibility_v1', 's'::"char", true, true,
          'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)'
        ),
        (
          'public.get_visible_member_detail(uuid)',
          'commatch_member_profile_visibility_v1', 'v'::"char", true, true,
          'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])'
        ),
        (
          'public.search_members_advanced(integer,integer,text,text,text,text)',
          'commatch_advanced_member_search_v1', 's'::"char", true, true,
          'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)'
        )
    )
    select
      expected.*,
      function_info.oid,
      function_info.prosecdef,
      function_info.provolatile,
      function_info.proconfig,
      function_info.proacl,
      function_info.proowner,
      pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name,
      pg_catalog.obj_description(function_info.oid, 'pg_proc') as actual_marker,
      pg_catalog.pg_get_function_result(function_info.oid) as actual_result
    from expected
    left join pg_catalog.pg_proc as function_info
      on function_info.oid = pg_catalog.to_regprocedure(expected.identity)
  loop
    if v_function.oid is null
       or v_function.owner_name <> 'postgres'
       or not v_function.prosecdef
       or v_function.provolatile <> v_function.volatility
       or v_function.proconfig is distinct from array['search_path=""']::text[]
       or v_function.actual_marker is distinct from v_function.marker
       or v_function.actual_result is distinct from v_function.result_type
       or exists (
         select 1
         from pg_catalog.aclexplode(
           coalesce(v_function.proacl, pg_catalog.acldefault('f', v_function.proowner))
         ) as acl_info
         where acl_info.grantee = 0::oid
           and acl_info.privilege_type = 'EXECUTE'
       )
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
          <> v_function.authenticated_execute
       or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
          <> v_function.service_execute then
      raise exception '% differs from the approved pre-migration contract', v_function.identity;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
       'public.search_members_advanced(integer,integer,text,text,text)'
     ) is not null then
    raise exception 'The post-migration advanced search signature already exists';
  end if;
end
$preflight$;

-- These RPCs keep their signatures and return types. Define their complete
-- approved bodies explicitly so deployment does not depend on the formatting
-- emitted by pg_get_functiondef().
create or replace function public.get_admin_members(
  p_search text default null,
  p_account text default 'all',
  p_profile text default 'all',
  p_visibility text default 'all',
  p_limit integer default 20,
  p_offset integer default 0,
  p_sort_key text default 'joined_at',
  p_sort_direction text default 'desc'
)
returns table (
  member_user_id uuid,
  nickname text,
  joined_at timestamptz,
  profile_exists boolean,
  profile_status text,
  profile_visibility text,
  stored_account_status text,
  current_account_status text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  premium_membership_exists boolean,
  premium_stored_status text,
  premium_is_available boolean,
  premium_period_state text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_search text := nullif(pg_catalog.btrim(p_search), '');
  v_account text := coalesce(nullif(pg_catalog.btrim(p_account), ''), 'all');
  v_profile text := coalesce(nullif(pg_catalog.btrim(p_profile), ''), 'all');
  v_visibility text := coalesce(nullif(pg_catalog.btrim(p_visibility), ''), 'all');
  v_sort_key text := coalesce(nullif(pg_catalog.btrim(p_sort_key), ''), 'joined_at');
  v_sort_direction text := coalesce(nullif(pg_catalog.btrim(p_sort_direction), ''), 'desc');
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('member_restrictions_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  if v_search is not null and pg_catalog.char_length(v_search) > 100 then
    raise exception using errcode = '22023', message = 'Search must be at most 100 characters';
  end if;

  if v_account not in ('all', 'active', 'suspended')
     or v_profile not in ('all', 'missing', 'in_progress', 'completed')
     or v_visibility not in ('all', 'visible', 'hidden')
     or v_sort_key not in ('joined_at', 'nickname')
     or v_sort_direction not in ('asc', 'desc')
     or p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid administrator member list parameters';
  end if;

  return query
  with member_population as (
    select
      auth_user.id as member_user_id,
      profile.nickname,
      auth_user.created_at as joined_at,
      profile.id is not null as profile_exists,
      case
        when profile.id is null then 'missing'
        when (
          nullif(pg_catalog.btrim(profile.profile_image), '') is not null
          or exists (
            select 1
            from pg_catalog.unnest(profile.profile_images) as profile_image(image_path)
            where nullif(pg_catalog.btrim(profile_image.image_path), '') is not null
          )
        )
        and nullif(pg_catalog.btrim(profile.nickname), '') is not null
        and nullif(pg_catalog.btrim(profile.gender), '') is not null
        and profile.birth_date is not null
        and profile.height is not null
        and profile.height > 0
        and nullif(pg_catalog.btrim(profile.region), '') is not null
        and nullif(pg_catalog.btrim(profile.job), '') is not null
        and nullif(pg_catalog.btrim(profile.education), '') is not null
        and nullif(pg_catalog.btrim(profile.hobby), '') is not null
        and nullif(pg_catalog.btrim(profile.drinking), '') is not null
        and nullif(pg_catalog.btrim(profile.smoking), '') is not null
        and nullif(pg_catalog.btrim(profile.marriage_history), '') is not null
        and pg_catalog.char_length(pg_catalog.btrim(profile.introduction)) >= 10
        and pg_catalog.char_length(pg_catalog.btrim(profile.marriage_values)) >= 10
          then 'completed'
        else 'in_progress'
      end as profile_status,
      case
        when profile.id is null then null
        when restriction.profile_visibility = 'hidden' then 'hidden'
        else 'visible'
      end as profile_visibility,
      coalesce(restriction.account_status, 'active') as stored_account_status,
      case
        when restriction.account_status = 'suspended'
          and (restriction.suspended_until is null or restriction.suspended_until > v_now)
          then 'suspended'
        else 'active'
      end as current_account_status,
      restriction.suspended_at,
      restriction.suspended_until,
      membership.user_id is not null as premium_membership_exists,
      membership.status as premium_stored_status,
      coalesce(
        membership.status = 'active'
          and membership.started_at <= v_now
          and (membership.expires_at is null or membership.expires_at > v_now),
        false
      ) as premium_is_available,
      case
        when membership.user_id is null then 'none'
        when membership.started_at > v_now then 'not_started'
        when membership.expires_at is not null and membership.expires_at <= v_now then 'expired'
        when membership.status = 'suspended' then 'suspended'
        when membership.status = 'revoked' then 'revoked'
        else 'available'
      end as premium_period_state
    from auth.users as auth_user
    left join public.profiles as profile on profile.id = auth_user.id
    left join public.member_restrictions as restriction on restriction.user_id = auth_user.id
    left join public.premium_memberships as membership on membership.user_id = auth_user.id
    where not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = auth_user.id
    )
  ),
  filtered_members as (
    select member.*
    from member_population as member
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(member.nickname, '')),
        pg_catalog.lower(v_search)
      ) > 0
      or pg_catalog.left(member.member_user_id::text, pg_catalog.char_length(v_search)) =
        pg_catalog.lower(v_search)
    )
      and (v_account = 'all' or member.current_account_status = v_account)
      and (v_profile = 'all' or member.profile_status = v_profile)
      and (v_visibility = 'all' or member.profile_visibility = v_visibility)
  )
  select
    member.member_user_id,
    member.nickname,
    member.joined_at,
    member.profile_exists,
    member.profile_status,
    member.profile_visibility,
    member.stored_account_status,
    member.current_account_status,
    member.suspended_at,
    member.suspended_until,
    member.premium_membership_exists,
    member.premium_stored_status,
    member.premium_is_available,
    member.premium_period_state,
    pg_catalog.count(*) over () as total_count
  from filtered_members as member
  order by
    case when v_sort_key = 'joined_at' and v_sort_direction = 'asc' then member.joined_at end asc,
    case when v_sort_key = 'joined_at' and v_sort_direction = 'desc' then member.joined_at end desc,
    case when v_sort_key = 'nickname' and v_sort_direction = 'asc'
      then pg_catalog.lower(pg_catalog.btrim(member.nickname)) end asc nulls last,
    case when v_sort_key = 'nickname' and v_sort_direction = 'desc'
      then pg_catalog.lower(pg_catalog.btrim(member.nickname)) end desc nulls last,
    case when v_sort_direction = 'asc' then member.member_user_id end asc,
    case when v_sort_direction = 'desc' then member.member_user_id end desc
  limit p_limit
  offset p_offset;
end
$function$;

alter function public.get_admin_members(text, text, text, text, integer, integer, text, text)
  owner to postgres;
comment on function public.get_admin_members(text, text, text, text, integer, integer, text, text)
  is 'commatch_admin_members_v1';
revoke all on function public.get_admin_members(text, text, text, text, integer, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_members(text, text, text, text, integer, integer, text, text)
  to authenticated;

create or replace function public.get_admin_dashboard_operational_summary(
  p_expiring_days integer default 30
)
returns table (
  total_member_count bigint,
  active_member_count bigint,
  suspended_member_count bigint,
  hidden_profile_count bigint,
  missing_profile_count bigint,
  completed_profile_count bigint,
  premium_available_count bigint,
  premium_not_started_count bigint,
  premium_expired_count bigint,
  premium_suspended_count bigint,
  premium_revoked_count bigint,
  premium_expiring_soon_count bigint,
  expiration_window_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_expiring_days is null or p_expiring_days < 1 or p_expiring_days > 90 then
    raise exception using
      errcode = '22023',
      message = 'Expiration window must be between 1 and 90 days';
  end if;

  if not coalesce(public.has_admin_permission('admin_dashboard_view'), false)
     or not coalesce(public.has_admin_permission('member_restrictions_view'), false)
     or not coalesce(public.has_admin_permission('premium_memberships_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  with member_population as (
    select
      auth_user.id,
      profile.id is not null as profile_exists,
      profile.nickname,
      profile.gender,
      profile.birth_date,
      profile.height,
      profile.region,
      profile.job,
      profile.education,
      profile.hobby,
      profile.drinking,
      profile.smoking,
      profile.marriage_history,
      profile.introduction,
      profile.marriage_values,
      profile.profile_image,
      profile.profile_images,
      restriction.account_status,
      restriction.profile_visibility,
      restriction.suspended_until
    from auth.users as auth_user
    left join public.profiles as profile on profile.id = auth_user.id
    left join public.member_restrictions as restriction on restriction.user_id = auth_user.id
    where not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = auth_user.id
    )
  ),
  member_summary as (
    select
      pg_catalog.count(*) as total_member_count,
      pg_catalog.count(*) filter (
        where member.account_status is null
          or member.account_status = 'active'
          or (
            member.account_status = 'suspended'
            and member.suspended_until is not null
            and member.suspended_until <= v_now
          )
      ) as active_member_count,
      pg_catalog.count(*) filter (
        where member.account_status = 'suspended'
          and (member.suspended_until is null or member.suspended_until > v_now)
      ) as suspended_member_count,
      pg_catalog.count(*) filter (
        where member.profile_exists
          and member.profile_visibility = 'hidden'
      ) as hidden_profile_count,
      pg_catalog.count(*) filter (where not member.profile_exists) as missing_profile_count,
      pg_catalog.count(*) filter (
        where member.profile_exists
          and (
            nullif(pg_catalog.btrim(member.profile_image), '') is not null
            or exists (
              select 1
              from pg_catalog.unnest(member.profile_images) as profile_image(image_path)
              where nullif(pg_catalog.btrim(profile_image.image_path), '') is not null
            )
          )
          and nullif(pg_catalog.btrim(member.nickname), '') is not null
          and nullif(pg_catalog.btrim(member.gender), '') is not null
          and member.birth_date is not null
          and member.height is not null
          and member.height > 0
          and nullif(pg_catalog.btrim(member.region), '') is not null
          and nullif(pg_catalog.btrim(member.job), '') is not null
          and nullif(pg_catalog.btrim(member.education), '') is not null
          and nullif(pg_catalog.btrim(member.hobby), '') is not null
          and nullif(pg_catalog.btrim(member.drinking), '') is not null
          and nullif(pg_catalog.btrim(member.smoking), '') is not null
          and nullif(pg_catalog.btrim(member.marriage_history), '') is not null
          and pg_catalog.char_length(pg_catalog.btrim(member.introduction)) >= 10
          and pg_catalog.char_length(pg_catalog.btrim(member.marriage_values)) >= 10
      ) as completed_profile_count
    from member_population as member
  ),
  premium_population as (
    select
      membership.status,
      membership.started_at,
      membership.expires_at
    from public.premium_memberships as membership
    join auth.users as auth_user on auth_user.id = membership.user_id
    where not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = membership.user_id
    )
  ),
  premium_summary as (
    select
      pg_catalog.count(*) filter (
        where premium.status = 'active'
          and premium.started_at <= v_now
          and (premium.expires_at is null or premium.expires_at > v_now)
      ) as premium_available_count,
      pg_catalog.count(*) filter (
        where premium.status = 'active'
          and premium.started_at > v_now
      ) as premium_not_started_count,
      pg_catalog.count(*) filter (
        where premium.status = 'active'
          and premium.expires_at is not null
          and premium.expires_at <= v_now
      ) as premium_expired_count,
      pg_catalog.count(*) filter (
        where premium.status = 'suspended'
      ) as premium_suspended_count,
      pg_catalog.count(*) filter (
        where premium.status = 'revoked'
      ) as premium_revoked_count,
      pg_catalog.count(*) filter (
        where premium.status = 'active'
          and premium.started_at <= v_now
          and premium.expires_at is not null
          and premium.expires_at > v_now
          and premium.expires_at <= v_now + pg_catalog.make_interval(days => p_expiring_days)
      ) as premium_expiring_soon_count
    from premium_population as premium
  )
  select
    member_summary.total_member_count,
    member_summary.active_member_count,
    member_summary.suspended_member_count,
    member_summary.hidden_profile_count,
    member_summary.missing_profile_count,
    member_summary.completed_profile_count,
    premium_summary.premium_available_count,
    premium_summary.premium_not_started_count,
    premium_summary.premium_expired_count,
    premium_summary.premium_suspended_count,
    premium_summary.premium_revoked_count,
    premium_summary.premium_expiring_soon_count,
    p_expiring_days
  from member_summary
  cross join premium_summary;
end;
$function$;

alter function public.get_admin_dashboard_operational_summary(integer) owner to postgres;
comment on function public.get_admin_dashboard_operational_summary(integer)
  is 'commatch_admin_dashboard_operational_v2';
revoke all on function public.get_admin_dashboard_operational_summary(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_dashboard_operational_summary(integer)
  to authenticated, service_role;

drop function public.get_visible_member_detail(uuid);

create function public.get_visible_member_detail(p_target_user_id uuid)
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
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_history,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and public.is_member_profile_visible(target_profile.id);
end
$function$;

alter function public.get_visible_member_detail(uuid) owner to postgres;
comment on function public.get_visible_member_detail(uuid)
  is 'commatch_member_profile_visibility_v1';
revoke all on function public.get_visible_member_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid)
  to authenticated, service_role;

drop function public.get_ai_match_candidates();

create function public.get_ai_match_candidates()
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

alter function public.get_ai_match_candidates() owner to postgres;
comment on function public.get_ai_match_candidates()
  is 'commatch_member_profile_visibility_v1';
revoke all on function public.get_ai_match_candidates()
  from public, anon, authenticated, service_role;
grant execute on function public.get_ai_match_candidates()
  to authenticated, service_role;

drop function public.get_admin_member_detail(uuid);

create function public.get_admin_member_detail(p_target_user_id uuid)
returns table (
  member_user_id uuid,
  joined_at timestamptz,
  profile_exists boolean,
  profile_status text,
  profile_visibility text,
  nickname text,
  gender text,
  birth_date date,
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
  stored_account_status text,
  current_account_status text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  premium_membership_exists boolean,
  premium_stored_status text,
  premium_is_available boolean,
  premium_period_state text,
  premium_started_at timestamptz,
  premium_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('member_restrictions_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = p_target_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1
    from public.admin_accounts as target_admin
    where target_admin.user_id = p_target_user_id
  ) then
    raise exception using errcode = '22023', message = 'Administrator accounts are not member detail targets';
  end if;
  return query
  select
    member.member_user_id,
    member.joined_at,
    member.profile_exists,
    member.profile_status,
    member.profile_visibility,
    profile.nickname,
    profile.gender,
    profile.birth_date,
    profile.height,
    profile.region,
    profile.job,
    profile.education,
    profile.hobby,
    profile.drinking,
    profile.smoking,
    profile.marriage_history,
    profile.introduction,
    profile.marriage_values,
    profile.profile_image,
    profile.profile_images,
    member.stored_account_status,
    member.current_account_status,
    member.suspended_at,
    member.suspended_until,
    member.premium_membership_exists,
    member.premium_stored_status,
    member.premium_is_available,
    member.premium_period_state,
    membership.started_at,
    membership.expires_at
  from public.get_admin_members(
    p_target_user_id::text, 'all', 'all', 'all', 1, 0, 'joined_at', 'desc'
  ) as member
  left join public.profiles as profile on profile.id = member.member_user_id
  left join public.premium_memberships as membership
    on membership.user_id = member.member_user_id
  where member.member_user_id = p_target_user_id;
end
$function$;

alter function public.get_admin_member_detail(uuid) owner to postgres;
comment on function public.get_admin_member_detail(uuid)
  is 'commatch_admin_member_detail_v1';
revoke all on function public.get_admin_member_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_member_detail(uuid)
  to authenticated;

drop function public.search_members_advanced(integer, integer, text, text, text, text);

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

alter function public.search_members_advanced(integer, integer, text, text, text)
  owner to postgres;
comment on function public.search_members_advanced(integer, integer, text, text, text)
  is 'commatch_advanced_member_search_v1';
revoke all on function public.search_members_advanced(integer, integer, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text)
  to authenticated, service_role;

do $validation$
declare
  v_identity text;
  v_function record;
  v_admin_members_definition text;
  v_dashboard_definition text;
begin
  if pg_catalog.to_regprocedure(
       'public.search_members_advanced(integer,integer,text,text,text,text)'
     ) is not null then
    raise exception 'Legacy advanced search signature still exists';
  end if;

  foreach v_identity in array array[
    'public.get_admin_dashboard_operational_summary(integer)',
    'public.get_admin_member_detail(uuid)',
    'public.get_admin_members(text,text,text,text,integer,integer,text,text)',
    'public.get_ai_match_candidates()',
    'public.get_visible_member_detail(uuid)',
    'public.search_members_advanced(integer,integer,text,text,text)'
  ]
  loop
    if pg_catalog.to_regprocedure(v_identity) is null
       or pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_identity)) ~* '\mreligion\M' then
      raise exception '% is missing or still references religion', v_identity;
    end if;
  end loop;

  v_admin_members_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'public.get_admin_members(text,text,text,text,integer,integer,text,text)'::pg_catalog.regprocedure
  ));
  if (
       select pg_catalog.count(*)
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_namespace as namespace_info
         on namespace_info.oid = function_info.pronamespace
       where namespace_info.nspname = 'public'
         and function_info.proname = 'get_admin_members'
     ) <> 1
     or v_admin_members_definition ~ '\.religion\M'
     or v_admin_members_definition !~ 'profile\.education\M'
     or v_admin_members_definition !~ 'profile\.hobby\M'
     or v_admin_members_definition !~ 'then[[:space:]]+''completed'''
     or v_admin_members_definition !~ 'end[[:space:]]+as[[:space:]]+profile_status' then
    raise exception 'Administrator member completion semantics differ after migration';
  end if;

  v_dashboard_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(
    'public.get_admin_dashboard_operational_summary(integer)'::pg_catalog.regprocedure
  ));
  if (
       select pg_catalog.count(*)
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_namespace as namespace_info
         on namespace_info.oid = function_info.pronamespace
       where namespace_info.nspname = 'public'
         and function_info.proname = 'get_admin_dashboard_operational_summary'
     ) <> 1
     or v_dashboard_definition ~ '\.religion\M'
     or v_dashboard_definition !~ 'with[[:space:]]+member_population[[:space:]]+as'
     or v_dashboard_definition !~ 'member\.education\M'
     or v_dashboard_definition !~ 'member\.hobby\M'
     or v_dashboard_definition !~ 'count\(\*\)[[:space:]]+filter'
     or v_dashboard_definition !~ 'as[[:space:]]+completed_profile_count' then
    raise exception 'Dashboard completed profile semantics differ after migration';
  end if;

  for v_function in
    with expected(identity, marker, volatility, authenticated_execute, service_execute) as (
      values
        ('public.get_admin_dashboard_operational_summary(integer)', 'commatch_admin_dashboard_operational_v2', 's'::"char", true, true),
        ('public.get_admin_member_detail(uuid)', 'commatch_admin_member_detail_v1', 's'::"char", true, false),
        ('public.get_admin_members(text,text,text,text,integer,integer,text,text)', 'commatch_admin_members_v1', 's'::"char", true, false),
        ('public.get_ai_match_candidates()', 'commatch_member_profile_visibility_v1', 's'::"char", true, true),
        ('public.get_visible_member_detail(uuid)', 'commatch_member_profile_visibility_v1', 'v'::"char", true, true),
        ('public.search_members_advanced(integer,integer,text,text,text)', 'commatch_advanced_member_search_v1', 's'::"char", true, true)
    )
    select
      expected.*,
      function_info.oid,
      function_info.proacl,
      function_info.proowner,
      function_info.proconfig,
      function_info.prosecdef,
      function_info.provolatile,
      pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name,
      pg_catalog.obj_description(function_info.oid, 'pg_proc') as actual_marker
    from expected
    left join pg_catalog.pg_proc as function_info
      on function_info.oid = pg_catalog.to_regprocedure(expected.identity)
  loop
    if v_function.oid is null
       or v_function.owner_name <> 'postgres'
       or not v_function.prosecdef
       or v_function.provolatile <> v_function.volatility
       or v_function.proconfig is distinct from array['search_path=""']::text[]
       or v_function.actual_marker is distinct from v_function.marker
       or exists (
         select 1
         from pg_catalog.aclexplode(
           coalesce(v_function.proacl, pg_catalog.acldefault('f', v_function.proowner))
         ) as acl_info
         where acl_info.grantee = 0::oid
           and acl_info.privilege_type = 'EXECUTE'
       )
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
          <> v_function.authenticated_execute
       or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
          <> v_function.service_execute then
      raise exception '% metadata or ACL differs after migration', v_function.identity;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
       'public.get_admin_members(text,text,text,text,integer,integer,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(member_user_id uuid, nickname text, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, total_count bigint)'
     or pg_catalog.pg_get_function_result(
       'public.get_admin_dashboard_operational_summary(integer)'::pg_catalog.regprocedure
     ) <> 'TABLE(total_member_count bigint, active_member_count bigint, suspended_member_count bigint, hidden_profile_count bigint, missing_profile_count bigint, completed_profile_count bigint, premium_available_count bigint, premium_not_started_count bigint, premium_expired_count bigint, premium_suspended_count bigint, premium_revoked_count bigint, premium_expiring_soon_count bigint, expiration_window_days integer)'
     or pg_catalog.pg_get_function_result(
       'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])'
     or pg_catalog.pg_get_function_result(
       'public.get_ai_match_candidates()'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)'
     or pg_catalog.pg_get_function_result(
       'public.get_admin_member_detail(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(member_user_id uuid, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, nickname text, gender text, birth_date date, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, premium_started_at timestamp with time zone, premium_expires_at timestamp with time zone)' then
    raise exception 'A post-migration RPC return contract differs from the approved definition';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'religion'
  ) then
    raise exception 'The legacy religion column must remain in phase 1';
  end if;
end
$validation$;

notify pgrst, 'reload schema';

commit;
