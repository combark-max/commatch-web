-- ComMatch administrator service statistic detail rollback integration tests.
--
-- Apply admin-service-statistics.sql and admin-service-statistic-details.sql first.
-- Replace both placeholders in a Supabase SQL Editor tab. Every fixture and
-- state change in this script is rolled back.

begin isolation level repeatable read;

create temp table _commatch_service_detail_it_config (
  super_admin_id uuid,
  fixture_confirmation text,
  role_test_user_id uuid not null default pg_catalog.gen_random_uuid(),
  missing_profile_user_id uuid not null default pg_catalog.gen_random_uuid(),
  suspended_user_id uuid not null default pg_catalog.gen_random_uuid(),
  old_user_id uuid not null default pg_catalog.gen_random_uuid(),
  active_match_id uuid not null default pg_catalog.gen_random_uuid(),
  ended_match_id uuid not null default pg_catalog.gen_random_uuid(),
  visible_message_id uuid not null default pg_catalog.gen_random_uuid(),
  hidden_ended_message_id uuid not null default pg_catalog.gen_random_uuid(),
  profile_report_id uuid not null default pg_catalog.gen_random_uuid(),
  message_report_id uuid not null default pg_catalog.gen_random_uuid(),
  old_report_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_service_detail_it_config (super_admin_id, fixture_confirmation)
values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on pg_temp._commatch_service_detail_it_config
  to anon, authenticated, service_role;

do $preflight$
declare
  v_config _commatch_service_detail_it_config%rowtype;
  v_ids uuid[];
begin
  select * into strict v_config from pg_temp._commatch_service_detail_it_config;
  v_ids := array[
    v_config.role_test_user_id, v_config.missing_profile_user_id,
    v_config.suspended_user_id, v_config.old_user_id
  ];
  if v_config.super_admin_id is null then
    raise exception 'Replace PASTE_SUPER_ADMIN_USER_ID in the SQL Editor tab';
  end if;
  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if not exists (
    select 1 from auth.users as auth_user
    join public.admin_accounts as admin_account on admin_account.user_id = auth_user.id
    where auth_user.id = v_config.super_admin_id
      and admin_account.role = 'super_admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if (select pg_catalog.count(distinct fixture_id)
      from pg_catalog.unnest(v_ids) as fixture(fixture_id)) <> 4
     or v_config.super_admin_id = any(v_ids)
     or exists (select 1 from auth.users where id = any(v_ids)) then
    raise exception 'Generated fixture Auth UUIDs are not disposable and distinct';
  end if;
  if pg_catalog.to_regprocedure(
       'public.get_admin_service_statistic_details(text,integer,integer)'
     ) is null then
    raise exception 'Apply admin-service-statistic-details.sql before this test';
  end if;
  raise notice 'PASS fixture and object preflight';
end;
$preflight$;

create function pg_temp._commatch_service_detail_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text end,
    true
  );
end;
$function$;

create function pg_temp._commatch_service_detail_it_expect_error(
  p_label text, p_state text, p_message text, p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception when others then
    if sqlstate is distinct from p_state
       or p_message is not null and sqlerrm is distinct from p_message then
      raise exception 'FAIL %: expected %/%, received %/%',
        p_label, p_state, p_message, sqlstate, sqlerrm;
    end if;
    raise notice 'PASS %', p_label;
  end;
end;
$function$;

grant execute on function pg_temp._commatch_service_detail_it_set_user(uuid)
  to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_service_detail_it_expect_error(text, text, text, text)
  to anon, authenticated, service_role;

do $contract$
declare
  v_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_service_statistic_details(text,integer,integer)'
  );
  v_result text;
begin
  v_result := pg_catalog.pg_get_function_result(v_oid);
  if v_result like '%content%' or v_result like '%body%' or v_result like '%snapshot%' then
    raise exception 'FAIL message content-like field exists in the RPC return contract: %', v_result;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargs = 3
      and function_info.pronargdefaults = 2
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'commatch_admin_service_statistic_details_v1'
      and exists (
        select 1 from pg_catalog.unnest(function_info.proconfig) as config(setting)
        where config.setting = 'search_path=""'
      )
  ) then
    raise exception 'FAIL RPC owner/STABLE/SECURITY DEFINER/search_path contract';
  end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'FAIL RPC ACL contract';
  end if;
  raise notice 'PASS RPC security and content-free return contract';
