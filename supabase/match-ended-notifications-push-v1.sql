-- ComMatch match-ended in-app notification and Web Push.
--
-- Apply after notification-events-v1.sql, push-additional-events-v1.sql,
-- push-v2-explicit-preferences-fix.sql, and member-service-write-guards.sql.
-- Existing v1/v2 Push registration contracts remain unchanged.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.notifications') is null
     or pg_catalog.to_regclass('public.push_subscriptions') is null
     or pg_catalog.to_regclass('public.push_events') is null
     or pg_catalog.to_regclass('public.push_deliveries') is null
     or pg_catalog.to_regprocedure('public.end_match(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.enqueue_push_event(uuid,uuid,text,uuid)') is null
     or pg_catalog.to_regprocedure('public.expand_push_event_batch(integer)') is null
     or pg_catalog.to_regprocedure('public.claim_push_delivery_batch(integer,integer)') is null
     or pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure('public.get_my_push_subscription_settings_v2(text)') is null then
    raise exception 'Required match, notification, or Push dependencies are missing';
  end if;

  if pg_catalog.pg_get_function_result('public.end_match(uuid)'::pg_catalog.regprocedure) <> 'text'
     or pg_catalog.pg_get_function_result(
       'public.enqueue_push_event(uuid,uuid,text,uuid)'::pg_catalog.regprocedure
     ) <> 'uuid' then
    raise exception 'An existing match or Push function has an incompatible return contract';
  end if;

  if pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v3(text,text,text,timestamptz,boolean,boolean,boolean,boolean,boolean)'
     ) is not null
     or pg_catalog.to_regprocedure('public.get_my_push_subscription_settings_v3(text)') is not null then
    raise exception 'The match-ended Push v3 contract already exists';
  end if;
end
$preflight$;

alter table public.notifications
  drop constraint notifications_type_check,
  drop constraint notifications_target_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'new_match', 'new_message', 'new_like',
      'support_inquiry_answered', 'match_ended'
    )
  ),
  add constraint notifications_target_check check (
    (type in ('new_match', 'new_message', 'match_ended')
      and match_id is not null and inquiry_id is null)
    or (type = 'new_like' and match_id is null and inquiry_id is null)
    or (type = 'support_inquiry_answered' and match_id is null and inquiry_id is not null)
  );

alter table public.push_events
  drop constraint push_events_type_check,
  add constraint push_events_type_check check (
    event_type in (
      'new_message', 'new_like', 'new_match',
      'support_inquiry_answered', 'match_ended'
    )
  );

-- Existing and future legacy-client rows remain opted out until an explicit v3
-- registration enables match-ended Push for this endpoint.
alter table public.push_subscriptions
  add column match_ended_enabled boolean not null default false;

