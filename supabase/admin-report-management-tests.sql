-- ComMatch administrator report RPC rollback integration tests.
--
-- In a Supabase SQL Editor tab, replace the five PASTE_* UUID placeholders
-- with one existing active super administrator and four user-confirmed
-- disposable, non-production Auth users. The four ordinary users must have
-- profiles and must not be administrators. Replace the confirmation placeholder
-- with CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS. No real UUID belongs in this
-- repository. This transaction deliberately deletes/recreates report fixtures
-- and deletes one disposable Auth user, then restores everything with ROLLBACK.
-- Apply admin-report-management.sql before running this file.

begin;

create temp table _commatch_report_it_config (
  super_admin_id uuid not null,
  role_test_user_id uuid not null,
  message_target_user_id uuid not null,
  missing_profile_user_id uuid not null,
  deleted_user_id uuid not null,
  fixture_confirmation text not null,
  semantic_profile_report_id uuid not null default pg_catalog.gen_random_uuid(),
  semantic_deleted_report_id uuid not null default pg_catalog.gen_random_uuid(),
  semantic_message_report_id uuid not null default pg_catalog.gen_random_uuid(),
  match_id uuid not null default pg_catalog.gen_random_uuid(),
  message_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_report_it_config (
  super_admin_id, role_test_user_id, message_target_user_id,
  missing_profile_user_id, deleted_user_id, fixture_confirmation
) values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_ROLE_TEST_USER_ID', 'PASTE_' || 'ROLE_TEST_USER_ID')::uuid,
  nullif('PASTE_MESSAGE_TARGET_USER_ID', 'PASTE_' || 'MESSAGE_TARGET_USER_ID')::uuid,
  nullif('PASTE_MISSING_PROFILE_USER_ID', 'PASTE_' || 'MISSING_PROFILE_USER_ID')::uuid,
  nullif('PASTE_DELETED_USER_ID', 'PASTE_' || 'DELETED_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on _commatch_report_it_config to anon, authenticated, service_role;

do $preflight$
declare v_config _commatch_report_it_config%rowtype; v_ids uuid[];
begin
  select * into v_config from _commatch_report_it_config;
  v_ids := array[v_config.super_admin_id, v_config.role_test_user_id,
    v_config.message_target_user_id, v_config.missing_profile_user_id, v_config.deleted_user_id];
  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace every PASTE_* Auth UUID';
  end if;
  if v_config.fixture_confirmation <> 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace the fixture confirmation placeholder';
  end if;
  if (select pg_catalog.count(distinct id) from pg_catalog.unnest(v_ids) ids(id)) <> 5
     or (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 5 then
    raise exception 'All five configured Auth users must exist and be distinct';
  end if;
  if not exists (select 1 from public.admin_accounts where user_id=v_config.super_admin_id and role='super_admin' and status='active') then
    raise exception 'The supplied super administrator is not active';
  end if;
  if exists (select 1 from public.admin_accounts where user_id=any(v_ids[2:5]))
     or (select pg_catalog.count(*) from public.profiles where id=any(v_ids[2:5])) <> 4 then
    raise exception 'The four disposable ordinary users need profiles and no admin row';
  end if;
  if pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or not public.is_member_profile_visible(v_config.missing_profile_user_id)
     or not public.is_member_profile_visible(v_config.deleted_user_id) then
    raise exception 'Semantic profile-report targets must be visible before fixture deletion';
  end if;
  if exists (
    select 1 from public.matches as existing_match
    where existing_match.user_1_id = least(v_config.role_test_user_id, v_config.message_target_user_id)
      and existing_match.user_2_id = greatest(v_config.role_test_user_id, v_config.message_target_user_id)
  ) then
    raise exception 'The pagination reporter and message target must not already share a match';
  end if;
  if pg_catalog.to_regprocedure('public.get_admin_reports(text,text,integer,integer)') is null
     or pg_catalog.to_regprocedure('public.get_admin_report_detail(uuid)') is null then
    raise exception 'Apply admin-report-management.sql before this test';
  end if;
end;
$preflight$;

create function pg_temp._commatch_report_it_set_user(p_user_id uuid)
returns void language plpgsql as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub',p_user_id,'role','authenticated')::text, true);
end;
$function$;

create function pg_temp._commatch_report_it_expect_sqlstate(p_label text, p_state text, p_sql text)
returns void language plpgsql as $function$
begin
  begin execute p_sql; raise exception 'FAIL % unexpectedly succeeded', p_label;
  exception when others then
    if sqlstate is distinct from p_state then
      raise exception 'FAIL % expected %, received % (%)', p_label, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'PASS % (SQLSTATE %)', p_label, p_state;
  end;
end;
$function$;

create function pg_temp._commatch_report_it_seed(p_count integer)
returns void language plpgsql as $function$
begin
  delete from public.reports;
  delete from public.messages
  where match_id = (select match_id from pg_temp._commatch_report_it_config);

  with pagination_messages as (
    insert into public.messages (id, match_id, sender_id, content)
    select
      pg_catalog.gen_random_uuid(),
      config.match_id,
      config.message_target_user_id,
      'rollback pagination message ' || fixture.position
    from pg_temp._commatch_report_it_config as config
    cross join pg_catalog.generate_series(1, p_count) as fixture(position)
    returning id, match_id, sender_id
  )
  insert into public.reports (
    id, reporter_id, target_type, target_user_id, target_message_id, target_match_id,
    reason_code, reason_detail, target_snapshot, status, created_at
  )
  select
    pg_catalog.gen_random_uuid(),
    config.role_test_user_id,
    'message',
    pagination_message.sender_id,
    pagination_message.id,
    pagination_message.match_id,
    'other',
    'rollback pagination fixture',
    '{}'::jsonb,
    'pending',
    timestamptz '2099-01-01 00:00:00+00'
  from pagination_messages as pagination_message
  cross join pg_temp._commatch_report_it_config as config;
end;
$function$;

grant execute on function pg_temp._commatch_report_it_set_user(uuid) to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_report_it_expect_sqlstate(text,text,text) to anon, authenticated, service_role;

insert into public.admin_accounts (user_id, role, status)
select role_test_user_id, 'admin', 'active' from _commatch_report_it_config;

insert into public.matches (id,user_1_id,user_2_id,status)
select match_id, least(role_test_user_id,message_target_user_id),
  greatest(role_test_user_id,message_target_user_id), 'active'
from _commatch_report_it_config;

set local role authenticated;
select pg_temp._commatch_report_it_set_user(role_test_user_id) from _commatch_report_it_config;

-- Exact 0/1/10/11/21 result counts, total_count and pages 1/2/last.
do $pagination$
declare v_count integer; v_rows integer; v_total bigint; v_ids uuid[]; v_sorted uuid[];
begin
  foreach v_count in array array[0,1,10,11,21] loop
    set local role postgres;
    perform pg_temp._commatch_report_it_seed(v_count);
    set local role authenticated;
    select pg_catalog.count(*), pg_catalog.max(total_count), pg_catalog.array_agg(report_id order by created_at desc, report_id desc)
      into v_rows, v_total, v_ids from public.get_admin_reports(null,null,1,10);
    if v_rows <> least(v_count,10) or (v_count > 0 and v_total <> v_count) or (v_count=0 and v_total is not null) then
      raise exception 'FAIL pagination count % (rows %, total %)', v_count, v_rows, v_total;
    end if;
    if v_count > 0 then
      select pg_catalog.array_agg(id order by created_at desc,id desc) into v_sorted
      from (select id,created_at from public.reports order by created_at desc,id desc limit 10) expected;
      if v_ids is distinct from v_sorted then raise exception 'FAIL created_at/id stable ordering for %', v_count; end if;
    end if;
    select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows,v_total
      from public.get_admin_reports(null,null,2,10);
    if v_rows <> greatest(least(v_count-10,10),0) or (v_count>10 and v_total<>v_count) then
      raise exception 'FAIL page 2 for %', v_count;
    end if;
    select pg_catalog.count(*) into v_rows from public.get_admin_reports(null,null,greatest(1,ceiling(v_count/10.0)::integer),10);
    if v_rows <> (
      case
        when v_count = 0 then 0
        when v_count % 10 = 0 then 10
        else v_count % 10
      end
    ) then
      raise exception 'FAIL last page for %', v_count;
    end if;
    raise notice 'PASS report pagination fixture count %', v_count;
  end loop;
end;
$pagination$;

set local role postgres;
delete from public.reports;
delete from public.messages
where match_id = (select match_id from _commatch_report_it_config);

-- Create profile-missing, deleted-member, and message-author fixtures.
insert into public.messages (id,match_id,sender_id,content)
select message_id,match_id,message_target_user_id,'rollback report message' from _commatch_report_it_config;
insert into public.reports (
  id,reporter_id,target_type,target_user_id,target_message_id,target_match_id,
  reason_code,reason_detail,target_snapshot,status,created_at
)
select semantic_profile_report_id,role_test_user_id,'profile',missing_profile_user_id,null::uuid,null::uuid,
  'fake_profile','missing profile fixture','{}'::jsonb,'pending',timestamptz '2099-02-01 00:00:00+00'
from _commatch_report_it_config
union all
select semantic_deleted_report_id,role_test_user_id,'profile',deleted_user_id,null::uuid,null::uuid,
  'other','deleted member fixture','{}'::jsonb,'reviewing',timestamptz '2099-02-01 00:00:00+00'
from _commatch_report_it_config
union all
select semantic_message_report_id,role_test_user_id,'message',message_target_user_id,message_id,match_id,
  'harassment','message fixture','{}'::jsonb,'resolved',timestamptz '2099-02-01 00:00:00+00'
from _commatch_report_it_config;
delete from public.profiles where id=(select missing_profile_user_id from _commatch_report_it_config);
delete from auth.users where id=(select deleted_user_id from _commatch_report_it_config);

set local role authenticated;
select pg_temp._commatch_report_it_set_user(role_test_user_id) from _commatch_report_it_config;
do $metadata$
declare v_config _commatch_report_it_config%rowtype; v_row record;
begin
  select * into v_config from _commatch_report_it_config;
  select * into v_row from public.get_admin_reports(null,null,1,10) where report_id=v_config.semantic_profile_report_id;
  if not v_row.reporter_member_exists or not v_row.reporter_profile_exists
     or not v_row.reported_member_exists or v_row.reported_profile_exists then
    raise exception 'FAIL reporter/reported member-profile existence metadata';
  end if;
  select * into v_row from public.get_admin_reports(null,null,1,10) where report_id=v_config.semantic_deleted_report_id;
  if v_row.reported_member_exists or v_row.reported_profile_exists then raise exception 'FAIL deleted Auth member metadata'; end if;
  select * into v_row from public.get_admin_report_detail(v_config.semantic_message_report_id);
  if v_row.message_sender_id <> v_config.message_target_user_id
     or v_row.reported_user_id <> v_config.message_target_user_id
     or not v_row.message_sender_member_exists or not v_row.message_sender_profile_exists
     or not v_row.reported_member_exists or not v_row.reported_profile_exists then
    raise exception 'FAIL message reporter target/author metadata';
  end if;
  raise notice 'PASS member/profile/deleted/message metadata and detail contract';
end;
$metadata$;

-- Existing filters and all administrator roles remain usable.
do $roles$
declare v_role text; v_config _commatch_report_it_config%rowtype;
begin
  select * into v_config from _commatch_report_it_config;
  foreach v_role in array array['super_admin','admin','moderator'] loop
    set local role postgres;
    update public.admin_accounts set role=v_role where user_id=v_config.role_test_user_id;
    set local role authenticated;
    perform pg_temp._commatch_report_it_set_user(v_config.role_test_user_id);
    perform * from public.get_admin_reports('pending','profile',1,10);
    perform * from public.get_admin_reports('resolved','message',1,10);
    perform * from public.get_admin_report_detail(v_config.semantic_message_report_id);
    raise notice 'PASS % report list/detail', v_role;
  end loop;
end;
$roles$;

select pg_temp._commatch_report_it_set_user(message_target_user_id) from _commatch_report_it_config;
select pg_temp._commatch_report_it_expect_sqlstate('ordinary authenticated list','42501','select * from public.get_admin_reports()');
reset role;
set local role anon;
select pg_temp._commatch_report_it_expect_sqlstate('anon list','42501','select * from public.get_admin_reports()');
reset role;
set local role service_role;
select pg_temp._commatch_report_it_expect_sqlstate('service_role execute ACL','42501','select * from public.get_admin_reports()');
reset role;

do $contract$
declare v_function record; v_count integer:=0;
begin
  for v_function in select p.oid,p.proname,p.prosecdef,p.provolatile,p.proconfig,
      pg_catalog.pg_get_userbyid(p.proowner) owner_name
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_admin_reports','get_admin_report_detail')
  loop
    v_count:=v_count+1;
    if v_function.owner_name<>'postgres' or not v_function.prosecdef or v_function.provolatile<>'s'
       or not ('search_path=""'=any(v_function.proconfig))
       or pg_catalog.has_function_privilege('public',v_function.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_function.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',v_function.oid,'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated',v_function.oid,'EXECUTE') then
      raise exception 'FAIL % owner/security/STABLE/search_path/ACL',v_function.proname;
    end if;
  end loop;
  if v_count<>2 then raise exception 'FAIL report function count'; end if;
  raise notice 'PASS report RPC owner, SECURITY DEFINER, STABLE, empty search_path, and ACL';
end;
$contract$;

select 'PASS all report management rollback integration tests' as test_result;
rollback;
