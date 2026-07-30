begin;

do $preflight$
declare
  v_function record;
begin
  if pg_catalog.to_regclass('public.reports') is null then
    raise exception 'public.reports must exist before installing admin report functions';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing admin report functions';
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
        'get_admin_report_summary',
        'get_admin_recent_reports'
      )
  loop
    if (
      v_function.proname = 'get_admin_report_summary'
      and v_function.identity_arguments <> ''
    ) or (
      v_function.proname = 'get_admin_recent_reports'
      and v_function.identity_arguments <> 'limit_count integer'
    ) then
      raise exception 'public.% already exists with an incompatible signature', v_function.proname;
    end if;

    if pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from 'commatch_admin_reports_v1' then
      raise exception 'public.% already exists without the approved definition marker', v_function.proname;
    end if;
  end loop;
end
$preflight$;

create or replace function public.get_admin_report_summary()
returns table (
  total_count bigint,
  pending_count bigint,
  reviewing_count bigint,
  resolved_count bigint,
  dismissed_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  select
    pg_catalog.count(*) as total_count,
    pg_catalog.count(*) filter (where report.status = 'pending') as pending_count,
    pg_catalog.count(*) filter (where report.status = 'reviewing') as reviewing_count,
    pg_catalog.count(*) filter (where report.status = 'resolved') as resolved_count,
    pg_catalog.count(*) filter (where report.status = 'dismissed') as dismissed_count
  from public.reports as report;
end
$function$;

comment on function public.get_admin_report_summary()
  is 'commatch_admin_reports_v1';

create or replace function public.get_admin_recent_reports(limit_count integer default 5)
returns table (
  report_id uuid,
  target_type text,
  reason text,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reported_user_id uuid,
  message_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(limit_count, 5), 20)
  );
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  select
    report.id as report_id,
    report.target_type,
    report.reason_code as reason,
    report.status,
    report.created_at,
    report.reporter_id as reporter_user_id,
    report.target_user_id as reported_user_id,
    report.target_message_id as message_id
  from public.reports as report
  order by report.created_at desc, report.id desc
  limit v_limit;
end
$function$;

comment on function public.get_admin_recent_reports(integer)
  is 'commatch_admin_reports_v1';

revoke all on function public.get_admin_report_summary()
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_recent_reports(integer)
  from public, anon, authenticated, service_role;

grant execute on function public.get_admin_report_summary()
  to authenticated, service_role;
grant execute on function public.get_admin_recent_reports(integer)
  to authenticated, service_role;

do $validation$
declare
  v_summary_oid oid := pg_catalog.to_regprocedure('public.get_admin_report_summary()');
  v_recent_oid oid := pg_catalog.to_regprocedure('public.get_admin_recent_reports(integer)');
begin
  if v_summary_oid is null or v_recent_oid is null then
    raise exception 'Admin report functions were not created';
  end if;

  if pg_catalog.pg_get_function_result(v_summary_oid)
    <> 'TABLE(total_count bigint, pending_count bigint, reviewing_count bigint, resolved_count bigint, dismissed_count bigint)' then
    raise exception 'public.get_admin_report_summary() has an incompatible return type';
  end if;

  if pg_catalog.pg_get_function_result(v_recent_oid)
    <> 'TABLE(report_id uuid, target_type text, reason text, status text, created_at timestamp with time zone, reporter_user_id uuid, reported_user_id uuid, message_id uuid)' then
    raise exception 'public.get_admin_recent_reports(integer) has an incompatible return type';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid in (v_summary_oid, v_recent_oid)
      and (
        not function_info.prosecdef
        or function_info.provolatile <> 's'
        or not exists (
          select 1
          from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
          where function_config.setting = 'search_path=""'
        )
      )
  ) then
    raise exception 'Admin report function security settings differ from the approved definition';
  end if;

  if pg_catalog.has_function_privilege('anon', v_summary_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_summary_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_summary_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_recent_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_recent_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_recent_oid, 'EXECUTE') then
    raise exception 'Admin report function privileges differ from the approved definition';
  end if;
end
$validation$;

commit;

-- Read-only post-install verification:
-- select * from public.get_admin_report_summary();
-- select * from public.get_admin_recent_reports(5);
