-- ComMatch Web Push additional notification events.
--
-- Apply after push-business-events-v1.sql. This forward migration adds
-- new_match and support_inquiry_answered without changing the Phase 2-B/2-C
-- migration files or the existing retry, lease, completion, and failure flow.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.push_subscriptions') is null
     or pg_catalog.to_regclass('public.push_events') is null
     or pg_catalog.to_regclass('public.push_deliveries') is null
     or pg_catalog.to_regclass('public.notifications') is null
     or pg_catalog.to_regclass('public.support_inquiries') is null
     or pg_catalog.to_regprocedure('public.register_my_push_subscription(text,text,text,timestamptz,boolean,boolean)') is null
     or pg_catalog.to_regprocedure('public.get_my_push_subscription_settings(text)') is null
     or pg_catalog.to_regprocedure('public.revoke_my_push_subscription(text)') is null
     or pg_catalog.to_regprocedure('public.enqueue_push_event(uuid,uuid,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.expand_push_event_batch(integer)') is null
     or pg_catalog.to_regprocedure('public.claim_push_delivery_batch(integer,integer)') is null
     or pg_catalog.to_regprocedure('public.send_member_like(uuid)') is null
     or pg_catalog.to_regprocedure('public.answer_admin_support_inquiry(uuid,timestamptz,text)') is null then
    raise exception 'Required Push, match, or support inquiry dependency is missing';
  end if;
end
$preflight$;

-- Existing rows receive false. Defaults are changed only after the columns
-- exist so subscriptions inserted after this migration default to true.
alter table public.push_subscriptions
  add column new_match_enabled boolean not null default false,
  add column support_inquiry_answered_enabled boolean not null default false;

alter table public.push_subscriptions
  alter column new_match_enabled set default true,
  alter column support_inquiry_answered_enabled set default true;

alter table public.push_events
  drop constraint push_events_type_check,
  add constraint push_events_type_check check (
    event_type in (
      'new_message',
      'new_like',
      'new_match',
      'support_inquiry_answered'
    )
  );

-- Preserve the v1 signature for already-deployed clients. New physical rows
-- use the new column defaults; reactivating a revoked endpoint also restores
-- the two new-event defaults without changing active existing subscriptions.
create or replace function public.register_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz,
  p_new_message_enabled boolean,
  p_new_like_enabled boolean
)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
  v_now timestamptz := pg_catalog.now();
  v_result public.push_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh is null
     or pg_catalog.char_length(p_p256dh) not between 80 and 120
     or p_p256dh !~ '^[A-Za-z0-9_-]+$'
     or p_auth is null
     or pg_catalog.char_length(p_auth) not between 16 and 64
     or p_auth !~ '^[A-Za-z0-9_-]+$'
     or p_new_message_enabled is null
     or p_new_like_enabled is null
     or (p_expiration_time is not null and p_expiration_time <= v_now) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions as subscription_row (
    user_id, endpoint, p256dh, auth, expiration_time,
    new_message_enabled, new_like_enabled,
    created_at, updated_at, last_seen_at, revoked_at
  ) values (
    v_user_id, v_endpoint, p_p256dh, p_auth, p_expiration_time,
    p_new_message_enabled, p_new_like_enabled,
    v_now, v_now, v_now, null
  )
  on conflict on constraint push_subscriptions_endpoint_unique
  do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      new_message_enabled = excluded.new_message_enabled,
      new_like_enabled = excluded.new_like_enabled,
      new_match_enabled = case
        when subscription_row.revoked_at is not null then true
        else subscription_row.new_match_enabled
      end,
      support_inquiry_answered_enabled = case
        when subscription_row.revoked_at is not null then true
        else subscription_row.support_inquiry_answered_enabled
      end,
      created_at = case
        when subscription_row.user_id = excluded.user_id then subscription_row.created_at
        else excluded.created_at
      end,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at,
      revoked_at = null
  where subscription_row.user_id = excluded.user_id
     or subscription_row.revoked_at is not null
  returning subscription_row.* into v_result;

  if v_result.id is null then
    raise exception using
      errcode = '23505',
      message = 'Push subscription is active for another account';
  end if;

  return query
  select v_result.id, v_result.new_message_enabled, v_result.new_like_enabled,
    v_result.created_at, v_result.updated_at, v_result.last_seen_at,
    v_result.revoked_at;
