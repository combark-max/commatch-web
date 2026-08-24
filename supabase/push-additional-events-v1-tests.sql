-- ComMatch additional Web Push event rollback-safe integration tests.
--
-- Run in the Supabase SQL Editor after applying push-additional-events-v1.sql.
-- Replace the four placeholders with three disposable active/visible members
-- and one active administrator with support_inquiries_manage permission.
-- Every fixture write and test-only trigger is rolled back.

begin;

create temp table _commatch_push_additional_events_config (
  member_a uuid,
  member_b uuid,
  member_c uuid,
  admin_user uuid,
  match_id uuid,
  message_id uuid,
  inquiry_a uuid,
  inquiry_b uuid,
  inquiry_c uuid,
  rollback_inquiry uuid,
  inquiry_a_initial_updated_at timestamptz,
  inquiry_b_initial_updated_at timestamptz,
  inquiry_c_initial_updated_at timestamptz,
  rollback_inquiry_updated_at timestamptz,
  endpoint_a text,
  endpoint_b text,
  endpoint_c text
) on commit drop;

insert into _commatch_push_additional_events_config (
  member_a, member_b, member_c, admin_user,
  endpoint_a, endpoint_b, endpoint_c
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_THIRD_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'THIRD_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SUPPORT_ADMIN_USER_ID', 'PASTE_' || 'SUPPORT_ADMIN_USER_ID')::uuid,
  'https://push.test/additional-a-' || extensions.gen_random_uuid()::text,
  'https://push.test/additional-b-' || extensions.gen_random_uuid()::text,
  'https://push.test/additional-c-' || extensions.gen_random_uuid()::text
);

grant select, update on _commatch_push_additional_events_config to authenticated;
grant select on _commatch_push_additional_events_config to service_role;

create function pg_temp._commatch_push_additional_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object(
        'sub', p_user_id::text,
        'role', 'authenticated'
      )::text
    end,
    true
  );
end
$function$;

create function pg_temp._commatch_push_additional_expect_error(
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

grant execute on function pg_temp._commatch_push_additional_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_push_additional_expect_error(text, text, text)
  to authenticated;

do $preflight$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;

  if v_config.member_a is null or v_config.member_b is null
     or v_config.member_c is null or v_config.admin_user is null then
    raise exception 'Replace all four PASTE_* fixture IDs';
  end if;
  if pg_catalog.cardinality(array[
       v_config.member_a, v_config.member_b, v_config.member_c, v_config.admin_user
     ]) <> (
       select pg_catalog.count(distinct fixture_id)
       from pg_catalog.unnest(array[
         v_config.member_a, v_config.member_b, v_config.member_c, v_config.admin_user
       ]) as fixture_ids(fixture_id)
     ) then
    raise exception 'All fixture IDs must be distinct';
  end if;
  if (select pg_catalog.count(*) from auth.users
      where id in (
        v_config.member_a, v_config.member_b,
        v_config.member_c, v_config.admin_user
      )) <> 4 then
    raise exception 'All fixture IDs must identify Auth users';
  end if;
  if (select pg_catalog.count(*) from public.profiles
      where id in (v_config.member_a, v_config.member_b, v_config.member_c)) <> 3 then
    raise exception 'All disposable members must have profiles';
  end if;
  if not public.is_member_profile_visible(v_config.member_a)
     or not public.is_member_profile_visible(v_config.member_b)
     or not public.is_member_profile_visible(v_config.member_c) then
    raise exception 'All disposable member profiles must be visible';
  end if;
  if exists (
    select 1 from public.likes as like_row
    where like_row.user_id in (v_config.member_a, v_config.member_b, v_config.member_c)
      and like_row.liked_user_id in (v_config.member_a, v_config.member_b, v_config.member_c)
  ) or exists (
    select 1 from public.matches as match_row
    where match_row.user_1_id in (v_config.member_a, v_config.member_b, v_config.member_c)
      and match_row.user_2_id in (v_config.member_a, v_config.member_b, v_config.member_c)
  ) then
    raise exception 'Disposable members must not already have a like or match relation';
  end if;

  if pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.get_my_push_subscription_settings_v2(text)'
     ) is null then
    raise exception 'Apply the additional Push event migration first';
  end if;
