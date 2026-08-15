-- ComMatch administrator Premium membership SQL integration tests.
--
-- DO NOT save real identifiers in this file. In a Supabase SQL Editor tab,
-- replace the four PASTE_* UUID placeholders with one existing active super
-- administrator and three user-confirmed disposable, non-production Auth users.
-- Replace PASTE_TEST_FIXTURE_CONFIRMATION with the exact confirmation token shown
-- below. The role-test user and both Premium targets must start as non-admins and
-- none may have Premium/action/receipt rows. The pagination section creates
-- identifier-only disposable Auth fixtures inside the transaction; all changes
-- end with ROLLBACK.
--
-- Apply admin-premium-memberships.sql and then
-- priority-recommendation-premium-migration.sql before running this test.
-- Repeat the permission section after each supported reinstall sequence when
-- validating deployment order. admin-accounts.sql and premium-memberships.sql
-- remain prerequisites. Do not reapply an older shared permission definition
-- after notices.sql or support-inquiries.sql has extended that contract.

begin;

create temp table _commatch_premium_it_config (
  super_admin_id uuid,
  role_test_user_id uuid,
  member_id uuid,
  second_member_id uuid,
  fixture_confirmation text,
  grant_request_id uuid not null,
  noop_request_id uuid not null,
  failed_request_id uuid not null,
  invalid_status_request_id uuid not null,
  invalid_period_request_id uuid not null,
  empty_reason_request_id uuid not null,
  long_reason_request_id uuid not null,
  atomic_failure_request_id uuid not null,
  future_request_id uuid not null,
  active_request_id uuid not null,
  suspend_request_id uuid not null,
  reactivate_request_id uuid not null,
  revoke_request_id uuid not null,
  regrant_request_id uuid not null,
  super_grant_request_id uuid not null
) on commit drop;

insert into _commatch_premium_it_config values (
  nullif(
    'PASTE_SUPER_ADMIN_USER_ID',
    'PASTE_' || 'SUPER_ADMIN_USER_ID'
  )::uuid,
  nullif(
    'PASTE_ROLE_TEST_USER_ID',
    'PASTE_' || 'ROLE_TEST_USER_ID'
  )::uuid,
  nullif(
    'PASTE_MEMBER_USER_ID',
    'PASTE_' || 'MEMBER_USER_ID'
  )::uuid,
  nullif(
    'PASTE_SECOND_MEMBER_USER_ID',
    'PASTE_' || 'SECOND_MEMBER_USER_ID'
  )::uuid,
  nullif(
    'PASTE_TEST_FIXTURE_CONFIRMATION',
    'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'
  ),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
);

grant select on _commatch_premium_it_config to anon, authenticated;

do $preflight$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_ids uuid[];
  v_admin_marker text;
  v_access_definition text;
  v_permission_definition text;
begin
  select * into v_config from _commatch_premium_it_config;
  v_ids := array[
    v_config.super_admin_id,
    v_config.role_test_user_id,
    v_config.member_id,
    v_config.second_member_id
  ];

  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace all four PASTE_* Auth UUID values in the SQL Editor tab';
  end if;
  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if (select pg_catalog.count(distinct fixture.user_id) from pg_catalog.unnest(v_ids) fixture(user_id)) <> 4 then
    raise exception 'The super administrator, role-test user, and two Premium targets must be distinct';
  end if;
  if (
    select pg_catalog.count(distinct request_id)
    from pg_catalog.unnest(array[
      v_config.grant_request_id,
      v_config.noop_request_id,
      v_config.failed_request_id,
      v_config.invalid_status_request_id,
      v_config.invalid_period_request_id,
      v_config.empty_reason_request_id,
      v_config.long_reason_request_id,
      v_config.atomic_failure_request_id,
      v_config.future_request_id,
      v_config.active_request_id,
      v_config.suspend_request_id,
      v_config.reactivate_request_id,
      v_config.revoke_request_id,
      v_config.regrant_request_id,
      v_config.super_grant_request_id
    ]::uuid[]) as request(request_id)
  ) <> 15 then
    raise exception 'Every configured request UUID must be distinct';
  end if;
  if (select pg_catalog.count(*) from auth.users as auth_user where auth_user.id = any(v_ids)) <> 4 then
    raise exception 'Every test UUID must identify an existing Auth user';
  end if;
  if (
    select pg_catalog.count(*)
    from public.profiles as profile
    where profile.id = any(array[
      v_config.role_test_user_id,
      v_config.member_id,
      v_config.second_member_id
    ]::uuid[])
  ) <> 3 then
    raise exception 'The role-test user and both Premium targets must have existing profiles';
  end if;
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_config.super_admin_id
      and admin_account.role = 'super_admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if exists (
    select 1 from public.admin_accounts as admin_account
    where admin_account.user_id = any(array[
      v_config.role_test_user_id,
      v_config.member_id,
      v_config.second_member_id
    ]::uuid[])
  ) or exists (
    select 1 from public.premium_memberships as membership
    where membership.user_id = any(array[
      v_config.role_test_user_id,
      v_config.member_id,
      v_config.second_member_id
    ]::uuid[])
  ) or exists (
    select 1 from public.premium_membership_actions as action
    where action.subject_user_id = any(array[v_config.member_id, v_config.second_member_id]::uuid[])
       or action.performed_by = v_config.role_test_user_id
  ) or exists (
    select 1 from public.premium_membership_request_receipts as receipt
    where receipt.subject_user_id = any(array[v_config.member_id, v_config.second_member_id]::uuid[])
       or receipt.performed_by = v_config.role_test_user_id
  ) then
    raise exception 'Role-test and Premium target users must start without administrator or Premium data';
  end if;
  if pg_catalog.to_regprocedure(
       'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'
     ) is null then
    raise exception 'Administrator Premium SQL is not installed';
  end if;
  if pg_catalog.to_regclass('public.premium_feature_access') is null then
    raise exception 'Priority recommendation pilot table is missing';
  end if;

  v_admin_marker := pg_catalog.obj_description(
    'public.get_my_admin_access()'::pg_catalog.regprocedure,
    'pg_proc'
  );
  if v_admin_marker is null
     or v_admin_marker not in (
       'commatch_admin_accounts_v1',
       'commatch_admin_member_restrictions_v1',
       'commatch_admin_premium_memberships_v1',
       'commatch_notices_v1',
       'commatch_support_inquiries_v1'
     )
     or pg_catalog.obj_description(
       'public.has_admin_permission(text)'::pg_catalog.regprocedure,
       'pg_proc'
     ) is distinct from v_admin_marker then
    raise exception 'Administrator permission marker compatibility regression';
  end if;

  v_access_definition := pg_catalog.pg_get_functiondef(
    'public.get_my_admin_access()'::pg_catalog.regprocedure
  );
  v_permission_definition := pg_catalog.pg_get_functiondef(
    'public.has_admin_permission(text)'::pg_catalog.regprocedure
  );
  if pg_catalog.strpos(v_access_definition, '''premium_memberships_view''') = 0
     or pg_catalog.strpos(v_access_definition, '''premium_memberships_manage''') = 0
     or pg_catalog.strpos(v_permission_definition, '''premium_memberships_view''') = 0
     or pg_catalog.strpos(v_permission_definition, '''premium_memberships_manage''') = 0 then
    raise exception 'Shared administrator functions lost Premium permissions';
  end if;
  if v_admin_marker in ('commatch_notices_v1', 'commatch_support_inquiries_v1')
     and (
       pg_catalog.strpos(v_access_definition, '''notices_manage''') = 0
       or pg_catalog.strpos(v_permission_definition, '''notices_manage''') = 0
     ) then
    raise exception 'Shared administrator functions lost notices_manage';
  end if;
  if v_admin_marker = 'commatch_support_inquiries_v1'
     and (
       pg_catalog.strpos(v_access_definition, '''support_inquiries_view''') = 0
       or pg_catalog.strpos(v_access_definition, '''support_inquiries_manage''') = 0
       or pg_catalog.strpos(v_permission_definition, '''support_inquiries_view''') = 0
       or pg_catalog.strpos(v_permission_definition, '''support_inquiries_manage''') = 0
     ) then
    raise exception 'Shared administrator functions lost support inquiry permissions';
  end if;

  raise notice 'PASS fixture, object, and shared administrator permission preflight';