end
$function$;

-- The v2 RPC gives the current client an atomic four-preference contract while
-- leaving the v1 RPC callable by older deployed clients.
create function public.register_my_push_subscription_v2(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz,
  p_new_message_enabled boolean,
  p_new_like_enabled boolean,
  p_new_match_enabled boolean,
  p_support_inquiry_answered_enabled boolean
)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  new_match_enabled boolean,
  support_inquiry_answered_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
  v_now timestamptz := pg_catalog.now();
  v_existing_active boolean;
  v_result public.push_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh is null
     or pg_catalog.char_length(p_p256dh) not between 80 and 120
     or p_p256dh !~ '^[A-Za-z0-9_-]+$'
     or p_auth is null
     or pg_catalog.char_length(p_auth) not between 16 and 64
     or p_auth !~ '^[A-Za-z0-9_-]+$'
     or p_new_message_enabled is null
     or p_new_like_enabled is null
     or p_new_match_enabled is null
     or p_support_inquiry_answered_enabled is null
     or (p_expiration_time is not null and p_expiration_time <= v_now) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  select exists (
    select 1
    from public.push_subscriptions as subscription_row
    where subscription_row.endpoint = v_endpoint
      and subscription_row.user_id = v_user_id
      and subscription_row.revoked_at is null
  ) into v_existing_active;

  insert into public.push_subscriptions as subscription_row (
    user_id, endpoint, p256dh, auth, expiration_time,
    new_message_enabled, new_like_enabled, new_match_enabled,
    support_inquiry_answered_enabled,
    created_at, updated_at, last_seen_at, revoked_at
  ) values (
    v_user_id, v_endpoint, p_p256dh, p_auth, p_expiration_time,
    p_new_message_enabled, p_new_like_enabled,
    case when v_existing_active then p_new_match_enabled else true end,
    case when v_existing_active then p_support_inquiry_answered_enabled else true end,
    v_now, v_now, v_now, null
  )
  on conflict on constraint push_subscriptions_endpoint_unique
  do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      new_message_enabled = excluded.new_message_enabled,
      new_like_enabled = excluded.new_like_enabled,
      new_match_enabled = excluded.new_match_enabled,
      support_inquiry_answered_enabled = excluded.support_inquiry_answered_enabled,
      created_at = case
        when subscription_row.user_id = excluded.user_id then subscription_row.created_at
        else excluded.created_at
      end,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at,
      revoked_at = null
  where subscription_row.user_id = excluded.user_id
     or subscription_row.revoked_at is not null
  returning subscription_row.* into v_result;

  if v_result.id is null then
    raise exception using
      errcode = '23505',
      message = 'Push subscription is active for another account';
  end if;

  return query
  select v_result.id, v_result.new_message_enabled, v_result.new_like_enabled,
    v_result.new_match_enabled, v_result.support_inquiry_answered_enabled,
    v_result.created_at, v_result.updated_at, v_result.last_seen_at,
    v_result.revoked_at;
end
$function$;

create function public.get_my_push_subscription_settings_v2(p_endpoint text)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  new_match_enabled boolean,
  support_inquiry_answered_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid push subscription endpoint';
  end if;

  return query
  select subscription_row.id, subscription_row.new_message_enabled,
    subscription_row.new_like_enabled, subscription_row.new_match_enabled,
    subscription_row.support_inquiry_answered_enabled,
    subscription_row.created_at, subscription_row.updated_at,
    subscription_row.last_seen_at, subscription_row.revoked_at
  from public.push_subscriptions as subscription_row
  where subscription_row.user_id = v_user_id
    and subscription_row.endpoint = v_endpoint;
end
$function$;