end
$preflight$;

set local role authenticated;
select pg_temp._commatch_push_additional_set_user(admin_user)
from _commatch_push_additional_events_config;

do $admin_preflight$
begin
  if not coalesce(public.has_admin_permission('support_inquiries_manage'), false) then
    raise exception 'The administrator fixture needs support_inquiries_manage';
  end if;
end
$admin_preflight$;
reset role;

-- A subscription created after the migration defaults both new preferences ON.
insert into public.push_subscriptions (
  user_id, endpoint, p256dh, auth, expiration_time,
  new_message_enabled, new_like_enabled
)
select member_a, endpoint_a, pg_catalog.repeat('A', 88),
  pg_catalog.repeat('B', 22), null, true, true
from _commatch_push_additional_events_config;

-- Explicit false represents an existing migrated subscription and must remain OFF.
insert into public.push_subscriptions (
  user_id, endpoint, p256dh, auth, expiration_time,
  new_message_enabled, new_like_enabled,
  new_match_enabled, support_inquiry_answered_enabled
)
select member_b, endpoint_b, pg_catalog.repeat('C', 88),
  pg_catalog.repeat('D', 22), null, true, true, false, false
from _commatch_push_additional_events_config;

do $preference_default_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.push_subscriptions
    where endpoint = v_config.endpoint_a
      and new_match_enabled
      and support_inquiry_answered_enabled
  ) or not exists (
    select 1 from public.push_subscriptions
    where endpoint = v_config.endpoint_b
      and not new_match_enabled
      and not support_inquiry_answered_enabled
  ) then
    raise exception 'FAIL new or existing subscription preference defaults';
  end if;
end
$preference_default_assertions$;

-- The old six-argument RPC remains callable and preserves active new settings.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_b)
from _commatch_push_additional_events_config;

do $v1_compatibility$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  perform public.register_my_push_subscription(
    v_config.endpoint_b, pg_catalog.repeat('C', 88),
    pg_catalog.repeat('D', 22), null, true, true
  );
end
$v1_compatibility$;
reset role;

do $v1_compatibility_assertion$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.push_subscriptions
    where endpoint = v_config.endpoint_b
      and not new_match_enabled
      and not support_inquiry_answered_enabled
  ) then
    raise exception 'FAIL v1 registration expanded an existing user preference';
  end if;
end
$v1_compatibility_assertion$;

-- The v2 RPC can atomically update and read all four preferences.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_b)
from _commatch_push_additional_events_config;

do $v2_preference_contract$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_settings record;
begin
  select * into v_config from _commatch_push_additional_events_config;
  perform public.register_my_push_subscription_v2(
    v_config.endpoint_b, pg_catalog.repeat('C', 88),
    pg_catalog.repeat('D', 22), null, true, true, true, true
  );
  select * into v_settings
  from public.get_my_push_subscription_settings_v2(v_config.endpoint_b);
  if not v_settings.new_match_enabled
     or not v_settings.support_inquiry_answered_enabled then
    raise exception 'FAIL v2 RPC did not enable both new preferences';
  end if;

  perform public.register_my_push_subscription_v2(
    v_config.endpoint_b, pg_catalog.repeat('C', 88),
    pg_catalog.repeat('D', 22), null, true, true, false, false
  );
end
$v2_preference_contract$;
reset role;

do $v2_preference_contract_assertion$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.push_subscriptions
    where endpoint = v_config.endpoint_b
      and not new_match_enabled
      and not support_inquiry_answered_enabled
  ) then
    raise exception 'FAIL v2 RPC did not persist disabled new preferences';
  end if;
end
$v2_preference_contract_assertion$;

-- A new subscription created through the old RPC receives the new defaults,
-- and revocation disables all four preferences.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_c)
from _commatch_push_additional_events_config;