end;
$contract$;

-- Ordinary authenticated callers reach the RPC but fail its internal check.
set local role authenticated;
select pg_temp._commatch_service_detail_it_set_user(role_test_user_id)
from pg_temp._commatch_service_detail_it_config;
select pg_temp._commatch_service_detail_it_expect_error(
  'ordinary authenticated member', '42501', 'Insufficient admin permission',
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, 0)$$
);

reset role;
set local role anon;
select pg_temp._commatch_service_detail_it_set_user(null);
select pg_temp._commatch_service_detail_it_expect_error(
  'anon execute ACL', '42501', null,
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, 0)$$
);

reset role;
set local role service_role;
select pg_temp._commatch_service_detail_it_set_user(null);
select pg_temp._commatch_service_detail_it_expect_error(
  'service role execute ACL', '42501', null,
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, 0)$$
);

reset role;

set local role authenticated;
select pg_temp._commatch_service_detail_it_set_user(super_admin_id)
from pg_temp._commatch_service_detail_it_config;
do $active_super_admin_access$
begin
  perform * from public.get_admin_service_statistic_details('total_matches', 1, 0);
  raise notice 'PASS active super administrator access';
end;
$active_super_admin_access$;

reset role;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, fixture.created_at, pg_catalog.now()
from (
  select role_test_user_id as user_id, pg_catalog.now() - interval '2 days' as created_at
  from pg_temp._commatch_service_detail_it_config
  union all
  select missing_profile_user_id, pg_catalog.now() - interval '3 days'
  from pg_temp._commatch_service_detail_it_config
  union all
  select suspended_user_id, pg_catalog.now() - interval '4 days'
  from pg_temp._commatch_service_detail_it_config
  union all
  select old_user_id, pg_catalog.now() - interval '8 days'
  from pg_temp._commatch_service_detail_it_config
) as fixture
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user
  where auth_user.id = (
    select super_admin_id from pg_temp._commatch_service_detail_it_config
  )
) as source;

-- The missing-profile user intentionally receives no public.profiles row.
insert into public.profiles (id, nickname, profile_images)
select role_test_user_id, 'detail_admin_' || pg_catalog.left(role_test_user_id::text, 8), array[]::text[]
from pg_temp._commatch_service_detail_it_config
union all
select suspended_user_id, 'detail_suspended_' || pg_catalog.left(suspended_user_id::text, 8), array[]::text[]
from pg_temp._commatch_service_detail_it_config
union all
select old_user_id, 'detail_old_' || pg_catalog.left(old_user_id::text, 8), array[]::text[]
from pg_temp._commatch_service_detail_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, reason
)
select suspended_user_id, 'suspended', 'hidden', pg_catalog.now() - interval '1 day',
  'rollback service detail suspended member'
from pg_temp._commatch_service_detail_it_config;

insert into public.matches (id, user_1_id, user_2_id, status, matched_at, created_at)
select active_match_id, least(role_test_user_id, suspended_user_id),
  greatest(role_test_user_id, suspended_user_id), 'active',
  pg_catalog.now() - interval '2 days', pg_catalog.now() - interval '2 days'
from pg_temp._commatch_service_detail_it_config;

insert into public.matches (
  id, user_1_id, user_2_id, status, matched_at, ended_at, ended_by, created_at
)
select ended_match_id, least(role_test_user_id, old_user_id),
  greatest(role_test_user_id, old_user_id), 'ended',
  pg_catalog.now() - interval '10 days', pg_catalog.now() - interval '5 days',
  role_test_user_id, pg_catalog.now() - interval '10 days'
from pg_temp._commatch_service_detail_it_config;

insert into public.messages (
  id, match_id, sender_id, content, moderation_visibility, created_at
)
select visible_message_id, active_match_id, suspended_user_id,
  'rollback service detail visible message', 'visible', pg_catalog.now() - interval '1 day'
