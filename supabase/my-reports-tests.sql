-- ComMatch member report history integration test (rollback-safe).
--
-- Run in the Supabase SQL Editor after supabase/my-reports.sql. Replace the
-- five UUID placeholders with one active super_admin and four distinct,
-- user-confirmed disposable ordinary Auth users with profiles. The ordinary
-- users must not be administrators. This test deletes one disposable profile
-- and its disposable match/message, then rolls every fixture write back.

begin;

create temp table _commatch_my_reports_it_config (
  super_admin_id uuid not null,
  reporter_a_id uuid not null,
  reporter_b_id uuid not null,
  profile_target_id uuid not null,
  message_target_id uuid not null,
  fixture_confirmation text not null,
  match_id uuid not null default pg_catalog.gen_random_uuid(),
  message_id uuid not null default pg_catalog.gen_random_uuid(),
  ended_message_id uuid not null default pg_catalog.gen_random_uuid(),
  a_pending_profile_report_id uuid,
  a_resolved_message_report_id uuid,
  a_dismissed_profile_report_id uuid not null default pg_catalog.gen_random_uuid(),
  b_reviewing_profile_report_id uuid,
  pending_created_at timestamptz,
  resolved_created_at timestamptz,
  dismissed_created_at timestamptz,
  reviewing_created_at timestamptz,
  resolved_completed_at timestamptz,
  dismissed_completed_at timestamptz,
  profile_target_nickname text
) on commit drop;

insert into _commatch_my_reports_it_config (
  super_admin_id,
  reporter_a_id,
  reporter_b_id,
  profile_target_id,
  message_target_id,
  fixture_confirmation,
  profile_target_nickname
)
select
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_REPORTER_A_USER_ID', 'PASTE_' || 'REPORTER_A_USER_ID')::uuid,
  nullif('PASTE_REPORTER_B_USER_ID', 'PASTE_' || 'REPORTER_B_USER_ID')::uuid,
  nullif('PASTE_PROFILE_TARGET_USER_ID', 'PASTE_' || 'PROFILE_TARGET_USER_ID')::uuid,
  nullif('PASTE_MESSAGE_TARGET_USER_ID', 'PASTE_' || 'MESSAGE_TARGET_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'),
  target_profile.nickname
from public.profiles as target_profile
where target_profile.id = nullif(
  'PASTE_PROFILE_TARGET_USER_ID',
  'PASTE_' || 'PROFILE_TARGET_USER_ID'
)::uuid;

grant select, update on _commatch_my_reports_it_config to anon, authenticated, service_role;

create function pg_temp._commatch_my_reports_set_user(p_user_id uuid, p_role text default 'authenticated')
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', p_role)::text
    end,
    true
  );
end
$function$;