do $v1_new_and_revoke$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  perform public.register_my_push_subscription(
    v_config.endpoint_c, pg_catalog.repeat('E', 88),
    pg_catalog.repeat('F', 22), null, true, true
  );
  if not public.revoke_my_push_subscription(v_config.endpoint_c) then
    raise exception 'FAIL subscription revoke returned false';
  end if;
end
$v1_new_and_revoke$;
reset role;

do $revoked_preference_assertion$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.push_subscriptions
    where endpoint = v_config.endpoint_c
      and revoked_at is not null
      and not new_message_enabled and not new_like_enabled
      and not new_match_enabled and not support_inquiry_answered_enabled
  ) then
    raise exception 'FAIL revoke did not disable all Push preferences';
  end if;
end
$revoked_preference_assertion$;

-- One-way like retains the existing new_like event and creates no new_match event.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_a)
from _commatch_push_additional_events_config;

do $one_way_like$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_push_additional_events_config;
  select public.send_member_like(v_config.member_b) into v_result;
  if v_result <> 'liked' then raise exception 'FAIL one-way like returned %', v_result; end if;
end
$one_way_like$;
reset role;

do $one_way_like_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if (select pg_catalog.count(*)
      from public.push_events as event_row
      join public.likes as like_row on like_row.id = event_row.source_id
      where like_row.user_id = v_config.member_a
        and like_row.liked_user_id = v_config.member_b
        and event_row.recipient_user_id = v_config.member_b
        and event_row.event_type = 'new_like') <> 1
     or exists (
       select 1 from public.push_events
       where event_type = 'new_match'
         and recipient_user_id in (v_config.member_a, v_config.member_b)
     ) then
    raise exception 'FAIL one-way like Push contract';
  end if;
end
$one_way_like_assertions$;

-- Reciprocal like creates one match, two notifications, and two mapped events.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_b)
from _commatch_push_additional_events_config;

do $reciprocal_like$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_result text;
  v_repeat_result text;
begin
  select * into v_config from _commatch_push_additional_events_config;
  select public.send_member_like(v_config.member_a) into v_result;
  if v_result <> 'matched' then raise exception 'FAIL reciprocal like returned %', v_result; end if;

  select match_row.id into v_config.match_id
  from public.matches as match_row
  where match_row.user_1_id = least(v_config.member_a, v_config.member_b)
    and match_row.user_2_id = greatest(v_config.member_a, v_config.member_b);
  update _commatch_push_additional_events_config set match_id = v_config.match_id;

  select public.send_member_like(v_config.member_a) into v_repeat_result;
  if v_repeat_result <> 'already_matched' then
    raise exception 'FAIL repeated reciprocal like returned %', v_repeat_result;
  end if;
end
$reciprocal_like$;
reset role;

do $new_match_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if v_config.match_id is null
     or (select pg_catalog.count(*) from public.matches where id = v_config.match_id) <> 1
     or (select pg_catalog.count(*) from public.notifications
         where type = 'new_match' and match_id = v_config.match_id) <> 2
     or (select pg_catalog.count(*) from public.push_events
         where event_type = 'new_match' and source_id = v_config.match_id) <> 2
     or (select pg_catalog.count(distinct recipient_user_id) from public.push_events
         where event_type = 'new_match' and source_id = v_config.match_id) <> 2
     or exists (
       select 1
       from public.push_events as event_row
       left join public.notifications as notification_row
         on notification_row.id = event_row.notification_id
        and notification_row.recipient_user_id = event_row.recipient_user_id
        and notification_row.type = event_row.event_type
        and notification_row.match_id = event_row.source_id
       where event_row.event_type = 'new_match'
         and event_row.source_id = v_config.match_id
         and notification_row.id is null
     ) then
    raise exception 'FAIL new_match notification or Push event mapping';
  end if;
end
$new_match_assertions$;

-- Existing new_message flow remains intact on the new match.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_a)
from _commatch_push_additional_events_config;

update _commatch_push_additional_events_config as config
set message_id = public.send_match_message(
  config.match_id,
  'Additional Push regression'
);
reset role;

