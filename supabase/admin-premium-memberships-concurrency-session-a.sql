-- TEMPORARY MANUAL TEST / DO NOT RUN AS MIGRATION
-- DO NOT INCLUDE IN AUTOMATIC DEPLOYMENT
-- REVIEW ALL TEST VALUES BEFORE RUNNING
--
-- Manual Premium administrator concurrency test: SESSION A.
-- Run this file in its own Supabase SQL Editor tab with SESSION B already open
-- in a second tab. Start SESSION B within 1-2 seconds after starting this file;
-- SQL Editor notices may be buffered until the statement finishes. This file
-- grants one disposable, non-production ordinary member a temporary Premium
-- membership and commits it. Run the cleanup file after both sessions.

-- INPUT VALUES: replace every PASTE_* value before running.
select pg_catalog.set_config(
  'commatch.premium_concurrency_admin_id',
  'PASTE_ACTIVE_ADMIN_USER_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_target_id',
  'PASTE_DISPOSABLE_MEMBER_USER_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_session_a_request_id',
  'PASTE_SESSION_A_REQUEST_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_sleep_seconds',
  '15',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_duration',
  '1 day',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_session_a_reason',
  'Premium concurrency session A',
  false
);

do $preflight$
declare
  v_admin_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_admin_id',
    true
  );
  v_target_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id',
    true
  );
  v_request_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id',
    true
  );
  v_sleep_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_sleep_seconds',
    true
  );
  v_duration_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_duration',
    true
  );
  v_reason text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_reason',
    true
  );
  v_admin_id uuid;
  v_target_id uuid;
  v_request_id uuid;
  v_sleep_seconds double precision;
  v_duration interval;
begin
  if v_admin_text is null or v_admin_text like 'PASTE_%'
     or v_target_text is null or v_target_text like 'PASTE_%'
     or v_request_text is null or v_request_text like 'PASTE_%' then
    raise exception 'Replace every SESSION A PASTE_* input before running';
  end if;

  v_admin_id := nullif(v_admin_text, '')::uuid;
  v_target_id := nullif(v_target_text, '')::uuid;
  v_request_id := nullif(v_request_text, '')::uuid;
  v_sleep_seconds := nullif(v_sleep_text, '')::double precision;
  v_duration := nullif(v_duration_text, '')::interval;

  if v_admin_id is null or v_target_id is null or v_request_id is null then
    raise exception 'SESSION A administrator, target, and request UUIDs are required';
  end if;
  if v_admin_id = v_target_id then
    raise exception 'SESSION A administrator and target UUIDs must differ';
  end if;
  if v_sleep_seconds is null or v_sleep_seconds < 5 or v_sleep_seconds > 60 then
    raise exception 'SESSION A sleep must be between 5 and 60 seconds';
  end if;
  if v_duration is null or v_duration <= interval '0 seconds' then
    raise exception 'SESSION A Premium duration must be positive';
  end if;
  if nullif(pg_catalog.btrim(v_reason), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(v_reason)) > 500 then
    raise exception 'SESSION A reason must contain 1-500 trimmed characters';
  end if;
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_admin_id
      and admin_account.status = 'active'
      and admin_account.role in ('super_admin', 'admin')
  ) then
    raise exception 'SESSION A administrator must be an active super_admin or admin';
  end if;
  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = v_target_id
  ) or not exists (
    select 1 from public.profiles as profile where profile.id = v_target_id
  ) then
    raise exception 'SESSION A target must be an existing member with a profile';
  end if;
  if exists (
    select 1 from public.admin_accounts as target_admin
    where target_admin.user_id = v_target_id
  ) then
    raise exception 'SESSION A target must be an ordinary non-admin member';
  end if;
  if exists (
    select 1 from public.premium_memberships as membership
    where membership.user_id = v_target_id
  ) or exists (
    select 1 from public.premium_membership_actions as action
    where action.subject_user_id = v_target_id
       or action.request_id = v_request_id
  ) or exists (
    select 1 from public.premium_membership_request_receipts as receipt
    where receipt.subject_user_id = v_target_id
       or receipt.request_id = v_request_id
  ) then
    raise exception 'SESSION A target or request UUID already has Premium test data';
  end if;

  raise notice 'PASS SESSION A preflight';
end
$preflight$;

begin;

do $session_a$
declare
  v_admin_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_admin_id'
  )::uuid;
  v_target_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id'
  )::uuid;
  v_request_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id'
  )::uuid;
  v_sleep_seconds double precision := pg_catalog.current_setting(
    'commatch.premium_concurrency_sleep_seconds'
  )::double precision;
  v_duration interval := pg_catalog.current_setting(
    'commatch.premium_concurrency_duration'
  )::interval;
  v_reason text := pg_catalog.btrim(pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_reason'
  ));
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_result record;
begin
  set local role authenticated;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_admin_id,
      'role', 'authenticated'
    )::text,
    true
  );

  if auth.uid() is distinct from v_admin_id then
    raise exception 'SESSION A auth.uid() setup failed';
  end if;

  select * into v_result
  from public.update_admin_premium_membership(
    v_target_id,
    null,
    'active',
    v_started_at,
    v_started_at + v_duration,
    array['likes_received']::text[],
    v_reason,
    v_request_id
  );

  if not v_result.is_success
     or v_result.is_noop
     or v_result.is_duplicate_request
     or v_result.action_type is distinct from 'granted'
     or v_result.action_id is null then
    raise exception 'SESSION A grant returned an unexpected result';
  end if;

  raise notice
    'PASS SESSION A grant; membership %, action %, sleeping % seconds while holding the target lock',
    v_result.membership_id,
    v_result.action_id,
    v_sleep_seconds;

  perform pg_catalog.pg_sleep(v_sleep_seconds);
  set local role postgres;
end
$session_a$;

commit;

do $verify_session_a$
declare
  v_target_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id'
  )::uuid;
  v_request_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id'
  )::uuid;
  v_membership public.premium_memberships%rowtype;
  v_action public.premium_membership_actions%rowtype;
  v_receipt public.premium_membership_request_receipts%rowtype;
begin
  select * into strict v_membership
  from public.premium_memberships as membership
  where membership.user_id = v_target_id;

  select * into strict v_action
  from public.premium_membership_actions as action
  where action.request_id = v_request_id;

  select * into strict v_receipt
  from public.premium_membership_request_receipts as receipt
  where receipt.request_id = v_request_id;

  if v_membership.status <> 'active'
     or v_action.action_type <> 'granted'
     or v_action.membership_id is distinct from v_membership.id
     or v_action.subject_user_id is distinct from v_target_id
     or v_receipt.is_noop
     or v_receipt.membership_id is distinct from v_membership.id
     or v_receipt.action_id is distinct from v_action.id
     or v_receipt.action_type is distinct from 'granted' then
    raise exception 'SESSION A committed membership, action, or receipt linkage is invalid';
  end if;

  raise notice 'PASS SESSION A committed membership, granted action, and receipt';
end
$verify_session_a$;

select
  membership.id as membership_id,
  action.id as session_a_action_id,
  action.request_id as session_a_request_id,
  membership.user_id as target_member_id,
  membership.status,
  action.action_type,
  receipt.request_id is not null as receipt_exists
from public.premium_memberships as membership
join public.premium_membership_actions as action
  on action.membership_id = membership.id
join public.premium_membership_request_receipts as receipt
  on receipt.request_id = action.request_id
 and receipt.action_id = action.id
where membership.user_id = pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id'
  )::uuid
  and action.request_id = pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id'
  )::uuid;
