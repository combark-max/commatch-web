-- ComMatch Web Push Phase 2-B rollback-safe integration tests.
--
-- Run after push-events-deliveries-v1.sql. Replace both placeholders with
-- distinct disposable members. Every fixture write is rolled back.

begin;

create temp table _commatch_push_delivery_it_config (
  first_user_id uuid,
  second_user_id uuid,
  notification_id uuid,
  first_source_id uuid not null default gen_random_uuid(),
  second_source_id uuid not null default gen_random_uuid(),
  first_event_id uuid,
  duplicate_event_id uuid,
  second_event_id uuid,
  owner_change_subscription_id uuid,
  generation_change_subscription_id uuid,
  valid_subscription_id uuid,
  preference_off_subscription_id uuid,
  revoked_subscription_id uuid,
  expired_subscription_id uuid,
  claimed_delivery_id uuid,
  claimed_subscription_id uuid,
  claim_token uuid,
  lease_delivery_id uuid,
  stale_claim_token uuid,
  reclaimed_claim_token uuid,
  retry_delivery_id uuid,
  retry_claim_token uuid,
  terminal_delivery_id uuid,
  terminal_claim_token uuid,
  gone_subscription_id uuid,
  gone_delivery_id uuid,
  gone_pending_delivery_id uuid
) on commit drop;