do $message_regression_assertion$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.push_events
    where event_type = 'new_message'
      and source_id = v_config.message_id
      and recipient_user_id = v_config.member_b
  ) then
    raise exception 'FAIL existing new_message Push regression';
  end if;
end
$message_regression_assertion$;

-- Force new_match enqueue failure; the reciprocal like, match, notifications,
-- and events created by that call must all roll back.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_c)
from _commatch_push_additional_events_config;
select public.send_member_like(member_a)
from _commatch_push_additional_events_config;
reset role;

create function pg_temp._commatch_force_new_match_enqueue_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.event_type = 'new_match' then
    raise exception 'forced new_match enqueue failure';
  end if;
  return new;
end
$function$;

create trigger push_additional_test_force_match_failure
  before insert on public.push_events
  for each row execute function pg_temp._commatch_force_new_match_enqueue_failure();

set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_a)
from _commatch_push_additional_events_config;

do $new_match_atomicity$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_push_additional_events_config;
  begin
    perform public.send_member_like(v_config.member_c);
  exception when others then
    if sqlerrm <> 'forced new_match enqueue failure' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL forced new_match failure did not occur'; end if;
end
$new_match_atomicity$;
reset role;

drop trigger push_additional_test_force_match_failure on public.push_events;

do $new_match_atomicity_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if exists (
    select 1 from public.likes
    where user_id = v_config.member_a and liked_user_id = v_config.member_c
  ) or exists (
    select 1 from public.matches
    where user_1_id = least(v_config.member_a, v_config.member_c)
      and user_2_id = greatest(v_config.member_a, v_config.member_c)
  ) or exists (
    select 1 from public.notifications
    where type = 'new_match'
      and recipient_user_id in (v_config.member_a, v_config.member_c)
      and match_id <> v_config.match_id
  ) then
    raise exception 'FAIL new_match enqueue failure retained business changes';
  end if;
end
$new_match_atomicity_assertions$;

-- Create three inquiries for ON, OFF, and revoked subscription eligibility.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_a)
from _commatch_push_additional_events_config;
update _commatch_push_additional_events_config
set inquiry_a = public.create_my_support_inquiry(
      'service', 'Additional Push A', 'Initial answer should enqueue'
    );

select pg_temp._commatch_push_additional_set_user(member_b)
from _commatch_push_additional_events_config;
update _commatch_push_additional_events_config
set inquiry_b = public.create_my_support_inquiry(
      'service', 'Additional Push B', 'Preference is disabled'
    );

select pg_temp._commatch_push_additional_set_user(member_c)
from _commatch_push_additional_events_config;
update _commatch_push_additional_events_config
set inquiry_c = public.create_my_support_inquiry(
      'service', 'Additional Push C', 'Subscription is revoked'
    );
reset role;

update _commatch_push_additional_events_config as config
set inquiry_a_initial_updated_at = inquiry.updated_at
from public.support_inquiries as inquiry where inquiry.id = config.inquiry_a;
update _commatch_push_additional_events_config as config
set inquiry_b_initial_updated_at = inquiry.updated_at
from public.support_inquiries as inquiry where inquiry.id = config.inquiry_b;
update _commatch_push_additional_events_config as config
set inquiry_c_initial_updated_at = inquiry.updated_at
from public.support_inquiries as inquiry where inquiry.id = config.inquiry_c;

set local role authenticated;
select pg_temp._commatch_push_additional_set_user(admin_user)
from _commatch_push_additional_events_config;

do $initial_answers$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  perform public.answer_admin_support_inquiry(
    v_config.inquiry_a, v_config.inquiry_a_initial_updated_at, 'Answer A'
  );
  perform public.answer_admin_support_inquiry(
    v_config.inquiry_b, v_config.inquiry_b_initial_updated_at, 'Answer B'
  );
  perform public.answer_admin_support_inquiry(
    v_config.inquiry_c, v_config.inquiry_c_initial_updated_at, 'Answer C'
  );
end
$initial_answers$;
reset role;