create function public.register_my_push_subscription_v3(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz,
  p_new_message_enabled boolean,
  p_new_like_enabled boolean,
  p_new_match_enabled boolean,
  p_support_inquiry_answered_enabled boolean,
  p_match_ended_enabled boolean
)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  new_match_enabled boolean,
  support_inquiry_answered_enabled boolean,
  match_ended_enabled boolean,
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
     or p_new_match_enabled is null
     or p_support_inquiry_answered_enabled is null
     or p_match_ended_enabled is null
     or (p_expiration_time is not null and p_expiration_time <= v_now) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions as subscription_row (
    user_id, endpoint, p256dh, auth, expiration_time,
    new_message_enabled, new_like_enabled, new_match_enabled,
    support_inquiry_answered_enabled, match_ended_enabled,
    created_at, updated_at, last_seen_at, revoked_at
  ) values (
    v_user_id, v_endpoint, p_p256dh, p_auth, p_expiration_time,
    p_new_message_enabled, p_new_like_enabled, p_new_match_enabled,
    p_support_inquiry_answered_enabled, p_match_ended_enabled,
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
      match_ended_enabled = excluded.match_ended_enabled,
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
    v_result.match_ended_enabled, v_result.created_at, v_result.updated_at,
    v_result.last_seen_at, v_result.revoked_at;
end
$function$;

create function public.get_my_push_subscription_settings_v3(p_endpoint text)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  new_match_enabled boolean,
  support_inquiry_answered_enabled boolean,
  match_ended_enabled boolean,
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
    subscription_row.match_ended_enabled, subscription_row.created_at,
    subscription_row.updated_at, subscription_row.last_seen_at,
    subscription_row.revoked_at
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
      support_inquiry_answered_enabled = false,
      match_ended_enabled = false
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
       'new_message', 'new_like', 'new_match',
       'support_inquiry_answered', 'match_ended'
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
      or (event_row.event_type = 'match_ended' and subscription_row.match_ended_enabled)
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
            or (event_row.event_type = 'match_ended' and subscription_row.match_ended_enabled)
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
        or (event_row.event_type = 'match_ended' and subscription_row.match_ended_enabled)
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

create or replace function public.end_match(p_match_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_match public.matches%rowtype;
  v_recipient_user_id uuid;
  v_notification_id uuid;
  v_ended_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  -- commatch_match_ended_notifications_push_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;

  if v_user_id <> v_match.user_1_id and v_user_id <> v_match.user_2_id then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  if v_match.status = 'ended' then
    return 'ended';
  end if;

  v_recipient_user_id := case
    when v_user_id = v_match.user_1_id then v_match.user_2_id
    else v_match.user_1_id
  end;

  update public.matches as match_row
  set status = 'ended',
      ended_at = v_ended_at,
      ended_by = v_user_id,
      updated_at = v_ended_at
  where match_row.id = p_match_id;

  insert into public.notifications (
    recipient_user_id, type, match_id, inquiry_id, read_at, created_at
  ) values (
    v_recipient_user_id, 'match_ended', p_match_id, null, null, v_ended_at
  )
  returning id into v_notification_id;

  perform public.enqueue_push_event(
    v_recipient_user_id,
    v_notification_id,
    'match_ended',
    p_match_id
  );

  return 'ended';
end
$function$;

comment on function public.register_my_push_subscription_v3(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean
) is 'Registers or refreshes one browser PushSubscription with five explicit event preferences';
comment on function public.get_my_push_subscription_settings_v3(text)
  is 'Returns five event preferences for one PushSubscription owned by auth.uid()';
comment on function public.end_match(uuid) is 'commatch_matching_chat_v1';

alter function public.register_my_push_subscription_v3(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean
) owner to postgres;
alter function public.get_my_push_subscription_settings_v3(text) owner to postgres;
alter function public.revoke_my_push_subscription(text) owner to postgres;
alter function public.enqueue_push_event(uuid, uuid, text, uuid) owner to postgres;
alter function public.expand_push_event_batch(integer) owner to postgres;
alter function public.claim_push_delivery_batch(integer, integer) owner to postgres;
alter function public.end_match(uuid) owner to postgres;

revoke all on function public.register_my_push_subscription_v3(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.get_my_push_subscription_settings_v3(text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_my_push_subscription(text)
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_push_event(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.expand_push_event_batch(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_push_delivery_batch(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.end_match(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.register_my_push_subscription_v3(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean, boolean
) to authenticated;
grant execute on function public.get_my_push_subscription_settings_v3(text)
  to authenticated;
grant execute on function public.revoke_my_push_subscription(text) to authenticated;
grant execute on function public.enqueue_push_event(uuid, uuid, text, uuid) to service_role;
grant execute on function public.expand_push_event_batch(integer) to service_role;
grant execute on function public.claim_push_delivery_batch(integer, integer) to service_role;
grant execute on function public.end_match(uuid) to authenticated, service_role;

do $contract_validation$
declare
  v_end_match_oid oid := 'public.end_match(uuid)'::pg_catalog.regprocedure::oid;
  v_v3_oid oid := 'public.register_my_push_subscription_v3(text,text,text,timestamptz,boolean,boolean,boolean,boolean,boolean)'::pg_catalog.regprocedure::oid;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_info
    where attribute_info.attrelid = 'public.push_subscriptions'::pg_catalog.regclass
      and attribute_info.attname = 'match_ended_enabled'
      and attribute_info.atttypid = 'pg_catalog.bool'::pg_catalog.regtype
      and attribute_info.attnotnull
      and not attribute_info.attisdropped
      and pg_catalog.pg_get_expr(
        (
          select default_info.adbin
          from pg_catalog.pg_attrdef as default_info
          where default_info.adrelid = attribute_info.attrelid
            and default_info.adnum = attribute_info.attnum
        ),
        attribute_info.attrelid
      ) = 'false'
  ) or exists (
    select 1 from public.push_subscriptions where match_ended_enabled is null
  ) then
    raise exception 'The match-ended preference column is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_v3_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'The Push v3 registration security contract is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_end_match_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proparallel = 'u'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.strpos(
        function_info.prosrc,
        'commatch_member_service_write_guards_v1'
      ) > 0
      and pg_catalog.strpos(
        function_info.prosrc,
        'commatch_match_ended_notifications_push_v1'
      ) > 0
  ) then
    raise exception 'The match-ended end_match contract is incompatible';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.enqueue_push_event(uuid,uuid,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.enqueue_push_event(uuid,uuid,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.register_my_push_subscription_v3(text,text,text,timestamptz,boolean,boolean,boolean,boolean,boolean)',
       'EXECUTE'
     ) then
    raise exception 'The match-ended function ACL contract is incompatible';
  end if;
end
$contract_validation$;

commit;

select 'PASS match-ended notification and Push migration' as migration_result;