end;
$preflight$;

create function pg_temp._commatch_premium_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text
    end,
    true
  );
  if auth.uid() is distinct from p_user_id then
    raise exception 'auth.uid() setup failed';
  end if;
end;
$function$;

create function pg_temp._commatch_premium_it_expect_sqlstate(
  p_label text,
  p_expected_state text,
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
      raise notice 'PASS % (SQLSTATE %)', p_label, p_expected_state;
  end;
end;
$function$;

grant execute on function pg_temp._commatch_premium_it_set_user(uuid)
  to anon, authenticated;
grant execute on function pg_temp._commatch_premium_it_expect_sqlstate(text, text, text)
  to anon, authenticated;

-- Owner-only fixture setup. The existing super administrator is never changed.
-- One disposable user begins as active admin and is transitioned through the
-- remaining administrator roles near the end of this transaction.
insert into public.admin_accounts (
  user_id, role, status, suspended_at, revoked_at
)
select role_test_user_id, 'admin', 'active', null, null
from _commatch_premium_it_config;

-- Fault-injection trigger used once to prove that a receipt failure rolls back
-- the preceding membership and action writes in the same RPC statement.
create function pg_temp._commatch_premium_it_fail_receipt()
returns trigger
language plpgsql
as $function$
begin
  if new.request_id = (
    select atomic_failure_request_id from pg_temp._commatch_premium_it_config
  ) then
    raise exception using errcode = 'P0001', message = 'TEST_RECEIPT_FAILURE';
  end if;
  return new;
end;
$function$;

create trigger _commatch_premium_it_fail_receipt
  before insert on public.premium_membership_request_receipts
  for each row
  execute function pg_temp._commatch_premium_it_fail_receipt();

-- An administrator account cannot itself become a Premium membership target.
-- Use the disposable role-test administrator as the target so no existing
-- administrator membership or history is changed.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(super_admin_id)
from _commatch_premium_it_config;
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_request_id uuid := pg_catalog.gen_random_uuid();
begin
  select * into v_config from _commatch_premium_it_config;

  begin
    perform * from public.update_admin_premium_membership(
      v_config.role_test_user_id,
      null,
      'active',
      pg_catalog.now(),
      null,
      array['likes_received']::text[],
      'administrator target blocked',
      v_request_id
    );
    raise exception 'FAIL administrator Premium target unexpectedly succeeded';
  exception
    when others then
      if sqlstate is distinct from '22023'
         or sqlerrm is distinct from
           'Administrator accounts cannot receive member Premium access' then
        raise exception
          'FAIL administrator Premium target: expected 22023 / %, received % / %',
          'Administrator accounts cannot receive member Premium access',
          sqlstate,
          sqlerrm;
      end if;
  end;

  set local role postgres;
  if exists (
    select 1
    from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_id
  ) or exists (
    select 1
    from public.premium_membership_actions as action
    where action.request_id = v_request_id
  ) or exists (
    select 1
    from public.premium_memberships as membership
    where membership.user_id = v_config.role_test_user_id
  ) then
    raise exception 'FAIL administrator Premium target left membership, action, or receipt data';
  end if;

  raise notice 'PASS administrator Premium target blocked without membership, action, or receipt';
end;
$$;
reset role;

-- anon cannot execute any administrator RPC.
set local role anon;
select pg_temp._commatch_premium_it_set_user(null);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'anon list',
  '42501',
  'select * from public.get_admin_premium_memberships()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'anon detail',
  '42501',
  format(
    'select * from public.get_admin_premium_membership(%L, 10)',
    (select member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'anon change',
  '42501',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''test'',%L)',
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);
reset role;

-- An ordinary authenticated member has neither Premium administrator permission.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(member_id)
from _commatch_premium_it_config;
do $$
begin
  if public.has_admin_permission('premium_memberships_view')
     or public.has_admin_permission('premium_memberships_manage') then
    raise exception 'FAIL ordinary member received a Premium administrator permission';
  end if;
  raise notice 'PASS ordinary member permission matrix';
end;
$$;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'ordinary member list', '42501', 'select * from public.get_admin_premium_memberships()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'ordinary member detail',
  '42501',
  format(
    'select * from public.get_admin_premium_membership(%L, 10)',
    (select member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'ordinary member change',
  '42501',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''ordinary member blocked'',%L)',
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);
reset role;

-- Active admin: immediate finite grant with a partial, deliberately unsorted
-- feature list. The RPC stores a canonical sorted list and one audit action.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
-- The exists filter returns every membership row regardless of stored status or
-- time window. Identifier-only Auth fixtures provide exact pagination counts.
set local role postgres;
create temp table _commatch_premium_page_users (
  position integer primary key,
  user_id uuid not null unique
) on commit drop;
insert into _commatch_premium_page_users
select position, pg_catalog.gen_random_uuid()
from pg_catalog.generate_series(1,21) as fixture(position);
grant select on pg_temp._commatch_premium_page_users to authenticated;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from _commatch_premium_page_users as fixture
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user
  where auth_user.id=(select member_id from _commatch_premium_it_config)
) as source;