do $support_event_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if exists (
    select 1
    from (values
      (v_config.inquiry_a, v_config.member_a),
      (v_config.inquiry_b, v_config.member_b),
      (v_config.inquiry_c, v_config.member_c)
    ) as expected(inquiry_id, recipient_id)
    where (select pg_catalog.count(*) from public.notifications
           where type = 'support_inquiry_answered'
             and inquiry_id = expected.inquiry_id
             and recipient_user_id = expected.recipient_id) <> 1
       or (select pg_catalog.count(*) from public.push_events
           where event_type = 'support_inquiry_answered'
             and source_id = expected.inquiry_id
             and recipient_user_id = expected.recipient_id) <> 1
  ) or exists (
    select 1
    from public.push_events as event_row
    left join public.notifications as notification_row
      on notification_row.id = event_row.notification_id
     and notification_row.recipient_user_id = event_row.recipient_user_id
     and notification_row.type = event_row.event_type
     and notification_row.inquiry_id = event_row.source_id
    where event_row.event_type = 'support_inquiry_answered'
      and event_row.source_id in (
        v_config.inquiry_a, v_config.inquiry_b, v_config.inquiry_c
      )
      and notification_row.id is null
  ) then
    raise exception 'FAIL support answer notification or Push event mapping';
  end if;
end
$support_event_assertions$;

-- Answer correction adds only answer_update metadata; close and stale calls add no Push.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(admin_user)
from _commatch_push_additional_events_config;

do $support_lifecycle$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_push_additional_events_config;
  select inquiry.updated_at into v_updated_at
  from public.get_admin_support_inquiry(v_config.inquiry_a) as inquiry;

  select result.updated_at into v_updated_at
  from public.answer_admin_support_inquiry(
    v_config.inquiry_a, v_updated_at, 'Corrected answer A'
  ) as result;
  perform public.close_admin_support_inquiry(v_config.inquiry_a, v_updated_at);

  perform pg_temp._commatch_push_additional_expect_error(
    'stale repeated support answer',
    'P0001',
    pg_catalog.format(
      'select * from public.answer_admin_support_inquiry(%L::uuid,%L::timestamptz,%L)',
      v_config.inquiry_b, v_config.inquiry_b_initial_updated_at, 'Stale answer'
    )
  );
end
$support_lifecycle$;
reset role;

do $support_lifecycle_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if (select pg_catalog.count(*) from public.push_events
      where event_type = 'support_inquiry_answered'
        and source_id = v_config.inquiry_a) <> 1
     or (select pg_catalog.count(*) from public.notifications
         where type = 'support_inquiry_answered'
           and inquiry_id = v_config.inquiry_a) <> 1
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
         where inquiry_id = v_config.inquiry_a and action = 'answer_update') <> 1
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
         where inquiry_id = v_config.inquiry_a and action = 'close') <> 1 then
    raise exception 'FAIL answer update, close, or stale lifecycle created duplicate Push';
  end if;
end
$support_lifecycle_assertions$;

-- Force initial-answer enqueue failure and prove all support changes roll back.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_b)
from _commatch_push_additional_events_config;
update _commatch_push_additional_events_config
set rollback_inquiry = public.create_my_support_inquiry(
      'service', 'Additional Push rollback', 'Answer must roll back'
    );
reset role;

update _commatch_push_additional_events_config as config
set rollback_inquiry_updated_at = inquiry.updated_at
from public.support_inquiries as inquiry where inquiry.id = config.rollback_inquiry;

create function pg_temp._commatch_force_support_enqueue_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.event_type = 'support_inquiry_answered' then
    raise exception 'forced support enqueue failure';
  end if;
  return new;
end
$function$;

create trigger push_additional_test_force_support_failure
  before insert on public.push_events
  for each row execute function pg_temp._commatch_force_support_enqueue_failure();

set local role authenticated;
select pg_temp._commatch_push_additional_set_user(admin_user)
from _commatch_push_additional_events_config;

