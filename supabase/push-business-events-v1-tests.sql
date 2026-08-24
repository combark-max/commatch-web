-- ComMatch Web Push Phase 2-C rollback-safe integration tests.
--
-- Run in the Supabase SQL Editor after applying push-business-events-v1.sql.
-- Replace the three placeholders with distinct disposable, active, visible
-- members that have no existing like or match relation with one another.
-- Every fixture write and test-only trigger is rolled back.

begin;

create temp table _commatch_push_business_events_it_config (
  first_user_id uuid,
  second_user_id uuid,
  third_user_id uuid,
  match_id uuid,
  first_like_id uuid,
  first_like_notification_id uuid,
  first_like_event_id uuid,
  second_like_id uuid,
  second_like_notification_id uuid,
  second_like_event_id uuid,
  reciprocal_like_id uuid,
  first_message_id uuid,
  second_message_id uuid,
  new_message_notification_id uuid,
  before_reciprocal_notification_count bigint,
  before_reciprocal_event_count bigint,
  before_message_count bigint,
  before_message_event_count bigint,
  before_last_message_at timestamptz,
  before_message_notification_read_at timestamptz,
  before_message_notification_created_at timestamptz,
  before_like_count bigint,
  before_like_notification_count bigint,
  before_like_event_count bigint
) on commit drop;

