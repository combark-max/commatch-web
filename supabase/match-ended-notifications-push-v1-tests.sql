-- ComMatch match-ended notification and Push rollback integration tests.
--
-- Apply match-ended-notifications-push-v1.sql first. Replace the confirmation
-- placeholder in a Supabase SQL Editor tab. All fixture changes are rolled back.

begin isolation level repeatable read;

create temp table _commatch_match_ended_it_config (
  fixture_confirmation text,
  first_user_id uuid not null default pg_catalog.gen_random_uuid(),
  second_user_id uuid not null default pg_catalog.gen_random_uuid(),
  third_user_id uuid not null default pg_catalog.gen_random_uuid(),
  match_id uuid not null default pg_catalog.gen_random_uuid(),
  atomic_match_id uuid not null default pg_catalog.gen_random_uuid(),
  endpoint text not null default (
    'https://push.example.test/match-ended-' || pg_catalog.gen_random_uuid()::text
  ),
  second_endpoint text not null default (
    'https://push.example.test/match-ended-second-' || pg_catalog.gen_random_uuid()::text
  ),
  legacy_endpoint text not null default (
    'https://push.example.test/match-ended-legacy-' || pg_catalog.gen_random_uuid()::text
  ),
  expired_endpoint text not null default (
    'https://push.example.test/match-ended-expired-' || pg_catalog.gen_random_uuid()::text
  ),
  revoked_endpoint text not null default (
    'https://push.example.test/match-ended-revoked-' || pg_catalog.gen_random_uuid()::text
  )
) on commit drop;

insert into _commatch_match_ended_it_config (fixture_confirmation)
values (
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on pg_temp._commatch_match_ended_it_config
  to anon, authenticated, service_role;

create function pg_temp._commatch_match_ended_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text end,
    true
  );
end
$function$;

