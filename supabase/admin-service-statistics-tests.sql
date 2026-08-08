-- ComMatch administrator service statistics rollback integration tests.
--
-- Apply admin-service-statistics.sql first. In a Supabase SQL Editor tab,
-- replace PASTE_SUPER_ADMIN_USER_ID with one existing active super administrator
-- and replace PASTE_TEST_FIXTURE_CONFIRMATION with the confirmation token below.
-- This transaction creates three identifier-only Auth users and all related
-- profile, match, message, report, and temporary administrator fixtures itself.
-- No real UUID belongs in this repository, and every data change is rolled back.

begin isolation level repeatable read;

create temp table _commatch_service_stats_it_config (
  super_admin_id uuid,
  fixture_confirmation text,
  role_test_user_id uuid not null default pg_catalog.gen_random_uuid(),
  recent_member_id uuid not null default pg_catalog.gen_random_uuid(),
  old_member_id uuid not null default pg_catalog.gen_random_uuid(),
  active_match_id uuid not null default pg_catalog.gen_random_uuid(),
  ended_match_id uuid not null default pg_catalog.gen_random_uuid(),
  first_message_id uuid not null default pg_catalog.gen_random_uuid(),
  second_message_id uuid not null default pg_catalog.gen_random_uuid(),
  recent_report_id uuid not null default pg_catalog.gen_random_uuid(),
  old_report_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_service_stats_it_config (
  super_admin_id,
  fixture_confirmation
) values (
  nullif(
    'PASTE_SUPER_ADMIN_USER_ID',
    'PASTE_' || 'SUPER_ADMIN_USER_ID'
  )::uuid,
  nullif(
    'PASTE_TEST_FIXTURE_CONFIRMATION',
    'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'
  )
);

grant select on pg_temp._commatch_service_stats_it_config
  to anon, authenticated, service_role;

create temp table _commatch_service_stats_it_baseline (
  total_match_count bigint not null,
  active_match_count bigint not null,
  ended_match_count bigint not null,
  total_message_count bigint not null,
  new_member_last_7_days_count bigint not null,
  report_last_7_days_count bigint not null
) on commit drop;

grant select, insert on pg_temp._commatch_service_stats_it_baseline
  to authenticated;

do $preflight$
declare
  v_config _commatch_service_stats_it_config%rowtype;
  v_generated_ids uuid[];
begin
  select * into v_config from pg_temp._commatch_service_stats_it_config;
  v_generated_ids := array[
    v_config.role_test_user_id,
    v_config.recent_member_id,
    v_config.old_member_id
  ];

  if v_config.super_admin_id is null then
    raise exception 'Replace PASTE_SUPER_ADMIN_USER_ID in the SQL Editor tab';
  end if;
  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if not exists (
    select 1
    from auth.users as auth_user
    join public.admin_accounts as admin_account
      on admin_account.user_id = auth_user.id
    where auth_user.id = v_config.super_admin_id
      and admin_account.role = 'super_admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if (select pg_catalog.count(distinct fixture_id)
      from pg_catalog.unnest(v_generated_ids) as fixture(fixture_id)) <> 3
     or v_config.super_admin_id = any(v_generated_ids) then
    raise exception 'Generated fixture Auth UUIDs must be distinct from each other and the administrator';
  end if;
  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id = any(v_generated_ids)
  ) then
    raise exception 'A generated fixture Auth UUID unexpectedly already exists';
  end if;
  if pg_catalog.to_regprocedure('public.get_admin_service_statistics()') is null then
    raise exception 'Apply admin-service-statistics.sql before this test';
  end if;

  raise notice 'PASS fixture and object preflight';
end;
$preflight$;

create function pg_temp._commatch_service_stats_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(p_user_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object(
        'sub', p_user_id,
        'role', 'authenticated'
      )::text
    end,
    true
  );
end;
$function$;

create function pg_temp._commatch_service_stats_it_expect_error(
  p_label text,
  p_expected_state text,
  p_expected_message text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate is distinct from p_expected_state then
        raise exception 'FAIL %: expected SQLSTATE %, received % (%)',
          p_label, p_expected_state, sqlstate, sqlerrm;
      end if;
      if p_expected_message is not null
         and sqlerrm is distinct from p_expected_message then
        raise exception 'FAIL %: expected message %, received %',
          p_label, p_expected_message, sqlerrm;
      end if;
      raise notice 'PASS % (SQLSTATE %, message %)', p_label, sqlstate, sqlerrm;
  end;
end;
$function$;

grant execute on function pg_temp._commatch_service_stats_it_set_user(uuid)
  to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_service_stats_it_expect_error(text, text, text, text)
  to anon, authenticated, service_role;

do $contract$
declare
  v_marker constant text := 'commatch_admin_service_statistics_v1';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_service_statistics()'
  );