delete from public.premium_memberships;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $exists_pagination$
declare v_count integer; v_rows integer; v_total bigint; v_row record;
begin
  foreach v_count in array array[0,1,10,11,21] loop
    set local role postgres;
    delete from public.premium_memberships;
    insert into public.premium_memberships (
      user_id,status,started_at,expires_at,feature_keys,updated_at
    )
    select fixture.user_id,
      case fixture.position%3 when 0 then 'revoked' when 1 then 'active' else 'suspended' end,
      case when fixture.position=1 then pg_catalog.now()
           when fixture.position=4 then pg_catalog.now()+interval '1 day'
           else pg_catalog.now()-interval '2 days' end,
      case when fixture.position=5 then pg_catalog.now()-interval '1 day'
           when fixture.position=7 then pg_catalog.now()
           when fixture.position=6 then null else pg_catalog.now()+interval '2 days' end,
      array['likes_received']::text[],
      case when fixture.position>=20 then timestamptz '2099-01-01 00:01:00+00'
           else timestamptz '2099-01-01 00:00:00+00' + fixture.position*interval '1 second' end
    from _commatch_premium_page_users fixture where fixture.position<=v_count;
    set local role authenticated;
    select pg_catalog.count(*),pg_catalog.max(total_count) into v_rows,v_total
      from public.get_admin_premium_memberships(null,'exists',10,0,'updated_at','desc');
    if v_rows<>least(v_count,10) or (v_count>0 and v_total<>v_count) or (v_count=0 and v_total is not null) then
      raise exception 'FAIL exists count % (rows %, total %)',v_count,v_rows,v_total;
    end if;
    select pg_catalog.count(*),pg_catalog.max(total_count) into v_rows,v_total
      from public.get_admin_premium_memberships(null,'exists',10,10,'updated_at','desc');
    if v_rows<>greatest(least(v_count-10,10),0) or (v_count>10 and v_total<>v_count) then
      raise exception 'FAIL exists offset 10 for %',v_count;
    end if;
    select pg_catalog.count(*) into v_rows
      from public.get_admin_premium_memberships(null,'exists',10,20,'updated_at','desc');
    if v_rows<>greatest(v_count-20,0) then raise exception 'FAIL exists offset 20 for %',v_count; end if;
    raise notice 'PASS Premium exists pagination fixture count %',v_count;
  end loop;

  select * into v_row from public.get_admin_premium_memberships(null,'exists',100,0,'updated_at','desc')
    where member_user_id=(select user_id from _commatch_premium_page_users where position=4);
  if not v_row.membership_exists or not v_row.is_not_started then raise exception 'FAIL exists future row'; end if;
  select * into v_row from public.get_admin_premium_memberships(null,'exists',100,0,'updated_at','desc')
    where member_user_id=(select user_id from _commatch_premium_page_users where position=7);
  if not v_row.membership_exists or not v_row.is_expired then raise exception 'FAIL exists expired row'; end if;
  if (select pg_catalog.count(*) from public.get_admin_premium_memberships(null,'exists',100,0,'updated_at','desc'))<>21
     or exists (select 1 from public.get_admin_premium_memberships(null,'exists',100,0,'updated_at','desc') where not membership_exists)
     or exists (select 1 from public.get_admin_premium_memberships(null,'exists',100,0,'updated_at','desc') where member_user_id=(select role_test_user_id from _commatch_premium_it_config)) then
    raise exception 'FAIL exists membership/admin exclusion semantics';
  end if;
  if (select pg_catalog.array_agg(member_user_id)
      from public.get_admin_premium_memberships(null,'exists',2,0,'updated_at','desc'))
     is distinct from (select pg_catalog.array_agg(user_id order by user_id)
                       from _commatch_premium_page_users where position>=20) then
    raise exception 'FAIL updated_at tie-breaker user_id ordering';
  end if;
  select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows, v_total
  from public.get_admin_premium_memberships(null,'available',100,0,'updated_at','desc');
  if v_rows <> 5 or v_total <> 5
     or exists (
       select 1 from public.get_admin_premium_memberships(null,'available',100,0,'updated_at','desc')
       where not is_available or stored_status <> 'active'
     ) then
    raise exception 'FAIL available filter contract (rows %, total %)', v_rows, v_total;
  end if;

  select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows, v_total
  from public.get_admin_premium_memberships(null,'not_started',100,0,'updated_at','desc');
  if v_rows <> 1 or v_total <> 1
     or not exists (
       select 1 from public.get_admin_premium_memberships(null,'not_started',100,0,'updated_at','desc')
       where member_user_id=(select user_id from _commatch_premium_page_users where position=4)
         and is_not_started and stored_status='active'
     ) then
    raise exception 'FAIL not_started filter contract (rows %, total %)', v_rows, v_total;
  end if;

  select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows, v_total
  from public.get_admin_premium_memberships(null,'expired',100,0,'updated_at','desc');
  if v_rows <> 1 or v_total <> 1
     or not exists (
       select 1 from public.get_admin_premium_memberships(null,'expired',100,0,'updated_at','desc')
       where member_user_id=(select user_id from _commatch_premium_page_users where position=7)
         and is_expired and stored_status='active'
     ) then
    raise exception 'FAIL expired filter contract (rows %, total %)', v_rows, v_total;
  end if;

  select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows, v_total
  from public.get_admin_premium_memberships(null,'suspended',100,0,'updated_at','desc');
  if v_rows <> 7 or v_total <> 7
     or exists (
       select 1 from public.get_admin_premium_memberships(null,'suspended',100,0,'updated_at','desc')
       where stored_status <> 'suspended' or is_not_started or is_expired
     ) then
    raise exception 'FAIL suspended filter contract (rows %, total %)', v_rows, v_total;
  end if;

  select pg_catalog.count(*), pg_catalog.max(total_count) into v_rows, v_total
  from public.get_admin_premium_memberships(null,'revoked',100,0,'updated_at','desc');
  if v_rows <> 7 or v_total <> 7
     or exists (
       select 1 from public.get_admin_premium_memberships(null,'revoked',100,0,'updated_at','desc')
       where stored_status <> 'revoked' or is_not_started or is_expired
     ) then
    raise exception 'FAIL revoked filter contract (rows %, total %)', v_rows, v_total;
  end if;

  perform * from public.get_admin_premium_memberships(null,'all',10,0,'updated_at','desc');
  raise notice 'PASS exists/available/not_started/expired/suspended/revoked filters and time boundaries';
end;
$exists_pagination$;

select pg_temp._commatch_premium_it_expect_sqlstate(
  'invalid list status', '22023',
  'select * from public.get_admin_premium_memberships(null,''unsupported'',10,0,''updated_at'',''desc'')'
);

set local role postgres;
delete from public.premium_memberships;
delete from auth.users where id in (select user_id from _commatch_premium_page_users);

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_access record;
  v_result record;
  v_admin_marker text;
  v_expected_permissions text[];
begin
  select * into v_config from _commatch_premium_it_config;
  select * into v_access from public.get_my_admin_access();
  v_admin_marker := pg_catalog.obj_description(
    'public.get_my_admin_access()'::pg_catalog.regprocedure,
    'pg_proc'
  );
  v_expected_permissions := array[
    'admin_dashboard_view',
    'reports_view',
    'reports_manage',
    'member_restrictions_view',
    'member_restrictions_manage',
    'premium_memberships_view',
    'premium_memberships_manage'
  ]::text[]
  || case when v_admin_marker in ('commatch_notices_v1', 'commatch_support_inquiries_v1')
       then array['notices_manage']::text[] else array[]::text[] end
  || case when v_admin_marker = 'commatch_support_inquiries_v1'
       then array['support_inquiries_view', 'support_inquiries_manage']::text[]
       else array[]::text[] end;
  if not public.has_admin_permission('premium_memberships_view')
     or not public.has_admin_permission('premium_memberships_manage')
     or (
       v_admin_marker in ('commatch_notices_v1', 'commatch_support_inquiries_v1')
       and not public.has_admin_permission('notices_manage')
     )
     or (
       v_admin_marker = 'commatch_support_inquiries_v1'
       and (
         not public.has_admin_permission('support_inquiries_view')
         or not public.has_admin_permission('support_inquiries_manage')
       )
     )
     or v_access.permissions is distinct from v_expected_permissions then
    raise exception 'FAIL active admin Premium permission matrix';
  end if;

  perform * from public.get_admin_premium_memberships(null, 'all', 10, 0, 'updated_at', 'desc');
  perform * from public.get_admin_premium_membership(v_config.member_id, 10);

  select * into v_result
  from public.update_admin_premium_membership(
    v_config.member_id,
    null,
    'active',
    pg_catalog.now(),
    pg_catalog.now() + interval '1 day',
    array['likes_received', 'advanced_member_search'],
    'integration grant',
    v_config.grant_request_id
  );

  if not v_result.is_success or v_result.is_noop or v_result.is_duplicate_request
     or v_result.action_type <> 'granted' or v_result.action_id is null
     or not v_result.is_available
     or v_result.feature_keys <> array['advanced_member_search', 'likes_received']::text[] then
    raise exception 'FAIL immediate finite partial grant result';
  end if;
  set local role postgres;
  if (select pg_catalog.count(*) from public.premium_membership_actions
      where request_id = v_config.grant_request_id) <> 1 then
    raise exception 'FAIL grant did not create exactly one action';
  end if;
  raise notice 'PASS admin grant, finite period, partial features, canonical order, and audit';