create function pg_temp._commatch_match_ended_expect_error(
  p_label text,
  p_state text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception when others then
    if sqlstate is distinct from p_state then
      raise exception 'FAIL %: expected SQLSTATE %, received %/%',
        p_label, p_state, sqlstate, sqlerrm;
    end if;
    raise notice 'PASS %', p_label;
  end;
end
$function$;

grant execute on function pg_temp._commatch_match_ended_set_user(uuid)
  to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_match_ended_expect_error(text, text, text)
  to anon, authenticated, service_role;

do $preflight$
declare
  v_config pg_temp._commatch_match_ended_it_config%rowtype;
  v_ids uuid[];
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  v_ids := array[v_config.first_user_id, v_config.second_user_id, v_config.third_user_id];

  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if not exists (select 1 from auth.users) then
    raise exception 'At least one existing Auth user is required to copy the Supabase instance ID';
  end if;
  if (select pg_catalog.count(distinct fixture_id)
      from pg_catalog.unnest(v_ids) as fixture(fixture_id)) <> 3
     or exists (select 1 from auth.users where id = any(v_ids)) then
    raise exception 'Generated fixture Auth UUIDs are not distinct and disposable';
  end if;
  if pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v3(text,text,text,timestamptz,boolean,boolean,boolean,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure('public.get_my_push_subscription_settings_v3(text)') is null then
    raise exception 'Apply match-ended-notifications-push-v1.sql before this test';
  end if;
  if pg_catalog.to_regprocedure(
       'public.register_my_push_subscription(text,text,text,timestamptz,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure('public.get_my_push_subscription_settings_v2(text)') is null then
    raise exception 'Existing Push v1/v2 backward-compatible contracts are missing';
  end if;
  raise notice 'PASS fixture and v1/v2/v3 contract preflight';
end
$preflight$;

do $security_contract$
declare
  v_end_match_oid oid := 'public.end_match(uuid)'::pg_catalog.regprocedure::oid;
  v_v3_oid oid := 'public.register_my_push_subscription_v3(text,text,text,timestamptz,boolean,boolean,boolean,boolean,boolean)'::pg_catalog.regprocedure::oid;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_end_match_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proparallel = 'u'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.strpos(function_info.prosrc, 'for update') > 0
      and pg_catalog.strpos(function_info.prosrc, 'commatch_member_service_write_guards_v1') > 0
      and pg_catalog.strpos(function_info.prosrc, 'commatch_match_ended_notifications_push_v1') > 0
  ) then
    raise exception 'FAIL end_match security, row-lock, or guard contract';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_v3_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'FAIL Push v3 security contract';
  end if;
  if pg_catalog.has_function_privilege(
       'authenticated', 'public.enqueue_push_event(uuid,uuid,text,uuid)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.enqueue_push_event(uuid,uuid,text,uuid)', 'EXECUTE'
     ) then
    raise exception 'FAIL enqueue ACL contract';
  end if;
  raise notice 'PASS end_match row lock, guards, SECURITY DEFINER, search_path, and Push ACL';
end
$security_contract$;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from (
  select first_user_id as user_id from pg_temp._commatch_match_ended_it_config
  union all
  select second_user_id from pg_temp._commatch_match_ended_it_config
  union all
  select third_user_id from pg_temp._commatch_match_ended_it_config
) as fixture
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user limit 1
) as source;

insert into public.profiles (id, nickname, profile_images)
select first_user_id, 'match_ended_first_' || pg_catalog.left(first_user_id::text, 8), array[]::text[]
from pg_temp._commatch_match_ended_it_config
union all
select second_user_id, 'match_ended_second_' || pg_catalog.left(second_user_id::text, 8), array[]::text[]
from pg_temp._commatch_match_ended_it_config
union all
select third_user_id, 'match_ended_third_' || pg_catalog.left(third_user_id::text, 8), array[]::text[]
from pg_temp._commatch_match_ended_it_config;

insert into public.matches (id, user_1_id, user_2_id, status, matched_at, created_at)
select match_id, least(first_user_id, second_user_id),
  greatest(first_user_id, second_user_id), 'active', pg_catalog.now(), pg_catalog.now()
from pg_temp._commatch_match_ended_it_config
union all
select atomic_match_id, least(first_user_id, third_user_id),
  greatest(first_user_id, third_user_id), 'active', pg_catalog.now(), pg_catalog.now()
from pg_temp._commatch_match_ended_it_config;

-- Authenticated members cannot bypass the writer RPCs.
set local role authenticated;
select pg_temp._commatch_match_ended_set_user(first_user_id)
from pg_temp._commatch_match_ended_it_config;
select pg_temp._commatch_match_ended_expect_error(
  'direct notification insert', '42501',
  $$insert into public.notifications(recipient_user_id,type,match_id)
    select second_user_id,'match_ended',match_id
    from pg_temp._commatch_match_ended_it_config$$
);
select pg_temp._commatch_match_ended_expect_error(
  'direct Push event insert', '42501',
  $$insert into public.push_events(recipient_user_id,notification_id,event_type,source_id)
    values (gen_random_uuid(),gen_random_uuid(),'match_ended',gen_random_uuid())$$
);
reset role;

-- V3 preserves all five explicit values for new, active, and revoked endpoints.
set local role authenticated;
select pg_temp._commatch_match_ended_set_user(second_user_id)
from pg_temp._commatch_match_ended_it_config;

select * from public.register_my_push_subscription_v3(
  (select endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('A', 88), pg_catalog.repeat('B', 24), null,
  true, false, true, false, false
);

do $v3_new_endpoint$
declare v_row record; v_endpoint text;
begin
  select endpoint into strict v_endpoint from pg_temp._commatch_match_ended_it_config;
  select * into strict v_row from public.get_my_push_subscription_settings_v3(v_endpoint);
  if not v_row.new_message_enabled or v_row.new_like_enabled
     or not v_row.new_match_enabled or v_row.support_inquiry_answered_enabled
     or v_row.match_ended_enabled or v_row.revoked_at is not null then
    raise exception 'FAIL v3 new endpoint explicit preferences';
  end if;
  raise notice 'PASS v3 new endpoint explicit preferences';
end
$v3_new_endpoint$;

select * from public.register_my_push_subscription_v3(
  (select endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('C', 88), pg_catalog.repeat('D', 24), null,
  false, true, false, true, true
);

do $v3_active_update$
declare v_row record; v_endpoint text;
begin
  select endpoint into strict v_endpoint from pg_temp._commatch_match_ended_it_config;
  select * into strict v_row from public.get_my_push_subscription_settings_v3(v_endpoint);
  if v_row.new_message_enabled or not v_row.new_like_enabled
     or v_row.new_match_enabled or not v_row.support_inquiry_answered_enabled
     or not v_row.match_ended_enabled then
    raise exception 'FAIL v3 active endpoint explicit preferences';
  end if;
  raise notice 'PASS v3 active endpoint explicit preferences';
end
$v3_active_update$;

select public.revoke_my_push_subscription(
  (select endpoint from pg_temp._commatch_match_ended_it_config)
);

do $revoke_all_false$
declare v_row record; v_endpoint text;
begin
  select endpoint into strict v_endpoint from pg_temp._commatch_match_ended_it_config;
  select * into strict v_row from public.get_my_push_subscription_settings_v3(v_endpoint);
  if v_row.revoked_at is null or v_row.new_message_enabled or v_row.new_like_enabled
     or v_row.new_match_enabled or v_row.support_inquiry_answered_enabled
     or v_row.match_ended_enabled then
    raise exception 'FAIL revoke did not disable all five preferences';
  end if;
  raise notice 'PASS revoke disables all five preferences';
end
$revoke_all_false$;

select * from public.register_my_push_subscription_v3(
  (select endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('E', 88), pg_catalog.repeat('F', 24), null,
  true, true, false, false, false
);

select * from public.register_my_push_subscription_v3(
  (select second_endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('G', 88), pg_catalog.repeat('H', 24), null,
  false, false, true, true, false
);

do $v3_revoked_and_second_endpoint$
declare v_primary record; v_second record; v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  select * into strict v_primary from public.get_my_push_subscription_settings_v3(v_config.endpoint);
  select * into strict v_second from public.get_my_push_subscription_settings_v3(v_config.second_endpoint);
  if not v_primary.new_message_enabled or not v_primary.new_like_enabled
     or v_primary.new_match_enabled or v_primary.support_inquiry_answered_enabled
     or v_primary.match_ended_enabled or v_primary.revoked_at is not null
     or v_second.new_message_enabled or v_second.new_like_enabled
     or not v_second.new_match_enabled or not v_second.support_inquiry_answered_enabled
     or v_second.match_ended_enabled or v_second.revoked_at is not null then
    raise exception 'FAIL v3 revoked re-registration or second endpoint explicit preferences';
  end if;
  raise notice 'PASS v3 revoked re-registration and second endpoint explicit preferences';
end
$v3_revoked_and_second_endpoint$;

-- Legacy clients retain their existing contracts and cannot opt in to the new type.
select * from public.register_my_push_subscription(
  (select legacy_endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('O', 88), pg_catalog.repeat('P', 24), null,
  true, false
);
reset role;

do $v1_backward_compatibility$
declare v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.second_user_id
      and endpoint = v_config.legacy_endpoint
      and new_message_enabled and not new_like_enabled
      and new_match_enabled and support_inquiry_answered_enabled
      and not match_ended_enabled and revoked_at is null
  ) then
    raise exception 'FAIL v1 backward-compatible registration or match-ended opt-out';
  end if;
  raise notice 'PASS v1 backward compatibility and match-ended opt-out';
end
$v1_backward_compatibility$;

set local role authenticated;
select * from public.register_my_push_subscription_v2(
  (select legacy_endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('Q', 88), pg_catalog.repeat('R', 24), null,
  false, true, false, true
);
reset role;

do $v2_backward_compatibility$
declare v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.second_user_id
      and endpoint = v_config.legacy_endpoint
      and not new_message_enabled and new_like_enabled
      and not new_match_enabled and support_inquiry_answered_enabled
      and not match_ended_enabled and revoked_at is null
  ) then
    raise exception 'FAIL v2 explicit preferences or match-ended opt-out';
  end if;
  raise notice 'PASS v2 explicit preferences and match-ended opt-out';
end
$v2_backward_compatibility$;

set local role authenticated;
select public.revoke_my_push_subscription(
  (select legacy_endpoint from pg_temp._commatch_match_ended_it_config)
);

reset role;

-- Add ineligible endpoints directly so expansion must exclude them.
insert into public.push_subscriptions (
  user_id, endpoint, p256dh, auth, expiration_time,
  new_message_enabled, new_like_enabled, new_match_enabled,
  support_inquiry_answered_enabled, match_ended_enabled,
  created_at, updated_at, last_seen_at, revoked_at
)
select second_user_id, expired_endpoint, pg_catalog.repeat('I', 88), pg_catalog.repeat('J', 24),
  pg_catalog.now() - interval '1 day', false, false, false, false, true,
  pg_catalog.now() - interval '2 days', pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '2 days', null
from pg_temp._commatch_match_ended_it_config
union all
select second_user_id, revoked_endpoint, pg_catalog.repeat('K', 88), pg_catalog.repeat('L', 24),
  null, false, false, false, false, true,
  pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
from pg_temp._commatch_match_ended_it_config;

-- The first active -> ended transition creates exactly one recipient event.
set local role authenticated;
select pg_temp._commatch_match_ended_set_user(first_user_id)
from pg_temp._commatch_match_ended_it_config;
select public.end_match(match_id) from pg_temp._commatch_match_ended_it_config;
select public.end_match(match_id) from pg_temp._commatch_match_ended_it_config;
reset role;

do $match_end_contract$
declare
  v_config pg_temp._commatch_match_ended_it_config%rowtype;
  v_notification_id uuid;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if not exists (
    select 1 from public.matches
    where id = v_config.match_id and status = 'ended'
      and ended_by = v_config.first_user_id and ended_at is not null
  ) then
    raise exception 'FAIL active match did not retain the approved ended lifecycle';
  end if;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'match_ended' and match_id = v_config.match_id
        and inquiry_id is null) <> 1
     or exists (
       select 1 from public.notifications
       where recipient_user_id = v_config.first_user_id
         and type = 'match_ended' and match_id = v_config.match_id
     ) then
    raise exception 'FAIL match-ended recipient, target, or sequential idempotency contract';
  end if;
  select id into strict v_notification_id
  from public.notifications
  where recipient_user_id = v_config.second_user_id
    and type = 'match_ended' and match_id = v_config.match_id;
  if (select pg_catalog.count(*) from public.push_events
      where recipient_user_id = v_config.second_user_id
        and notification_id = v_notification_id
        and event_type = 'match_ended' and source_id = v_config.match_id) <> 1
     or exists (
       select 1 from public.push_events
       where recipient_user_id = v_config.first_user_id
         and event_type = 'match_ended' and source_id = v_config.match_id
     ) then
    raise exception 'FAIL match-ended Push source, recipient, or idempotency contract';
  end if;
  raise notice 'PASS match end lifecycle, recipient-only notification/Push, and sequential idempotency';
end
$match_end_contract$;

-- OFF, expired, and revoked endpoints produce no delivery.
set local role service_role;
select public.expand_push_event_batch(1000);
reset role;

do $preference_off$
declare v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if exists (
    select 1
    from public.push_deliveries as delivery
    join public.push_events as event_row on event_row.id = delivery.push_event_id
    where event_row.event_type = 'match_ended' and event_row.source_id = v_config.match_id
  ) then
    raise exception 'FAIL OFF, expired, or revoked endpoint received a match-ended delivery';
  end if;
  raise notice 'PASS match-ended OFF, expired, and revoked delivery exclusion';
end
$preference_off$;

-- Explicitly enable only the primary endpoint, then re-expand the fixture event.
set local role authenticated;
select pg_temp._commatch_match_ended_set_user(second_user_id)
from pg_temp._commatch_match_ended_it_config;
select * from public.register_my_push_subscription_v3(
  (select endpoint from pg_temp._commatch_match_ended_it_config),
  pg_catalog.repeat('M', 88), pg_catalog.repeat('N', 24), null,
  true, true, false, false, true
);
reset role;

update public.push_events
set expanded_at = null
where event_type = 'match_ended'
  and source_id = (select match_id from pg_temp._commatch_match_ended_it_config);

set local role service_role;
select public.expand_push_event_batch(1000);
reset role;

do $preference_on$
declare
  v_config pg_temp._commatch_match_ended_it_config%rowtype;
  v_primary_subscription_id uuid;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  select id into strict v_primary_subscription_id
  from public.push_subscriptions where endpoint = v_config.endpoint;
  if (select pg_catalog.count(*)
      from public.push_deliveries as delivery
      join public.push_events as event_row on event_row.id = delivery.push_event_id
      where event_row.event_type = 'match_ended'
        and event_row.source_id = v_config.match_id
        and delivery.push_subscription_id = v_primary_subscription_id
        and delivery.status = 'pending') <> 1
     or exists (
       select 1
       from public.push_deliveries as delivery
       join public.push_events as event_row on event_row.id = delivery.push_event_id
       join public.push_subscriptions as subscription_row
         on subscription_row.id = delivery.push_subscription_id
       where event_row.event_type = 'match_ended'
         and event_row.source_id = v_config.match_id
         and subscription_row.endpoint <> v_config.endpoint
     ) then
    raise exception 'FAIL match-ended ON delivery eligibility';
  end if;
  raise notice 'PASS match-ended ON delivery eligibility';
end
$preference_on$;

-- Prioritize only the fixture delivery for the claim assertion.
update public.push_deliveries as delivery
set next_attempt_at = pg_catalog.now() - interval '1 hour'
from public.push_events as event_row
where event_row.id = delivery.push_event_id
  and event_row.event_type = 'match_ended'
  and event_row.source_id = (select match_id from pg_temp._commatch_match_ended_it_config);

set local role service_role;
create temp table _commatch_match_ended_claim as
select * from public.claim_push_delivery_batch(100, 120);
reset role;

do $claim_contract$
declare v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if (select pg_catalog.count(*) from pg_temp._commatch_match_ended_claim
      where event_type = 'match_ended') <> 1
     or not exists (
       select 1
       from pg_temp._commatch_match_ended_claim as claim
       join public.push_events as event_row on event_row.id = claim.push_event_id
       where claim.event_type = 'match_ended' and event_row.source_id = v_config.match_id
     ) then
    raise exception 'FAIL match-ended delivery claim eligibility';
  end if;
  raise notice 'PASS match-ended delivery claim eligibility';
end
$claim_contract$;

-- A forced notification failure must roll the match transition back.
create function pg_temp._commatch_match_ended_force_failure()
returns trigger
language plpgsql
as $function$
begin
  if new.type = 'match_ended'
     and new.match_id = (
       select atomic_match_id from pg_temp._commatch_match_ended_it_config
     ) then
    raise exception using errcode = 'P0001', message = 'forced match-ended notification failure';
  end if;
  return new;
end
$function$;

create trigger match_ended_test_force_failure
before insert on public.notifications
for each row execute function pg_temp._commatch_match_ended_force_failure();

set local role authenticated;
select pg_temp._commatch_match_ended_set_user(first_user_id)
from pg_temp._commatch_match_ended_it_config;
select pg_temp._commatch_match_ended_expect_error(
  'match-ended atomic notification failure', 'P0001',
  format(
    'select public.end_match(%L::uuid)',
    (select atomic_match_id from pg_temp._commatch_match_ended_it_config)
  )
);
reset role;

drop trigger match_ended_test_force_failure on public.notifications;

do $atomicity$
declare v_config pg_temp._commatch_match_ended_it_config%rowtype;
begin
  select * into strict v_config from pg_temp._commatch_match_ended_it_config;
  if not exists (
    select 1 from public.matches
    where id = v_config.atomic_match_id and status = 'active'
      and ended_at is null and ended_by is null
  )
     or exists (
       select 1 from public.notifications
       where type = 'match_ended' and match_id = v_config.atomic_match_id
     )
     or exists (
       select 1 from public.push_events
       where event_type = 'match_ended' and source_id = v_config.atomic_match_id
     ) then
    raise exception 'FAIL notification failure did not roll back match end and Push event';
  end if;
  raise notice 'PASS match end, notification, and Push enqueue atomicity';
end
$atomicity$;

-- Row lock plus both existing unique constraints are the concurrency contract;
-- the sequential retry above proves the same post-lock ended branch is idempotent.
do $concurrency_contract$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notifications'::pg_catalog.regclass
      and conname = 'notifications_recipient_type_match_unique'
      and contype = 'u'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.push_events'::pg_catalog.regclass
      and conname = 'push_events_source_unique'
      and contype = 'u'
  ) then
    raise exception 'FAIL match-ended concurrency unique contracts';
  end if;
  raise notice 'PASS row-lock and notification/Push unique concurrency contracts';
end
$concurrency_contract$;

select 'PASS match-ended notifications and Push; all fixture changes rolled back'
  as test_result;

rollback;