begin
  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(total_match_count bigint, active_match_count bigint, ended_match_count bigint, total_message_count bigint, new_member_last_7_days_count bigint, report_last_7_days_count bigint)' then
    raise exception 'FAIL service statistics return type';
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
    raise exception 'FAIL service statistics owner/language/STABLE/SECURITY DEFINER/search_path contract';
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
    raise exception 'FAIL service statistics ACL contract';
  end if;

  raise notice 'PASS function return type, owner, attributes, marker, and ACL';
end;
$contract$;

-- Capture a repeatable-read baseline as the existing active super administrator.
set local role authenticated;
select pg_temp._commatch_service_stats_it_set_user(super_admin_id)
from pg_temp._commatch_service_stats_it_config;

insert into pg_temp._commatch_service_stats_it_baseline
select * from public.get_admin_service_statistics();

do $super_admin_access$
begin
  if (select pg_catalog.count(*) from public.get_admin_service_statistics()) <> 1 then
    raise exception 'FAIL active super administrator result row count';
  end if;
  raise notice 'PASS active super administrator access';
end;
$super_admin_access$;

reset role;

-- Three generated Auth users give deterministic rolling-window behavior:
-- two are six days old, one is eight days old, and one recent user later
-- becomes an administrator so the admin exclusion can be observed separately.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  fixture.user_id,
  source.instance_id,
  'authenticated',
  'authenticated',
  null,
  '{}'::jsonb,
  '{}'::jsonb,
  fixture.created_at,
  pg_catalog.now()
from (
  select role_test_user_id as user_id, pg_catalog.now() - interval '6 days' as created_at
  from pg_temp._commatch_service_stats_it_config
  union all
  select recent_member_id, pg_catalog.now() - interval '6 days'
  from pg_temp._commatch_service_stats_it_config
  union all
  select old_member_id, pg_catalog.now() - interval '8 days'
  from pg_temp._commatch_service_stats_it_config
) as fixture
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.id = (
    select super_admin_id from pg_temp._commatch_service_stats_it_config
  )
) as source;

insert into public.profiles (id, nickname, profile_images)
select
  fixture.user_id,
  'stats' || fixture.position || '_' || pg_catalog.left(fixture.user_id::text, 8),
  array[]::text[]
from (
  select 1 as position, role_test_user_id as user_id
  from pg_temp._commatch_service_stats_it_config
  union all
  select 2, recent_member_id
  from pg_temp._commatch_service_stats_it_config
  union all
  select 3, old_member_id
  from pg_temp._commatch_service_stats_it_config
) as fixture;

insert into public.matches (
  id, user_1_id, user_2_id, status, matched_at
)
select
  active_match_id,
  least(role_test_user_id, recent_member_id),
  greatest(role_test_user_id, recent_member_id),
  'active',
  pg_catalog.now() - interval '2 days'
from pg_temp._commatch_service_stats_it_config;

insert into public.matches (
  id, user_1_id, user_2_id, status, matched_at, ended_at, ended_by
)
select
  ended_match_id,
  least(role_test_user_id, old_member_id),
  greatest(role_test_user_id, old_member_id),
  'ended',
  pg_catalog.now() - interval '10 days',
  pg_catalog.now() - interval '5 days',
  role_test_user_id
from pg_temp._commatch_service_stats_it_config;

insert into public.messages (id, match_id, sender_id, content)
select first_message_id, active_match_id, role_test_user_id,
  'rollback service statistics message one'
from pg_temp._commatch_service_stats_it_config
union all
select second_message_id, active_match_id, recent_member_id,
  'rollback service statistics message two'
from pg_temp._commatch_service_stats_it_config;

insert into public.reports (
  id, reporter_id, target_type, target_user_id, target_message_id,
  target_match_id, reason_code, reason_detail, target_snapshot, status, created_at
)
select
  recent_report_id,
  recent_member_id,
  'profile',
  old_member_id,
  null::uuid,
  null::uuid,
  'other',
  'rollback service statistics recent report',
  '{}'::jsonb,
  'pending',
  pg_catalog.now() - interval '6 days'
from pg_temp._commatch_service_stats_it_config;

insert into public.reports (
  id, reporter_id, target_type, target_user_id, target_message_id,
  target_match_id, reason_code, reason_detail, target_snapshot, status, created_at
)
select
  old_report_id,
  old_member_id,
  'profile',
  recent_member_id,
  null::uuid,
  null::uuid,
  'other',
  'rollback service statistics old report',
  '{}'::jsonb,
  'dismissed',
  pg_catalog.now() - interval '8 days'
from pg_temp._commatch_service_stats_it_config;

-- Before the role-test user becomes an administrator, both six-day Auth users
-- count as recent members while the eight-day user and report remain excluded.
set local role authenticated;
select pg_temp._commatch_service_stats_it_set_user(super_admin_id)
from pg_temp._commatch_service_stats_it_config;

do $fixture_delta_before_admin$
declare
  v_baseline pg_temp._commatch_service_stats_it_baseline%rowtype;
  v_current record;
