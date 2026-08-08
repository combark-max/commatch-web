begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_service_statistics_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.reports') is null then
    raise exception 'Required service statistics tables must exist before installation';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing service statistics';
  end if;

  if exists (
    select required.column_name
    from (values
      ('public', 'matches', 'status', 'text', true),
      ('auth', 'users', 'id', 'uuid', true),
      ('auth', 'users', 'created_at', 'timestamp with time zone', false),
      ('public', 'admin_accounts', 'user_id', 'uuid', true),
      ('public', 'reports', 'created_at', 'timestamp with time zone', true)
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
    raise exception 'Required service statistics columns differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.matches'::pg_catalog.regclass
      and constraint_info.conname = 'matches_status_check'
      and constraint_info.contype = 'c'
  ) then
    raise exception 'public.matches must retain the approved status CHECK constraint';
  end if;

  for v_function in
    select
      function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_service_statistics'
  loop
    if v_function.identity_arguments <> ''
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.get_admin_service_statistics(%) already exists with an incompatible definition',
        v_function.identity_arguments;
    end if;
  end loop;
end;
$preflight$;

create or replace function public.get_admin_service_statistics()
returns table (
  total_match_count bigint,
  active_match_count bigint,
  ended_match_count bigint,
  total_message_count bigint,
  new_member_last_7_days_count bigint,
  report_last_7_days_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('admin_dashboard_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  with match_summary as (
    select
      pg_catalog.count(*) as total_match_count,
      pg_catalog.count(*) filter (where match_row.status = 'active') as active_match_count,
      pg_catalog.count(*) filter (where match_row.status = 'ended') as ended_match_count
    from public.matches as match_row
  ),
  message_summary as (
    select pg_catalog.count(*) as total_message_count
    from public.messages as message_row
  ),
  new_member_summary as (
    select pg_catalog.count(*) as new_member_last_7_days_count
    from auth.users as auth_user
    where auth_user.created_at >= v_now - interval '7 days'
      and not exists (
        select 1
        from public.admin_accounts as admin_account
        where admin_account.user_id = auth_user.id
      )
  ),
  report_summary as (
    select pg_catalog.count(*) as report_last_7_days_count
    from public.reports as report
    where report.created_at >= v_now - interval '7 days'
  )
  select
    match_summary.total_match_count,
    match_summary.active_match_count,
    match_summary.ended_match_count,
    message_summary.total_message_count,
    new_member_summary.new_member_last_7_days_count,
    report_summary.report_last_7_days_count
  from match_summary
  cross join message_summary
  cross join new_member_summary
  cross join report_summary;
end;
$function$;

alter function public.get_admin_service_statistics() owner to postgres;

-- Match and message counts describe currently retained rows. They are not
-- historical totals because profile deletion cascades to matches and messages.
comment on function public.get_admin_service_statistics()
  is 'commatch_admin_service_statistics_v1';

revoke all on function public.get_admin_service_statistics()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_service_statistics()
  to authenticated;

do $validation$
declare
  v_marker constant text := 'commatch_admin_service_statistics_v1';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_service_statistics()'
  );
begin
  if v_function_oid is null then
    raise exception 'Administrator service statistics function was not created';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_service_statistics'
  ) <> 1 then
    raise exception 'Administrator service statistics function must have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(total_match_count bigint, active_match_count bigint, ended_match_count bigint, total_message_count bigint, new_member_last_7_days_count bigint, report_last_7_days_count bigint)' then
    raise exception 'Administrator service statistics return type differs from the approved definition';
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
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and pg_catalog.pg_get_function_identity_arguments(function_info.oid) = ''
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Administrator service statistics function attributes differ from the approved definition';
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
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'Administrator service statistics function privileges differ from the approved definition';
  end if;
end;
$validation$;

commit;

-- Read-only post-install verification for an authenticated active administrator:
-- select * from public.get_admin_service_statistics();