insert into _commatch_push_delivery_it_config (
  first_user_id,
  second_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_push_delivery_it_config
  to service_role, authenticated;

create function pg_temp._commatch_push_delivery_expect_error(
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
      if sqlstate <> p_expected_state then
        raise exception 'FAIL %: expected SQLSTATE %, got % (%)',
          p_label, p_expected_state, sqlstate, sqlerrm;
      end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_push_delivery_expect_error(text, text, text)
  to service_role, authenticated;

do $preflight$
declare
  v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;

  if v_config.first_user_id is null or v_config.second_user_id is null then
    raise exception 'Replace both PASTE_* disposable member IDs';
  end if;
  if v_config.first_user_id = v_config.second_user_id then
    raise exception 'Disposable members must be distinct';
  end if;
  if (select pg_catalog.count(*) from public.profiles
      where id in (v_config.first_user_id, v_config.second_user_id)) <> 2 then
    raise exception 'Both disposable members must have profiles';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(array[
      'public.enqueue_push_event(uuid,uuid,text,uuid)'::pg_catalog.regprocedure::oid,
      'public.expand_push_event_batch(integer)'::pg_catalog.regprocedure::oid,
      'public.claim_push_delivery_batch(integer,integer)'::pg_catalog.regprocedure::oid,
      'public.complete_push_delivery(uuid,uuid,integer)'::pg_catalog.regprocedure::oid,
      'public.fail_push_delivery(uuid,uuid,integer,text,timestamp with time zone)'::pg_catalog.regprocedure::oid
    ]) as function_oid
    where pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
  ) then
    raise exception 'authenticated unexpectedly has a Push worker RPC grant';
  end if;
end
$preflight$;

-- Isolate the disposable members from any pre-existing browser registrations.
-- This is rollback-safe with the rest of the fixture transaction.
update public.push_subscriptions
set revoked_at = coalesce(revoked_at, pg_catalog.now()),
    new_message_enabled = false,
    new_like_enabled = false,
    updated_at = pg_catalog.now()
where user_id in (
  select first_user_id from _commatch_push_delivery_it_config
  union all
  select second_user_id from _commatch_push_delivery_it_config
);

with inserted as (
  insert into public.notifications (
    recipient_user_id,
    type,
    match_id,
    inquiry_id,
    read_at,
    created_at
  )
  select first_user_id, 'new_like', null, null, null, pg_catalog.now()
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set notification_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/owner-change',
    pg_catalog.repeat('A', 87),
    pg_catalog.repeat('B', 22),
    true,
    true,
    pg_catalog.now() - interval '10 minutes',
    pg_catalog.now() - interval '6 minutes',
    pg_catalog.now() - interval '6 minutes'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set owner_change_subscription_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/generation-change',
    pg_catalog.repeat('C', 87),
    pg_catalog.repeat('D', 22),
    true,
    true,
    pg_catalog.now() - interval '10 minutes',
    pg_catalog.now() - interval '5 minutes',
    pg_catalog.now() - interval '5 minutes'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set generation_change_subscription_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/valid',
    pg_catalog.repeat('E', 87),
    pg_catalog.repeat('F', 22),
    true,
    true,
    pg_catalog.now() - interval '10 minutes',
    pg_catalog.now() - interval '4 minutes',
    pg_catalog.now() - interval '4 minutes'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set valid_subscription_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/preference-off',
    pg_catalog.repeat('G', 87),
    pg_catalog.repeat('H', 22),
    true,
    false,
    pg_catalog.now() - interval '10 minutes',
    pg_catalog.now() - interval '3 minutes',
    pg_catalog.now() - interval '3 minutes'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set preference_off_subscription_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at, revoked_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/revoked',
    pg_catalog.repeat('I', 87),
    pg_catalog.repeat('J', 22),
    true,
    true,
    pg_catalog.now() - interval '10 minutes',
    pg_catalog.now() - interval '2 minutes',
    pg_catalog.now() - interval '2 minutes',
    pg_catalog.now() - interval '1 minute'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set revoked_subscription_id = inserted.id
from inserted;

with inserted as (
  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, expiration_time,
    new_message_enabled, new_like_enabled, created_at, updated_at, last_seen_at
  )
  select
    first_user_id,
    'https://push.example.test/delivery/expired',
    pg_catalog.repeat('K', 87),
    pg_catalog.repeat('L', 22),
    pg_catalog.now() - interval '1 day',
    true,
    true,
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '1 day',
    pg_catalog.now() - interval '1 day'
  from _commatch_push_delivery_it_config
  returning id
)
update _commatch_push_delivery_it_config
set expired_subscription_id = inserted.id
from inserted;

set local role service_role;

with enqueued as (
  select public.enqueue_push_event(
    first_user_id,
    notification_id,
    'new_like',
    first_source_id
  ) as id
  from _commatch_push_delivery_it_config
)
update _commatch_push_delivery_it_config
set first_event_id = enqueued.id
from enqueued;

with enqueued as (
  select public.enqueue_push_event(
    first_user_id,
    notification_id,
    'new_like',
    first_source_id
  ) as id
  from _commatch_push_delivery_it_config
)
update _commatch_push_delivery_it_config
set duplicate_event_id = enqueued.id
from enqueued;

with enqueued as (
  select public.enqueue_push_event(
    first_user_id,
    notification_id,
    'new_like',
    second_source_id
  ) as id
  from _commatch_push_delivery_it_config
)
update _commatch_push_delivery_it_config
set second_event_id = enqueued.id
from enqueued;

reset role;

do $event_idempotency$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if v_config.first_event_id is null
     or v_config.first_event_id <> v_config.duplicate_event_id
     or v_config.first_event_id = v_config.second_event_id
     or (select pg_catalog.count(*) from public.push_events
         where notification_id = v_config.notification_id) <> 2 then
    raise exception 'FAIL Push event idempotency or notification reuse contract';
  end if;

  update public.push_events
  set expanded_at = pg_catalog.now()
  where id = v_config.second_event_id;
end
$event_idempotency$;

set local role service_role;

do $expand$
begin
  if public.expand_push_event_batch(10) <> 1 then
    raise exception 'FAIL expected exactly one event expansion';
  end if;
end
$expand$;

reset role;

do $expansion_contract$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;

  if (select pg_catalog.count(*) from public.push_deliveries
      where push_event_id = v_config.first_event_id) <> 3 then
    raise exception 'FAIL event was not expanded to all eligible subscriptions';
  end if;
  if exists (
    select 1
    from public.push_deliveries as delivery_row
    where delivery_row.push_event_id = v_config.first_event_id
      and delivery_row.push_subscription_id in (
        v_config.preference_off_subscription_id,
        v_config.revoked_subscription_id,
        v_config.expired_subscription_id
      )
  ) then
    raise exception 'FAIL ineligible subscription received a delivery';
  end if;
  if exists (
    select 1
    from public.push_deliveries as delivery_row
    join public.push_subscriptions as subscription_row
      on subscription_row.id = delivery_row.push_subscription_id
    where delivery_row.push_event_id = v_config.first_event_id
      and delivery_row.subscription_updated_at <> subscription_row.updated_at
  ) then
    raise exception 'FAIL delivery omitted the subscription generation snapshot';
  end if;

  update public.push_events
  set expanded_at = null
  where id = v_config.first_event_id;
end
$expansion_contract$;

set local role service_role;

do $reexpand$
begin
  if public.expand_push_event_batch(10) <> 1 then
    raise exception 'FAIL simulated re-expansion did not process the event';
  end if;
end
$reexpand$;

reset role;

do $delivery_unique$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if (select pg_catalog.count(*) from public.push_deliveries
      where push_event_id = v_config.first_event_id) <> 3 then
    raise exception 'FAIL re-expansion duplicated a delivery';
  end if;

  update public.push_subscriptions
  set user_id = v_config.second_user_id,
      updated_at = pg_catalog.now()
  where id = v_config.owner_change_subscription_id;

  update public.push_subscriptions
  set updated_at = pg_catalog.now() + interval '1 second'
  where id = v_config.generation_change_subscription_id;
end
$delivery_unique$;

set local role service_role;

with claimed as (
  select * from public.claim_push_delivery_batch(10, 120)
)
update _commatch_push_delivery_it_config
set claimed_delivery_id = claimed.delivery_id,
    claimed_subscription_id = claimed.push_subscription_id,
    claim_token = claimed.delivery_claim_token
from claimed;

do $no_duplicate_claim$
begin
  if exists (select 1 from public.claim_push_delivery_batch(10, 120)) then
    raise exception 'FAIL an unexpired processing delivery was claimed twice';
  end if;
end
$no_duplicate_claim$;

reset role;

do $generation_and_owner_safety$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if v_config.claimed_delivery_id is null
     or v_config.claimed_subscription_id <> v_config.valid_subscription_id
     or v_config.claim_token is null then
    raise exception 'FAIL claim returned an ineligible or incomplete delivery';
  end if;
  if (select pg_catalog.count(*) from public.push_deliveries
      where push_event_id = v_config.first_event_id and status = 'cancelled') <> 2 then
    raise exception 'FAIL changed owner/generation deliveries were not cancelled';
  end if;
  if exists (
    select 1 from public.push_deliveries
    where push_event_id = v_config.first_event_id
      and push_subscription_id = v_config.owner_change_subscription_id
      and status <> 'cancelled'
  ) then
    raise exception 'FAIL prior owner delivery remained sendable';
  end if;
end
$generation_and_owner_safety$;

set local role service_role;

do $fencing_and_success$
declare
  v_config _commatch_push_delivery_it_config%rowtype;
  v_stale_token uuid := pg_catalog.gen_random_uuid();
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if public.complete_push_delivery(v_config.claimed_delivery_id, v_stale_token, 201)
     or public.fail_push_delivery(
       v_config.claimed_delivery_id,
       v_stale_token,
       500,
       'push_service_error',
       null
     ) is not null then
    raise exception 'FAIL stale claim token changed a delivery';
  end if;
  if not public.complete_push_delivery(
    v_config.claimed_delivery_id,
    v_config.claim_token,
    201
  ) then
    raise exception 'FAIL valid completion was rejected';
  end if;
end
$fencing_and_success$;

reset role;

do $success_state$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if not exists (
    select 1 from public.push_deliveries
    where id = v_config.claimed_delivery_id
      and status = 'sent'
      and http_status = 201
      and sent_at is not null
      and claim_token is null
  ) then
    raise exception 'FAIL completed delivery state is incompatible';
  end if;
end
$success_state$;

do $result_fixtures$
declare
  v_config _commatch_push_delivery_it_config%rowtype;
  v_event_id uuid;
  v_token uuid;
begin
  select * into v_config from _commatch_push_delivery_it_config;

  insert into public.push_events (
    recipient_user_id, notification_id, event_type, source_id, expanded_at
  ) values (
    v_config.first_user_id, v_config.notification_id, 'new_like',
    pg_catalog.gen_random_uuid(), pg_catalog.now()
  ) returning id into v_event_id;
  v_token := pg_catalog.gen_random_uuid();
  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, lease_until, claim_token,
    last_attempt_at, created_at, updated_at
  )
  select
    v_event_id, subscription_row.id, subscription_row.updated_at,
    'processing', 1, null, pg_catalog.now() - interval '1 minute', v_token,
    pg_catalog.now() - interval '2 minutes', pg_catalog.now() - interval '3 minutes',
    pg_catalog.now() - interval '2 minutes'
  from public.push_subscriptions as subscription_row
  where subscription_row.id = v_config.valid_subscription_id
  returning id into v_config.lease_delivery_id;
  v_config.stale_claim_token := v_token;

  insert into public.push_events (
    recipient_user_id, notification_id, event_type, source_id, expanded_at
  ) values (
    v_config.first_user_id, v_config.notification_id, 'new_like',
    pg_catalog.gen_random_uuid(), pg_catalog.now()
  ) returning id into v_event_id;
  v_token := pg_catalog.gen_random_uuid();
  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, lease_until, claim_token,
    last_attempt_at, created_at, updated_at
  )
  select
    v_event_id, subscription_row.id, subscription_row.updated_at,
    'processing', 1, null, pg_catalog.now() + interval '5 minutes', v_token,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  from public.push_subscriptions as subscription_row
  where subscription_row.id = v_config.valid_subscription_id
  returning id into v_config.retry_delivery_id;

  insert into public.push_events (
    recipient_user_id, notification_id, event_type, source_id, expanded_at
  ) values (
    v_config.first_user_id, v_config.notification_id, 'new_like',
    pg_catalog.gen_random_uuid(), pg_catalog.now()
  ) returning id into v_event_id;
  v_token := pg_catalog.gen_random_uuid();
  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, lease_until, claim_token,
    last_attempt_at, created_at, updated_at
  )
  select
    v_event_id, subscription_row.id, subscription_row.updated_at,
    'processing', 1, null, pg_catalog.now() + interval '5 minutes', v_token,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  from public.push_subscriptions as subscription_row
  where subscription_row.id = v_config.valid_subscription_id
  returning id into v_config.terminal_delivery_id;

  update _commatch_push_delivery_it_config
  set lease_delivery_id = v_config.lease_delivery_id,
      stale_claim_token = v_config.stale_claim_token,
      retry_delivery_id = v_config.retry_delivery_id,
      retry_claim_token = (
        select claim_token from public.push_deliveries
        where id = v_config.retry_delivery_id
      ),
      terminal_delivery_id = v_config.terminal_delivery_id,
      terminal_claim_token = (
        select claim_token from public.push_deliveries
        where id = v_config.terminal_delivery_id
      );
