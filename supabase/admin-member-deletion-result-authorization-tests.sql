-- Rollback-safe integration tests for administrator deletion result authorization.
--
-- Apply admin-member-deletion-result-authorization.sql first. Replace the five
-- PASTE_* values with one active super administrator, one distinct authenticated
-- caller, and three distinct disposable ordinary Auth users that have profiles.
-- Run this file as one SQL Editor invocation. Every mutation is rolled back.

begin;

create temp table _commatch_deletion_result_auth_config (
  admin_user_id uuid,
  other_caller_id uuid,
  active_completed_target_id uuid,
  changed_role_completed_target_id uuid,
  inactive_failed_target_id uuid,
  fixture_confirmation text,
  active_completed_request_id uuid not null default pg_catalog.gen_random_uuid(),
  changed_role_completed_request_id uuid not null default pg_catalog.gen_random_uuid(),
  inactive_failed_request_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_deletion_result_auth_config (
  admin_user_id,
  other_caller_id,
  active_completed_target_id,
  changed_role_completed_target_id,
  inactive_failed_target_id,
  fixture_confirmation
) values (
  nullif('PASTE_ACTIVE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_OTHER_AUTH_USER_ID', 'PASTE_' || 'OTHER_AUTH_USER_ID')::uuid,
  nullif('PASTE_ACTIVE_COMPLETED_TARGET_USER_ID', 'PASTE_' || 'ACTIVE_COMPLETED_TARGET_USER_ID')::uuid,
  nullif('PASTE_CHANGED_ROLE_COMPLETED_TARGET_USER_ID', 'PASTE_' || 'CHANGED_ROLE_COMPLETED_TARGET_USER_ID')::uuid,
  nullif('PASTE_INACTIVE_FAILED_TARGET_USER_ID', 'PASTE_' || 'INACTIVE_FAILED_TARGET_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on _commatch_deletion_result_auth_config to authenticated;

create function pg_temp._commatch_deletion_result_auth_set_user(p_user_id uuid)
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
end
$function$;

create function pg_temp._commatch_deletion_result_auth_expect_error(
  p_label text,
  p_state text,
  p_message_fragment text,
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
         or pg_catalog.strpos(sqlerrm, p_message_fragment) = 0 then
        raise exception 'FAIL % expected % / %, received % / %',
          p_label, p_state, p_message_fragment, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS % (% / %)', p_label, sqlstate, sqlerrm;
  end;
end
$function$;

grant execute on function pg_temp._commatch_deletion_result_auth_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_deletion_result_auth_expect_error(text, text, text, text)
  to authenticated;

do $preflight$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_deletion_result_auth_config;
  v_ids := array[
    v_config.admin_user_id,
    v_config.other_caller_id,
    v_config.active_completed_target_id,
    v_config.changed_role_completed_target_id,
    v_config.inactive_failed_target_id
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
    select 1
    from public.admin_accounts
    where user_id = v_config.admin_user_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'Configured administrator must be an active super_admin';
  end if;
  if exists (
    select 1
    from public.admin_accounts
    where user_id = any(array[
      v_config.other_caller_id,
      v_config.active_completed_target_id,
      v_config.changed_role_completed_target_id,
      v_config.inactive_failed_target_id
    ])
  ) then
    raise exception 'Other caller and deletion targets must be ordinary users';
  end if;
  if (
    select pg_catalog.count(*)
    from public.profiles
    where id = any(array[
      v_config.active_completed_target_id,
      v_config.changed_role_completed_target_id,
      v_config.inactive_failed_target_id
    ])
  ) <> 3 then
    raise exception 'Every disposable deletion target must have a profile';
  end if;
  if exists (
    select 1
    from public.admin_member_deletion_actions
    where target_user_id = any(array[
      v_config.active_completed_target_id,
      v_config.changed_role_completed_target_id,
      v_config.inactive_failed_target_id
    ])
      and status = 'requested'
  ) then
    raise exception 'Disposable targets must not have requested deletions';
  end if;
end
$preflight$;

do $metadata_acl_and_security_contract$
declare
  v_result_oid oid := pg_catalog.to_regprocedure(
    'public.set_admin_member_deletion_result(uuid,text,text)'
  );
begin
  if v_result_oid is null
     or pg_catalog.pg_get_function_identity_arguments(v_result_oid) <>
       'p_request_id uuid, p_status text, p_failure_stage text'
     or pg_catalog.pg_get_function_result(v_result_oid) <>
       'TABLE(request_id uuid, status text, failure_stage text, is_duplicate boolean, updated_at timestamp with time zone)'
     or pg_catalog.obj_description(v_result_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1' then
    raise exception 'FAIL result RPC signature, return, or comment contract';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    where function_info.oid = v_result_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'FAIL result RPC owner, volatility, security-definer, or search_path contract';
  end if;

  if pg_catalog.has_function_privilege('public', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_result_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_result_oid, 'EXECUTE') then
    raise exception 'FAIL result RPC ACL contract';
  end if;

  raise notice 'PASS result RPC metadata, ACL, and security contracts';
end
$metadata_acl_and_security_contract$;

set local role authenticated;
select pg_temp._commatch_deletion_result_auth_set_user(admin_user_id)
from _commatch_deletion_result_auth_config;

do $create_requests_while_authorized$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_deletion_result_auth_config;

  select * into v_row
  from public.request_admin_member_deletion(
    v_config.active_completed_request_id,
    v_config.active_completed_target_id,
    'active requester completion fixture',
    null
  );
  if v_row.status <> 'requested' or v_row.is_duplicate then
    raise exception 'FAIL active completion request lifecycle';
  end if;

  select * into v_row
  from public.request_admin_member_deletion(
    v_config.changed_role_completed_request_id,
    v_config.changed_role_completed_target_id,
    'changed-role completion fixture',
    null
  );
  if v_row.status <> 'requested' or v_row.is_duplicate then
    raise exception 'FAIL changed-role completion request lifecycle';
  end if;

  select * into v_row
  from public.request_admin_member_deletion(
    v_config.inactive_failed_request_id,
    v_config.inactive_failed_target_id,
    'inactive failure fixture',
    null
  );
  if v_row.status <> 'requested' or v_row.is_duplicate then
    raise exception 'FAIL inactive failure request lifecycle';
  end if;

  raise notice 'PASS all deletion requests started while requester was active super_admin';
end
$create_requests_while_authorized$;

do $active_requester_can_complete$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_deletion_result_auth_config;
  select * into v_row
  from public.set_admin_member_deletion_result(
    v_config.active_completed_request_id,
    'completed',
    null
  );
  if v_row.request_id <> v_config.active_completed_request_id
     or v_row.status <> 'completed'
     or v_row.failure_stage is not null
     or v_row.is_duplicate then
    raise exception 'FAIL active requester could not record completed result';
  end if;
  raise notice 'PASS active super_admin requester recorded completed result';
end
$active_requester_can_complete$;

set local role postgres;
update public.admin_accounts
set role = 'admin',
    status = 'active',
    suspended_at = null,
    revoked_at = null
where user_id = (select admin_user_id from _commatch_deletion_result_auth_config);

set local role authenticated;
select pg_temp._commatch_deletion_result_auth_set_user(admin_user_id)
from _commatch_deletion_result_auth_config;

do $changed_role_requester_can_complete$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_deletion_result_auth_config;
  select * into v_row
  from public.set_admin_member_deletion_result(
    v_config.changed_role_completed_request_id,
    'completed',
    null
  );
  if v_row.request_id <> v_config.changed_role_completed_request_id
     or v_row.status <> 'completed'
     or v_row.failure_stage is not null
     or v_row.is_duplicate then
    raise exception 'FAIL changed-role requester could not record completed result';
  end if;
  raise notice 'PASS original requester recorded completed result after role change';
end
$changed_role_requester_can_complete$;

select pg_temp._commatch_deletion_result_auth_set_user(other_caller_id)
from _commatch_deletion_result_auth_config;
select pg_temp._commatch_deletion_result_auth_expect_error(
  'different authenticated caller result',
  '42501',
  'Only the requesting administrator can finish this deletion',
  pg_catalog.format(
    'select * from public.set_admin_member_deletion_result(%L,%L,%L)',
    inactive_failed_request_id,
    'failed',
    'database'
  )
)
from _commatch_deletion_result_auth_config;

set local role postgres;
update public.admin_accounts
set role = 'super_admin',
    status = 'suspended',
    suspended_at = pg_catalog.now(),
    revoked_at = null
where user_id = (select admin_user_id from _commatch_deletion_result_auth_config);

set local role authenticated;
select pg_temp._commatch_deletion_result_auth_set_user(admin_user_id)
from _commatch_deletion_result_auth_config;

do $inactive_requester_can_record_failure$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_deletion_result_auth_config;
  select * into v_row
  from public.set_admin_member_deletion_result(
    v_config.inactive_failed_request_id,
    'failed',
    'database'
  );
  if v_row.request_id <> v_config.inactive_failed_request_id
     or v_row.status <> 'failed'
     or v_row.failure_stage <> 'database'
     or v_row.is_duplicate then
    raise exception 'FAIL inactive requester could not record failed result';
  end if;

  select * into v_row
  from public.set_admin_member_deletion_result(
    v_config.inactive_failed_request_id,
    'failed',
    'database'
  );
  if v_row.status <> 'failed'
     or v_row.failure_stage <> 'database'
     or not v_row.is_duplicate then
    raise exception 'FAIL result idempotency contract';
  end if;

  raise notice 'PASS inactive original requester recorded and repeated failed result';
end
$inactive_requester_can_record_failure$;

select pg_temp._commatch_deletion_result_auth_expect_error(
  'completed lifecycle cannot change to failed',
  'P0001',
  'MEMBER_DELETION_RESULT_ALREADY_RECORDED',
  pg_catalog.format(
    'select * from public.set_admin_member_deletion_result(%L,%L,%L)',
    changed_role_completed_request_id,
    'failed',
    'auth'
  )
)
from _commatch_deletion_result_auth_config;

select pg_temp._commatch_deletion_result_auth_set_user(null);
select pg_temp._commatch_deletion_result_auth_expect_error(
  'missing auth.uid result',
  '42501',
  'Active super administrator required',
  pg_catalog.format(
    'select * from public.set_admin_member_deletion_result(%L,%L,%L)',
    inactive_failed_request_id,
    'failed',
    'database'
  )
)
from _commatch_deletion_result_auth_config;

set local role postgres;
do $final_lifecycle_contract$
declare
  v_config _commatch_deletion_result_auth_config%rowtype;
begin
  select * into v_config from _commatch_deletion_result_auth_config;

  if not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.active_completed_request_id
         and admin_user_id = v_config.admin_user_id
         and admin_role = 'super_admin'
         and status = 'completed'
         and failure_stage is null
         and completed_at is not null
     )
     or not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.changed_role_completed_request_id
         and admin_user_id = v_config.admin_user_id
         and admin_role = 'super_admin'
         and status = 'completed'
         and failure_stage is null
         and completed_at is not null
     )
     or not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.inactive_failed_request_id
         and admin_user_id = v_config.admin_user_id
         and admin_role = 'super_admin'
         and status = 'failed'
         and failure_stage = 'database'
         and completed_at is null
     ) then
    raise exception 'FAIL requested to completed/failed lifecycle contract';
  end if;

  raise notice 'PASS requested to completed/failed lifecycle and request snapshots';
end
$final_lifecycle_contract$;

rollback;