end;
$$;

-- Same request_id returns the original action result without a second write.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_result record;
  v_before_updated_at timestamptz;
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  select updated_at into v_before_updated_at
  from public.premium_memberships where user_id = v_config.member_id;

  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result
  from public.update_admin_premium_membership(
    v_config.member_id,
    null,
    'revoked',
    pg_catalog.now() - interval '10 days',
    null,
    array['expanded_recommendations'],
    'different retry body is ignored',
    v_config.grant_request_id
  );

  set local role postgres;
  if not v_result.is_duplicate_request or v_result.action_type <> 'granted'
     or v_result.membership_updated_at is distinct from v_before_updated_at
     or (select pg_catalog.count(*) from public.premium_membership_actions
         where request_id = v_config.grant_request_id) <> 1
     or (select pg_catalog.count(*) from public.premium_membership_request_receipts
         where request_id = v_config.grant_request_id and not is_noop) <> 1 then
    raise exception 'FAIL duplicate request idempotency';
  end if;
  raise notice 'PASS duplicate request returns original receipt without new write/action';
end;
$$;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'same request ID for another member',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''request conflict'',%L)',
    (select second_member_id from _commatch_premium_it_config),
    (select grant_request_id from _commatch_premium_it_config)
  )
);

-- A new request with identical state, including feature order differences, is a
-- no-op. Reason differences alone are not membership-state changes.
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_result record;
  v_action_count bigint;
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id = v_config.member_id;
  select pg_catalog.count(*) into v_action_count from public.premium_membership_actions;

  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result
  from public.update_admin_premium_membership(
    v_config.member_id,
    v_membership.updated_at,
    v_membership.status,
    v_membership.started_at,
    v_membership.expires_at,
    array['likes_received', 'advanced_member_search'],
    'different no-op reason',
    v_config.noop_request_id
  );

  set local role postgres;
  if not v_result.is_noop or v_result.action_id is not null
     or v_result.action_type is not null
     or (select updated_at from public.premium_memberships where user_id=v_config.member_id)
          is distinct from v_membership.updated_at
     or (select pg_catalog.count(*) from public.premium_membership_actions) <> v_action_count then
    raise exception 'FAIL no-op changed membership or action history';
  end if;
  if (select pg_catalog.count(*) from public.premium_membership_request_receipts
      where request_id=v_config.noop_request_id and is_noop) <> 1 then
    raise exception 'FAIL no-op did not create exactly one request receipt';
  end if;

  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result
  from public.update_admin_premium_membership(
    v_config.member_id,
    null,
    'revoked',
    pg_catalog.now() - interval '5 days',
    null,
    array['expanded_recommendations'],
    'immediate retry body is ignored',
    v_config.noop_request_id
  );
  set local role postgres;
  if not v_result.is_noop or not v_result.is_duplicate_request
     or v_result.membership_updated_at is distinct from v_membership.updated_at
     or (select pg_catalog.count(*) from public.premium_membership_request_receipts
         where request_id=v_config.noop_request_id) <> 1
     or (select pg_catalog.count(*) from public.premium_membership_actions) <> v_action_count then
    raise exception 'FAIL immediate no-op request receipt replay';
  end if;
  raise notice 'PASS no-op receipt and immediate idempotent replay';
end;
$$;

-- Stale version and invalid input validation.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $stale_contract$
declare
  v_config _commatch_premium_it_config%rowtype;
begin
  select * into v_config from _commatch_premium_it_config;

  begin
    perform * from public.update_admin_premium_membership(
      v_config.member_id,
      '2000-01-01T00:00:00Z'::timestamptz,
      'active',
      pg_catalog.now(),
      null,
      array['likes_received']::text[],
      'stale existing membership',
      v_config.failed_request_id
    );
    raise exception 'FAIL stale existing membership unexpectedly succeeded';
  exception
    when others then
      if sqlstate is distinct from 'P0001'
         or sqlerrm is distinct from 'PREMIUM_STALE_VERSION' then
        raise exception
          'FAIL stale existing membership: expected P0001 / PREMIUM_STALE_VERSION, received % / %',
          sqlstate,
          sqlerrm;
      end if;
  end;

  begin
    perform * from public.update_admin_premium_membership(
      v_config.second_member_id,
      '2000-01-01T00:00:00Z'::timestamptz,
      'active',
      pg_catalog.now(),
      null,
      array['likes_received']::text[],
      'stale missing membership',
      v_config.failed_request_id
    );
    raise exception 'FAIL stale missing membership unexpectedly succeeded';
  exception
    when others then
      if sqlstate is distinct from 'P0001'
         or sqlerrm is distinct from 'PREMIUM_STALE_VERSION' then
        raise exception
          'FAIL stale missing membership: expected P0001 / PREMIUM_STALE_VERSION, received % / %',
          sqlstate,
          sqlerrm;
      end if;
  end;

  raise notice 'PASS stale existing/missing membership contracts (P0001 / PREMIUM_STALE_VERSION)';
end;
$stale_contract$;
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  if exists (
    select 1 from public.premium_membership_request_receipts
    where request_id=v_config.failed_request_id
  ) or exists (
    select 1 from public.premium_membership_actions
    where request_id=v_config.failed_request_id
  ) then
    raise exception 'FAIL stale request left a receipt or action';
  end if;
  raise notice 'PASS failed request left no receipt or action';
end;
$$;
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'empty feature list',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''active'',pg_catalog.now(),null,array[]::text[],''invalid'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from public.premium_memberships where user_id=(select member_id from _commatch_premium_it_config)),
    pg_catalog.gen_random_uuid()
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'unknown feature key',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''active'',pg_catalog.now(),null,array[''not_a_feature'']::text[],''invalid'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from public.premium_memberships where user_id=(select member_id from _commatch_premium_it_config)),
    pg_catalog.gen_random_uuid()
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'duplicate feature keys',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''active'',pg_catalog.now(),null,array[''likes_received'',''likes_received'']::text[],''invalid'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from public.premium_memberships where user_id=(select member_id from _commatch_premium_it_config)),
    pg_catalog.gen_random_uuid()
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'six feature keys including unknown',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''active'',pg_catalog.now(),null,array[''likes_received'',''received_likes'',''advanced_member_search'',''expanded_recommendations'',''priority_recommendation'',''not_a_feature'']::text[],''invalid'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from public.premium_memberships where user_id=(select member_id from _commatch_premium_it_config)),
    pg_catalog.gen_random_uuid()
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'administrator target rejected',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''invalid target'',%L)',
    (select role_test_user_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);