end
$result_fixtures$;

set local role service_role;

with reclaimed as (
  select * from public.claim_push_delivery_batch(1, 120)
)
update _commatch_push_delivery_it_config
set reclaimed_claim_token = reclaimed.delivery_claim_token
from reclaimed
where lease_delivery_id = reclaimed.delivery_id;

do $lease_recovery_and_fencing$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if v_config.reclaimed_claim_token is null
     or v_config.reclaimed_claim_token = v_config.stale_claim_token then
    raise exception 'FAIL expired lease did not receive a new claim token';
  end if;
  if public.complete_push_delivery(
       v_config.lease_delivery_id,
       v_config.stale_claim_token,
       201
     )
     or public.fail_push_delivery(
       v_config.lease_delivery_id,
       v_config.stale_claim_token,
       500,
       'push_service_error',
       null
     ) is not null then
    raise exception 'FAIL reclaimed delivery accepted its stale token';
  end if;
  if not public.complete_push_delivery(
    v_config.lease_delivery_id,
    v_config.reclaimed_claim_token,
    201
  ) then
    raise exception 'FAIL reclaimed delivery completion';
  end if;
end
$lease_recovery_and_fencing$;

reset role;

do $lease_attempt_count$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if (select attempt_count from public.push_deliveries
      where id = v_config.lease_delivery_id) <> 2 then
    raise exception 'FAIL lease reclaim did not increment attempt_count';
  end if;