do $support_atomicity$
declare
  v_config _commatch_push_additional_events_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_push_additional_events_config;
  begin
    perform public.answer_admin_support_inquiry(
      v_config.rollback_inquiry,
      v_config.rollback_inquiry_updated_at,
      'This answer must roll back'
    );
  exception when others then
    if sqlerrm <> 'forced support enqueue failure' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL forced support failure did not occur'; end if;
end
$support_atomicity$;
reset role;

drop trigger push_additional_test_force_support_failure on public.push_events;

do $support_atomicity_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if not exists (
    select 1 from public.support_inquiries
    where id = v_config.rollback_inquiry
      and status = 'pending' and answer_body is null
      and answered_at is null and answer_updated_at is null
  ) or exists (
    select 1 from public.support_inquiry_admin_actions
    where inquiry_id = v_config.rollback_inquiry
  ) or exists (
    select 1 from public.notifications
    where inquiry_id = v_config.rollback_inquiry
  ) or exists (
    select 1 from public.push_events
    where source_id = v_config.rollback_inquiry
  ) then
    raise exception 'FAIL support enqueue failure retained inquiry changes';
  end if;
end
$support_atomicity_assertions$;

-- Expansion honors ON, OFF, and revoked subscription state for new events.
set local role service_role;
select public.expand_push_event_batch(1000);
reset role;

do $preference_delivery_assertions$
declare
  v_config _commatch_push_additional_events_config%rowtype;
begin
  select * into v_config from _commatch_push_additional_events_config;
  if (select pg_catalog.count(*)
      from public.push_deliveries as delivery_row
      join public.push_events as event_row on event_row.id = delivery_row.push_event_id
      join public.push_subscriptions as subscription_row
        on subscription_row.id = delivery_row.push_subscription_id
      where event_row.event_type = 'new_match'
        and event_row.source_id = v_config.match_id
        and subscription_row.endpoint = v_config.endpoint_a) <> 1
     or exists (
       select 1
       from public.push_deliveries as delivery_row
       join public.push_events as event_row on event_row.id = delivery_row.push_event_id
       join public.push_subscriptions as subscription_row
         on subscription_row.id = delivery_row.push_subscription_id
       where event_row.event_type = 'new_match'
         and event_row.source_id = v_config.match_id
         and subscription_row.endpoint = v_config.endpoint_b
     )
     or (select pg_catalog.count(*)
         from public.push_deliveries as delivery_row
         join public.push_events as event_row on event_row.id = delivery_row.push_event_id
         join public.push_subscriptions as subscription_row
           on subscription_row.id = delivery_row.push_subscription_id
         where event_row.event_type = 'support_inquiry_answered'
           and event_row.source_id = v_config.inquiry_a
           and subscription_row.endpoint = v_config.endpoint_a) <> 1
     or exists (
       select 1
       from public.push_deliveries as delivery_row
       join public.push_events as event_row on event_row.id = delivery_row.push_event_id
       where event_row.event_type = 'support_inquiry_answered'
         and event_row.source_id in (v_config.inquiry_b, v_config.inquiry_c)
     )
     or (select pg_catalog.count(*)
         from public.push_deliveries as delivery_row
         join public.push_events as event_row on event_row.id = delivery_row.push_event_id
         join public.push_subscriptions as subscription_row
           on subscription_row.id = delivery_row.push_subscription_id
         where event_row.event_type = 'new_like'
           and event_row.recipient_user_id = v_config.member_b
           and subscription_row.endpoint = v_config.endpoint_b) <> 1
     or (select pg_catalog.count(*)
         from public.push_deliveries as delivery_row
         join public.push_events as event_row on event_row.id = delivery_row.push_event_id
         join public.push_subscriptions as subscription_row
           on subscription_row.id = delivery_row.push_subscription_id
         where event_row.event_type = 'new_message'
           and event_row.recipient_user_id = v_config.member_b
           and subscription_row.endpoint = v_config.endpoint_b) <> 1
  then
    raise exception 'FAIL new-event preference or inactive subscription expansion';
  end if;
end
$preference_delivery_assertions$;

