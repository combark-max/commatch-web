-- ComMatch member-facing report history.
-- Run after reports.sql and admin-report-management.sql.

begin;

do $preflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_my_reports()');
begin
  if pg_catalog.to_regclass('public.reports') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('public.report_admin_actions') is null then
    raise exception 'Reports, profiles, messages, and report_admin_actions must exist before installing member report history';
  end if;

  if v_function_oid is not null
     and pg_catalog.obj_description(v_function_oid, 'pg_proc') <> 'commatch_my_reports_v1' then
    raise exception 'public.get_my_reports() already exists without the approved definition marker';
  end if;
end
$preflight$;

drop function if exists public.get_my_reports();

create function public.get_my_reports()
returns table (
  report_id uuid,
  target_type text,
  reason_code text,
  reason_detail text,
  status text,
  created_at timestamptz,
  completed_at timestamptz,
  target_display_name text,
  target_deleted boolean
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
    report.id,
    report.target_type,
    report.reason_code,
    report.reason_detail,
    report.status,
    report.created_at,
    case
      when report.status in ('resolved', 'dismissed') then completion.completed_at
      else null
    end,
    case
      when report.target_type = 'profile' then
        case
          when target_profile.id is null then '삭제된 회원'
          else coalesce(
            nullif(pg_catalog.btrim(target_profile.nickname), ''),
            nullif(pg_catalog.btrim(report.target_snapshot ->> 'nickname'), ''),
            '회원 프로필'
          )
        end
      when target_message.id is null then '삭제된 메시지'
      else '채팅 메시지'
    end,
    case
      when report.target_type = 'profile' then target_profile.id is null
      else target_message.id is null
    end
  from public.reports as report
  left join public.profiles as target_profile
    on report.target_type = 'profile'
   and target_profile.id = report.target_user_id
  left join public.messages as target_message
    on report.target_type = 'message'
   and target_message.id = report.target_message_id
  left join lateral (
    select action.created_at as completed_at
    from public.report_admin_actions as action
    where action.report_id = report.id
      and action.new_status = report.status
      and action.new_status in ('resolved', 'dismissed')
    order by action.created_at desc, action.id desc
    limit 1
  ) as completion on true
  where report.reporter_id = v_user_id
  order by report.created_at desc, report.id desc;
end
$function$;

comment on function public.get_my_reports()
  is 'commatch_my_reports_v1';

alter function public.get_my_reports() owner to postgres;

-- Member clients must use the safe projection above rather than selecting raw
-- report rows containing target snapshots and internal object identifiers.
revoke all on table public.reports from public, anon, authenticated;

revoke all on function public.get_my_reports()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_reports() to authenticated;

do $security_validation$
declare
  v_function_oid oid := 'public.get_my_reports()'::pg_catalog.regprocedure;
  v_function record;
begin
  if pg_catalog.has_table_privilege('anon', 'public.reports', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reports', 'SELECT') then
    raise exception 'Direct member SELECT on public.reports is not blocked';
  end if;

  select
    function_info.prosecdef,
    function_info.provolatile,
    function_info.proconfig,
    pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name
  into v_function
  from pg_catalog.pg_proc as function_info
  where function_info.oid = v_function_oid;

  if v_function.owner_name <> 'postgres'
     or not v_function.prosecdef
     or v_function.provolatile <> 's'
     or not exists (
       select 1
       from pg_catalog.unnest(v_function.proconfig) as function_config(setting)
       where function_config.setting = 'search_path=""'
     )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_my_reports() security or privileges differ from the approved definition';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(report_id uuid, target_type text, reason_code text, reason_detail text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, target_display_name text, target_deleted boolean)' then
    raise exception 'public.get_my_reports() return contract differs from the approved definition';
  end if;
end
$security_validation$;

commit;

-- Read-only verification:
-- select * from public.get_my_reports();