end
$lease_attempt_count$;

set local role service_role;

do $retry_and_terminal$
declare
  v_config _commatch_push_delivery_it_config%rowtype;
  v_retry_token uuid;
  v_terminal_token uuid;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  v_retry_token := v_config.retry_claim_token;
  v_terminal_token := v_config.terminal_claim_token;

  if public.fail_push_delivery(
       v_config.retry_delivery_id,
       v_retry_token,
       500,
       'push_service_error',
       null
     ) <> 'pending' then
    raise exception 'FAIL retryable response was not scheduled';
  end if;
  if public.fail_push_delivery(
       v_config.terminal_delivery_id,
       v_terminal_token,
       400,
       'invalid_request',
       null
     ) <> 'failed' then
    raise exception 'FAIL terminal 4xx response was not failed';
  end if;
end
$retry_and_terminal$;

reset role;

do $retry_and_terminal_state$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if not exists (
    select 1 from public.push_deliveries
    where id = v_config.retry_delivery_id
      and status = 'pending'
      and next_attempt_at > pg_catalog.now()
      and http_status = 500
      and last_error_code = 'push_service_error'
  ) then
    raise exception 'FAIL retry delivery state is incompatible';
  end if;
  if not exists (
    select 1 from public.push_deliveries
    where id = v_config.terminal_delivery_id
      and status = 'failed'
      and next_attempt_at is null
      and http_status = 400
      and last_error_code = 'invalid_request'
  ) then
    raise exception 'FAIL terminal delivery state is incompatible';
  end if;
