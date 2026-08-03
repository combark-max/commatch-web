-- TEMPORARY MANUAL TEST / DO NOT RUN AS MIGRATION
-- DO NOT INCLUDE IN AUTOMATIC DEPLOYMENT
-- REVIEW ALL TEST VALUES BEFORE RUNNING
--
-- Manual Premium administrator concurrency test: SESSION B.
-- Start this file in a second Supabase SQL Editor tab within 1-2 seconds after
-- SESSION A begins sleeping. SESSION B must wait for A to commit, then fail with
-- SQLSTATE 40001 / PREMIUM_STALE_VERSION without writing an action or receipt.

-- INPUT VALUES: replace every PASTE_* value before running. The target and
-- SESSION A request UUID must exactly match SESSION A.
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
  'commatch.premium_concurrency_session_b_request_id',
  'PASTE_SESSION_B_REQUEST_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_minimum_wait_seconds',
  '8',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_duration',
  '2 days',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_session_b_reason',
  'Premium concurrency session B',
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
  v_request_a_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id',
    true
  );
  v_request_b_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_b_request_id',
    true
  );
  v_minimum_wait_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_minimum_wait_seconds',
    true
  );
  v_duration_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_duration',
    true
  );
  v_reason text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_b_reason',
    true
  );
  v_admin_id uuid;
  v_target_id uuid;
  v_request_a_id uuid;
  v_request_b_id uuid;
  v_minimum_wait_seconds double precision;
  v_duration interval;
begin
  if v_admin_text is null or v_admin_text like 'PASTE_%'
     or v_target_text is null or v_target_text like 'PASTE_%'
     or v_request_a_text is null or v_request_a_text like 'PASTE_%'
     or v_request_b_text is null or v_request_b_text like 'PASTE_%' then
    raise exception 'Replace every SESSION B PASTE_* input before running';
  end if;

  v_admin_id := nullif(v_admin_text, '')::uuid;
  v_target_id := nullif(v_target_text, '')::uuid;
  v_request_a_id := nullif(v_request_a_text, '')::uuid;
  v_request_b_id := nullif(v_request_b_text, '')::uuid;
  v_minimum_wait_seconds := nullif(v_minimum_wait_text, '')::double precision;
  v_duration := nullif(v_duration_text, '')::interval;

  if v_admin_id is null or v_target_id is null
     or v_request_a_id is null or v_request_b_id is null then
    raise exception 'SESSION B administrator, target, and request UUIDs are required';
  end if;
  if v_admin_id = v_target_id then
    raise exception 'SESSION B administrator and target UUIDs must differ';
  end if;
  if v_request_a_id = v_request_b_id then
    raise exception 'SESSION A and SESSION B request UUIDs must differ';
  end if;
  if v_minimum_wait_seconds is null
     or v_minimum_wait_seconds < 1
     or v_minimum_wait_seconds > 60 then
    raise exception 'SESSION B minimum wait must be between 1 and 60 seconds';
  end if;
  if v_duration is null or v_duration <= interval '0 seconds' then
    raise exception 'SESSION B Premium duration must be positive';
  end if;
  if nullif(pg_catalog.btrim(v_reason), '') is null
     or pg_catalog.char_length(pg_catalog.btrim(v_reason)) > 500 then
    raise exception 'SESSION B reason must contain 1-500 trimmed characters';
  end if;
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_admin_id
      and admin_account.status = 'active'
      and admin_account.role in ('super_admin', 'admin')
  ) then
    raise exception 'SESSION B administrator must be an active super_admin or admin';
  end if;
  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = v_target_id
  ) or not exists (
    select 1 from public.profiles as profile where profile.id = v_target_id
  ) then
    raise exception 'SESSION B target must be an existing member with a profile';
  end if;
  if exists (
    select 1 from public.admin_accounts as target_admin
    where target_admin.user_id = v_target_id
  ) then
    raise exception 'SESSION B target must be an ordinary non-admin member';
  end if;
  if exists (
    select 1 from public.premium_memberships as membership
    where membership.user_id = v_target_id
  ) or exists (
    select 1 from public.premium_membership_actions as action
    where action.request_id = v_request_b_id
  ) or exists (
    select 1 from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_b_id
  ) then
    raise exception 'SESSION B started too late or its request UUID already exists';
  end if;

  raise notice 'PASS SESSION B preflight; attempting competing grant now';