create or replace function public.revoke_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid push subscription endpoint';
  end if;

  update public.push_subscriptions as subscription_row
  set revoked_at = coalesce(subscription_row.revoked_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      new_message_enabled = false,
      new_like_enabled = false,
      new_match_enabled = false,
      support_inquiry_answered_enabled = false
  where subscription_row.user_id = v_user_id
    and subscription_row.endpoint = v_endpoint;

  return found;
end
$function$;

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
     or p_event_type not in (
       'new_message', 'new_like', 'new_match', 'support_inquiry_answered'
     ) then
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
    recipient_user_id, notification_id, event_type, source_id
  ) values (
    p_recipient_user_id, p_notification_id, p_event_type, p_source_id
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

  if v_event_ids is null then return 0; end if;

  insert into public.push_deliveries (
    push_event_id, push_subscription_id, subscription_updated_at,
    status, attempt_count, next_attempt_at, created_at, updated_at
  )
  select event_row.id, subscription_row.id, subscription_row.updated_at,
    'pending', 0, v_now, v_now, v_now
  from public.push_events as event_row
  join public.push_subscriptions as subscription_row
    on subscription_row.user_id = event_row.recipient_user_id
  where event_row.id = any(v_event_ids)
    and subscription_row.revoked_at is null
    and (subscription_row.expiration_time is null or subscription_row.expiration_time > v_now)
    and (
      (event_row.event_type = 'new_message' and subscription_row.new_message_enabled)
      or (event_row.event_type = 'new_like' and subscription_row.new_like_enabled)
      or (event_row.event_type = 'new_match' and subscription_row.new_match_enabled)
      or (
        event_row.event_type = 'support_inquiry_answered'
        and subscription_row.support_inquiry_answered_enabled
      )
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
  set status = 'failed', next_attempt_at = null, lease_until = null,
      claim_token = null, last_error_code = terminal_candidate.error_code,
      sent_at = null, updated_at = v_now
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
            or (event_row.event_type = 'new_match' and subscription_row.new_match_enabled)
            or (
              event_row.event_type = 'support_inquiry_answered'
              and subscription_row.support_inquiry_answered_enabled
            )
          )
      )
    order by delivery_row.created_at, delivery_row.id
    for update of delivery_row skip locked
    limit p_limit
  )
  update public.push_deliveries as delivery_row
  set status = 'cancelled', next_attempt_at = null, lease_until = null,
      claim_token = null, last_error_code = 'subscription_ineligible',
      sent_at = null, updated_at = v_now
  from invalid_candidate
  where delivery_row.id = invalid_candidate.id;

  return query
  with claimable as (
    select delivery_row.id, event_row.id as event_id,
      event_row.notification_id, event_row.event_type,
      subscription_row.id as subscription_id, subscription_row.endpoint,
      subscription_row.p256dh, subscription_row.auth,
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
        or (event_row.event_type = 'new_match' and subscription_row.new_match_enabled)
        or (
          event_row.event_type = 'support_inquiry_answered'
          and subscription_row.support_inquiry_answered_enabled
        )
      )
    order by delivery_row.next_attempt_at nulls first,
      delivery_row.created_at, delivery_row.id
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
  returning delivery_row.id, delivery_row.claim_token,
    claimable.event_id, claimable.notification_id, claimable.event_type,
    claimable.subscription_id, claimable.endpoint, claimable.p256dh,
    claimable.auth, claimable.expiration_time, delivery_row.attempt_count;
end
$function$;