reset role;

-- Snapshot the complete write footprint once, then verify it after each rejected
-- request. Dedicated request UUIDs make the four failure cases independent.
create temp table _commatch_premium_it_invalid_before on commit drop as
select
  membership.*,
  (select pg_catalog.count(*) from public.premium_memberships) as membership_count,
  (select pg_catalog.count(*) from public.premium_membership_actions) as action_count,
  (select pg_catalog.count(*) from public.premium_membership_request_receipts) as receipt_count
from public.premium_memberships as membership
cross join _commatch_premium_it_config as config
where membership.user_id = config.member_id;
grant select on _commatch_premium_it_invalid_before to authenticated;

create function pg_temp._commatch_premium_it_assert_invalid_unchanged(
  p_label text,
  p_request_id uuid
)
returns void
language plpgsql
as $function$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_before _commatch_premium_it_invalid_before%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_premium_it_config;
  select * into v_before from _commatch_premium_it_invalid_before;
  select membership.updated_at into v_updated_at
  from public.premium_memberships as membership
  where membership.user_id = v_config.member_id;

  if v_updated_at is distinct from v_before.updated_at
     or (select pg_catalog.count(*) from public.premium_memberships) <> v_before.membership_count
     or (select pg_catalog.count(*) from public.premium_membership_actions) <> v_before.action_count
     or (select pg_catalog.count(*) from public.premium_membership_request_receipts) <> v_before.receipt_count
     or exists (
       select 1 from public.premium_membership_actions as action
       where action.request_id = p_request_id
     )
     or exists (
       select 1 from public.premium_membership_request_receipts as receipt
       where receipt.request_id = p_request_id
     ) then
    raise exception 'FAIL % changed membership, action, or receipt data', p_label;
  end if;
  raise notice 'PASS % left membership, action, and receipt data unchanged', p_label;
end;
$function$;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'invalid status value',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''unsupported'',%L,%L,%L::text[],''invalid status'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from _commatch_premium_it_invalid_before),
    (select started_at from _commatch_premium_it_invalid_before),
    (select expires_at from _commatch_premium_it_invalid_before),
    (select feature_keys from _commatch_premium_it_invalid_before),
    (select invalid_status_request_id from _commatch_premium_it_config)
  )
);
reset role;
select pg_temp._commatch_premium_it_assert_invalid_unchanged(
  'invalid status value',
  (select invalid_status_request_id from _commatch_premium_it_config)
);

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'Premium end time not after start time',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''active'',pg_catalog.now(),pg_catalog.now(),%L::text[],''invalid period'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from _commatch_premium_it_invalid_before),
    (select feature_keys from _commatch_premium_it_invalid_before),
    (select invalid_period_request_id from _commatch_premium_it_config)
  )
);
reset role;
select pg_temp._commatch_premium_it_assert_invalid_unchanged(
  'Premium end time not after start time',
  (select invalid_period_request_id from _commatch_premium_it_config)
);

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'blank administrator reason',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,%L,%L,%L,%L::text[],''   '',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from _commatch_premium_it_invalid_before),
    (select status from _commatch_premium_it_invalid_before),
    (select started_at from _commatch_premium_it_invalid_before),
    (select expires_at from _commatch_premium_it_invalid_before),
    (select feature_keys from _commatch_premium_it_invalid_before),
    (select empty_reason_request_id from _commatch_premium_it_config)
  )
);
reset role;
select pg_temp._commatch_premium_it_assert_invalid_unchanged(
  'blank administrator reason',
  (select empty_reason_request_id from _commatch_premium_it_config)
);

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'administrator reason longer than 500 characters',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,%L,%L,%L,%L::text[],%L,%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from _commatch_premium_it_invalid_before),
    (select status from _commatch_premium_it_invalid_before),
    (select started_at from _commatch_premium_it_invalid_before),
    (select expires_at from _commatch_premium_it_invalid_before),
    (select feature_keys from _commatch_premium_it_invalid_before),
    pg_catalog.repeat('x', 501),
    (select long_reason_request_id from _commatch_premium_it_config)
  )
);
reset role;
select pg_temp._commatch_premium_it_assert_invalid_unchanged(
  'administrator reason longer than 500 characters',
  (select long_reason_request_id from _commatch_premium_it_config)
);

create temp table _commatch_premium_it_atomic_before on commit drop as
select
  membership.*,
  (select pg_catalog.count(*) from public.premium_membership_actions) as action_count,
  (select pg_catalog.count(*) from public.premium_membership_request_receipts) as receipt_count
from public.premium_memberships as membership
cross join _commatch_premium_it_config as config
where membership.user_id=config.member_id;
grant select on _commatch_premium_it_atomic_before to authenticated;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'receipt failure rolls back membership and action',
  'P0001',
  format(
    'select * from public.update_admin_premium_membership(%L,%L,''suspended'',%L,%L,%L::text[],''atomic rollback'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select updated_at from _commatch_premium_it_atomic_before),
    (select started_at from _commatch_premium_it_atomic_before),
    (select expires_at from _commatch_premium_it_atomic_before),
    (select feature_keys from _commatch_premium_it_atomic_before),
    (select atomic_failure_request_id from _commatch_premium_it_config)
  )
);
reset role;

do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_before _commatch_premium_it_atomic_before%rowtype;
  v_after public.premium_memberships%rowtype;
begin
  select * into v_config from _commatch_premium_it_config;
  select * into v_before from _commatch_premium_it_atomic_before;
  select * into v_after from public.premium_memberships where user_id=v_config.member_id;
  if (v_after.id, v_after.status, v_after.started_at, v_after.expires_at,
      v_after.feature_keys, v_after.updated_at)
     is distinct from
     (v_before.id, v_before.status, v_before.started_at, v_before.expires_at,
      v_before.feature_keys, v_before.updated_at)
     or (select pg_catalog.count(*) from public.premium_membership_actions) <> v_before.action_count
     or (select pg_catalog.count(*) from public.premium_membership_request_receipts) <> v_before.receipt_count
     or exists (
       select 1 from public.premium_membership_request_receipts
       where request_id=v_config.atomic_failure_request_id
     ) then
    raise exception 'FAIL receipt fault left a membership, action, or receipt change';
  end if;
  raise notice 'PASS receipt failure rolled back membership, action, and receipt atomically';
end;
$$;

drop trigger _commatch_premium_it_fail_receipt
  on public.premium_membership_request_receipts;
drop function pg_temp._commatch_premium_it_fail_receipt();

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;

-- Future start, then equality-at-start and indefinite full-feature update.
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_result record;
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active',
    pg_catalog.now() + interval '1 day', pg_catalog.now() + interval '2 days',
    array['expanded_recommendations'], 'future start', v_config.future_request_id
  );
  if v_result.is_available then raise exception 'FAIL future start is available'; end if;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active',
    pg_catalog.now(), null,
    array['expanded_recommendations','likes_received','received_likes','advanced_member_search','priority_recommendation'],
    'active indefinite full features', v_config.active_request_id
  );
  if not v_result.is_available or v_result.expires_at is not null
     or pg_catalog.cardinality(v_result.feature_keys) <> 5
     or v_result.action_type <> 'updated' then
    raise exception 'FAIL equality start or indefinite full-feature update';
  end if;
  raise notice 'PASS future start, start equality, indefinite period, full features, feature add/remove';
