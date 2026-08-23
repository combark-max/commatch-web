-- ComMatch Web Push Phase 2-B durable delivery pipeline.
--
-- This migration adds an internal outbox, per-subscription deliveries, and
-- service-role worker RPCs. It does not connect any business RPC to Push.
-- Apply after notification-events-v1.sql and push-subscriptions-v1.sql.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.notifications') is null
     or pg_catalog.to_regclass('public.push_subscriptions') is null then
    raise exception 'Required notification or Push Phase 2-A dependency is missing';
  end if;
end
$preflight$;

create table public.push_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  event_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  expanded_at timestamptz null,
  constraint push_events_type_check
    check (event_type in ('new_message', 'new_like')),
  constraint push_events_source_unique
    unique (recipient_user_id, event_type, source_id),
  constraint push_events_expanded_at_check
    check (expanded_at is null or expanded_at >= created_at)
);

create index push_events_unexpanded_idx
  on public.push_events (created_at, id)
  where expanded_at is null;

create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  push_event_id uuid not null references public.push_events(id) on delete cascade,
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  subscription_updated_at timestamptz not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz null default pg_catalog.now(),
  lease_until timestamptz null,
  claim_token uuid null,
  last_attempt_at timestamptz null,
  http_status integer null,
  last_error_code text null,
  sent_at timestamptz null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint push_deliveries_event_subscription_unique
    unique (push_event_id, push_subscription_id),
  constraint push_deliveries_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  constraint push_deliveries_attempt_count_check
    check (attempt_count >= 0),
  constraint push_deliveries_http_status_check
    check (http_status is null or http_status between 100 and 599),
  constraint push_deliveries_last_error_code_check
    check (
      last_error_code is null
      or (
        pg_catalog.char_length(last_error_code) between 1 and 64
        and last_error_code ~ '^[a-z0-9_]+$'
      )
    ),
  constraint push_deliveries_timestamps_check
    check (updated_at >= created_at),
  constraint push_deliveries_state_check
    check (
      (status = 'pending'
        and next_attempt_at is not null
        and lease_until is null
        and claim_token is null
        and sent_at is null)
      or (status = 'processing'
        and next_attempt_at is null
        and lease_until is not null
        and claim_token is not null
        and last_attempt_at is not null
        and attempt_count > 0
        and sent_at is null)
      or (status = 'sent'
        and next_attempt_at is null
        and lease_until is null
        and claim_token is null
        and sent_at is not null
        and http_status between 200 and 299)
      or (status in ('failed', 'cancelled')
        and next_attempt_at is null
        and lease_until is null
        and claim_token is null
        and sent_at is null)
    )
);

create index push_deliveries_pending_idx
  on public.push_deliveries (next_attempt_at, created_at, id)
  where status = 'pending';

create index push_deliveries_expired_lease_idx
  on public.push_deliveries (lease_until, id)
  where status = 'processing';

create index push_deliveries_subscription_open_idx
  on public.push_deliveries (push_subscription_id, status, id)
  where status in ('pending', 'processing');

alter table public.push_events enable row level security;
alter table public.push_deliveries enable row level security;

-- No policies are intentional. All access is through the worker-only
-- SECURITY DEFINER functions below.
revoke all on table public.push_events
  from public, anon, authenticated, service_role;
revoke all on table public.push_deliveries
  from public, anon, authenticated, service_role;