create function pg_temp._commatch_my_reports_expect_42501(p_label text, p_sql text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when sqlstate '42501' then null;
  end;
end
$function$;

grant execute on function pg_temp._commatch_my_reports_set_user(uuid, text)
  to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_my_reports_expect_42501(text, text)
  to anon, authenticated, service_role;

do $preflight$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_my_reports_it_config;
  v_ids := array[
    v_config.super_admin_id,
    v_config.reporter_a_id,
    v_config.reporter_b_id,
    v_config.profile_target_id,
    v_config.message_target_id
  ];

  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace every PASTE_* Auth UUID';
  end if;
  if nullif(pg_catalog.btrim(v_config.profile_target_nickname), '') is null then
    raise exception 'The profile report target needs a non-empty nickname for display verification';
  end if;
  if v_config.fixture_confirmation <> 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace the fixture confirmation placeholder';
  end if;
  if (select pg_catalog.count(distinct fixture.id) from pg_catalog.unnest(v_ids) as fixture(id)) <> 5
     or (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 5 then
    raise exception 'All five configured Auth users must exist and be distinct';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.super_admin_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'The supplied super administrator is not active';
  end if;
  if exists (
    select 1 from public.admin_accounts
    where user_id = any(v_ids[2:5])
  ) or (select pg_catalog.count(*) from public.profiles where id = any(v_ids[2:5])) <> 4 then
    raise exception 'The four disposable ordinary users need profiles and no administrator row';
  end if;
  if not public.is_member_profile_visible(v_config.profile_target_id)
     or not public.is_member_profile_visible(v_config.message_target_id) then
    raise exception 'Both report targets must have visible profiles';
  end if;
  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id = any(v_ids[2:5])
      and restriction.account_status <> 'active'
      and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
  ) then
    raise exception 'Disposable ordinary users must currently have member service access';
  end if;
  if exists (
    select 1 from public.matches as existing_match
    where existing_match.user_1_id = least(v_config.reporter_a_id, v_config.message_target_id)
      and existing_match.user_2_id = greatest(v_config.reporter_a_id, v_config.message_target_id)
  ) then
    raise exception 'Reporter A and the message target must not already share a match';
  end if;
  if exists (
    select 1
    from public.reports as existing_report
    where (existing_report.reporter_id = v_config.reporter_a_id
      and (
        (existing_report.target_type = 'profile' and existing_report.target_user_id in (v_config.profile_target_id, v_config.message_target_id))
        or existing_report.target_message_id in (v_config.message_id, v_config.ended_message_id)
      ))
      or (existing_report.reporter_id = v_config.reporter_b_id
        and existing_report.target_type = 'profile'
        and existing_report.target_user_id = v_config.message_target_id)
  ) then
    raise exception 'Disposable users already have a conflicting report fixture';
  end if;
  if pg_catalog.to_regprocedure('public.get_my_reports()') is null then
    raise exception 'Apply supabase/my-reports.sql before running this test';
  end if;
end
$preflight$;

insert into public.matches (id, user_1_id, user_2_id, status)
select
  match_id,
  least(reporter_a_id, message_target_id),
  greatest(reporter_a_id, message_target_id),
  'active'
from _commatch_my_reports_it_config;

insert into public.messages (id, match_id, sender_id, content)
select message_id, match_id, message_target_id, 'rollback member report history message'
from _commatch_my_reports_it_config;

insert into public.messages (id, match_id, sender_id, content)
select ended_message_id, match_id, message_target_id, 'rollback ended match report guard message'
from _commatch_my_reports_it_config;

-- Existing member submission RPCs must still work after direct table SELECT is revoked.
set local role authenticated;
select pg_temp._commatch_my_reports_set_user(reporter_a_id)
from _commatch_my_reports_it_config;

do $reporter_a_submissions$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_profile_report_id uuid;
  v_message_report_id uuid;
begin
  select * into v_config from _commatch_my_reports_it_config;
  select public.submit_profile_report(
    v_config.profile_target_id,
    'spam',
    'rollback member history profile report'
  ) into v_profile_report_id;
  select public.submit_message_report(
    v_config.message_id,
    'harassment',
    'rollback member history message report'
  ) into v_message_report_id;

  update _commatch_my_reports_it_config
  set a_pending_profile_report_id = v_profile_report_id,
      a_resolved_message_report_id = v_message_report_id;
end
$reporter_a_submissions$;

do $message_submission_guards$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_match_status text;
begin
  select * into v_config from _commatch_my_reports_it_config;

  begin
    perform public.submit_message_report(
      v_config.message_id,
      'harassment',
      'rollback duplicate message report'
    );
    raise exception 'FAIL duplicate message report unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  select public.end_match(v_config.match_id) into v_match_status;
  if v_match_status <> 'ended' then
    raise exception 'FAIL match did not end before ended-message report verification';
  end if;

  begin
    perform public.submit_message_report(
      v_config.ended_message_id,
      'harassment',
      'rollback ended match message report'
    );
    raise exception 'FAIL ended match message report unexpectedly succeeded';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'Messages from an ended match cannot be reported' then
        raise exception 'FAIL ended match message report returned an unexpected error: %', sqlerrm;
      end if;
  end;

  if (select pg_catalog.count(*) from public.reports where id = v_config.a_resolved_message_report_id) <> 1
     or exists (
       select 1 from public.reports
       where reporter_id = v_config.reporter_a_id
         and target_message_id = v_config.ended_message_id
     ) then
    raise exception 'FAIL ended match report guard changed existing report rows';
  end if;
end
$message_submission_guards$;

select pg_temp._commatch_my_reports_set_user(reporter_b_id)
from _commatch_my_reports_it_config;

do $reporter_b_submission$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_report_id uuid;
begin
  select * into v_config from _commatch_my_reports_it_config;
  select public.submit_profile_report(
    v_config.message_target_id,
    'privacy_violation',
    null
  ) into v_report_id;

  update _commatch_my_reports_it_config
  set b_reviewing_profile_report_id = v_report_id;
end
$reporter_b_submission$;

reset role;

-- Prepare all four statuses and safe terminal completion timestamps.
do $status_fixtures$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_resolved_completed_at timestamptz := pg_catalog.clock_timestamp();
  v_dismissed_completed_at timestamptz := v_resolved_completed_at + interval '1 second';
begin
  select * into v_config from _commatch_my_reports_it_config;

  update public.reports
  set status = 'resolved'
  where id = v_config.a_resolved_message_report_id;

  update public.reports
  set status = 'reviewing'
  where id = v_config.b_reviewing_profile_report_id;

  insert into public.reports (
    id,
    reporter_id,
    target_type,
    target_user_id,
    target_message_id,
    target_match_id,
    reason_code,
    reason_detail,
    target_snapshot,
    status
  )
  select
    v_config.a_dismissed_profile_report_id,
    v_config.reporter_a_id,
    'profile',
    v_config.message_target_id,
    null,
    null,
    'other',
    'rollback dismissed report fixture',
    pg_catalog.jsonb_build_object('nickname', target_profile.nickname, 'private_field', 'must-not-leak'),
    'dismissed'
  from public.profiles as target_profile
  where target_profile.id = v_config.message_target_id;

  insert into public.report_admin_actions (
    report_id, admin_user_id, previous_status, new_status, note, created_at
  ) values
    (
      v_config.a_resolved_message_report_id,
      v_config.super_admin_id,
      'pending',
      'resolved',
      'internal note must not be returned',
      v_resolved_completed_at
    ),
    (
      v_config.a_dismissed_profile_report_id,
      v_config.super_admin_id,
      'pending',
      'dismissed',
      'internal dismissal note must not be returned',
      v_dismissed_completed_at
    );

  update _commatch_my_reports_it_config
  set pending_created_at = (
        select created_at from public.reports where id = v_config.a_pending_profile_report_id
      ),
      resolved_created_at = (
        select created_at from public.reports where id = v_config.a_resolved_message_report_id
      ),
      dismissed_created_at = (
        select created_at from public.reports where id = v_config.a_dismissed_profile_report_id
      ),
      reviewing_created_at = (
        select created_at from public.reports where id = v_config.b_reviewing_profile_report_id
      ),
      resolved_completed_at = v_resolved_completed_at,
      dismissed_completed_at = v_dismissed_completed_at;
end
$status_fixtures$;

-- Removing the disposable profile cascades its match/message, while report rows remain.
delete from public.profiles
where id = (select message_target_id from _commatch_my_reports_it_config);

do $deleted_source_assertions$
declare v_config _commatch_my_reports_it_config%rowtype;
begin
  select * into v_config from _commatch_my_reports_it_config;
  if exists (select 1 from public.profiles where id = v_config.message_target_id)
     or exists (select 1 from public.messages where id = v_config.message_id)
     or (select pg_catalog.count(*) from public.reports where id in (
       v_config.a_resolved_message_report_id,
       v_config.a_dismissed_profile_report_id,
       v_config.b_reviewing_profile_report_id
     )) <> 3 then
    raise exception 'FAIL deleted source objects did not preserve report rows';
  end if;
end
$deleted_source_assertions$;

set local role authenticated;
select pg_temp._commatch_my_reports_set_user(reporter_a_id)
from _commatch_my_reports_it_config;

do $reporter_a_history$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_fixture_ids uuid[];
  v_fixture_id uuid;
  v_fixture_count bigint;
  v_fixture_id_count bigint;
  v_total_count bigint;
  v_row record;
begin
  select * into v_config from _commatch_my_reports_it_config;
  v_fixture_ids := array[
    v_config.a_pending_profile_report_id,
    v_config.a_resolved_message_report_id,
    v_config.a_dismissed_profile_report_id
  ];

  if pg_catalog.array_position(v_fixture_ids, null) is not null then
    raise exception 'FAIL reporter A fixture report IDs must all be non-null';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where report_history.report_id = any(v_fixture_ids))
  into v_total_count, v_fixture_count
  from public.get_my_reports() as report_history;

  if v_fixture_count <> 3 then
    raise exception 'FAIL reporter A expected 3 fixture reports, got %; total own reports=%',
      v_fixture_count, v_total_count;
  end if;

  foreach v_fixture_id in array v_fixture_ids loop
    select pg_catalog.count(*)
    into v_fixture_id_count
    from public.get_my_reports() as report_history
    where report_history.report_id = v_fixture_id;

    if v_fixture_id_count <> 1 then
      raise exception 'FAIL reporter A fixture report % expected exactly once, got %; total own reports=%',
        v_fixture_id, v_fixture_id_count, v_total_count;
    end if;
  end loop;
  if exists (
    select 1 from public.get_my_reports()
    where report_id = v_config.b_reviewing_profile_report_id
  ) then
    raise exception 'FAIL reporter A can see reporter B history';
  end if;

  select * into v_row
  from public.get_my_reports()
  where report_id = v_config.a_pending_profile_report_id;
  if v_row.target_type <> 'profile'
     or v_row.status <> 'pending'
     or v_row.created_at is distinct from v_config.pending_created_at
     or v_row.completed_at is not null
     or v_row.target_display_name is distinct from v_config.profile_target_nickname
     or v_row.target_deleted then
    raise exception 'FAIL pending live-profile report projection';
  end if;

  select * into v_row
  from public.get_my_reports()
  where report_id = v_config.a_resolved_message_report_id;
  if v_row.target_type <> 'message'
     or v_row.status <> 'resolved'
     or v_row.created_at is distinct from v_config.resolved_created_at
     or v_row.completed_at is distinct from v_config.resolved_completed_at
     or v_row.target_display_name <> '삭제된 메시지'
     or not v_row.target_deleted then
    raise exception 'FAIL resolved deleted-message report projection';
  end if;

  select * into v_row
  from public.get_my_reports()
  where report_id = v_config.a_dismissed_profile_report_id;
  if v_row.target_type <> 'profile'
     or v_row.status <> 'dismissed'
     or v_row.created_at is distinct from v_config.dismissed_created_at
     or v_row.completed_at is distinct from v_config.dismissed_completed_at
     or v_row.target_display_name <> '삭제된 회원'
     or not v_row.target_deleted then
    raise exception 'FAIL dismissed deleted-profile report projection';
  end if;