end;
$$;

-- A no-op receipt remains authoritative after later requests have changed the
-- membership. Reusing the old request ID returns its original snapshot and does
-- not restore or mutate the current membership.
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_before public.premium_memberships%rowtype;
  v_after public.premium_memberships%rowtype;
  v_receipt public.premium_membership_request_receipts%rowtype;
  v_result record;
  v_action_count bigint;
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  select * into v_before from public.premium_memberships where user_id=v_config.member_id;
  select * into v_receipt from public.premium_membership_request_receipts
  where request_id=v_config.noop_request_id;
  select pg_catalog.count(*) into v_action_count from public.premium_membership_actions;

  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, null, 'suspended', pg_catalog.now()-interval '30 days', null,
    array['likes_received'], 'historical no-op replay', v_config.noop_request_id
  );
  set local role postgres;
  select * into v_after from public.premium_memberships where user_id=v_config.member_id;

  if not v_result.is_noop or not v_result.is_duplicate_request
     or v_result.stored_status is distinct from v_receipt.stored_status
     or v_result.is_available is distinct from v_receipt.result_is_available
     or v_result.started_at is distinct from v_receipt.started_at
     or v_result.expires_at is distinct from v_receipt.expires_at
     or v_result.feature_keys is distinct from v_receipt.feature_keys
     or v_result.membership_updated_at is distinct from v_receipt.membership_updated_at
     or v_after is distinct from v_before
     or (select pg_catalog.count(*) from public.premium_membership_actions) <> v_action_count
     or (select pg_catalog.count(*) from public.premium_membership_request_receipts
         where request_id=v_config.noop_request_id) <> 1 then
    raise exception 'FAIL historical no-op request replay';
  end if;
  raise notice 'PASS historical no-op response replay after later membership changes';
end;
$$;

-- Explicit finite-period extension and shortening remain the general updated
-- action; their previous/new timestamps in the action row carry the detail.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_result record;
  v_extended_expiry timestamptz := pg_catalog.now() + interval '3 days';
  v_shortened_expiry timestamptz := pg_catalog.now() + interval '12 hours';
begin
  select * into v_config from _commatch_premium_it_config;
  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active', v_membership.started_at,
    v_extended_expiry, v_membership.feature_keys,
    'extend finite period', pg_catalog.gen_random_uuid()
  );
  if v_result.action_type <> 'updated' or v_result.expires_at <> v_extended_expiry
     or not v_result.is_available then
    raise exception 'FAIL finite-period extension';
  end if;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active', v_membership.started_at,
    v_shortened_expiry, v_membership.feature_keys,
    'shorten finite period', pg_catalog.gen_random_uuid()
  );
  if v_result.action_type <> 'updated' or v_result.expires_at <> v_shortened_expiry
     or not v_result.is_available then
    raise exception 'FAIL finite-period shortening';
  end if;
  raise notice 'PASS period extension and shortening use updated actions';
end;
$$;

-- Existing member-facing functions use the same five-feature membership.
select pg_temp._commatch_premium_it_set_user(member_id)
from _commatch_premium_it_config;
do $$
declare v_access record;
begin
  if not public.has_premium_feature('likes_received')
     or not public.has_premium_feature('received_likes')
     or not public.has_premium_feature('advanced_member_search')
     or not public.has_premium_feature('expanded_recommendations')
     or not public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL existing feature function regression';
  end if;
  select * into v_access from public.get_my_premium_access();
  if not v_access.membership_exists or not v_access.is_available
     or pg_catalog.cardinality(v_access.feature_keys) <> 5 then
    raise exception 'FAIL existing access snapshot regression';
  end if;
  raise notice 'PASS existing member Premium functions with five feature keys';
end;
$$;

-- Member can SELECT only their row and cannot mutate it or access action rows.
do $$
begin
  if (select pg_catalog.count(*) from public.premium_memberships) <> 1 then
    raise exception 'FAIL member own SELECT RLS scope';
  end if;
  raise notice 'PASS member own SELECT retained';
end;
$$;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct Premium insert',
  '42501',
  format(
    'insert into public.premium_memberships(user_id,status,feature_keys) values (%L,''active'',array[''likes_received''])',
    (select second_member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct Premium update',
  '42501',
  'update public.premium_memberships set status=''revoked'' where user_id=auth.uid()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct Premium delete',
  '42501',
  'delete from public.premium_memberships where user_id=auth.uid()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct action select',
  '42501',
  'select * from public.premium_membership_actions'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct request receipt select',
  '42501',
  'select * from public.premium_membership_request_receipts'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct request receipt insert',
  '42501',
  format(
    'insert into public.premium_membership_request_receipts(request_id,subject_user_id,is_noop,membership_id,stored_status,result_is_available,started_at,feature_keys,membership_updated_at,performed_by) values (%L,%L,true,%L,''active'',true,pg_catalog.now(),array[''likes_received''],pg_catalog.now(),%L)',
    pg_catalog.gen_random_uuid(),
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid(),
    (select member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct request receipt update',
  '42501',
  'update public.premium_membership_request_receipts set stored_status=''revoked'''
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'member direct request receipt delete',
  '42501',
  'delete from public.premium_membership_request_receipts'
);

-- Restore admin claims for state transitions.
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;

do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_result record;
begin
  select * into v_config from _commatch_premium_it_config;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'suspended',
    v_membership.started_at, v_membership.expires_at, v_membership.feature_keys,
    'suspend', v_config.suspend_request_id
  );
  if v_result.action_type <> 'suspended' or v_result.is_available then
    raise exception 'FAIL active to suspended';
  end if;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active',
    v_membership.started_at, v_membership.expires_at, v_membership.feature_keys,
    'reactivate', v_config.reactivate_request_id
  );
  if v_result.action_type <> 'reactivated' or not v_result.is_available then
    raise exception 'FAIL suspended to active';
  end if;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'revoked',
    v_membership.started_at, v_membership.expires_at, v_membership.feature_keys,
    'revoke', v_config.revoke_request_id
  );
  if v_result.action_type <> 'revoked' or v_result.is_available then
    raise exception 'FAIL active to revoked';
  end if;

  set local role postgres;
  select * into v_membership from public.premium_memberships where user_id=v_config.member_id;
  set local role authenticated;
  perform pg_temp._commatch_premium_it_set_user(v_config.role_test_user_id);
  select * into v_result from public.update_admin_premium_membership(
    v_config.member_id, v_membership.updated_at, 'active',
    pg_catalog.now() - interval '1 hour', pg_catalog.now(),
    array['likes_received'], 'regrant at expiry boundary', v_config.regrant_request_id
  );
  if v_result.action_type <> 'regranted' or v_result.is_available then
    raise exception 'FAIL revoked regrant or expiry equality';
  end if;

  set local role postgres;
  if (select pg_catalog.count(*) from public.premium_memberships where user_id=v_config.member_id) <> 1 then
    raise exception 'FAIL regrant created a duplicate membership';
  end if;
  raise notice 'PASS suspend, reactivate, revoke, regrant, single row, and expiry boundary';