create or replace function public.enqueue_push_event(
  p_recipient_user_id uuid,
  p_notification_id uuid,
  p_event_type text,
  p_source_id uuid
)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
begin
  if p_recipient_user_id is null
     or p_notification_id is null
     or p_source_id is null
     or p_event_type is null
     or p_event_type not in ('new_message', 'new_like') then
    raise exception using errcode = '22023', message = 'Invalid Push event';
  end if;

  if not exists (
    select 1
    from public.notifications as notification_row
    where notification_row.id = p_notification_id
      and notification_row.recipient_user_id = p_recipient_user_id
      and notification_row.type = p_event_type
  ) then
    raise exception using
      errcode = '23503',
      message = 'Push event notification contract is incompatible';
  end if;

  insert into public.push_events (
    recipient_user_id,
    notification_id,
    event_type,
    source_id
  ) values (
    p_recipient_user_id,
    p_notification_id,
    p_event_type,
    p_source_id
  )
  on conflict on constraint push_events_source_unique do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select event_row.id into v_event_id
    from public.push_events as event_row
    where event_row.recipient_user_id = p_recipient_user_id
      and event_row.event_type = p_event_type
      and event_row.source_id = p_source_id
      and event_row.notification_id = p_notification_id;

    if v_event_id is null then
      raise exception using
        errcode = '23505',
        message = 'Push event source is already bound to another notification';
    end if;
  end if;

  return v_event_id;
end
$function$;

create or replace function public.expand_push_event_batch(p_limit integer)
returns integer
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_event_ids uuid[];
  v_expanded_count integer;
  v_now timestamptz := pg_catalog.now();
begin
  if p_limit is null or p_limit not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Invalid Push event expansion limit';
  end if;

  select pg_catalog.array_agg(candidate.id order by candidate.created_at, candidate.id)
    into v_event_ids
  from (
    select event_row.id, event_row.created_at
    from public.push_events as event_row
    where event_row.expanded_at is null
    order by event_row.created_at, event_row.id
    for update of event_row skip locked
    limit p_limit
  ) as candidate;

  if v_event_ids is null then
    return 0;
  end if;

  insert into public.push_deliveries (
    push_event_id,
    push_subscription_id,
    subscription_updated_at,
    status,
    attempt_count,
    next_attempt_at,
    created_at,
    updated_at
  )
  select
    event_row.id,
    subscription_row.id,
    subscription_row.updated_at,
    'pending',
    0,
    v_now,
    v_now,
    v_now
  from public.push_events as event_row
  join public.push_subscriptions as subscription_row
    on subscription_row.user_id = event_row.recipient_user_id
  where event_row.id = any(v_event_ids)
    and subscription_row.revoked_at is null
    and (subscription_row.expiration_time is null or subscription_row.expiration_time > v_now)
    and (
      (event_row.event_type = 'new_message' and subscription_row.new_message_enabled)
      or (event_row.event_type = 'new_like' and subscription_row.new_like_enabled)
    )
  on conflict on constraint push_deliveries_event_subscription_unique do nothing;

  update public.push_events as event_row
  set expanded_at = v_now
  where event_row.id = any(v_event_ids);

  get diagnostics v_expanded_count = row_count;
  return v_expanded_count;
end
$function$;