end
$preflight$;

begin;

do $session_b$
declare
  v_admin_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_admin_id'
  )::uuid;
  v_target_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id'
  )::uuid;
  v_request_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_b_request_id'
  )::uuid;
  v_minimum_wait_seconds double precision := pg_catalog.current_setting(
    'commatch.premium_concurrency_minimum_wait_seconds'
  )::double precision;
  v_duration interval := pg_catalog.current_setting(
    'commatch.premium_concurrency_duration'
  )::interval;
  v_reason text := pg_catalog.btrim(pg_catalog.current_setting(
    'commatch.premium_concurrency_session_b_reason'
  ));
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_finished_at timestamptz;
  v_waited_seconds double precision;
  v_received_expected_error boolean := false;
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
    raise exception 'SESSION B auth.uid() setup failed';
  end if;

  begin
    perform * from public.update_admin_premium_membership(
      v_target_id,
      null,
      'active',
      v_started_at,
      v_started_at + v_duration,
      array['advanced_member_search']::text[],
      v_reason,
      v_request_id
    );
    raise exception 'SESSION B competing grant unexpectedly succeeded';
  exception
    when others then
      if sqlstate is distinct from '40001'
         or sqlerrm is distinct from 'PREMIUM_STALE_VERSION' then
        raise exception
          'SESSION B expected 40001 / PREMIUM_STALE_VERSION, received % / %',
          sqlstate,
          sqlerrm;
      end if;
      v_received_expected_error := true;
  end;

  v_finished_at := pg_catalog.clock_timestamp();
  v_waited_seconds := extract(epoch from (v_finished_at - v_started_at));

  if not v_received_expected_error then
    raise exception 'SESSION B did not receive the expected stale-version error';
  end if;
  if v_waited_seconds < v_minimum_wait_seconds then
    raise exception
      'SESSION B waited % seconds, below the required minimum of % seconds',
      v_waited_seconds,
      v_minimum_wait_seconds;
  end if;

  raise notice
    'PASS SESSION B received 40001 / PREMIUM_STALE_VERSION after % seconds',
    v_waited_seconds;
  set local role postgres;
end
$session_b$;

commit;

do $verify_session_b$
declare
  v_target_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id'
  )::uuid;
  v_request_a_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_request_id'
  )::uuid;
  v_request_b_id uuid := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_b_request_id'
  )::uuid;
begin
  if (
    select pg_catalog.count(*)
    from public.premium_memberships as membership
    where membership.user_id = v_target_id
      and membership.status = 'active'
  ) <> 1 then
    raise exception 'SESSION B expected the active membership committed by SESSION A';
  end if;
  if (
    select pg_catalog.count(*)
    from public.premium_membership_actions as action
    where action.request_id = v_request_a_id
      and action.subject_user_id = v_target_id
      and action.action_type = 'granted'
  ) <> 1 or (
    select pg_catalog.count(*)
    from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_a_id
      and receipt.subject_user_id = v_target_id
      and not receipt.is_noop
  ) <> 1 then
    raise exception 'SESSION B could not verify SESSION A action and receipt';
  end if;
  if exists (
    select 1 from public.premium_membership_actions as action
    where action.request_id = v_request_b_id
  ) or exists (
    select 1 from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_b_id
  ) then
    raise exception 'SESSION B stale request left an action or receipt';
  end if;

  raise notice 'PASS SESSION B left zero actions and receipts; SESSION A membership remains active';
end
$verify_session_b$;

select
  (select pg_catalog.count(*)
   from public.premium_memberships as membership
   where membership.user_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_target_id'
     )::uuid
     and membership.status = 'active') as active_membership_count,
  (select pg_catalog.count(*)
   from public.premium_membership_actions as action
   where action.request_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_session_b_request_id'
     )::uuid) as session_b_action_count,
  (select pg_catalog.count(*)
   from public.premium_membership_request_receipts as receipt
   where receipt.request_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_session_b_request_id'
     )::uuid) as session_b_receipt_count;