end
$retry_and_terminal_state$;

do $gone_fixtures$
declare
  v_config _commatch_push_delivery_it_config%rowtype;
  v_first_event_id uuid;
  v_second_event_id uuid;
  v_token uuid := pg_catalog.gen_random_uuid();
begin
  select * into v_config from _commatch_push_delivery_it_config;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, new_message_enabled, new_like_enabled
  ) values (
    v_config.first_user_id,
    'https://push.example.test/delivery/gone',
    pg_catalog.repeat('M', 87),
    pg_catalog.repeat('N', 22),
    true,
    true
  ) returning id into v_config.gone_subscription_id;

  insert into public.push_events (
    recipient_user_id, notification_id, event_type, source_id, expanded_at
  ) values (
    v_config.first_user_id, v_config.notification_id, 'new_like',
    pg_catalog.gen_random_uuid(), pg_catalog.now()
  ) returning id into v_first_event_id;

  insert into public.push_events (
    recipient_user_id, notification_id, event_type, source_id, expanded_at
  ) values (
    v_config.first_user_id, v_config.notification_id, 'new_like',
    pg_catalog.gen_random_uuid(), pg_catalog.now()
  ) returning id into v_second_event_id;

  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, lease_until, claim_token,
    last_attempt_at, created_at, updated_at
  )
  select
    v_first_event_id, subscription_row.id, subscription_row.updated_at,
    'processing', 1, null, pg_catalog.now() + interval '5 minutes', v_token,
    pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  from public.push_subscriptions as subscription_row
  where subscription_row.id = v_config.gone_subscription_id
  returning id into v_config.gone_delivery_id;

  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, created_at, updated_at
  )
  select
    v_second_event_id, subscription_row.id, subscription_row.updated_at,
    'pending', 0, pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  from public.push_subscriptions as subscription_row
  where subscription_row.id = v_config.gone_subscription_id
  returning id into v_config.gone_pending_delivery_id;

  update _commatch_push_delivery_it_config
  set gone_subscription_id = v_config.gone_subscription_id,
      gone_delivery_id = v_config.gone_delivery_id,
      gone_pending_delivery_id = v_config.gone_pending_delivery_id,
      claim_token = v_token;