create or replace function public.claim_push_delivery_batch(
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  delivery_id uuid,
  delivery_claim_token uuid,
  push_event_id uuid,
  notification_id uuid,
  event_type text,
  push_subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  attempt_count integer
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_limit is null or p_limit not between 1 and 100
     or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid Push delivery claim options';
  end if;

  with terminal_candidate as (
    select delivery_row.id,
      case
        when event_row.created_at <= v_now - interval '24 hours' then 'event_expired'
        else 'attempt_limit'
      end as error_code
    from public.push_deliveries as delivery_row
    join public.push_events as event_row on event_row.id = delivery_row.push_event_id
    where (
      delivery_row.status = 'pending'
      or (delivery_row.status = 'processing' and delivery_row.lease_until <= v_now)
    )
      and (
        delivery_row.attempt_count >= 6
        or event_row.created_at <= v_now - interval '24 hours'
      )
    order by delivery_row.created_at, delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  )
  update public.push_deliveries as delivery_row
  set status = 'failed',
      next_attempt_at = null,
      lease_until = null,
      claim_token = null,
      last_error_code = terminal_candidate.error_code,
      sent_at = null,
      updated_at = v_now
  from terminal_candidate
  where delivery_row.id = terminal_candidate.id;

  with invalid_candidate as (
    select delivery_row.id
    from public.push_deliveries as delivery_row
    join public.push_events as event_row on event_row.id = delivery_row.push_event_id
    where (
      delivery_row.status = 'pending'
      or (delivery_row.status = 'processing' and delivery_row.lease_until <= v_now)
    )
      and not exists (
        select 1
        from public.push_subscriptions as subscription_row
        where subscription_row.id = delivery_row.push_subscription_id
          and subscription_row.user_id = event_row.recipient_user_id
          and subscription_row.updated_at = delivery_row.subscription_updated_at
          and subscription_row.revoked_at is null
          and (
            subscription_row.expiration_time is null
            or subscription_row.expiration_time > v_now
          )
          and (
            (event_row.event_type = 'new_message' and subscription_row.new_message_enabled)
            or (event_row.event_type = 'new_like' and subscription_row.new_like_enabled)
          )
      )
    order by delivery_row.created_at, delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  )
  update public.push_deliveries as delivery_row
  set status = 'cancelled',
      next_attempt_at = null,
      lease_until = null,
      claim_token = null,
      last_error_code = 'subscription_ineligible',
      sent_at = null,
      updated_at = v_now
  from invalid_candidate
  where delivery_row.id = invalid_candidate.id;

  return query
  with claimable as (
    select
      delivery_row.id,
      event_row.id as event_id,
      event_row.notification_id,
      event_row.event_type,
      subscription_row.id as subscription_id,
      subscription_row.endpoint,
      subscription_row.p256dh,
      subscription_row.auth,
      subscription_row.expiration_time
    from public.push_deliveries as delivery_row
    join public.push_events as event_row on event_row.id = delivery_row.push_event_id
    join public.push_subscriptions as subscription_row
      on subscription_row.id = delivery_row.push_subscription_id
     and subscription_row.user_id = event_row.recipient_user_id
     and subscription_row.updated_at = delivery_row.subscription_updated_at
    where (
      (delivery_row.status = 'pending' and delivery_row.next_attempt_at <= v_now)
      or (delivery_row.status = 'processing' and delivery_row.lease_until <= v_now)
    )
      and delivery_row.attempt_count < 6
      and event_row.created_at > v_now - interval '24 hours'
      and subscription_row.revoked_at is null
      and (subscription_row.expiration_time is null or subscription_row.expiration_time > v_now)
      and (
        (event_row.event_type = 'new_message' and subscription_row.new_message_enabled)
        or (event_row.event_type = 'new_like' and subscription_row.new_like_enabled)
      )
    order by delivery_row.next_attempt_at nulls first, delivery_row.created_at, delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  )
  update public.push_deliveries as delivery_row
  set status = 'processing',
      attempt_count = delivery_row.attempt_count + 1,
      next_attempt_at = null,
      lease_until = v_now + p_lease_seconds * interval '1 second',
      claim_token = pg_catalog.gen_random_uuid(),
      last_attempt_at = v_now,
      http_status = null,
      last_error_code = null,
      updated_at = v_now
  from claimable
  where delivery_row.id = claimable.id
  returning
    delivery_row.id,
    delivery_row.claim_token,
    claimable.event_id,
    claimable.notification_id,
    claimable.event_type,
    claimable.subscription_id,
    claimable.endpoint,
    claimable.p256dh,
    claimable.auth,
    claimable.expiration_time,
    delivery_row.attempt_count;
end
$function$;

create or replace function public.complete_push_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_http_status integer
)
returns boolean
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if p_delivery_id is null or p_claim_token is null
     or p_http_status is null or p_http_status not between 200 and 299 then
    raise exception using errcode = '22023', message = 'Invalid Push delivery completion';
  end if;

  update public.push_deliveries as delivery_row
  set status = 'sent',
      next_attempt_at = null,
      lease_until = null,
      claim_token = null,
      http_status = p_http_status,
      last_error_code = null,
      sent_at = v_now,
      updated_at = v_now
  where delivery_row.id = p_delivery_id
    and delivery_row.status = 'processing'
    and delivery_row.claim_token = p_claim_token
    and delivery_row.lease_until > v_now;

  return found;
end
$function$;