end;
$$;

-- Super admin also has both permissions and can grant a second member.
set local role authenticated;
select pg_temp._commatch_premium_it_set_user(super_admin_id)
from _commatch_premium_it_config;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'same request ID from another administrator',
  '22023',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''administrator conflict'',%L)',
    (select member_id from _commatch_premium_it_config),
    (select grant_request_id from _commatch_premium_it_config)
  )
);
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_access record;
  v_result record;
  v_admin_marker text;
  v_expected_permissions text[];
begin
  select * into v_config from _commatch_premium_it_config;
  select * into v_access from public.get_my_admin_access();
  v_admin_marker := pg_catalog.obj_description(
    'public.get_my_admin_access()'::pg_catalog.regprocedure,
    'pg_proc'
  );
  v_expected_permissions := array[
    'admin_dashboard_view',
    'reports_view',
    'reports_manage',
    'admin_accounts_manage',
    'member_restrictions_view',
    'member_restrictions_manage',
    'premium_memberships_view',
    'premium_memberships_manage'
  ]::text[]
  || case when v_admin_marker in ('commatch_notices_v1', 'commatch_support_inquiries_v1')
       then array['notices_manage']::text[] else array[]::text[] end
  || case when v_admin_marker = 'commatch_support_inquiries_v1'
       then array['support_inquiries_view', 'support_inquiries_manage']::text[]
       else array[]::text[] end;
  if not public.has_admin_permission('premium_memberships_view')
     or not public.has_admin_permission('premium_memberships_manage')
     or (
       v_admin_marker in ('commatch_notices_v1', 'commatch_support_inquiries_v1')
       and not public.has_admin_permission('notices_manage')
     )
     or (
       v_admin_marker = 'commatch_support_inquiries_v1'
       and (
         not public.has_admin_permission('support_inquiries_view')
         or not public.has_admin_permission('support_inquiries_manage')
       )
     )
     or v_access.permissions is distinct from v_expected_permissions then
    raise exception 'FAIL super admin Premium permission matrix';
  end if;
  perform * from public.get_admin_premium_memberships(null, 'all', 10, 0, 'updated_at', 'desc');
  perform * from public.get_admin_premium_membership(v_config.second_member_id, 10);
  select * into v_result from public.update_admin_premium_membership(
    v_config.second_member_id, null, 'active', pg_catalog.now(), null,
    array['received_likes'], 'super admin grant', v_config.super_grant_request_id
  );
  if v_result.action_type <> 'granted'
     or v_result.feature_keys <> array['received_likes']::text[] then
    raise exception 'FAIL super admin received_likes-only grant';
  end if;
  raise notice 'PASS super admin view/manage and received_likes-only grant';
end;
$$;
reset role;

-- Account restriction is returned by the detail RPC but does not mutate or
-- pause Premium state. The member-facing Premium function remains independent.
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until,
  reason, admin_note
)
select member_id, 'suspended', 'hidden', pg_catalog.now(), null,
  'Premium independence test', 'rollback fixture'
from _commatch_premium_it_config
on conflict (user_id) do update
set account_status = excluded.account_status,
    profile_visibility = excluded.profile_visibility,
    suspended_at = excluded.suspended_at,
    suspended_until = excluded.suspended_until,
    reason = excluded.reason,
    admin_note = excluded.admin_note;

-- Make member Premium active and unexpired as fixture owner without adding an
-- audit row; this is test setup only and is rolled back.
update public.premium_memberships as membership
set status='active', started_at=pg_catalog.now()-interval '1 hour',
    expires_at=pg_catalog.now()+interval '1 hour'
from _commatch_premium_it_config as config
where membership.user_id=config.member_id;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare v_detail record;
begin
  select * into v_detail from public.get_admin_premium_membership(
    (select member_id from _commatch_premium_it_config), 100
  );
  if v_detail.account_status <> 'suspended'
     or v_detail.profile_visibility <> 'hidden'
     or v_detail.stored_status <> 'active'
     or not v_detail.is_available then
    raise exception 'FAIL member restriction and Premium independence detail';
  end if;
  if pg_catalog.jsonb_array_length(v_detail.recent_actions) < 1 then
    raise exception 'FAIL detail action history';
  end if;
  raise notice 'PASS restriction state included without changing Premium';
end;
$$;

select pg_temp._commatch_premium_it_set_user(member_id)
from _commatch_premium_it_config;
do $$
begin
  if not public.has_premium_feature('likes_received') then
    raise exception 'FAIL member restriction improperly changed Premium function result';
  end if;
  raise notice 'PASS Premium duration/state remain independent from member restriction';
end;
$$;
reset role;

-- Audit invariants: every substantive RPC change has one action, previous/new
-- values and performer are retained, while no-op and duplicate retry add none.
do $$
declare
  v_config _commatch_premium_it_config%rowtype;
  v_action public.premium_membership_actions%rowtype;
begin
  select * into v_config from _commatch_premium_it_config;
  select * into v_action from public.premium_membership_actions
  where request_id=v_config.grant_request_id;
  if v_action.previous_status is not null or v_action.new_status <> 'active'
     or v_action.reason <> 'integration grant'
     or v_action.performed_by <> v_config.role_test_user_id
     or v_action.previous_feature_keys is not null
     or v_action.new_feature_keys <> array['advanced_member_search','likes_received']::text[] then
    raise exception 'FAIL grant action before/after or performer data';
  end if;
  if exists (select 1 from public.premium_membership_actions where request_id=v_config.noop_request_id) then
    raise exception 'FAIL no-op created an action';
  end if;
  if (select pg_catalog.count(*) from public.premium_membership_request_receipts
      where request_id=v_config.noop_request_id and is_noop
        and action_id is null and action_type is null) <> 1 then
    raise exception 'FAIL no-op receipt shape';
  end if;
  if (select pg_catalog.count(*) from public.premium_membership_actions
      where request_id=v_config.grant_request_id) <> 1 then
    raise exception 'FAIL duplicate request created another action';
  end if;
  if (select pg_catalog.count(*) from public.premium_membership_request_receipts
      where request_id=v_config.grant_request_id and not is_noop
        and action_id=v_action.id and action_type=v_action.action_type) <> 1 then
    raise exception 'FAIL changed request receipt/action linkage';
  end if;
  raise notice 'PASS action values, receipts, performer, reason, no-op, and duplicate invariants';
end;
$$;

-- Reuse the same disposable Auth user for the remaining administrator states.
-- The active-admin assertions and all mutations above ran first. Each UPDATE and
-- claim switch stays inside this transaction, and the final ROLLBACK removes the
-- inserted administrator row entirely.
update public.admin_accounts as admin_account
set role = 'moderator',
    status = 'active',
    suspended_at = null,
    revoked_at = null
