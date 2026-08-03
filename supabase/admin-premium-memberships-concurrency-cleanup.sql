-- TEMPORARY MANUAL TEST / DO NOT RUN AS MIGRATION
-- DO NOT INCLUDE IN AUTOMATIC DEPLOYMENT
-- REVIEW ALL TEST VALUES BEFORE RUNNING
--
-- Manual Premium administrator concurrency test cleanup.
-- Run only after SESSION A and SESSION B have finished. This file deletes only
-- the exact receipt, action, and membership created by SESSION A. It never
-- deletes or modifies auth.users, profiles, accounts, or administrator records.

-- INPUT VALUES: copy these exact IDs from SESSION A and SESSION B output.
select pg_catalog.set_config(
  'commatch.premium_concurrency_target_id',
  'PASTE_DISPOSABLE_MEMBER_USER_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_membership_id',
  'PASTE_CREATED_MEMBERSHIP_UUID',
  false
);
select pg_catalog.set_config(
  'commatch.premium_concurrency_session_a_action_id',
  'PASTE_SESSION_A_ACTION_UUID',
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

begin;

do $cleanup$
declare
  v_target_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_target_id',
    true
  );
  v_membership_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_membership_id',
    true
  );
  v_action_text text := pg_catalog.current_setting(
    'commatch.premium_concurrency_session_a_action_id',
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
  v_target_id uuid;
  v_membership_id uuid;
  v_action_id uuid;
  v_request_a_id uuid;
  v_request_b_id uuid;
  v_deleted_count integer;
begin
  if v_target_text is null or v_target_text like 'PASTE_%'
     or v_membership_text is null or v_membership_text like 'PASTE_%'
     or v_action_text is null or v_action_text like 'PASTE_%'
     or v_request_a_text is null or v_request_a_text like 'PASTE_%'
     or v_request_b_text is null or v_request_b_text like 'PASTE_%' then
    raise exception 'Replace every cleanup PASTE_* input before running';
  end if;

  v_target_id := nullif(v_target_text, '')::uuid;
  v_membership_id := nullif(v_membership_text, '')::uuid;
  v_action_id := nullif(v_action_text, '')::uuid;
  v_request_a_id := nullif(v_request_a_text, '')::uuid;
  v_request_b_id := nullif(v_request_b_text, '')::uuid;

  if v_target_id is null or v_membership_id is null or v_action_id is null
     or v_request_a_id is null or v_request_b_id is null then
    raise exception 'Every cleanup UUID is required';
  end if;
  if v_request_a_id = v_request_b_id then
    raise exception 'SESSION A and SESSION B request UUIDs must differ';
  end if;

  perform public.lock_premium_membership_write(v_target_id);

  if (
    select pg_catalog.count(*)
    from public.profiles as profile
    where profile.id = v_target_id
  ) <> 1 then
    raise exception 'Cleanup target profile does not exist exactly once';
  end if;
  if (
    select pg_catalog.count(*)
    from public.premium_memberships as membership
    where membership.id = v_membership_id
      and membership.user_id = v_target_id
  ) <> 1 then
    raise exception 'Cleanup membership ID and target ID do not match';
  end if;
  if (
    select pg_catalog.count(*)
    from public.premium_membership_actions as action
    where action.id = v_action_id
      and action.request_id = v_request_a_id
      and action.membership_id = v_membership_id
      and action.subject_user_id = v_target_id
      and action.action_type = 'granted'
  ) <> 1 then
    raise exception 'Cleanup SESSION A granted action does not match every supplied ID';
  end if;
  if (
    select pg_catalog.count(*)
    from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_a_id
      and receipt.subject_user_id = v_target_id
      and receipt.membership_id = v_membership_id
      and receipt.action_id = v_action_id
      and receipt.action_type = 'granted'
      and not receipt.is_noop
  ) <> 1 then
    raise exception 'Cleanup SESSION A receipt does not match the membership and action';
  end if;
  if exists (
    select 1 from public.premium_membership_actions as action
    where action.request_id = v_request_b_id
  ) or exists (
    select 1 from public.premium_membership_request_receipts as receipt
    where receipt.request_id = v_request_b_id
  ) then
    raise exception 'SESSION B action or receipt exists; cleanup stopped without deleting anything';
  end if;
  if exists (
    select 1
    from public.premium_membership_actions as action
    where (
      action.membership_id = v_membership_id
      or action.subject_user_id = v_target_id
    )
      and action.id <> v_action_id
  ) or exists (
    select 1
    from public.premium_membership_request_receipts as receipt
    where (
      receipt.membership_id = v_membership_id
      or receipt.subject_user_id = v_target_id
    )
      and receipt.request_id <> v_request_a_id
  ) then
    raise exception 'Additional Premium history exists for the target; cleanup stopped';
  end if;

  delete from public.premium_membership_request_receipts as receipt
  where receipt.request_id = v_request_a_id
    and receipt.subject_user_id = v_target_id
    and receipt.membership_id = v_membership_id
    and receipt.action_id = v_action_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Cleanup did not delete exactly one SESSION A receipt';
  end if;

  delete from public.premium_membership_actions as action
  where action.id = v_action_id
    and action.request_id = v_request_a_id
    and action.membership_id = v_membership_id
    and action.subject_user_id = v_target_id
    and action.action_type = 'granted';
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Cleanup did not delete exactly one SESSION A action';
  end if;

  delete from public.premium_memberships as membership
  where membership.id = v_membership_id
    and membership.user_id = v_target_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then
    raise exception 'Cleanup did not delete exactly one SESSION A membership';
  end if;
end
$cleanup$;

commit;

select
  (select pg_catalog.count(*)
   from public.premium_memberships as membership
   where membership.user_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_target_id'
     )::uuid) as membership_count,
  (select pg_catalog.count(*)
   from public.premium_membership_actions as action
   where action.subject_user_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_target_id'
     )::uuid
      or action.id = pg_catalog.current_setting(
       'commatch.premium_concurrency_session_a_action_id'
     )::uuid) as action_count,
  (select pg_catalog.count(*)
   from public.premium_membership_request_receipts as receipt
   where receipt.subject_user_id = pg_catalog.current_setting(
       'commatch.premium_concurrency_target_id'
     )::uuid
      or receipt.request_id in (
        pg_catalog.current_setting(
          'commatch.premium_concurrency_session_a_request_id'
        )::uuid,
        pg_catalog.current_setting(
          'commatch.premium_concurrency_session_b_request_id'
        )::uuid
      )) as receipt_count,
  (select pg_catalog.count(*)
   from public.profiles as profile
   where profile.id = pg_catalog.current_setting(
       'commatch.premium_concurrency_target_id'
     )::uuid) as target_member_count;
