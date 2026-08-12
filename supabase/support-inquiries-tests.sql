-- ComMatch support inquiry integration test (rollback-safe).
--
-- Replace the eight Auth UUID placeholders with one existing active super_admin
-- and seven user-confirmed disposable ordinary Auth users. The seven disposable
-- users must not have admin rows; the three member fixtures also need profiles
-- and no existing restriction rows. Temporary administrator rows and all other
-- fixture writes are rolled back.

begin;

create temp table _commatch_support_it_config (
  super_admin_id uuid not null,
  admin_id uuid not null,
  moderator_id uuid not null,
  suspended_admin_id uuid not null,
  revoked_admin_id uuid not null,
  member_a_id uuid not null,
  member_b_id uuid not null,
  suspended_member_id uuid not null,
  fixture_confirmation text not null,
  member_a_inquiry_id uuid,
  member_b_inquiry_id uuid,
  suspended_member_inquiry_id uuid,
  first_answer_updated_at timestamptz,
  second_answer_updated_at timestamptz
) on commit drop;

insert into _commatch_support_it_config values (
  nullif('PASTE_ACTIVE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_ACTIVE_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_ADMIN_USER_ID')::uuid,
  nullif('PASTE_ACTIVE_MODERATOR_USER_ID', 'PASTE_' || 'ACTIVE_MODERATOR_USER_ID')::uuid,
  nullif('PASTE_SUSPENDED_ADMIN_USER_ID', 'PASTE_' || 'SUSPENDED_ADMIN_USER_ID')::uuid,
  nullif('PASTE_REVOKED_ADMIN_USER_ID', 'PASTE_' || 'REVOKED_ADMIN_USER_ID')::uuid,
  nullif('PASTE_MEMBER_A_USER_ID', 'PASTE_' || 'MEMBER_A_USER_ID')::uuid,
  nullif('PASTE_MEMBER_B_USER_ID', 'PASTE_' || 'MEMBER_B_USER_ID')::uuid,
  nullif('PASTE_SUSPENDED_MEMBER_USER_ID', 'PASTE_' || 'SUSPENDED_MEMBER_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'),
  null, null, null, null, null
);

grant select, update on _commatch_support_it_config to anon, authenticated, service_role;

create function pg_temp._commatch_support_set_user(p_user_id uuid, p_role text default 'authenticated')
returns void language plpgsql as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', case when p_user_id is null then '{}'
    else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', p_role)::text end, true);
end
$function$;

