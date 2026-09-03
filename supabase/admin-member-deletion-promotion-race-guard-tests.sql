-- ComMatch administrator deletion/promotion race-guard rollback integration tests.
--
-- Apply admin-member-deletion-promotion-race-guard.sql first. Replace the five
-- PASTE_* values with one active super administrator and four distinct,
-- disposable, non-production ordinary Auth users that have profiles. Run this
-- file as one SQL Editor invocation. Every mutation is rolled back.
--
-- This single-session suite does not reproduce live two-session contention. It
-- verifies the shared advisory-lock/check ordering and both serialized outcomes
-- deterministically. Run an additional two-session contention check in staging
-- when a concurrent SQL harness is available.

begin;

create temp table _commatch_deletion_promotion_guard_config (
  admin_user_id uuid,
  requested_target_id uuid,
  failed_target_id uuid,
  promoted_target_id uuid,
  ordinary_caller_id uuid,
  fixture_confirmation text,
  requested_request_id uuid not null default pg_catalog.gen_random_uuid(),
  failed_request_id uuid not null default pg_catalog.gen_random_uuid(),
  promotion_request_id uuid not null default pg_catalog.gen_random_uuid(),
  normal_create_request_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_deletion_promotion_guard_config (
  admin_user_id,
  requested_target_id,
  failed_target_id,
  promoted_target_id,
  ordinary_caller_id,
  fixture_confirmation
) values (
  nullif('PASTE_ACTIVE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_REQUESTED_TARGET_USER_ID', 'PASTE_' || 'DISPOSABLE_REQUESTED_TARGET_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_FAILED_TARGET_USER_ID', 'PASTE_' || 'DISPOSABLE_FAILED_TARGET_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_PROMOTED_TARGET_USER_ID', 'PASTE_' || 'DISPOSABLE_PROMOTED_TARGET_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_ORDINARY_CALLER_USER_ID', 'PASTE_' || 'DISPOSABLE_ORDINARY_CALLER_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on _commatch_deletion_promotion_guard_config
  to anon, authenticated, service_role;

create function pg_temp._commatch_deletion_promotion_guard_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end
$function$;

create function pg_temp._commatch_deletion_promotion_guard_expect_error(
  p_label text,
  p_state text,
  p_message text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL % unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate is distinct from p_state
     or (p_message is not null and pg_catalog.strpos(sqlerrm, p_message) = 0) then
        raise exception 'FAIL % expected % / %, received % / %',
          p_label, p_state, p_message, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS % (% / %)', p_label, sqlstate, sqlerrm;
  end;
end
$function$;

do $preflight$
declare
  v_config _commatch_deletion_promotion_guard_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_deletion_promotion_guard_config;
  v_ids := array[
    v_config.admin_user_id,
    v_config.requested_target_id,
    v_config.failed_target_id,
    v_config.promoted_target_id,
    v_config.ordinary_caller_id
  ];

  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace every PASTE_* Auth UUID';
  end if;
  if v_config.fixture_confirmation <> 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace the fixture confirmation placeholder';
  end if;
  if (select pg_catalog.count(distinct id) from pg_catalog.unnest(v_ids) as ids(id)) <> 5
     or (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 5 then
    raise exception 'All configured Auth users must exist and be distinct';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.admin_user_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'Configured administrator must be an active super_admin';
  end if;
  if exists (
    select 1 from public.admin_accounts
    where user_id = any(array[
      v_config.requested_target_id,
      v_config.failed_target_id,
      v_config.promoted_target_id,
      v_config.ordinary_caller_id
    ])
  ) then
    raise exception 'Disposable users must start as ordinary members';
  end if;
  if (
    select pg_catalog.count(*) from public.profiles
    where id = any(array[
      v_config.requested_target_id,
      v_config.failed_target_id,
      v_config.promoted_target_id,
      v_config.ordinary_caller_id
    ])
  ) <> 4 then
    raise exception 'Every disposable ordinary user must have a profile';
  end if;
  if exists (
    select 1 from public.admin_member_deletion_actions
    where target_user_id = any(array[
      v_config.requested_target_id,
      v_config.failed_target_id,
      v_config.promoted_target_id
    ])
      and status = 'requested'
  ) then
    raise exception 'Disposable targets must not have requested deletions';
  end if;
  if pg_catalog.to_regprocedure('public.lock_admin_account_write()') is null
     or pg_catalog.to_regprocedure(
       'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.create_admin_account(uuid,text,uuid,text)'
     ) is null then
    raise exception 'Apply the prerequisite migrations and race guard first';
  end if;
end
$preflight$;

do $metadata_and_lock_contract$
declare
  v_request_oid oid := pg_catalog.to_regprocedure(
    'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
  );
  v_create_oid oid := pg_catalog.to_regprocedure(
    'public.create_admin_account(uuid,text,uuid,text)'
  );
  v_request_definition text;
  v_create_definition text;
begin
  if pg_catalog.pg_get_function_result(v_request_oid) <>
       'TABLE(request_id uuid, target_user_id uuid, status text, is_duplicate boolean, created_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(v_create_oid) <>
       'TABLE(action_id uuid, target_user_id uuid, role text, status text, updated_at timestamp with time zone)' then
    raise exception 'FAIL RPC return contracts changed';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid in (v_request_oid, v_create_oid)
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
  ) <> 2 then
    raise exception 'FAIL RPC owner/security-definer/search_path contract';
  end if;

  if pg_catalog.obj_description(v_request_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1'
     or pg_catalog.obj_description(v_create_oid, 'pg_proc') <>
       'commatch_admin_account_management_v1' then
    raise exception 'FAIL RPC comments changed';
  end if;

  if pg_catalog.has_function_privilege('public', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_request_oid, 'EXECUTE') then
    raise exception 'FAIL deletion-request ACL changed';
  end if;

  if not pg_catalog.has_function_privilege('public', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_create_oid, 'EXECUTE') then
    raise exception 'FAIL create-admin ACL changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_member_deletion_actions'
      and indexname = 'admin_member_deletion_actions_requested_target_unique'
      and indexdef ilike '%UNIQUE%'
      and indexdef ilike '%WHERE (status = ''requested''::text)%'
  ) then
    raise exception 'FAIL requested-target partial unique constraint changed';
  end if;

  v_request_definition := pg_catalog.pg_get_functiondef(v_request_oid);
  v_create_definition := pg_catalog.pg_get_functiondef(v_create_oid);
  if pg_catalog.strpos(v_request_definition, 'lock_admin_account_write()') = 0
     or pg_catalog.strpos(v_create_definition, 'lock_admin_account_write()') = 0 then
    raise exception 'FAIL both RPCs must use the common admin write lock';
  end if;
  if pg_catalog.strpos(v_request_definition, 'lock_admin_account_write()') >
       pg_catalog.strpos(v_request_definition, 'Administrator accounts cannot be force-deleted')
     or pg_catalog.strpos(v_create_definition, 'lock_admin_account_write()') >
       pg_catalog.strpos(v_create_definition, 'ADMIN_ACCOUNT_TARGET_DELETION_REQUESTED') then
    raise exception 'FAIL lock/check ordering does not serialize the race guard';
  end if;
  raise notice 'PASS metadata, ACL, partial unique, and common lock contracts';
end
$metadata_and_lock_contract$;

set local role authenticated;
select pg_temp._commatch_deletion_promotion_guard_set_user(admin_user_id)
from _commatch_deletion_promotion_guard_config;

do $requested_blocks_promotion$
declare
  v_config _commatch_deletion_promotion_guard_config%rowtype;
  v_first record;
  v_duplicate record;
begin
  select * into v_config from _commatch_deletion_promotion_guard_config;
  select * into v_first
  from public.request_admin_member_deletion(
    v_config.requested_request_id,
    v_config.requested_target_id,
    'promotion race requested fixture',
    null
  );
  select * into v_duplicate
  from public.request_admin_member_deletion(
    v_config.requested_request_id,
    v_config.requested_target_id,
    'promotion race requested fixture',
    null
  );
  if v_first.status <> 'requested' or v_first.is_duplicate
     or v_duplicate.status <> 'requested' or not v_duplicate.is_duplicate
     or v_duplicate.request_id is distinct from v_first.request_id
     or v_duplicate.target_user_id is distinct from v_first.target_user_id
     or v_duplicate.created_at is distinct from v_first.created_at then
    raise exception 'FAIL deletion request idempotency changed';
  end if;
end
$requested_blocks_promotion$;

select pg_temp._commatch_deletion_promotion_guard_expect_error(
  'requested deletion blocks promotion',
  'P0001',
  'ADMIN_ACCOUNT_TARGET_DELETION_REQUESTED',
  pg_catalog.format(
    'select * from public.create_admin_account(%L,''admin'',%L,%L)',
    (select requested_target_id from _commatch_deletion_promotion_guard_config),
    pg_catalog.gen_random_uuid(),
    'must remain blocked'
  )
);

select pg_temp._commatch_deletion_promotion_guard_expect_error(
  'requested partial unique remains enforced',
  'P0001',
  'MEMBER_DELETION_ALREADY_REQUESTED',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select requested_target_id from _commatch_deletion_promotion_guard_config),
    'second request for same target'
  )
);

do $failed_allows_promotion$
declare
  v_config _commatch_deletion_promotion_guard_config%rowtype;
  v_created record;
begin
  select * into v_config from _commatch_deletion_promotion_guard_config;
  perform public.request_admin_member_deletion(
    v_config.failed_request_id,
    v_config.failed_target_id,
    'failed deletion permits later promotion',
    null
  );
  perform public.set_admin_member_deletion_result(
    v_config.failed_request_id,
    'failed',
    'storage'
  );
  select * into v_created
  from public.create_admin_account(
    v_config.failed_target_id,
    'moderator',
    v_config.normal_create_request_id,
    'normal create after failed deletion'
  );
  if v_created.target_user_id is distinct from v_config.failed_target_id
     or v_created.role <> 'moderator'
     or v_created.status <> 'active' then
    raise exception 'FAIL failed deletion should preserve the normal create/audit path';
  end if;
  raise notice 'PASS failed deletion permits normal administrator creation';
end
$failed_allows_promotion$;

do $promotion_blocks_deletion$
declare
  v_config _commatch_deletion_promotion_guard_config%rowtype;
begin
  select * into v_config from _commatch_deletion_promotion_guard_config;
  perform public.create_admin_account(
    v_config.promoted_target_id,
    'admin',
    v_config.promotion_request_id,
    'promotion wins serialization'
  );
end
$promotion_blocks_deletion$;

select pg_temp._commatch_deletion_promotion_guard_expect_error(
  'promoted administrator blocks deletion request',
  '42501',
  'Administrator accounts cannot be force-deleted',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select promoted_target_id from _commatch_deletion_promotion_guard_config),
    'must reject administrator target'
  )
);