create or replace function public.fail_push_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_http_status integer,
  p_last_error_code text,
  p_retry_after timestamptz
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_delivery public.push_deliveries%rowtype;
  v_event_created_at timestamptz;
  v_selected record;
  v_error_code text := pg_catalog.lower(pg_catalog.btrim(p_last_error_code));
  v_now timestamptz := pg_catalog.now();
  v_retryable boolean;
  v_next_attempt_at timestamptz;
  v_delay_seconds double precision;
begin
  if p_delivery_id is null or p_claim_token is null
     or v_error_code is null
     or v_error_code not in (
       'network', 'timeout', 'rate_limited', 'push_service_error',
       'invalid_request', 'vapid_rejected', 'subscription_gone', 'unknown'
     )
     or (p_http_status is not null and p_http_status not between 100 and 599) then
    raise exception using errcode = '22023', message = 'Invalid Push delivery failure';
  end if;

  select
    delivery_row as delivery_snapshot,
    event_row.created_at as event_created_at
    into v_selected
  from public.push_deliveries as delivery_row
  join public.push_events as event_row on event_row.id = delivery_row.push_event_id
  where delivery_row.id = p_delivery_id
    and delivery_row.status = 'processing'
    and delivery_row.claim_token = p_claim_token
    and delivery_row.lease_until > v_now
  for update of delivery_row;

  if not found then
    return null;
  end if;

  v_delivery := v_selected.delivery_snapshot;
  v_event_created_at := v_selected.event_created_at;

  if p_http_status in (404, 410) then
    update public.push_subscriptions as subscription_row
    set revoked_at = coalesce(subscription_row.revoked_at, v_now),
        new_message_enabled = false,
        new_like_enabled = false,
        updated_at = v_now
    where subscription_row.id = v_delivery.push_subscription_id
      and subscription_row.updated_at = v_delivery.subscription_updated_at;

    update public.push_deliveries as delivery_row
    set status = 'cancelled',
        next_attempt_at = null,
        lease_until = null,
        claim_token = null,
        last_error_code = 'subscription_ineligible',
        sent_at = null,
        updated_at = v_now
    where delivery_row.push_subscription_id = v_delivery.push_subscription_id
      and delivery_row.id <> v_delivery.id
      and delivery_row.subscription_updated_at = v_delivery.subscription_updated_at
      and delivery_row.status in ('pending', 'processing');

    update public.push_deliveries as delivery_row
    set status = 'failed',
        next_attempt_at = null,
        lease_until = null,
        claim_token = null,
        http_status = p_http_status,
        last_error_code = 'subscription_gone',
        sent_at = null,
        updated_at = v_now
    where delivery_row.id = v_delivery.id;

    return 'failed';
  end if;

  v_retryable := (
    (p_http_status is null and v_error_code in ('network', 'timeout'))
    or p_http_status = 429
    or p_http_status between 500 and 599
  );

  if v_retryable
     and v_delivery.attempt_count < 6
     and v_event_created_at > v_now - interval '24 hours' then
    if p_http_status = 429 and p_retry_after is not null then
      v_next_attempt_at := greatest(
        v_now + interval '1 minute',
        least(p_retry_after, v_now + interval '6 hours')
      );
    else
      v_delay_seconds := least(
        3600::double precision,
        60::double precision * pg_catalog.power(
          2::double precision,
          greatest(v_delivery.attempt_count - 1, 0)::double precision
        )
      );
      v_next_attempt_at := v_now
        + (v_delay_seconds * (1 + pg_catalog.random() * 0.25)) * interval '1 second';
    end if;

    if v_next_attempt_at < v_event_created_at + interval '24 hours' then
      update public.push_deliveries as delivery_row
      set status = 'pending',
          next_attempt_at = v_next_attempt_at,
          lease_until = null,
          claim_token = null,
          http_status = p_http_status,
          last_error_code = v_error_code,
          sent_at = null,
          updated_at = v_now
      where delivery_row.id = v_delivery.id;

      return 'pending';
    end if;
  end if;

  update public.push_deliveries as delivery_row
  set status = 'failed',
      next_attempt_at = null,
      lease_until = null,
      claim_token = null,
      http_status = p_http_status,
      last_error_code = v_error_code,
      sent_at = null,
      updated_at = v_now
  where delivery_row.id = v_delivery.id;

  return 'failed';