-- Claim accepts all four event types. Completion and retry retain the existing
-- fencing-token contract for the two newly added types.
create temp table _commatch_push_additional_claims (
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
) on commit drop;

grant select, insert on _commatch_push_additional_claims to service_role;

update public.push_deliveries as delivery_row
set next_attempt_at = pg_catalog.now() - interval '100 years'
from public.push_events as event_row,
  _commatch_push_additional_events_config as config
where event_row.id = delivery_row.push_event_id
  and event_row.source_id in (
    config.match_id,
    config.inquiry_a
  );

set local role service_role;
insert into _commatch_push_additional_claims
select * from public.claim_push_delivery_batch(100, 120);

do $claim_completion_retry$
declare
  v_match_claim _commatch_push_additional_claims%rowtype;
  v_support_claim _commatch_push_additional_claims%rowtype;
  v_completed boolean;
  v_failed_status text;
begin
  select claim_row.* into v_match_claim
  from _commatch_push_additional_claims as claim_row
  cross join _commatch_push_additional_events_config as config
  where claim_row.event_type = 'new_match'
    and claim_row.endpoint = config.endpoint_a
  limit 1;
  select claim_row.* into v_support_claim
  from _commatch_push_additional_claims as claim_row
  cross join _commatch_push_additional_events_config as config
  where claim_row.event_type = 'support_inquiry_answered'
    and claim_row.endpoint = config.endpoint_a
  limit 1;

  if v_match_claim.delivery_id is null or v_support_claim.delivery_id is null then
    raise exception 'FAIL claim did not return both additional event types';
  end if;

  select public.complete_push_delivery(
    v_match_claim.delivery_id,
    v_match_claim.delivery_claim_token,
    201
  ) into v_completed;
  if not v_completed then raise exception 'FAIL new_match completion was stale'; end if;

  select public.fail_push_delivery(
    v_support_claim.delivery_id,
    v_support_claim.delivery_claim_token,
    500,
    'push_service_error',
    null
  ) into v_failed_status;
  if v_failed_status <> 'pending' then
    raise exception 'FAIL support retry returned %', v_failed_status;
  end if;
end
$claim_completion_retry$;
reset role;

do $completion_retry_assertions$
declare
  v_match_delivery uuid;
  v_support_delivery uuid;
begin
  select claim_row.delivery_id into v_match_delivery
  from _commatch_push_additional_claims as claim_row
  cross join _commatch_push_additional_events_config as config
  where claim_row.event_type = 'new_match'
    and claim_row.endpoint = config.endpoint_a
  limit 1;
  select claim_row.delivery_id into v_support_delivery
  from _commatch_push_additional_claims as claim_row
  cross join _commatch_push_additional_events_config as config
  where claim_row.event_type = 'support_inquiry_answered'
    and claim_row.endpoint = config.endpoint_a
  limit 1;

  if not exists (
    select 1 from public.push_deliveries
    where id = v_match_delivery
      and status = 'sent' and http_status = 201 and sent_at is not null
  ) or not exists (
    select 1 from public.push_deliveries
    where id = v_support_delivery
      and status = 'pending' and attempt_count = 1
      and next_attempt_at is not null
      and lease_until is null and claim_token is null
      and last_error_code = 'push_service_error'
  ) then
    raise exception 'FAIL additional event completion or retry state';
  end if;
end
$completion_retry_assertions$;

-- Authenticated clients still cannot call the internal enqueue RPC directly.
set local role authenticated;
select pg_temp._commatch_push_additional_set_user(member_a)
from _commatch_push_additional_events_config;

select pg_temp._commatch_push_additional_expect_error(
  'authenticated arbitrary additional Push enqueue',
  '42501',
  pg_catalog.format(
    'select public.enqueue_push_event(%L::uuid,%L::uuid,%L,%L::uuid)',
    config.member_a,
    '00000000-0000-0000-0000-000000000002',
    'new_match',
    config.match_id
  )
)
from _commatch_push_additional_events_config as config;
reset role;

select 'PASS additional Push events; all fixture changes rolled back' as test_result;

rollback;
