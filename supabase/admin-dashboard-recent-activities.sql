begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_dashboard_recent_activities_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.reports') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.member_restriction_actions') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regclass('public.premium_membership_actions') is null then
    raise exception 'Required administrator activity tables must exist before installing recent activities';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing recent activities';
  end if;

  if exists (
    select required.column_name
    from (values
      ('auth', 'users', 'id', 'uuid', true),
      ('public', 'profiles', 'id', 'uuid', true),
      ('public', 'profiles', 'nickname', 'text', true),
      ('public', 'admin_accounts', 'user_id', 'uuid', true),
      ('public', 'admin_accounts', 'role', 'text', true),
      ('public', 'reports', 'id', 'uuid', true),
      ('public', 'member_restrictions', 'user_id', 'uuid', true),
      ('public', 'member_restrictions', 'profile_visibility', 'text', true),
      ('public', 'member_restriction_actions', 'id', 'uuid', true),
      ('public', 'member_restriction_actions', 'subject_user_id', 'uuid', true),
      ('public', 'member_restriction_actions', 'created_at', 'timestamp with time zone', true),
      ('public', 'premium_memberships', 'id', 'uuid', true),
      ('public', 'premium_memberships', 'user_id', 'uuid', true),
      ('public', 'premium_membership_actions', 'id', 'uuid', true),
      ('public', 'premium_membership_actions', 'subject_user_id', 'uuid', true),
      ('public', 'premium_membership_actions', 'created_at', 'timestamp with time zone', true)
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
    raise exception 'Required administrator activity columns differ from the approved definition';
  end if;

  for v_function in
    select
      function_info.oid,
      function_info.proname,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_recent_member_restriction_actions',
        'get_admin_recent_premium_membership_actions'
      )
  loop
    if v_function.identity_arguments <> 'p_limit integer'
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.%(%) already exists with an incompatible definition',
        v_function.proname, v_function.identity_arguments;
    end if;
  end loop;
end
$preflight$;

create or replace function public.get_admin_recent_member_restriction_actions(
  p_limit integer default 5
)
returns table (
  action_id uuid,
  action_type text,
  subject_user_id uuid,
  member_exists boolean,
  profile_exists boolean,
  nickname text,
  current_profile_visibility text,
  previous_account_status text,
  new_account_status text,
  previous_profile_visibility text,
  new_profile_visibility text,
  previous_suspended_until timestamptz,
  new_suspended_until timestamptz,
  reason text,
  note text,
  report_id uuid,
  report_exists boolean,
  admin_user_id uuid,
  admin_role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Recent member restriction action limit must be between 1 and 20';
  end if;

  if not coalesce(public.has_admin_permission('member_restrictions_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  select
    action.id,
    action.action_type,
    action.subject_user_id,
    auth_user.id is not null,
    profile.id is not null,
    profile.nickname,
    coalesce(restriction.profile_visibility, 'visible'),
    action.previous_account_status,
    action.new_account_status,
    action.previous_profile_visibility,
    action.new_profile_visibility,
    action.previous_suspended_until,
    action.new_suspended_until,
    action.reason,
    action.note,
    action.report_id,
    report.id is not null,
    action.admin_user_id,
    admin_account.role,
    action.created_at
  from public.member_restriction_actions as action
  left join auth.users as auth_user on auth_user.id = action.subject_user_id
  left join public.profiles as profile on profile.id = action.subject_user_id
  left join public.member_restrictions as restriction
    on restriction.user_id = action.subject_user_id
  left join public.reports as report on report.id = action.report_id
  left join public.admin_accounts as admin_account
    on admin_account.user_id = action.admin_user_id
  order by action.created_at desc, action.id desc
  limit p_limit;
end
$function$;

create or replace function public.get_admin_recent_premium_membership_actions(
  p_limit integer default 5
)
returns table (
  action_id uuid,
  request_id uuid,
  membership_id uuid,
  subject_user_id uuid,
  member_exists boolean,
  profile_exists boolean,
  nickname text,
  current_profile_visibility text,
  action_type text,
  previous_status text,
  new_status text,
  previous_started_at timestamptz,
  new_started_at timestamptz,
  previous_expires_at timestamptz,
  new_expires_at timestamptz,
  previous_feature_keys text[],
  new_feature_keys text[],
  reason text,
  performed_by uuid,
  admin_role text,
  membership_updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Recent Premium membership action limit must be between 1 and 20';
  end if;

  if not coalesce(public.has_admin_permission('premium_memberships_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  select
    action.id,
    action.request_id,
    action.membership_id,
    action.subject_user_id,
    auth_user.id is not null,
    profile.id is not null,
    profile.nickname,
    coalesce(restriction.profile_visibility, 'visible'),
    action.action_type,
    action.previous_status,
    action.new_status,
    action.previous_started_at,
    action.new_started_at,
    action.previous_expires_at,
    action.new_expires_at,
    action.previous_feature_keys,
    action.new_feature_keys,
    action.reason,
    action.performed_by,
    admin_account.role,
    action.membership_updated_at,
    action.created_at
  from public.premium_membership_actions as action
  left join auth.users as auth_user on auth_user.id = action.subject_user_id
  left join public.profiles as profile on profile.id = action.subject_user_id
  left join public.premium_memberships as membership on membership.id = action.membership_id
  left join public.member_restrictions as restriction
    on restriction.user_id = action.subject_user_id
  left join public.admin_accounts as admin_account
    on admin_account.user_id = action.performed_by
  order by action.created_at desc, action.id desc
  limit p_limit;
end
$function$;

alter function public.get_admin_recent_member_restriction_actions(integer)
  owner to postgres;
alter function public.get_admin_recent_premium_membership_actions(integer)
  owner to postgres;

comment on function public.get_admin_recent_member_restriction_actions(integer)
  is 'commatch_admin_dashboard_recent_activities_v1';
comment on function public.get_admin_recent_premium_membership_actions(integer)
  is 'commatch_admin_dashboard_recent_activities_v1';

revoke all on function public.get_admin_recent_member_restriction_actions(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_recent_premium_membership_actions(integer)
  from public, anon, authenticated, service_role;

grant execute on function public.get_admin_recent_member_restriction_actions(integer)
  to authenticated, service_role;
grant execute on function public.get_admin_recent_premium_membership_actions(integer)
  to authenticated, service_role;

do $validation$
declare
  v_marker constant text := 'commatch_admin_dashboard_recent_activities_v1';
  v_restriction_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_recent_member_restriction_actions(integer)'
  );
  v_premium_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_recent_premium_membership_actions(integer)'
  );
  v_function_oid oid;
begin
  if v_restriction_oid is null or v_premium_oid is null then
    raise exception 'Dashboard recent activity functions were not created';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_recent_member_restriction_actions',
        'get_admin_recent_premium_membership_actions'
      )
  ) <> 2 then
    raise exception 'Dashboard recent activity functions must each have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_restriction_oid) <>
    'TABLE(action_id uuid, action_type text, subject_user_id uuid, member_exists boolean, profile_exists boolean, nickname text, current_profile_visibility text, previous_account_status text, new_account_status text, previous_profile_visibility text, new_profile_visibility text, previous_suspended_until timestamp with time zone, new_suspended_until timestamp with time zone, reason text, note text, report_id uuid, report_exists boolean, admin_user_id uuid, admin_role text, created_at timestamp with time zone)' then
    raise exception 'Recent member restriction action return type differs from the approved definition';
  end if;

  if pg_catalog.pg_get_function_result(v_premium_oid) <>
    'TABLE(action_id uuid, request_id uuid, membership_id uuid, subject_user_id uuid, member_exists boolean, profile_exists boolean, nickname text, current_profile_visibility text, action_type text, previous_status text, new_status text, previous_started_at timestamp with time zone, new_started_at timestamp with time zone, previous_expires_at timestamp with time zone, new_expires_at timestamp with time zone, previous_feature_keys text[], new_feature_keys text[], reason text, performed_by uuid, admin_role text, membership_updated_at timestamp with time zone, created_at timestamp with time zone)' then
    raise exception 'Recent Premium membership action return type differs from the approved definition';
  end if;

  foreach v_function_oid in array array[v_restriction_oid, v_premium_oid]
  loop
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
        and function_info.pronargs = 1
        and function_info.pronargdefaults = 1
        and pg_catalog.pg_get_function_identity_arguments(function_info.oid) = 'p_limit integer'
        and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
        and exists (
          select 1
          from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
          where function_config.setting = 'search_path=""'
        )
    ) then
      raise exception 'Dashboard recent activity function attributes differ from the approved definition';
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
      raise exception 'Dashboard recent activity function privileges differ from the approved definition';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.member_restriction_actions'::pg_catalog.regclass,
      'public.premium_membership_actions'::pg_catalog.regclass
    )
  ) then
    raise exception 'Recent activity tables must not contain direct-access RLS policies';
  end if;

  if exists (
    select 1
    from (values
      ('anon'::text),
      ('authenticated'::text)
    ) as browser_role(role_name)
    cross join (values
      ('public.member_restriction_actions'::text),
      ('public.premium_membership_actions'::text)
    ) as activity_table(table_name)
    where pg_catalog.has_table_privilege(
      browser_role.role_name,
      activity_table.table_name,
      'SELECT, INSERT, UPDATE, DELETE'
    )
  ) then
    raise exception 'Browser roles have an unapproved recent activity table privilege';
  end if;

  if exists (
    select 1
    from (values
      ('SELECT'::text),
      ('INSERT'::text),
      ('UPDATE'::text),
      ('DELETE'::text)
    ) as required_privilege(privilege_name)
    cross join (values
      ('public.member_restriction_actions'::text),
      ('public.premium_membership_actions'::text)
    ) as activity_table(table_name)
    where not pg_catalog.has_table_privilege(
      'service_role',
      activity_table.table_name,
      required_privilege.privilege_name
    )
  ) then
    raise exception 'Service role recent activity table privileges differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.member_restriction_actions'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) or not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.premium_membership_actions'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS must remain enabled on recent activity tables';
  end if;
end
$validation$;

commit;

-- Read-only post-install verification:
-- select * from public.get_admin_recent_member_restriction_actions(5);
-- select * from public.get_admin_recent_premium_membership_actions(5);