end
$gone_fixtures$;

set local role service_role;

do $gone_result$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if public.fail_push_delivery(
       v_config.gone_delivery_id,
       v_config.claim_token,
       410,
       'subscription_gone',
       null
     ) <> 'failed' then
    raise exception 'FAIL 410 response was not terminal';
  end if;
end
$gone_result$;

reset role;

do $gone_state$
declare v_config _commatch_push_delivery_it_config%rowtype;
begin
  select * into v_config from _commatch_push_delivery_it_config;
  if not exists (
    select 1 from public.push_deliveries
    where id = v_config.gone_delivery_id
      and status = 'failed'
      and http_status = 410
      and last_error_code = 'subscription_gone'
  ) then
    raise exception 'FAIL 410 delivery result is incompatible';
  end if;
  if not exists (
    select 1 from public.push_deliveries
    where id = v_config.gone_pending_delivery_id
      and status = 'cancelled'
  ) then
    raise exception 'FAIL pending delivery for a gone subscription was not cancelled';
  end if;
  if not exists (
    select 1 from public.push_subscriptions
    where id = v_config.gone_subscription_id
      and revoked_at is not null
      and not new_message_enabled
      and not new_like_enabled
  ) then
    raise exception 'FAIL 410 did not revoke the subscription and disable preferences';
  end if;
end
$gone_state$;

set local role authenticated;

select pg_temp._commatch_push_delivery_expect_error(
  'direct authenticated Push event select',
  '42501',
  'select * from public.push_events'
);
select pg_temp._commatch_push_delivery_expect_error(
  'direct authenticated Push event insert',
  '42501',
  'insert into public.push_events(recipient_user_id,notification_id,event_type,source_id) values (gen_random_uuid(),gen_random_uuid(),''new_like'',gen_random_uuid())'
);
select pg_temp._commatch_push_delivery_expect_error(
  'direct authenticated Push delivery update',
  '42501',
  'update public.push_deliveries set status = ''cancelled'''
);
select pg_temp._commatch_push_delivery_expect_error(
  'direct authenticated Push delivery delete',
  '42501',
  'delete from public.push_deliveries'
);
select pg_temp._commatch_push_delivery_expect_error(
  'authenticated arbitrary Push enqueue',
  '42501',
  format(
    'select public.enqueue_push_event(%L::uuid,%L::uuid,%L,%L::uuid)',
    first_user_id,
    notification_id,
    'new_like',
    pg_catalog.gen_random_uuid()
  )
) from _commatch_push_delivery_it_config;
select pg_temp._commatch_push_delivery_expect_error(
  'authenticated Push event expansion',
  '42501',
  'select public.expand_push_event_batch(1)'
);
select pg_temp._commatch_push_delivery_expect_error(
  'authenticated Push delivery claim',
  '42501',
  'select * from public.claim_push_delivery_batch(1, 120)'
);

reset role;

select 'PASS Web Push Phase 2-B delivery pipeline tests; all fixture changes rolled back'
  as test_result;

rollback;