from pg_temp._commatch_service_detail_it_config
union all
select hidden_ended_message_id, ended_match_id, old_user_id,
  'rollback service detail hidden ended message', 'hidden', pg_catalog.now() - interval '4 days'
from pg_temp._commatch_service_detail_it_config;

insert into public.reports (
  id, reporter_id, target_type, target_user_id, target_message_id,
  target_match_id, reason_code, reason_detail, target_snapshot, status, created_at
)
select profile_report_id, suspended_user_id, 'profile', old_user_id,
  null::uuid, null::uuid, 'spam', null::text, '{}'::jsonb, 'resolved',
  pg_catalog.now() - interval '2 days'
from pg_temp._commatch_service_detail_it_config
union all
select message_report_id, role_test_user_id, 'message', old_user_id,
  hidden_ended_message_id, ended_match_id, 'harassment', null::text,
  '{}'::jsonb, 'dismissed', pg_catalog.now() - interval '3 days'
from pg_temp._commatch_service_detail_it_config
union all
select old_report_id, old_user_id, 'profile', role_test_user_id,
  null::uuid, null::uuid, 'privacy_violation', null::text,
  '{}'::jsonb, 'reviewing', pg_catalog.now() - interval '8 days'
from pg_temp._commatch_service_detail_it_config;

-- Promote one recent member. The existing statistic and detail must both exclude it.
insert into public.admin_accounts (user_id, role, status, created_by)
select role_test_user_id, 'admin', 'active', super_admin_id
from pg_temp._commatch_service_detail_it_config;

set local role authenticated;
select pg_temp._commatch_service_detail_it_set_user(role_test_user_id)
from pg_temp._commatch_service_detail_it_config;

do $active_admin_and_fixtures$
declare
  v_config pg_temp._commatch_service_detail_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_service_detail_it_config;
  if not exists (
    select 1 from public.get_admin_service_statistic_details('total_matches', 50, 0)
    where item_id = v_config.active_match_id
  ) or not exists (
    select 1 from public.get_admin_service_statistic_details('total_matches', 50, 0)
    where item_id = v_config.ended_match_id
  ) or exists (
    select 1 from public.get_admin_service_statistic_details('active_matches', 50, 0)
    where item_id = v_config.ended_match_id
  ) or not exists (
    select 1 from public.get_admin_service_statistic_details('ended_matches', 50, 0)
    where item_id = v_config.ended_match_id
  ) then
    raise exception 'FAIL match metric fixtures or status filters';
  end if;

  if not exists (
    select 1 from public.get_admin_service_statistic_details('total_messages', 50, 0)
    where item_id = v_config.hidden_ended_message_id
      and match_id = v_config.ended_match_id
      and message_moderation_visibility = 'hidden'
  ) then
    raise exception 'FAIL hidden message from ended match is not included';
  end if;

  if not exists (
    select 1 from public.get_admin_service_statistic_details('recent_members', 50, 0)
    where item_id = v_config.missing_profile_user_id
      and member_profile_status = 'missing'
  ) or not exists (
    select 1 from public.get_admin_service_statistic_details('recent_members', 50, 0)
    where item_id = v_config.suspended_user_id
      and member_account_status = 'suspended'
  ) or exists (
    select 1 from public.get_admin_service_statistic_details('recent_members', 50, 0)
    where item_id in (v_config.role_test_user_id, v_config.old_user_id)
  ) then
    raise exception 'FAIL recent member include/exclude conditions';
  end if;

  if not exists (
    select 1 from public.get_admin_service_statistic_details('recent_reports', 50, 0)
    where item_id = v_config.profile_report_id
      and report_target_type = 'profile' and report_status = 'resolved'
  ) or not exists (
    select 1 from public.get_admin_service_statistic_details('recent_reports', 50, 0)
    where item_id = v_config.message_report_id
      and report_target_type = 'message' and report_status = 'dismissed'
  ) or exists (
    select 1 from public.get_admin_service_statistic_details('recent_reports', 50, 0)
    where item_id = v_config.old_report_id
  ) then
    raise exception 'FAIL recent report include/exclude conditions';
  end if;
  raise notice 'PASS all six metric fixtures and inclusion conditions';
