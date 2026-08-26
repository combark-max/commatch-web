begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_service_statistic_details_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regclass('public.reports') is null then
    raise exception 'Required tables must exist before installing administrator service statistic details';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null
     or pg_catalog.to_regprocedure('public.get_admin_service_statistics()') is null then
    raise exception 'Required administrator functions must exist before installing service statistic details';
  end if;

  for v_function in
    select function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_service_statistic_details'
  loop
    if v_function.identity_arguments <>
         'p_metric text, p_limit integer, p_offset integer'
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.get_admin_service_statistic_details(%) already exists with an incompatible definition',
        v_function.identity_arguments;
    end if;
  end loop;
end;
$preflight$;

create or replace function public.get_admin_service_statistic_details(
  p_metric text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  metric text,
  item_id uuid,
  item_created_at timestamptz,
  match_id uuid,
  match_status text,
  matched_at timestamptz,
  ended_at timestamptz,
  primary_user_id uuid,
  primary_nickname text,
  primary_member_exists boolean,
  primary_profile_exists boolean,
  secondary_user_id uuid,
  secondary_nickname text,
  secondary_member_exists boolean,
  secondary_profile_exists boolean,
  message_moderation_visibility text,
  member_profile_status text,
  member_profile_visibility text,
  member_account_status text,
  member_premium_status text,
  report_target_type text,
  report_reason text,
  report_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_metric text := nullif(pg_catalog.btrim(p_metric), '');
  v_now timestamptz := pg_catalog.now();
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('admin_dashboard_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_metric is null or v_metric not in (
    'total_matches', 'active_matches', 'ended_matches',
    'total_messages', 'recent_members', 'recent_reports'
  ) then
    raise exception using errcode = '22023', message = 'Invalid service statistic metric';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
     or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid service statistic pagination';
  end if;

  if v_metric in ('total_matches', 'active_matches', 'ended_matches') then
    return query
    select
      v_metric,
      match_row.id,
      match_row.created_at,
      null::uuid,
      match_row.status,
      match_row.matched_at,
      match_row.ended_at,
      match_row.user_1_id,
      first_profile.nickname,
      first_member.id is not null,
      first_profile.id is not null,
      match_row.user_2_id,
      second_profile.nickname,
      second_member.id is not null,
      second_profile.id is not null,
      null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text,
      pg_catalog.count(*) over ()
    from public.matches as match_row
    left join auth.users as first_member on first_member.id = match_row.user_1_id
    left join public.profiles as first_profile on first_profile.id = match_row.user_1_id
    left join auth.users as second_member on second_member.id = match_row.user_2_id
    left join public.profiles as second_profile on second_profile.id = match_row.user_2_id
    where v_metric = 'total_matches'
       or (v_metric = 'active_matches' and match_row.status = 'active')
       or (v_metric = 'ended_matches' and match_row.status = 'ended')
    order by match_row.matched_at desc, match_row.id desc
    limit p_limit offset p_offset;
    return;
  end if;

  if v_metric = 'total_messages' then
    return query
    select
      v_metric,
      message_row.id,
      message_row.created_at,
      message_row.match_id,
      null::text, null::timestamptz, null::timestamptz,
      message_row.sender_id,
      sender_profile.nickname,
      sender_member.id is not null,
      sender_profile.id is not null,
      null::uuid, null::text, null::boolean, null::boolean,
      message_row.moderation_visibility,
      null::text, null::text, null::text, null::text,
      null::text, null::text, null::text,
      pg_catalog.count(*) over ()
    from public.messages as message_row
    left join auth.users as sender_member on sender_member.id = message_row.sender_id
    left join public.profiles as sender_profile on sender_profile.id = message_row.sender_id
    order by message_row.created_at desc, message_row.id desc
    limit p_limit offset p_offset;
    return;
  end if;

  if v_metric = 'recent_members' then
    return query
    with member_population as (
      select
        auth_user.id,
        auth_user.created_at,
        profile.nickname,
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
          and profile.height is not null and profile.height > 0
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
        case
          when restriction.account_status = 'suspended'
            and (restriction.suspended_until is null or restriction.suspended_until > v_now)
            then 'suspended'
          else 'active'
        end as account_status,
        case
          when membership.user_id is null then 'none'
          when membership.started_at > v_now then 'not_started'
          when membership.expires_at is not null and membership.expires_at <= v_now then 'expired'
          when membership.status = 'suspended' then 'suspended'
          when membership.status = 'revoked' then 'revoked'
          else 'available'
        end as premium_status
      from auth.users as auth_user
      left join public.profiles as profile on profile.id = auth_user.id
      left join public.member_restrictions as restriction on restriction.user_id = auth_user.id
      left join public.premium_memberships as membership on membership.user_id = auth_user.id
      where auth_user.created_at >= v_now - interval '7 days'
        and not exists (
          select 1 from public.admin_accounts as admin_account
          where admin_account.user_id = auth_user.id
        )
    )
    select
      v_metric,
      member.id,
      member.created_at,
      null::uuid, null::text, null::timestamptz, null::timestamptz,
      member.id,
      member.nickname,
      true,
      member.profile_exists,
      null::uuid, null::text, null::boolean, null::boolean,
      null::text,
      member.profile_status,
      member.profile_visibility,
      member.account_status,
      member.premium_status,
      null::text, null::text, null::text,
      pg_catalog.count(*) over ()
    from member_population as member
    order by member.created_at desc, member.id desc
    limit p_limit offset p_offset;
    return;
  end if;

  return query
  select
    v_metric,
    report.id,
    report.created_at,
    null::uuid, null::text, null::timestamptz, null::timestamptz,
    report.reporter_id,
    reporter_profile.nickname,
    reporter_member.id is not null,
    reporter_profile.id is not null,
    report.target_user_id,
    target_profile.nickname,
    target_member.id is not null,
    target_profile.id is not null,
    null::text, null::text, null::text, null::text, null::text,
    report.target_type,
    report.reason_code,
    report.status,
    pg_catalog.count(*) over ()
  from public.reports as report
  left join auth.users as reporter_member on reporter_member.id = report.reporter_id
  left join public.profiles as reporter_profile on reporter_profile.id = report.reporter_id
  left join auth.users as target_member on target_member.id = report.target_user_id
  left join public.profiles as target_profile on target_profile.id = report.target_user_id
  where report.created_at >= v_now - interval '7 days'
  order by report.created_at desc, report.id desc
  limit p_limit offset p_offset;
end;
$function$;

alter function public.get_admin_service_statistic_details(text, integer, integer)
  owner to postgres;

comment on function public.get_admin_service_statistic_details(text, integer, integer)
  is 'commatch_admin_service_statistic_details_v1';

revoke all on function public.get_admin_service_statistic_details(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_service_statistic_details(text, integer, integer)
  to authenticated;

do $validation$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_service_statistic_details(text,integer,integer)'
  );
begin
  if v_function_oid is null then
    raise exception 'Administrator service statistic detail function was not created';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargs = 3
      and function_info.pronargdefaults = 2
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'commatch_admin_service_statistic_details_v1'
      and exists (
        select 1 from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Administrator service statistic detail function attributes differ from the approved definition';
  end if;
  if pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'Administrator service statistic detail function privileges differ from the approved definition';
  end if;
end;
$validation$;

commit;

-- Apply after admin-service-statistics.sql. No table or existing function is changed.