insert into _commatch_push_business_events_it_config (
  first_user_id,
  second_user_id,
  third_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_THIRD_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'THIRD_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_push_business_events_it_config to authenticated;

create function pg_temp._commatch_push_business_events_set_user(p_user_id uuid)
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

create function pg_temp._commatch_push_business_events_expect_error(
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
          p_label,
          p_expected_state,
          sqlstate,
          sqlerrm;
      end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_push_business_events_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_push_business_events_expect_error(text, text, text)
  to authenticated;

do $preflight$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if v_config.first_user_id is null
     or v_config.second_user_id is null
     or v_config.third_user_id is null then
    raise exception 'Replace all three PASTE_* fixture IDs';
  end if;
  if v_config.first_user_id = v_config.second_user_id
     or v_config.first_user_id = v_config.third_user_id
     or v_config.second_user_id = v_config.third_user_id then
    raise exception 'All three disposable members must be distinct';
  end if;
  if (select pg_catalog.count(*) from auth.users
      where id in (
        v_config.first_user_id,
        v_config.second_user_id,
        v_config.third_user_id
      )) <> 3 then
    raise exception 'All fixture IDs must identify Auth users';
  end if;
  if (select pg_catalog.count(*) from public.profiles
      where id in (
        v_config.first_user_id,
        v_config.second_user_id,
        v_config.third_user_id
      )) <> 3 then
    raise exception 'All disposable members must have profiles';
  end if;
  if not public.is_member_profile_visible(v_config.first_user_id)
     or not public.is_member_profile_visible(v_config.second_user_id)
     or not public.is_member_profile_visible(v_config.third_user_id) then
    raise exception 'All disposable member profiles must be visible';
  end if;
  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id in (
      v_config.first_user_id,
      v_config.second_user_id,
      v_config.third_user_id
    )
      and restriction.account_status <> 'active'
      and (
        restriction.suspended_until is null
        or restriction.suspended_until > pg_catalog.now()
      )
  ) then
    raise exception 'All disposable members must currently have service access';
  end if;
  if exists (
    select 1
    from public.likes as like_row
    where like_row.user_id in (
      v_config.first_user_id,
      v_config.second_user_id,
      v_config.third_user_id
    )
      and like_row.liked_user_id in (
        v_config.first_user_id,
        v_config.second_user_id,
        v_config.third_user_id
      )
  ) or exists (
    select 1
    from public.matches as match_row
    where match_row.user_1_id in (
      v_config.first_user_id,
      v_config.second_user_id,
      v_config.third_user_id
    )
      and match_row.user_2_id in (
        v_config.first_user_id,
        v_config.second_user_id,
        v_config.third_user_id
      )
  ) then
    raise exception 'Disposable members must not already have a like or match relation';
  end if;

  if pg_catalog.to_regprocedure('public.send_match_message(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.send_member_like(uuid)') is null
     or pg_catalog.to_regprocedure('public.send_member_like_with_match(uuid)') is null
     or pg_catalog.to_regprocedure(
       'public.enqueue_push_event(uuid,uuid,text,uuid)'
     ) is null
     or pg_catalog.to_regclass('public.push_events') is null then
    raise exception 'Apply the Phase 2-C production SQL first';
  end if;
  if pg_catalog.pg_get_function_result(
       'public.send_match_message(uuid,text)'::pg_catalog.regprocedure
     ) <> 'uuid'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like(uuid)'::pg_catalog.regprocedure
     ) <> 'text'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like_with_match(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(like_result text, match_id uuid)' then
    raise exception 'A message or like return contract changed';
  end if;
end
$preflight$;

-- A creates one new one-way like for B. Repeating the same call is idempotent.
set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $first_one_way_like$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'liked' then
    raise exception 'FAIL first one-way like returned %', v_result;
  end if;

  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'already_liked' then
    raise exception 'FAIL repeated one-way like returned %', v_result;
  end if;
end
$first_one_way_like$;

reset role;

update _commatch_push_business_events_it_config as config
set first_like_id = like_row.id
from public.likes as like_row
where like_row.user_id = config.first_user_id
  and like_row.liked_user_id = config.second_user_id;

update _commatch_push_business_events_it_config as config
set first_like_notification_id = event_row.notification_id,
    first_like_event_id = event_row.id
from public.push_events as event_row
where event_row.recipient_user_id = config.second_user_id
  and event_row.event_type = 'new_like'
  and event_row.source_id = config.first_like_id;

do $first_one_way_like_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if v_config.first_like_id is null
     or v_config.first_like_notification_id is null
     or v_config.first_like_event_id is null then
    raise exception 'FAIL one-way like IDs were not captured';
  end if;
  if (select pg_catalog.count(*) from public.push_events
      where recipient_user_id = v_config.second_user_id
        and notification_id = v_config.first_like_notification_id
        and event_type = 'new_like'
        and source_id = v_config.first_like_id) <> 1 then
    raise exception 'FAIL one-way like Push event contract';
  end if;
  if not exists (
    select 1
    from public.notifications as notification_row
    where notification_row.id = v_config.first_like_notification_id
      and notification_row.recipient_user_id = v_config.second_user_id
      and notification_row.type = 'new_like'
      and notification_row.match_id is null
      and notification_row.inquiry_id is null
  ) then
    raise exception 'FAIL one-way like notification contract';
  end if;
end
$first_one_way_like_assertions$;

-- Cancelling the unmatched like retains its historical notification and event.
set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $cancel_like$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_push_business_events_it_config;
  select public.cancel_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'cancelled' then
    raise exception 'FAIL unmatched like cancellation returned %', v_result;
  end if;
end
$cancel_like$;

reset role;

do $cancel_like_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if exists (
    select 1 from public.likes
    where id = v_config.first_like_id
  ) or not exists (
    select 1 from public.notifications
    where id = v_config.first_like_notification_id
  ) or not exists (
    select 1 from public.push_events
    where id = v_config.first_like_event_id
  ) then
    raise exception 'FAIL cancellation changed the historical notification or Push event';
  end if;
end
$cancel_like_assertions$;

-- Re-liking creates a new like source, notification, and Push event.
set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $second_one_way_like$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_push_business_events_it_config;
  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'liked' then
    raise exception 'FAIL re-like returned %', v_result;
  end if;
end
$second_one_way_like$;

reset role;

update _commatch_push_business_events_it_config as config
set second_like_id = like_row.id
from public.likes as like_row
where like_row.user_id = config.first_user_id
  and like_row.liked_user_id = config.second_user_id;

update _commatch_push_business_events_it_config as config
set second_like_notification_id = event_row.notification_id,
    second_like_event_id = event_row.id
from public.push_events as event_row
where event_row.recipient_user_id = config.second_user_id
  and event_row.event_type = 'new_like'
  and event_row.source_id = config.second_like_id;

do $second_one_way_like_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if v_config.second_like_id is null
     or v_config.second_like_notification_id is null
     or v_config.second_like_event_id is null
     or v_config.second_like_id = v_config.first_like_id
     or v_config.second_like_notification_id = v_config.first_like_notification_id
     or v_config.second_like_event_id = v_config.first_like_event_id then
    raise exception 'FAIL re-like did not create new source, notification, and event IDs';
  end if;
  if (select pg_catalog.count(*) from public.push_events
      where source_id in (v_config.first_like_id, v_config.second_like_id)) <> 2 then
    raise exception 'FAIL re-like Push event count';
  end if;
end
$second_one_way_like_assertions$;

-- B reciprocates through the UI wrapper. Only the existing new_match lifecycle
-- runs; no new_like notification or Push event is added for A.
update _commatch_push_business_events_it_config as config
set before_reciprocal_notification_count = (
      select pg_catalog.count(*)
      from public.notifications
      where recipient_user_id = config.first_user_id
        and type = 'new_like'
    ),
    before_reciprocal_event_count = (
      select pg_catalog.count(*)
      from public.push_events
      where recipient_user_id = config.first_user_id
        and event_type = 'new_like'
    );

set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(second_user_id)
from _commatch_push_business_events_it_config;

do $reciprocal_like$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_result text;
  v_match_id uuid;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  select result.like_result, result.match_id
  into v_result, v_match_id
  from public.send_member_like_with_match(v_config.first_user_id) as result;

  if v_result <> 'matched' or v_match_id is null then
    raise exception 'FAIL reciprocal like returned %, match %', v_result, v_match_id;
  end if;

  update _commatch_push_business_events_it_config
  set match_id = v_match_id;
end
$reciprocal_like$;

reset role;

update _commatch_push_business_events_it_config as config
set reciprocal_like_id = like_row.id
from public.likes as like_row
where like_row.user_id = config.second_user_id
  and like_row.liked_user_id = config.first_user_id;

do $reciprocal_like_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if v_config.reciprocal_like_id is null
     or (select pg_catalog.count(*) from public.notifications
         where type = 'new_match' and match_id = v_config.match_id) <> 2
     or (select pg_catalog.count(*) from public.notifications
         where recipient_user_id = v_config.first_user_id
           and type = 'new_like') <> v_config.before_reciprocal_notification_count
     or (select pg_catalog.count(*) from public.push_events
         where recipient_user_id = v_config.first_user_id
           and event_type = 'new_like') <> v_config.before_reciprocal_event_count
     or exists (
       select 1 from public.push_events
       where source_id = v_config.reciprocal_like_id
         and event_type = 'new_like'
     ) then
    raise exception 'FAIL reciprocal like changed the approved new_match-only contract';
  end if;
end
$reciprocal_like_assertions$;

-- Two messages reuse one notification ID but create one event per message ID.
set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $two_messages$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_first_message_id uuid;
  v_second_message_id uuid;
begin
  select * into v_config from _commatch_push_business_events_it_config;
  select public.send_match_message(v_config.match_id, 'Phase 2-C message one')
    into v_first_message_id;
  select public.send_match_message(v_config.match_id, 'Phase 2-C message two')
    into v_second_message_id;

  if v_first_message_id is null
     or v_second_message_id is null
     or v_first_message_id = v_second_message_id then
    raise exception 'FAIL two messages did not return distinct IDs';
  end if;

  update _commatch_push_business_events_it_config
  set first_message_id = v_first_message_id,
      second_message_id = v_second_message_id;
end
$two_messages$;

reset role;

update _commatch_push_business_events_it_config as config
set new_message_notification_id = notification_row.id
from public.notifications as notification_row
where notification_row.recipient_user_id = config.second_user_id
  and notification_row.type = 'new_message'
  and notification_row.match_id = config.match_id;

do $two_message_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if v_config.new_message_notification_id is null
     or (select pg_catalog.count(*) from public.messages
         where id in (v_config.first_message_id, v_config.second_message_id)
           and match_id = v_config.match_id
           and sender_id = v_config.first_user_id) <> 2
     or (select pg_catalog.count(*) from public.notifications
         where id = v_config.new_message_notification_id
           and recipient_user_id = v_config.second_user_id
           and type = 'new_message'
           and match_id = v_config.match_id
           and read_at is null) <> 1
     or (select pg_catalog.count(*) from public.push_events
         where recipient_user_id = v_config.second_user_id
           and notification_id = v_config.new_message_notification_id
           and event_type = 'new_message'
           and source_id in (
             v_config.first_message_id,
             v_config.second_message_id
           )) <> 2
     or (select pg_catalog.count(distinct event_row.notification_id)
         from public.push_events as event_row
         where event_row.source_id in (
           v_config.first_message_id,
           v_config.second_message_id
         )) <> 1 then
    raise exception 'FAIL message notification reuse or Push source contract';
  end if;
end
$two_message_assertions$;

-- Force the message enqueue insert to fail and prove the entire RPC rolls back.
update _commatch_push_business_events_it_config as config
set before_message_count = (
      select pg_catalog.count(*) from public.messages
      where match_id = config.match_id
    ),
    before_message_event_count = (
      select pg_catalog.count(*) from public.push_events
      where event_type = 'new_message'
        and recipient_user_id = config.second_user_id
    ),
    before_last_message_at = (
      select match_row.last_message_at from public.matches as match_row
      where match_row.id = config.match_id
    ),
    before_message_notification_read_at = (
      select notification_row.read_at from public.notifications as notification_row
      where notification_row.id = config.new_message_notification_id
    ),
    before_message_notification_created_at = (
      select notification_row.created_at from public.notifications as notification_row
      where notification_row.id = config.new_message_notification_id
    );

create function pg_temp._commatch_force_message_enqueue_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.event_type = 'new_message' then
    raise exception 'forced new_message enqueue failure';
  end if;
  return new;
end
$function$;

create trigger push_business_events_test_force_message_failure
  before insert on public.push_events
  for each row
  execute function pg_temp._commatch_force_message_enqueue_failure();

set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $message_atomicity$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_push_business_events_it_config;
  begin
    perform public.send_match_message(v_config.match_id, 'Phase 2-C must roll back');
  exception
    when others then
      if sqlerrm <> 'forced new_message enqueue failure' then
        raise;
      end if;
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL forced new_message enqueue failure did not occur';
  end if;
end
$message_atomicity$;

reset role;
drop trigger push_business_events_test_force_message_failure on public.push_events;

do $message_atomicity_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if (select pg_catalog.count(*) from public.messages
      where match_id = v_config.match_id) <> v_config.before_message_count
     or (select pg_catalog.count(*) from public.push_events
         where event_type = 'new_message'
           and recipient_user_id = v_config.second_user_id) <>
        v_config.before_message_event_count
     or (select match_row.last_message_at from public.matches as match_row
         where match_row.id = v_config.match_id) is distinct from
        v_config.before_last_message_at
     or (select notification_row.read_at from public.notifications as notification_row
         where notification_row.id = v_config.new_message_notification_id)
        is distinct from v_config.before_message_notification_read_at
     or (select notification_row.created_at from public.notifications as notification_row
         where notification_row.id = v_config.new_message_notification_id)
        is distinct from v_config.before_message_notification_created_at
     or exists (
       select 1 from public.messages
       where match_id = v_config.match_id
         and content = 'Phase 2-C must roll back'
     ) then
    raise exception 'FAIL enqueue failure retained a message, match, notification, or event change';
  end if;
end
$message_atomicity_assertions$;

-- Force a fresh A-to-C like enqueue to fail and prove like/notification rollback.
update _commatch_push_business_events_it_config as config
set before_like_count = (
      select pg_catalog.count(*) from public.likes
      where user_id = config.first_user_id
        and liked_user_id = config.third_user_id
    ),
    before_like_notification_count = (
      select pg_catalog.count(*) from public.notifications
      where recipient_user_id = config.third_user_id
        and type = 'new_like'
    ),
    before_like_event_count = (
      select pg_catalog.count(*) from public.push_events
      where recipient_user_id = config.third_user_id
        and event_type = 'new_like'
    );

create function pg_temp._commatch_force_like_enqueue_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.event_type = 'new_like' then
    raise exception 'forced new_like enqueue failure';
  end if;
  return new;
end
$function$;

create trigger push_business_events_test_force_like_failure
  before insert on public.push_events
  for each row
  execute function pg_temp._commatch_force_like_enqueue_failure();

set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

do $like_atomicity$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_push_business_events_it_config;
  begin
    perform public.send_member_like(v_config.third_user_id);
  exception
    when others then
      if sqlerrm <> 'forced new_like enqueue failure' then
        raise;
      end if;
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL forced new_like enqueue failure did not occur';
  end if;
end
$like_atomicity$;

reset role;
drop trigger push_business_events_test_force_like_failure on public.push_events;

do $like_atomicity_assertions$
declare
  v_config _commatch_push_business_events_it_config%rowtype;
begin
  select * into v_config from _commatch_push_business_events_it_config;

  if (select pg_catalog.count(*) from public.likes
      where user_id = v_config.first_user_id
        and liked_user_id = v_config.third_user_id) <> v_config.before_like_count
     or (select pg_catalog.count(*) from public.notifications
         where recipient_user_id = v_config.third_user_id
           and type = 'new_like') <> v_config.before_like_notification_count
     or (select pg_catalog.count(*) from public.push_events
         where recipient_user_id = v_config.third_user_id
           and event_type = 'new_like') <> v_config.before_like_event_count then
    raise exception 'FAIL enqueue failure retained a like, notification, or event change';
  end if;
end
$like_atomicity_assertions$;

-- Authenticated clients still cannot call the internal enqueue RPC directly.
set local role authenticated;
select pg_temp._commatch_push_business_events_set_user(first_user_id)
from _commatch_push_business_events_it_config;

select pg_temp._commatch_push_business_events_expect_error(
  'authenticated arbitrary Push enqueue',
  '42501',
  format(
    'select public.enqueue_push_event(%L::uuid,%L::uuid,%L,%L::uuid)',
    second_user_id,
    first_like_notification_id,
    'new_like',
    first_like_id
  )
)
from _commatch_push_business_events_it_config;

reset role;

select 'PASS Web Push Phase 2-C business event tests; all fixture changes rolled back'
  as test_result;

rollback;