create function pg_temp._commatch_support_expect_error(p_label text, p_state text, p_sql text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception when others then
    if sqlstate <> p_state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
    end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_support_set_user(uuid, text) to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_support_expect_error(text, text, text) to anon, authenticated, service_role;

do $preflight$
declare v_config _commatch_support_it_config%rowtype; v_ids uuid[];
begin
  select * into v_config from _commatch_support_it_config;
  v_ids := array[v_config.super_admin_id, v_config.admin_id, v_config.moderator_id,
    v_config.suspended_admin_id, v_config.revoked_admin_id, v_config.member_a_id,
    v_config.member_b_id, v_config.suspended_member_id];
  if pg_catalog.array_position(v_ids, null) is not null
     or (select pg_catalog.count(distinct id) from pg_catalog.unnest(v_ids) as fixture(id)) <> 8
     or (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 8 then
    raise exception 'Replace all eight PASTE_* UUIDs with distinct existing Auth users';
  end if;
  if v_config.fixture_confirmation <> 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace the fixture confirmation placeholder';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.super_admin_id and role = 'super_admin' and status = 'active'
  ) then
    raise exception 'The root administrator fixture must be an existing active super_admin';
  end if;
  if exists (select 1 from public.admin_accounts where user_id = any(v_ids[2:8])) then
    raise exception 'The seven disposable Auth fixtures must not have existing admin_accounts rows';
  end if;
  if (select pg_catalog.count(*) from public.profiles where id = any(v_ids[6:8])) <> 3
     or exists (select 1 from public.member_restrictions where user_id = any(v_ids[6:8])) then
    raise exception 'Ordinary fixtures need profiles, no admin rows, and no existing restrictions';
  end if;
  if pg_catalog.to_regprocedure('public.create_my_support_inquiry(text,text,text)') is null then
    raise exception 'Apply support-inquiries.sql before running this test';
  end if;
end
$preflight$;

-- Owner-only, rollback-safe administrator fixtures. This follows the existing
-- notices/admin-account-management test pattern and never changes a pre-existing
-- administrator row.
insert into public.admin_accounts (
  user_id, role, status, suspended_at, revoked_at, created_by
)
select admin_id, 'admin', 'active', null::timestamptz, null::timestamptz, super_admin_id
from _commatch_support_it_config
union all
select moderator_id, 'moderator', 'active', null::timestamptz, null::timestamptz, super_admin_id
from _commatch_support_it_config
union all
select suspended_admin_id, 'admin', 'suspended', pg_catalog.now(), null::timestamptz, super_admin_id
from _commatch_support_it_config
union all
select revoked_admin_id, 'admin', 'revoked', null::timestamptz, pg_catalog.now(), super_admin_id
from _commatch_support_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select suspended_member_id, 'suspended', 'visible', pg_catalog.now(), null, 'rollback support access fixture'
from _commatch_support_it_config;

-- Member A creates an inquiry; user_id cannot be supplied or spoofed.
set local role authenticated;
select pg_temp._commatch_support_set_user(member_a_id) from _commatch_support_it_config;
do $member_a_create$
declare v_config _commatch_support_it_config%rowtype; v_id uuid;
begin
  select * into v_config from _commatch_support_it_config;
  select public.create_my_support_inquiry('service', 'rollback member A inquiry', 'member A body') into v_id;
  update _commatch_support_it_config set member_a_inquiry_id = v_id;
  if not exists (select 1 from public.get_my_support_inquiry(v_id) where inquiry_id = v_id and status = 'pending') then
    raise exception 'FAIL member A own inquiry create/detail';
  end if;
  if not exists (select 1 from public.get_my_support_inquiries() where inquiry_id = v_id and status = 'pending') then
    raise exception 'FAIL member A own inquiry list';
  end if;
end
$member_a_create$;

select pg_temp._commatch_support_expect_error('member direct select', '42501',
  $$select * from public.support_inquiries$$);
select pg_temp._commatch_support_expect_error('member direct insert', '42501',
  $$insert into public.support_inquiries(user_id,category,subject,body) values (auth.uid(),'other','x','x')$$);
select pg_temp._commatch_support_expect_error('member direct update', '42501',
  $$update public.support_inquiries set status='closed'$$);
select pg_temp._commatch_support_expect_error('member direct delete', '42501',
  $$delete from public.support_inquiries$$);

-- Member B is isolated from A and creates a separate fixture.
select pg_temp._commatch_support_set_user(member_b_id) from _commatch_support_it_config;
do $member_b_create$
declare v_config _commatch_support_it_config%rowtype; v_id uuid;
begin
  select * into v_config from _commatch_support_it_config;
  if exists (select 1 from public.get_my_support_inquiry(v_config.member_a_inquiry_id))
     or exists (select 1 from public.get_my_support_inquiries() where inquiry_id = v_config.member_a_inquiry_id) then
    raise exception 'FAIL member B can see member A inquiry';
  end if;
  select public.create_my_support_inquiry('account', 'rollback member B inquiry', 'member B body') into v_id;
  update _commatch_support_it_config set member_b_inquiry_id = v_id;
  if not exists (select 1 from public.get_my_support_inquiries() where inquiry_id = v_id) then
    raise exception 'FAIL member B own inquiry list';
  end if;
end
$member_b_create$;

-- Suspended ordinary members retain support-only create/read access.
select pg_temp._commatch_support_set_user(suspended_member_id) from _commatch_support_it_config;
do $suspended_member_support$
declare v_id uuid;
begin
  if public.is_member_service_allowed() then
    raise exception 'FAIL suspended member unexpectedly has general member service access';
  end if;
  select public.create_my_support_inquiry('account', 'rollback suspended inquiry', 'suspended member body') into v_id;
  update _commatch_support_it_config set suspended_member_inquiry_id = v_id;
  if not exists (select 1 from public.get_my_support_inquiry(v_id) where inquiry_id = v_id) then
    raise exception 'FAIL suspended member cannot read own support inquiry';
  end if;
end
$suspended_member_support$;

reset role;
set local role anon;
select pg_temp._commatch_support_set_user(null, 'anon');
select pg_temp._commatch_support_expect_error('anon create', '42501',
  $$select public.create_my_support_inquiry('other','anon','anon')$$);
select pg_temp._commatch_support_expect_error('anon list', '42501',
  $$select * from public.get_my_support_inquiries()$$);

-- Moderator, inactive administrators, and ordinary members cannot use admin RPCs.
reset role;
set local role authenticated;
select pg_temp._commatch_support_set_user(moderator_id) from _commatch_support_it_config;
select pg_temp._commatch_support_expect_error('moderator admin list', '42501',
  $$select * from public.get_admin_support_inquiries(null,1,20)$$);
select pg_temp._commatch_support_set_user(suspended_admin_id) from _commatch_support_it_config;
select pg_temp._commatch_support_expect_error('suspended admin list', '42501',
  $$select * from public.get_admin_support_inquiries(null,1,20)$$);
select pg_temp._commatch_support_set_user(revoked_admin_id) from _commatch_support_it_config;
select pg_temp._commatch_support_expect_error('revoked admin list', '42501',
  $$select * from public.get_admin_support_inquiries(null,1,20)$$);
select pg_temp._commatch_support_set_user(member_b_id) from _commatch_support_it_config;
select pg_temp._commatch_support_expect_error('ordinary member admin list', '42501',
  $$select * from public.get_admin_support_inquiries(null,1,20)$$);

-- Active admin answers, edits with a fresh token, rejects stale edits, then closes.
select pg_temp._commatch_support_set_user(admin_id) from _commatch_support_it_config;
do $active_admin_answer$
declare v_config _commatch_support_it_config%rowtype; v_initial timestamptz; v_first timestamptz; v_second timestamptz;
begin
  select * into v_config from _commatch_support_it_config;
  if not exists (select 1 from public.get_admin_support_inquiries('pending',1,20) where inquiry_id = v_config.member_a_inquiry_id) then
    raise exception 'FAIL active admin inquiry list';
  end if;
  select inquiry.updated_at into v_initial
  from public.get_admin_support_inquiry(v_config.member_a_inquiry_id) as inquiry;
  select updated_at into v_first from public.answer_admin_support_inquiry(v_config.member_a_inquiry_id, v_initial, 'first admin answer');
  update _commatch_support_it_config set first_answer_updated_at = v_first;
  if not exists (select 1 from public.get_admin_support_inquiry(v_config.member_a_inquiry_id)
    where status = 'answered' and answer_body = 'first admin answer' and answered_at is not null) then
    raise exception 'FAIL pending to answered lifecycle';
  end if;
  begin
    perform public.answer_admin_support_inquiry(v_config.member_a_inquiry_id, v_initial, 'stale answer');
    raise exception 'FAIL stale answer unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%SUPPORT_INQUIRY_STALE_VERSION%' then raise; end if;
  end;
  select updated_at into v_second from public.answer_admin_support_inquiry(v_config.member_a_inquiry_id, v_first, 'corrected admin answer');
  update _commatch_support_it_config set second_answer_updated_at = v_second;
end
$active_admin_answer$;

-- Super administrator can view and close; pending cannot be closed directly.
select pg_temp._commatch_support_set_user(super_admin_id) from _commatch_support_it_config;
do $super_admin_close$
declare v_config _commatch_support_it_config%rowtype; v_status text; v_member_b_updated_at timestamptz;
begin
  select * into v_config from _commatch_support_it_config;
  select inquiry.updated_at into v_member_b_updated_at
  from public.get_admin_support_inquiry(v_config.member_b_inquiry_id) as inquiry;
  begin
    perform public.close_admin_support_inquiry(v_config.member_b_inquiry_id,
      v_member_b_updated_at);
    raise exception 'FAIL pending inquiry close unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
  perform public.answer_admin_support_inquiry(
    v_config.member_b_inquiry_id, v_member_b_updated_at, 'super admin answer');
  if not exists (select 1 from public.get_admin_support_inquiry(v_config.member_b_inquiry_id)
    where status = 'answered' and answer_body = 'super admin answer') then
    raise exception 'FAIL active super administrator answer';
  end if;
  select status into v_status from public.close_admin_support_inquiry(
    v_config.member_a_inquiry_id, v_config.second_answer_updated_at);
  if v_status <> 'closed' then raise exception 'FAIL answered to closed lifecycle'; end if;
  begin
    perform public.answer_admin_support_inquiry(v_config.member_a_inquiry_id,
      (select inquiry.updated_at
       from public.get_admin_support_inquiry(v_config.member_a_inquiry_id) as inquiry),
      'closed edit');
    raise exception 'FAIL closed answer edit unexpectedly succeeded';
  exception when sqlstate '22023' then null;
  end;
end
$super_admin_close$;

-- Member projection contains the answer but no admin identity/action history.
select pg_temp._commatch_support_set_user(member_a_id) from _commatch_support_it_config;
do $member_answer_projection$
declare v_config _commatch_support_it_config%rowtype;
begin
  select * into v_config from _commatch_support_it_config;
  if not exists (select 1 from public.get_my_support_inquiry(v_config.member_a_inquiry_id)
    where status = 'closed' and answer_body = 'corrected admin answer' and answered_at is not null) then
    raise exception 'FAIL member answer projection';
  end if;
  if pg_catalog.pg_get_function_result('public.get_my_support_inquiry(uuid)'::pg_catalog.regprocedure)
     like any(array['%admin_user_id%', '%action%']) then
    raise exception 'FAIL member detail exposes internal admin fields';
  end if;
end
$member_answer_projection$;

reset role;

do $admin_action_history$
declare v_config _commatch_support_it_config%rowtype;
begin
  select * into v_config from _commatch_support_it_config;
  if (select pg_catalog.count(*) from public.support_inquiry_admin_actions
      where inquiry_id = v_config.member_a_inquiry_id) <> 3
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
      where inquiry_id = v_config.member_a_inquiry_id and action = 'answer') <> 1
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
      where inquiry_id = v_config.member_a_inquiry_id and action = 'answer_update') <> 1
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
      where inquiry_id = v_config.member_a_inquiry_id and action = 'close') <> 1 then
    raise exception 'FAIL append-only admin action history';
  end if;
end
$admin_action_history$;

do $acl_and_contract$
begin
  if pg_catalog.pg_get_function_arguments('public.create_my_support_inquiry(text,text,text)'::pg_catalog.regprocedure)
       like '%user%'
     or pg_catalog.has_table_privilege('authenticated', 'public.support_inquiries', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.support_inquiries', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.support_inquiries', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.support_inquiries', 'DELETE')
     or pg_catalog.has_function_privilege('anon', 'public.create_my_support_inquiry(text,text,text)', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.create_my_support_inquiry(text,text,text)', 'EXECUTE') then
    raise exception 'FAIL support inquiry contract or ACL';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.support_inquiries'::pg_catalog.regclass
      and conname = 'support_inquiries_user_id_fkey'
      and confrelid = 'auth.users'::pg_catalog.regclass
      and confdeltype = 'c'
  ) then
    raise exception 'FAIL inquiry owner deletion must cascade with Auth account deletion';
  end if;
end
$acl_and_contract$;

select 'PASS support inquiries integration test; rolling back fixture writes' as test_result;
rollback;