end;
$active_admin_and_fixtures$;

do $aggregate_equality$
declare
  v_summary record;
  v_detail bigint;
  v_metric text;
  v_expected bigint;
begin
  select * into strict v_summary from public.get_admin_service_statistics();
  for v_metric, v_expected in
    select * from (values
      ('total_matches'::text, v_summary.total_match_count),
      ('active_matches', v_summary.active_match_count),
      ('ended_matches', v_summary.ended_match_count),
      ('total_messages', v_summary.total_message_count),
      ('recent_members', v_summary.new_member_last_7_days_count),
      ('recent_reports', v_summary.report_last_7_days_count)
    ) as expected(metric, count)
  loop
    select total_count into strict v_detail
    from public.get_admin_service_statistic_details(v_metric, 1, 0);
    if v_detail is distinct from v_expected then
      raise exception 'FAIL aggregate/detail mismatch for %: expected %, received %',
        v_metric, v_expected, v_detail;
    end if;
  end loop;
  raise notice 'PASS all six detail totals equal get_admin_service_statistics';
end;
$aggregate_equality$;

do $stable_pagination$
declare
  v_first uuid[];
  v_repeat uuid[];
  v_second uuid[];
begin
  select pg_catalog.array_agg(detail.item_id)
  into v_first
  from public.get_admin_service_statistic_details('total_matches', 2, 0) as detail;
  select pg_catalog.array_agg(detail.item_id)
  into v_repeat
  from public.get_admin_service_statistic_details('total_matches', 2, 0) as detail;
  select pg_catalog.array_agg(detail.item_id)
  into v_second
  from public.get_admin_service_statistic_details('total_matches', 2, 2) as detail;
  if v_first is null or v_first is distinct from v_repeat
     or coalesce(v_first, array[]::uuid[]) && coalesce(v_second, array[]::uuid[]) then
    raise exception 'FAIL stable pagination ordering';
  end if;
  raise notice 'PASS stable pagination and UUID tie-break behavior';
end;
$stable_pagination$;

select pg_temp._commatch_service_detail_it_expect_error(
  'invalid metric', '22023', 'Invalid service statistic metric',
  $$select * from public.get_admin_service_statistic_details('unknown', 10, 0)$$
);
select pg_temp._commatch_service_detail_it_expect_error(
  'null metric', '22023', 'Invalid service statistic metric',
  $$select * from public.get_admin_service_statistic_details(null, 10, 0)$$
);
select pg_temp._commatch_service_detail_it_expect_error(
  'zero page size', '22023', 'Invalid service statistic pagination',
  $$select * from public.get_admin_service_statistic_details('total_matches', 0, 0)$$
);
select pg_temp._commatch_service_detail_it_expect_error(
  'oversized page size', '22023', 'Invalid service statistic pagination',
  $$select * from public.get_admin_service_statistic_details('total_matches', 51, 0)$$
);
select pg_temp._commatch_service_detail_it_expect_error(
  'negative offset', '22023', 'Invalid service statistic pagination',
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, -1)$$
);

reset role;
update public.admin_accounts
set status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
where user_id = (select role_test_user_id from pg_temp._commatch_service_detail_it_config);

set local role authenticated;
select pg_temp._commatch_service_detail_it_set_user(role_test_user_id)
from pg_temp._commatch_service_detail_it_config;
select pg_temp._commatch_service_detail_it_expect_error(
  'suspended administrator', '42501', 'Insufficient admin permission',
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, 0)$$
);

reset role;
update public.admin_accounts
set status = 'revoked', suspended_at = null, revoked_at = pg_catalog.now()
where user_id = (select role_test_user_id from pg_temp._commatch_service_detail_it_config);

set local role authenticated;
select pg_temp._commatch_service_detail_it_set_user(role_test_user_id)
from pg_temp._commatch_service_detail_it_config;
select pg_temp._commatch_service_detail_it_expect_error(
  'revoked administrator', '42501', 'Insufficient admin permission',
  $$select * from public.get_admin_service_statistic_details('total_matches', 10, 0)$$
);

reset role;

select 'PASS administrator service statistic details; all fixture changes rolled back'
  as test_result;

rollback;