select pg_temp._commatch_deletion_promotion_guard_set_user(ordinary_caller_id)
from _commatch_deletion_promotion_guard_config;
select pg_temp._commatch_deletion_promotion_guard_expect_error(
  'ordinary caller cannot request deletion',
  '42501',
  'Active super administrator required',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select requested_target_id from _commatch_deletion_promotion_guard_config),
    'unauthorized request'
  )
);

select pg_temp._commatch_deletion_promotion_guard_set_user(admin_user_id)
from _commatch_deletion_promotion_guard_config;
select pg_temp._commatch_deletion_promotion_guard_expect_error(
  'self deletion remains forbidden',
  '42501',
  'Administrators cannot delete themselves',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select admin_user_id from _commatch_deletion_promotion_guard_config),
    'self deletion'
  )
);

set local role postgres;
do $final_assertion$
declare
  v_config _commatch_deletion_promotion_guard_config%rowtype;
begin
  select * into v_config from _commatch_deletion_promotion_guard_config;
  if not exists (
       select 1 from public.admin_member_deletion_actions
       where request_id = v_config.requested_request_id
         and target_user_id = v_config.requested_target_id
         and status = 'requested'
     )
     or not exists (
       select 1 from public.admin_member_deletion_actions
       where request_id = v_config.failed_request_id
         and target_user_id = v_config.failed_target_id
         and status = 'failed'
     )
     or exists (
       select 1 from public.admin_accounts
       where user_id = v_config.requested_target_id
     )
     or (
       select pg_catalog.count(distinct user_id)
       from public.admin_accounts
       where user_id in (v_config.failed_target_id, v_config.promoted_target_id)
     ) <> 2
     or not exists (
       select 1 from public.admin_account_actions
       where request_id = v_config.normal_create_request_id
         and target_user_id = v_config.failed_target_id
         and action_type = 'created'
     ) then
    raise exception 'FAIL final deletion/promotion state contracts';
  end if;
  raise notice 'PASS all deletion/promotion race-guard rollback integration tests';
end
$final_assertion$;

rollback;