create or replace function public.send_member_like(target_user_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_inserted_like_id uuid;
  v_notification_id uuid;
  v_match_id uuid;
  v_match_notification record;
  v_target_is_allowed boolean;
begin
  -- commatch_push_business_events_v1
  -- commatch_push_additional_events_v1
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if target_user_id is null or target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'A member cannot like themselves';
  end if;

  perform public.lock_member_service_write_pair(v_user_id, target_user_id);

  select
    exists (select 1 from public.profiles as profile where profile.id = target_user_id)
    and public.is_member_profile_visible(target_user_id)
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = target_user_id
        and restriction.account_status <> 'active'
        and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
    )
  into v_target_is_allowed;

  if not coalesce(v_target_is_allowed, false) then
    raise exception using errcode = '42501', message = 'Target member is not available';
  end if;

  insert into public.likes (user_id, liked_user_id)
  values (v_user_id, target_user_id)
  on conflict (user_id, liked_user_id) do nothing
  returning id into v_inserted_like_id;

  if exists (
    select 1 from public.likes as reciprocal_like
    where reciprocal_like.user_id = target_user_id
      and reciprocal_like.liked_user_id = v_user_id
  ) then
    insert into public.matches (user_1_id, user_2_id, status, matched_at)
    values (
      least(v_user_id, target_user_id),
      greatest(v_user_id, target_user_id),
      'active',
      pg_catalog.now()
    )
    on conflict (user_1_id, user_2_id) do nothing
    returning id into v_match_id;

    if v_match_id is not null then
      for v_match_notification in
        with inserted_notification as (
          insert into public.notifications (recipient_user_id, type, match_id)
          values
            (v_user_id, 'new_match', v_match_id),
            (target_user_id, 'new_match', v_match_id)
          returning id, recipient_user_id
        )
        select inserted_notification.id, inserted_notification.recipient_user_id
        from inserted_notification
      loop
        perform public.enqueue_push_event(
          v_match_notification.recipient_user_id,
          v_match_notification.id,
          'new_match',
          v_match_id
        );
      end loop;
    end if;

    return case when v_match_id is null then 'already_matched' else 'matched' end;
  end if;

  if v_inserted_like_id is not null then
    insert into public.notifications (recipient_user_id, type)
    values (target_user_id, 'new_like')
    returning id into v_notification_id;

    perform public.enqueue_push_event(
      target_user_id, v_notification_id, 'new_like', v_inserted_like_id
    );
  end if;

  return case when v_inserted_like_id is null then 'already_liked' else 'liked' end;
end
$function$;