end
$reporter_a_history$;

select pg_temp._commatch_my_reports_expect_42501(
  'authenticated direct reports SELECT',
  'select * from public.reports'
);

select pg_temp._commatch_my_reports_set_user(reporter_b_id)
from _commatch_my_reports_it_config;

do $reporter_b_history$
declare
  v_config _commatch_my_reports_it_config%rowtype;
  v_fixture_count bigint;
  v_total_count bigint;
  v_row record;
begin
  select * into v_config from _commatch_my_reports_it_config;
  if v_config.b_reviewing_profile_report_id is null then
    raise exception 'FAIL reporter B fixture report ID must be non-null';
  end if;

  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where report_history.report_id = v_config.b_reviewing_profile_report_id
    )
  into v_total_count, v_fixture_count
  from public.get_my_reports() as report_history;

  if v_fixture_count <> 1 then
    raise exception 'FAIL reporter B expected 1 fixture report, got %; total own reports=%',
      v_fixture_count, v_total_count;
  end if;
  if exists (
    select 1 from public.get_my_reports()
    where report_id in (
      v_config.a_pending_profile_report_id,
      v_config.a_resolved_message_report_id,
      v_config.a_dismissed_profile_report_id
    )
  ) then
    raise exception 'FAIL reporter B can see reporter A history';
  end if;

  select * into v_row
  from public.get_my_reports()
  where report_id = v_config.b_reviewing_profile_report_id;
  if v_row.report_id is distinct from v_config.b_reviewing_profile_report_id
     or v_row.status <> 'reviewing'
     or v_row.created_at is distinct from v_config.reviewing_created_at
     or v_row.completed_at is not null
     or v_row.target_display_name <> '삭제된 회원'
     or not v_row.target_deleted then
    raise exception 'FAIL reviewing deleted-profile report projection';
  end if;