from _commatch_premium_it_config as config
where admin_account.user_id = config.role_test_user_id;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare v_access record;
begin
  select * into v_access from public.get_my_admin_access();
  if not public.has_admin_permission('premium_memberships_view')
     or public.has_admin_permission('premium_memberships_manage')
     or public.has_admin_permission('notices_manage')
     or public.has_admin_permission('support_inquiries_view')
     or public.has_admin_permission('support_inquiries_manage')
     or v_access.permissions is distinct from array[
       'admin_dashboard_view',
       'reports_view',
       'reports_manage',
       'member_restrictions_view',
       'premium_memberships_view'
     ]::text[] then
    raise exception 'FAIL moderator Premium permission matrix';
  end if;
  perform * from public.get_admin_premium_memberships(null, 'all', 10, 0, 'nickname', 'asc');
  perform * from public.get_admin_premium_membership(
    (select second_member_id from _commatch_premium_it_config), 10
  );
  raise notice 'PASS moderator list, detail, and permission matrix';
end;
$$;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'moderator change',
  '42501',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''moderator blocked'',%L)',
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);
reset role;

update public.admin_accounts as admin_account
set role = 'admin',
    status = 'suspended',
    suspended_at = pg_catalog.now(),
    revoked_at = null
from _commatch_premium_it_config as config
where admin_account.user_id = config.role_test_user_id;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare v_access record;
begin
  select * into v_access from public.get_my_admin_access();
  if v_access.is_admin or pg_catalog.cardinality(v_access.permissions) <> 0 then
    raise exception 'FAIL suspended administrator retained permissions';
  end if;
  raise notice 'PASS suspended administrator empty permissions';
end;
$$;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'suspended administrator list', '42501', 'select * from public.get_admin_premium_memberships()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'suspended administrator detail',
  '42501',
  format(
    'select * from public.get_admin_premium_membership(%L, 10)',
    (select member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'suspended administrator change',
  '42501',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''blocked'',%L)',
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);
reset role;

update public.admin_accounts as admin_account
set role = 'admin',
    status = 'revoked',
    suspended_at = null,
    revoked_at = pg_catalog.now()
from _commatch_premium_it_config as config
where admin_account.user_id = config.role_test_user_id;

set local role authenticated;
select pg_temp._commatch_premium_it_set_user(role_test_user_id)
from _commatch_premium_it_config;
do $$
declare v_access record;
begin
  select * into v_access from public.get_my_admin_access();
  if v_access.is_admin or pg_catalog.cardinality(v_access.permissions) <> 0 then
    raise exception 'FAIL revoked administrator retained permissions';
  end if;
  raise notice 'PASS revoked administrator empty permissions';
end;
$$;
select pg_temp._commatch_premium_it_expect_sqlstate(
  'revoked administrator list', '42501', 'select * from public.get_admin_premium_memberships()'
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'revoked administrator detail',
  '42501',
  format(
    'select * from public.get_admin_premium_membership(%L, 10)',
    (select member_id from _commatch_premium_it_config)
  )
);
select pg_temp._commatch_premium_it_expect_sqlstate(
  'revoked administrator change',
  '42501',
  format(
    'select * from public.update_admin_premium_membership(%L,null,''active'',pg_catalog.now(),null,array[''likes_received'']::text[],''blocked'',%L)',
    (select member_id from _commatch_premium_it_config),
    pg_catalog.gen_random_uuid()
  )
);
reset role;

-- ACL, owner, RLS, and old function/table regression checks.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_policy
    where polrelid in (
      'public.premium_membership_actions'::pg_catalog.regclass,
      'public.premium_membership_request_receipts'::pg_catalog.regclass
    )
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where oid='public.premium_membership_actions'::pg_catalog.regclass and relrowsecurity
  ) then
    raise exception 'FAIL Premium action RLS shape';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid='public.premium_membership_request_receipts'::pg_catalog.regclass
      and relrowsecurity
  ) then
    raise exception 'FAIL Premium request receipt RLS shape';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.premium_membership_actions','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.premium_membership_actions','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('authenticated','public.premium_membership_request_receipts','SELECT,INSERT,UPDATE,DELETE')
     or pg_catalog.has_table_privilege('anon','public.premium_membership_request_receipts','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'FAIL browser action or receipt table privilege';
  end if;
  if pg_catalog.obj_description('public.premium_memberships'::pg_catalog.regclass,'pg_class')
       <> 'commatch_premium_memberships_v1'
     or pg_catalog.obj_description('public.has_premium_feature(text)'::pg_catalog.regprocedure,'pg_proc')
       <> 'commatch_premium_memberships_v1'
     or pg_catalog.obj_description('public.get_my_premium_access()'::pg_catalog.regprocedure,'pg_proc')
       <> 'commatch_premium_memberships_v1' then
    raise exception 'FAIL existing Premium objects changed';
  end if;
  raise notice 'PASS ACL, RLS, and existing object markers';
end;
$$;

select 'PASS all single-session integration tests; rolling back every fixture and data change' as test_result;

rollback;

-- TWO-SESSION CONCURRENCY TEST (manual, separate SQL Editor tabs)
--
-- Reusable scripts are available in:
--   admin-premium-memberships-concurrency-session-a.sql
--   admin-premium-memberships-concurrency-session-b.sql
--   admin-premium-memberships-concurrency-cleanup.sql
-- The detailed procedure below remains as an inline reference.
--
-- Use one active disposable admin and one disposable ordinary member with no
-- Premium row. Do not save replaced UUIDs in this file.
--
-- SESSION A:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub','PASTE_ACTIVE_ADMIN_ID',true);
--   select set_config('request.jwt.claims',
--     jsonb_build_object('sub','PASTE_ACTIVE_ADMIN_ID','role','authenticated')::text,true);
--   select * from public.update_admin_premium_membership(
--     'PASTE_MEMBER_ID', null, 'active', now(), now()+interval '1 day',
--     array['likes_received'], 'concurrency session A', gen_random_uuid());
--   select pg_sleep(20);
--   rollback;
--
-- Start SESSION B during A's sleep. It must wait on the target advisory lock.
-- Because A rolls back, B then becomes the single successful grant. For a stale
-- update test, commit A instead and have B pass the pre-A updated_at; B must fail
-- with SQLSTATE P0001 / PREMIUM_STALE_VERSION.
--
-- SESSION B:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub','PASTE_ACTIVE_ADMIN_ID',true);
--   select set_config('request.jwt.claims',
--     jsonb_build_object('sub','PASTE_ACTIVE_ADMIN_ID','role','authenticated')::text,true);
--   select clock_timestamp() as started_waiting;
--   select * from public.update_admin_premium_membership(
--     'PASTE_MEMBER_ID', null, 'active', now(), now()+interval '2 days',
--     array['advanced_member_search'], 'concurrency session B', gen_random_uuid());
--   select clock_timestamp() as finished_waiting;
--   rollback;
--
-- After both tabs finish, verify as owner that the member has its original row
-- count and no action whose reason begins with 'concurrency session'.
--
-- SAME-REQUEST NO-OP/CHANGE RACE VARIANT:
-- Prepare one existing membership and use the same request UUID in both tabs.
-- Session A submits its exact current values (no-op) while Session B submits a
-- real change. The request advisory lock makes the first receipt authoritative:
-- if A wins, B returns the original no-op receipt and performs no change; if B
-- wins, A returns B's changed receipt. In both cases there must be one receipt,
-- at most one action, and one membership mutation. Use the same administrator;
-- a different administrator must receive PREMIUM_REQUEST_ID_CONFLICT.
-- A different-administrator variant needs only the existing active super admin
-- and the disposable role-test user while it is active admin. It requires no
-- additional Auth account beyond the four single-session placeholders above.