end
$function$;

comment on function public.enqueue_push_event(uuid, uuid, text, uuid)
  is 'Creates one idempotent server-only Push outbox event';
comment on function public.expand_push_event_batch(integer)
  is 'Atomically expands unexpanded Push events to currently eligible subscriptions';
comment on function public.claim_push_delivery_batch(integer, integer)
  is 'Leases eligible Push deliveries and returns sensitive subscription material to the worker';
comment on function public.complete_push_delivery(uuid, uuid, integer)
  is 'Completes one leased Push delivery using its fencing token';
comment on function public.fail_push_delivery(uuid, uuid, integer, text, timestamptz)
  is 'Retries or terminally resolves one leased Push delivery using its fencing token';

alter function public.enqueue_push_event(uuid, uuid, text, uuid) owner to postgres;
alter function public.expand_push_event_batch(integer) owner to postgres;
alter function public.claim_push_delivery_batch(integer, integer) owner to postgres;
alter function public.complete_push_delivery(uuid, uuid, integer) owner to postgres;
alter function public.fail_push_delivery(uuid, uuid, integer, text, timestamptz) owner to postgres;

revoke all on function public.enqueue_push_event(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.expand_push_event_batch(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_push_delivery_batch(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_push_delivery(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_push_delivery(uuid, uuid, integer, text, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.enqueue_push_event(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.expand_push_event_batch(integer)
  to service_role;
grant execute on function public.claim_push_delivery_batch(integer, integer)
  to service_role;
grant execute on function public.complete_push_delivery(uuid, uuid, integer)
  to service_role;
grant execute on function public.fail_push_delivery(uuid, uuid, integer, text, timestamptz)
  to service_role;

do $contract_validation$
declare
  v_function_oid oid;
  v_postgres_oid oid := (
    select role_info.oid from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'postgres'
  );
begin
  if not exists (
    select 1 from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.push_events'::pg_catalog.regclass
      and table_info.relrowsecurity
      and table_info.relowner = v_postgres_oid
  ) or not exists (
    select 1 from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.push_deliveries'::pg_catalog.regclass
      and table_info.relrowsecurity
      and table_info.relowner = v_postgres_oid
  ) or exists (
    select 1 from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.push_events'::pg_catalog.regclass,
      'public.push_deliveries'::pg_catalog.regclass
    )
  ) then
    raise exception 'Push pipeline tables must be postgres-owned RLS tables with no policies';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(array['public', 'anon', 'authenticated', 'service_role']) as role_name
    cross join pg_catalog.unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege_name
    where pg_catalog.has_table_privilege(
      role_name,
      'public.push_events',
      privilege_name
    ) or pg_catalog.has_table_privilege(
      role_name,
      'public.push_deliveries',
      privilege_name
    )
  ) then
    raise exception 'A client or worker role retains direct Push pipeline table access';
  end if;

  foreach v_function_oid in array array[
    'public.enqueue_push_event(uuid,uuid,text,uuid)'::pg_catalog.regprocedure::oid,
    'public.expand_push_event_batch(integer)'::pg_catalog.regprocedure::oid,
    'public.claim_push_delivery_batch(integer,integer)'::pg_catalog.regprocedure::oid,
    'public.complete_push_delivery(uuid,uuid,integer)'::pg_catalog.regprocedure::oid,
    'public.fail_push_delivery(uuid,uuid,integer,text,timestamp with time zone)'::pg_catalog.regprocedure::oid
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      where function_info.oid = v_function_oid
        and function_info.prosecdef
        and function_info.proowner = v_postgres_oid
        and function_info.proconfig is not distinct from array['search_path=""']::text[]
    )
       or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE') then
      raise exception 'Push worker RPC security contract is incompatible';
    end if;
  end loop;
end
$contract_validation$;

commit;

select 'PASS Web Push Phase 2-B delivery pipeline migration' as migration_result;
