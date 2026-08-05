begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_dashboard_operational_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null then
    raise exception 'Required member and Premium tables must exist before installing the dashboard summary';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing the dashboard summary';
  end if;

  if exists (
    select required.column_name
    from (values
      ('auth', 'users', 'id', 'uuid', true),
      ('public', 'profiles', 'id', 'uuid', true),
      ('public', 'admin_accounts', 'user_id', 'uuid', true),
      ('public', 'member_restrictions', 'user_id', 'uuid', true),
      ('public', 'member_restrictions', 'account_status', 'text', true),
      ('public', 'member_restrictions', 'profile_visibility', 'text', true),
      ('public', 'member_restrictions', 'suspended_until', 'timestamp with time zone', false),
      ('public', 'premium_memberships', 'user_id', 'uuid', true),
      ('public', 'premium_memberships', 'status', 'text', true),
      ('public', 'premium_memberships', 'started_at', 'timestamp with time zone', true),
      ('public', 'premium_memberships', 'expires_at', 'timestamp with time zone', false)
    ) as required(table_schema, table_name, column_name, data_type, is_not_null)
    where not exists (
      select 1
      from information_schema.columns as column_info
      where column_info.table_schema = required.table_schema
        and column_info.table_name = required.table_name
        and column_info.column_name = required.column_name
        and column_info.data_type = required.data_type
        and (column_info.is_nullable = 'NO') = required.is_not_null
    )
  ) then
    raise exception 'Required member or Premium columns differ from the approved definition';
  end if;

  for v_function in
    select
      function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_dashboard_operational_summary'
  loop
    if v_function.identity_arguments <> 'p_expiring_days integer'
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.get_admin_dashboard_operational_summary already exists with an incompatible definition';
    end if;
  end loop;
end
$preflight$;

create or replace function public.get_admin_dashboard_operational_summary(
  p_expiring_days integer default 30
)
returns table (
  total_member_count bigint,
  active_member_count bigint,
  suspended_member_count bigint,
  hidden_profile_count bigint,
  missing_profile_count bigint,
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
      pg_catalog.count(*) filter (where not member.profile_exists) as missing_profile_count
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
        where premium.started_at > v_now
      ) as premium_not_started_count,
      pg_catalog.count(*) filter (
        where premium.expires_at is not null
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
    premium_summary.premium_available_count,
    premium_summary.premium_not_started_count,
    premium_summary.premium_expired_count,
    premium_summary.premium_suspended_count,
    premium_summary.premium_revoked_count,
    premium_summary.premium_expiring_soon_count,
    p_expiring_days
  from member_summary
  cross join premium_summary;
end
$function$;

alter function public.get_admin_dashboard_operational_summary(integer) owner to postgres;

comment on function public.get_admin_dashboard_operational_summary(integer)
  is 'commatch_admin_dashboard_operational_v1';

revoke all on function public.get_admin_dashboard_operational_summary(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_dashboard_operational_summary(integer)
  to authenticated, service_role;

do $validation$
declare
  v_marker constant text := 'commatch_admin_dashboard_operational_v1';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_dashboard_operational_summary(integer)'
  );
begin
  if v_function_oid is null then
    raise exception 'Dashboard operational summary function was not created';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_dashboard_operational_summary'
  ) <> 1 then
    raise exception 'Dashboard operational summary function must have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(total_member_count bigint, active_member_count bigint, suspended_member_count bigint, hidden_profile_count bigint, missing_profile_count bigint, premium_available_count bigint, premium_not_started_count bigint, premium_expired_count bigint, premium_suspended_count bigint, premium_revoked_count bigint, premium_expiring_soon_count bigint, expiration_window_days integer)' then
    raise exception 'Dashboard operational summary return type differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargdefaults = 1
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Dashboard operational summary function attributes differ from the approved definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid = v_function_oid
      and acl_info.privilege_type = 'EXECUTE'
      and acl_info.grantee = 0::oid
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'Dashboard operational summary function privileges differ from the approved definition';
  end if;
end
$validation$;

commit;

-- Read-only post-install verification:
-- select * from public.get_admin_dashboard_operational_summary(30);