begin
  select * into strict v_baseline
  from pg_temp._commatch_service_stats_it_baseline;
  select * into strict v_current
  from public.get_admin_service_statistics();

  if v_current.total_match_count <> v_baseline.total_match_count + 2
     or v_current.active_match_count <> v_baseline.active_match_count + 1
     or v_current.ended_match_count <> v_baseline.ended_match_count + 1
     or v_current.total_message_count <> v_baseline.total_message_count + 2
     or v_current.new_member_last_7_days_count <>
       v_baseline.new_member_last_7_days_count + 2
     or v_current.report_last_7_days_count <>
       v_baseline.report_last_7_days_count + 1 then
    raise exception 'FAIL fixture delta before administrator exclusion: baseline %, current %',
      pg_catalog.row_to_json(v_baseline), pg_catalog.row_to_json(v_current);
  end if;

  raise notice 'PASS match/message deltas and six-day/eight-day rolling boundaries';
end;
$fixture_delta_before_admin$;

-- An ordinary authenticated member reaches the function but fails its internal
-- permission check with the exact production error contract.
select pg_temp._commatch_service_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_service_stats_it_config;
select pg_temp._commatch_service_stats_it_expect_error(
  'ordinary authenticated member',
  '42501',
  'Insufficient admin permission',
  'select * from public.get_admin_service_statistics()'
);

reset role;

-- anon and service_role are rejected by the function ACL before its body runs.
set local role anon;
select pg_temp._commatch_service_stats_it_set_user(null);
select pg_temp._commatch_service_stats_it_expect_error(
  'anon ACL',
  '42501',
  null,
  'select * from public.get_admin_service_statistics()'
);

reset role;
set local role service_role;
select pg_temp._commatch_service_stats_it_set_user(null);
select pg_temp._commatch_service_stats_it_expect_error(
  'service_role ACL',
  '42501',
  null,
  'select * from public.get_admin_service_statistics()'
);

reset role;

insert into public.admin_accounts (user_id, role, status, created_by)
select role_test_user_id, 'admin', 'active', super_admin_id
from pg_temp._commatch_service_stats_it_config;

-- Every supported active administrator role owns admin_dashboard_view.
set local role authenticated;
select pg_temp._commatch_service_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_service_stats_it_config;
do $active_admin_access$
begin
  if (select pg_catalog.count(*) from public.get_admin_service_statistics()) <> 1 then
    raise exception 'FAIL active admin result row count';
  end if;
  raise notice 'PASS active admin access';
end;
$active_admin_access$;

reset role;
update public.admin_accounts
set role = 'moderator'
where user_id = (
  select role_test_user_id from pg_temp._commatch_service_stats_it_config
);

set local role authenticated;
select pg_temp._commatch_service_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_service_stats_it_config;
do $active_moderator_access$
begin
  if (select pg_catalog.count(*) from public.get_admin_service_statistics()) <> 1 then
    raise exception 'FAIL active moderator result row count';
  end if;
  raise notice 'PASS active moderator access';
end;
$active_moderator_access$;

reset role;
update public.admin_accounts
set role = 'super_admin'
where user_id = (
  select role_test_user_id from pg_temp._commatch_service_stats_it_config
);

set local role authenticated;
select pg_temp._commatch_service_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_service_stats_it_config;
do $active_super_admin_access$
begin
  if (select pg_catalog.count(*) from public.get_admin_service_statistics()) <> 1 then
    raise exception 'FAIL active super_admin role result row count';
  end if;
  raise notice 'PASS active super_admin role access';
end;
$active_super_admin_access$;

-- The newly created administrator must now disappear from the recent-member
-- count without changing any other fixture delta.
select pg_temp._commatch_service_stats_it_set_user(super_admin_id)
from pg_temp._commatch_service_stats_it_config;

do $fixture_delta_after_admin$
declare
  v_baseline pg_temp._commatch_service_stats_it_baseline%rowtype;
  v_current record;
begin
  select * into strict v_baseline
  from pg_temp._commatch_service_stats_it_baseline;
  select * into strict v_current
  from public.get_admin_service_statistics();

  if v_current.total_match_count <> v_baseline.total_match_count + 2
     or v_current.active_match_count <> v_baseline.active_match_count + 1
     or v_current.ended_match_count <> v_baseline.ended_match_count + 1
     or v_current.total_message_count <> v_baseline.total_message_count + 2
     or v_current.new_member_last_7_days_count <>
       v_baseline.new_member_last_7_days_count + 1
     or v_current.report_last_7_days_count <>
       v_baseline.report_last_7_days_count + 1 then
    raise exception 'FAIL fixture delta after administrator exclusion: baseline %, current %',
      pg_catalog.row_to_json(v_baseline), pg_catalog.row_to_json(v_current);
  end if;

  raise notice 'PASS administrator exclusion and final service statistics deltas';
end;
$fixture_delta_after_admin$;

reset role;

select
  'PASS all administrator service statistics rollback integration tests; rolling back every fixture and data change'
  as test_result;

rollback;