create or replace function public.answer_admin_support_inquiry(
  p_inquiry_id uuid,
  p_expected_updated_at timestamptz,
  p_answer_body text
)
returns table (
  inquiry_id uuid,
  status text,
  answered_at timestamptz,
  answer_updated_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_answer_body text := nullif(pg_catalog.btrim(p_answer_body), '');
  v_previous_status text;
  v_current_updated_at timestamptz;
  v_answered_at timestamptz;
  v_recipient_user_id uuid;
  v_notification_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_result record;
begin
  if not coalesce(public.has_admin_permission('support_inquiries_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_inquiry_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Inquiry ID and expected update time are required';
  end if;
  if v_answer_body is null or pg_catalog.char_length(v_answer_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Answer must be between 1 and 5000 characters';
  end if;

  select inquiry.status, inquiry.updated_at, inquiry.answered_at, inquiry.user_id
  into v_previous_status, v_current_updated_at, v_answered_at, v_recipient_user_id
  from public.support_inquiries as inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Inquiry not found'; end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'SUPPORT_INQUIRY_STALE_VERSION';
  end if;
  if v_previous_status not in ('pending', 'answered') then
    raise exception using errcode = '22023', message = 'Closed inquiries cannot be answered';
  end if;

  update public.support_inquiries as inquiry
  set status = 'answered', answer_body = v_answer_body,
      answered_by_admin_user_id = v_admin_user_id,
      answered_at = coalesce(v_answered_at, v_changed_at),
      answer_updated_at = v_changed_at
  where inquiry.id = p_inquiry_id
  returning inquiry.id, inquiry.status, inquiry.answered_at,
    inquiry.answer_updated_at, inquiry.updated_at into v_result;

  insert into public.support_inquiry_admin_actions (
    inquiry_id, admin_user_id, action, previous_status, new_status, created_at
  ) values (
    p_inquiry_id, v_admin_user_id,
    case when v_previous_status = 'pending' then 'answer' else 'answer_update' end,
    v_previous_status, 'answered', v_result.updated_at
  );

  if v_previous_status = 'pending' then
    insert into public.notifications (recipient_user_id, type, inquiry_id)
    values (v_recipient_user_id, 'support_inquiry_answered', p_inquiry_id)
    on conflict on constraint notifications_recipient_type_inquiry_unique
    do nothing
    returning id into v_notification_id;

    if v_notification_id is not null then
      perform public.enqueue_push_event(
        v_recipient_user_id,
        v_notification_id,
        'support_inquiry_answered',
        p_inquiry_id
      );
    end if;
  end if;

  return query select v_result.id, v_result.status, v_result.answered_at,
    v_result.answer_updated_at, v_result.updated_at;
end
$function$;

comment on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) is 'Registers or refreshes one browser PushSubscription with four event preferences';
comment on function public.get_my_push_subscription_settings_v2(text)
  is 'Returns four event preferences for one PushSubscription owned by auth.uid()';
comment on function public.send_member_like(uuid)
  is 'Sends an idempotent like and atomically creates corresponding like or mutual-match notifications and Push events';
comment on function public.answer_admin_support_inquiry(uuid, timestamptz, text)
  is 'commatch_support_inquiries_v1';

alter function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) owner to postgres;
alter function public.get_my_push_subscription_settings_v2(text) owner to postgres;
alter function public.register_my_push_subscription(
  text, text, text, timestamptz, boolean, boolean
) owner to postgres;
alter function public.revoke_my_push_subscription(text) owner to postgres;
alter function public.enqueue_push_event(uuid, uuid, text, uuid) owner to postgres;
alter function public.expand_push_event_batch(integer) owner to postgres;
alter function public.claim_push_delivery_batch(integer, integer) owner to postgres;
alter function public.send_member_like(uuid) owner to postgres;
alter function public.answer_admin_support_inquiry(uuid, timestamptz, text) owner to postgres;

revoke all on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.get_my_push_subscription_settings_v2(text)
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_push_event(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.send_member_like(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.answer_admin_support_inquiry(uuid, timestamptz, text)
  from public, anon, authenticated, service_role;

grant execute on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.get_my_push_subscription_settings_v2(text)
  to authenticated;
grant execute on function public.enqueue_push_event(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.send_member_like(uuid)
  to authenticated, service_role;
grant execute on function public.answer_admin_support_inquiry(uuid, timestamptz, text)
  to authenticated;

do $contract_validation$
declare
  v_postgres_oid oid := (
    select role_info.oid from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'postgres'
  );
  v_function_oid oid;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_info
    where attribute_info.attrelid = 'public.push_subscriptions'::pg_catalog.regclass
      and attribute_info.attname = 'new_match_enabled'
      and attribute_info.attnotnull
      and not attribute_info.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_info
    where attribute_info.attrelid = 'public.push_subscriptions'::pg_catalog.regclass
      and attribute_info.attname = 'support_inquiry_answered_enabled'
      and attribute_info.attnotnull
      and not attribute_info.attisdropped
  ) then
    raise exception 'New Push preference columns are incompatible';
  end if;

  foreach v_function_oid in array array[
    'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'::pg_catalog.regprocedure::oid,
    'public.get_my_push_subscription_settings_v2(text)'::pg_catalog.regprocedure::oid,
    'public.enqueue_push_event(uuid,uuid,text,uuid)'::pg_catalog.regprocedure::oid,
    'public.expand_push_event_batch(integer)'::pg_catalog.regprocedure::oid,
    'public.claim_push_delivery_batch(integer,integer)'::pg_catalog.regprocedure::oid,
    'public.send_member_like(uuid)'::pg_catalog.regprocedure::oid,
    'public.answer_admin_support_inquiry(uuid,timestamptz,text)'::pg_catalog.regprocedure::oid
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc as function_info
      where function_info.oid = v_function_oid
        and function_info.proowner = v_postgres_oid
        and function_info.prosecdef
        and function_info.proconfig is not distinct from array['search_path=""']::text[]
    ) then
      raise exception 'An additional Push function has an incompatible security contract';
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.enqueue_push_event(uuid,uuid,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.enqueue_push_event(uuid,uuid,text,uuid)',
       'EXECUTE'
     ) then
    raise exception 'Push enqueue ACL is incompatible';
  end if;
end
$contract_validation$;

commit;

select 'PASS Web Push additional event migration' as migration_result;