end
$reporter_b_history$;

reset role;
set local role anon;
select pg_temp._commatch_my_reports_set_user(null, 'anon');
select pg_temp._commatch_my_reports_expect_42501(
  'anonymous get_my_reports RPC',
  'select * from public.get_my_reports()'
);

reset role;
set local role authenticated;
select pg_temp._commatch_my_reports_set_user(super_admin_id)
from _commatch_my_reports_it_config;

do $admin_rpc_regression$
declare
  v_config _commatch_my_reports_it_config%rowtype;
begin
  select * into v_config from _commatch_my_reports_it_config;
  if (select pg_catalog.count(*) from public.get_admin_reports(null, null, 1, 50)
      where report_id in (
        v_config.a_pending_profile_report_id,
        v_config.a_resolved_message_report_id,
        v_config.a_dismissed_profile_report_id,
        v_config.b_reviewing_profile_report_id
      )) <> 4 then
    raise exception 'FAIL existing administrator report RPC after direct SELECT revoke';
  end if;
end
$admin_rpc_regression$;

reset role;

do $contract_and_acl$
begin
  if pg_catalog.pg_get_function_arguments(
       'public.get_my_reports()'::pg_catalog.regprocedure
     ) <> '' then
    raise exception 'FAIL get_my_reports must not accept a spoofable user parameter';
  end if;
  if pg_catalog.pg_get_function_result(
       'public.get_my_reports()'::pg_catalog.regprocedure
     ) <> 'TABLE(report_id uuid, target_type text, reason_code text, reason_detail text, status text, created_at timestamp with time zone, completed_at timestamp with time zone, target_display_name text, target_deleted boolean)' then
    raise exception 'FAIL member report RPC exposes an unexpected projection';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.reports', 'SELECT')
     or pg_catalog.has_function_privilege('anon', 'public.get_my_reports()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_my_reports()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.get_my_reports()', 'EXECUTE') then
    raise exception 'FAIL member report history ACL differs from the approved definition';
  end if;
end
$contract_and_acl$;

select 'PASS member report history integration test; rolling back fixture writes' as test_result;
rollback;
