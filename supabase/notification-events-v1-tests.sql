-- ComMatch first-party notification event rollback-safe integration tests.
--
-- Run in the Supabase SQL Editor after applying notification-events-v1.sql.
-- Replace the three placeholders with:
--   1. two distinct disposable, active, visible members with profiles and no
--      existing like/match relation with each other; and
--   2. one active super_admin or admin Auth user.
-- Every fixture write and test-only trigger is rolled back.

begin;

create temp table _commatch_notification_events_it_config (
  first_user_id uuid,
  second_user_id uuid,
  admin_user_id uuid,
  match_id uuid,
  inquiry_id uuid,
  rollback_inquiry_id uuid,
  new_message_notification_id uuid
) on commit drop;

insert into _commatch_notification_events_it_config (
  first_user_id,
  second_user_id,
  admin_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_ACTIVE_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_ADMIN_USER_ID')::uuid
);

grant select, update on _commatch_notification_events_it_config to authenticated;

create function pg_temp._commatch_notification_events_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text end,
    true
  );
end
$function$;

create function pg_temp._commatch_notification_events_expect_error(
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

grant execute on function pg_temp._commatch_notification_events_set_user(uuid) to authenticated;
grant execute on function pg_temp._commatch_notification_events_expect_error(text, text, text) to authenticated;

do $preflight$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_forbidden_columns text[];
begin
  select * into v_config from _commatch_notification_events_it_config;

  if v_config.first_user_id is null
     or v_config.second_user_id is null
     or v_config.admin_user_id is null then
    raise exception 'Replace all three PASTE_* fixture IDs';
  end if;
  if v_config.first_user_id = v_config.second_user_id
     or v_config.admin_user_id in (v_config.first_user_id, v_config.second_user_id) then
    raise exception 'The two members and administrator must be distinct Auth users';
  end if;
  if (select pg_catalog.count(*) from auth.users
      where id in (v_config.first_user_id, v_config.second_user_id, v_config.admin_user_id)) <> 3 then
    raise exception 'All fixture IDs must identify Auth users';
  end if;
  if (select pg_catalog.count(*) from public.profiles
      where id in (v_config.first_user_id, v_config.second_user_id)) <> 2 then
    raise exception 'Both disposable members must have profiles';
  end if;
  if not public.is_member_profile_visible(v_config.first_user_id)
     or not public.is_member_profile_visible(v_config.second_user_id) then
    raise exception 'Both disposable member profiles must be visible';
  end if;
  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id in (v_config.first_user_id, v_config.second_user_id)
      and restriction.account_status <> 'active'
      and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
  ) then
    raise exception 'Both disposable members must currently have service access';
  end if;
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_config.admin_user_id
      and admin_account.status = 'active'
      and admin_account.role in ('super_admin', 'admin')
  ) then
    raise exception 'The administrator must be an active super_admin or admin';
  end if;
  if exists (
    select 1 from public.likes
    where (user_id, liked_user_id) in (
      (v_config.first_user_id, v_config.second_user_id),
      (v_config.second_user_id, v_config.first_user_id)
    )
  ) or exists (
    select 1 from public.matches
    where user_1_id = least(v_config.first_user_id, v_config.second_user_id)
      and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'Disposable members must not already have a like or match relation';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'notifications'
  ) then
    raise exception 'public.notifications is not in the supabase_realtime publication';
  end if;

  select pg_catalog.array_agg(column_info.column_name order by column_info.column_name)
  into v_forbidden_columns
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'notifications'
    and column_info.column_name in (
      'actor_user_id', 'sender_id', 'like_id', 'title', 'body', 'payload', 'link', 'url'
    );

  if v_forbidden_columns is not null then
    raise exception 'notifications exposes forbidden actor or payload columns: %', v_forbidden_columns;
  end if;

  if pg_catalog.pg_get_function_result('public.send_match_message(uuid,text)'::pg_catalog.regprocedure) <> 'uuid'
     or pg_catalog.pg_get_function_result('public.mark_match_read(uuid)'::pg_catalog.regprocedure) <> 'bigint'
     or pg_catalog.pg_get_function_result('public.send_member_like(uuid)'::pg_catalog.regprocedure) <> 'text' then
    raise exception 'Existing chat or like return contracts changed';
  end if;
end
$preflight$;

-- A sends a one-way like to B. B receives one anonymous new_like notification.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $one_way_like$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'liked' then
    raise exception 'FAIL first one-way like returned %', v_result;
  end if;

  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'already_liked' then
    raise exception 'FAIL duplicate one-way like returned %', v_result;
  end if;
end
$one_way_like$;

reset role;

do $one_way_like_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'new_like'
        and match_id is null
        and inquiry_id is null) <> 1 then
    raise exception 'FAIL one-way or repeated like notification count';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id = v_config.first_user_id and type = 'new_like'
  ) then
    raise exception 'FAIL sender received their own new_like notification';
  end if;
end
$one_way_like_assertions$;

-- Cancelling retains the historical notification; a fresh re-send creates a
-- second anonymous event.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $cancel_like$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select public.cancel_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'cancelled' then
    raise exception 'FAIL unmatched like cancellation returned %', v_result;
  end if;
end
$cancel_like$;

reset role;

do $cancellation_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id and type = 'new_like') <> 1 then
    raise exception 'FAIL cancellation removed the historical new_like notification';
  end if;
end
$cancellation_assertions$;

set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $resend_like$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select public.send_member_like(v_config.second_user_id) into v_result;
  if v_result <> 'liked' then
    raise exception 'FAIL re-sent like returned %', v_result;
  end if;
end
$resend_like$;

reset role;

do $resend_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'new_like'
        and match_id is null
        and inquiry_id is null) <> 2 then
    raise exception 'FAIL fresh re-send did not create a second anonymous notification';
  end if;
end
$resend_assertions$;

-- B reciprocates. The existing new_match lifecycle creates exactly two rows,
-- and the reciprocal operation creates no new_like for A.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(second_user_id)
from _commatch_notification_events_it_config;

do $reciprocal_like$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_result text;
  v_match_id uuid;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select result.like_result, result.match_id
  into v_result, v_match_id
  from public.send_member_like_with_match(v_config.first_user_id) as result;

  if v_result <> 'matched' or v_match_id is null then
    raise exception 'FAIL reciprocal like returned %, match %', v_result, v_match_id;
  end if;

  update _commatch_notification_events_it_config set match_id = v_match_id;
end
$reciprocal_like$;

reset role;

do $reciprocal_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where type = 'new_match' and match_id = v_config.match_id) <> 2 then
    raise exception 'FAIL reciprocal match did not retain exactly two new_match notifications';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id = v_config.first_user_id and type = 'new_like'
  ) then
    raise exception 'FAIL reciprocal like created a redundant new_like notification';
  end if;
end
$reciprocal_assertions$;

-- Two consecutive messages from A reuse B's one new_message notification.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $consecutive_messages$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_first_message_id uuid;
  v_second_message_id uuid;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select public.send_match_message(v_config.match_id, 'notification message one') into v_first_message_id;
  select public.send_match_message(v_config.match_id, 'notification message two') into v_second_message_id;
  if v_first_message_id is null or v_second_message_id is null or v_first_message_id = v_second_message_id then
    raise exception 'FAIL consecutive messages did not create two message rows';
  end if;
end
$consecutive_messages$;

reset role;

update _commatch_notification_events_it_config as config
set new_message_notification_id = notification_row.id
from public.notifications as notification_row
where notification_row.recipient_user_id = config.second_user_id
  and notification_row.type = 'new_message'
  and notification_row.match_id = config.match_id;

do $consecutive_message_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.messages
      where match_id = v_config.match_id and sender_id = v_config.first_user_id) <> 2 then
    raise exception 'FAIL consecutive message row count';
  end if;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'new_message'
        and match_id = v_config.match_id
        and read_at is null) <> 1 then
    raise exception 'FAIL consecutive messages did not coalesce to one unread notification';
  end if;
  if v_config.new_message_notification_id is null then
    raise exception 'FAIL new_message notification ID was not captured';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id = v_config.first_user_id
      and type = 'new_message'
      and match_id = v_config.match_id
  ) then
    raise exception 'FAIL message sender received their own notification';
  end if;
  if (select created_at from public.notifications
      where id = v_config.new_message_notification_id) is distinct from
     (select pg_catalog.max(created_at) from public.messages
      where match_id = v_config.match_id and sender_id = v_config.first_user_id) then
    raise exception 'FAIL coalesced notification does not use the latest message timestamp';
  end if;
end
$consecutive_message_assertions$;

-- B entering the chat reads both messages and the coalesced notification.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(second_user_id)
from _commatch_notification_events_it_config;

do $mark_read$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_count bigint;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select public.mark_match_read(v_config.match_id) into v_count;
  if v_count <> 2 then
    raise exception 'FAIL mark_match_read returned %, expected 2', v_count;
  end if;
end
$mark_read$;

reset role;

do $read_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if exists (
    select 1 from public.messages
    where match_id = v_config.match_id
      and sender_id = v_config.first_user_id
      and read_at is null
  ) then
    raise exception 'FAIL mark_match_read left an incoming message unread';
  end if;
  if (select read_at from public.notifications
      where id = v_config.new_message_notification_id) is null then
    raise exception 'FAIL mark_match_read left the new_message notification unread';
  end if;
end
$read_assertions$;

-- A later message reuses the same row and makes it unread again.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

select public.send_match_message(match_id, 'notification message after read')
from _commatch_notification_events_it_config;

reset role;

do $reopened_notification_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'new_message'
        and match_id = v_config.match_id) <> 1
     or (select read_at from public.notifications
         where id = v_config.new_message_notification_id) is not null then
    raise exception 'FAIL a later message did not reopen the same notification row';
  end if;
  if (select pg_catalog.count(*) from public.messages
      where match_id = v_config.match_id
        and sender_id = v_config.first_user_id
        and read_at is null) <> 1 then
    raise exception 'FAIL existing message unread calculation changed';
  end if;
end
$reopened_notification_assertions$;

-- A forced notification failure rolls the message and match timestamp back.
create function pg_temp._commatch_notification_events_force_message_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.type = 'new_message' then
    raise exception 'forced new_message notification failure';
  end if;
  return new;
end
$function$;

create trigger notification_events_test_force_message_failure
  before insert on public.notifications
  for each row execute function pg_temp._commatch_notification_events_force_message_failure();

set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $message_atomicity$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_before_message_count bigint;
  v_before_last_message_at timestamptz;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select pg_catalog.count(*) into v_before_message_count
  from public.messages where match_id = v_config.match_id;
  select last_message_at into v_before_last_message_at
  from public.matches where id = v_config.match_id;

  begin
    perform public.send_match_message(v_config.match_id, 'must roll back');
  exception when others then
    if sqlerrm <> 'forced new_message notification failure' then raise; end if;
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL forced new_message notification failure did not occur';
  end if;
  if (select pg_catalog.count(*) from public.messages where match_id = v_config.match_id) <> v_before_message_count
     or (select last_message_at from public.matches where id = v_config.match_id)
        is distinct from v_before_last_message_at then
    raise exception 'FAIL notification failure retained a message or match timestamp change';
  end if;
end
$message_atomicity$;

reset role;
drop trigger notification_events_test_force_message_failure on public.notifications;

-- Ended matches retain the existing send prohibition and create no new row.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;
select public.end_match(match_id) from _commatch_notification_events_it_config;

select pg_temp._commatch_notification_events_expect_error(
  'ended match message',
  '55000',
  format('select public.send_match_message(%L::uuid, %L)', match_id, 'ended message')
) from _commatch_notification_events_it_config;

reset role;

do $ended_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.messages
      where match_id = v_config.match_id and content = 'ended message') <> 0 then
    raise exception 'FAIL ended match retained a message';
  end if;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.second_user_id
        and type = 'new_message'
        and match_id = v_config.match_id) <> 1 then
    raise exception 'FAIL ended send changed the existing new_message notification';
  end if;
end
$ended_assertions$;

-- Create two member-owned inquiries. One succeeds; the second proves that a
-- notification failure rolls the answer and administrator action back.
with inserted_inquiry as (
  insert into public.support_inquiries (user_id, category, subject, body)
  select first_user_id, 'service', 'notification answer fixture', 'first inquiry body'
  from _commatch_notification_events_it_config
  returning id
)
update _commatch_notification_events_it_config as config
set inquiry_id = inserted_inquiry.id
from inserted_inquiry;

with inserted_inquiry as (
  insert into public.support_inquiries (user_id, category, subject, body)
  select first_user_id, 'service', 'notification rollback fixture', 'second inquiry body'
  from _commatch_notification_events_it_config
  returning id
)
update _commatch_notification_events_it_config as config
set rollback_inquiry_id = inserted_inquiry.id
from inserted_inquiry;

set local role authenticated;
select pg_temp._commatch_notification_events_set_user(admin_user_id)
from _commatch_notification_events_it_config;

do $first_answer_and_correction$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select result.updated_at into v_updated_at
  from public.answer_admin_support_inquiry(
    v_config.inquiry_id,
    (select inquiry.updated_at
     from public.get_admin_support_inquiry(v_config.inquiry_id) as inquiry),
    'first answer'
  ) as result;

  perform public.answer_admin_support_inquiry(
    v_config.inquiry_id,
    v_updated_at,
    'corrected answer'
  );
end
$first_answer_and_correction$;

reset role;

do $answer_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if (select pg_catalog.count(*) from public.notifications
      where recipient_user_id = v_config.first_user_id
        and type = 'support_inquiry_answered'
        and match_id is null
        and inquiry_id = v_config.inquiry_id) <> 1 then
    raise exception 'FAIL first answer or correction notification count';
  end if;
  if (select pg_catalog.count(*) from public.support_inquiry_admin_actions
      where inquiry_id = v_config.inquiry_id and action = 'answer') <> 1
     or (select pg_catalog.count(*) from public.support_inquiry_admin_actions
         where inquiry_id = v_config.inquiry_id and action = 'answer_update') <> 1 then
    raise exception 'FAIL existing support answer action lifecycle changed';
  end if;
end
$answer_assertions$;

create function pg_temp._commatch_notification_events_force_answer_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.type = 'support_inquiry_answered' then
    raise exception 'forced inquiry notification failure';
  end if;
  return new;
end
$function$;

create trigger notification_events_test_force_answer_failure
  before insert on public.notifications
  for each row execute function pg_temp._commatch_notification_events_force_answer_failure();

set local role authenticated;
select pg_temp._commatch_notification_events_set_user(admin_user_id)
from _commatch_notification_events_it_config;

do $answer_atomicity$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_notification_events_it_config;
  begin
    perform public.answer_admin_support_inquiry(
      v_config.rollback_inquiry_id,
      (select inquiry.updated_at
       from public.get_admin_support_inquiry(v_config.rollback_inquiry_id) as inquiry),
      'must roll back'
    );
  exception when others then
    if sqlerrm <> 'forced inquiry notification failure' then raise; end if;
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'FAIL forced inquiry notification failure did not occur';
  end if;
end
$answer_atomicity$;

reset role;
drop trigger notification_events_test_force_answer_failure on public.notifications;

do $answer_rollback_assertions$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if not exists (
    select 1 from public.support_inquiries
    where id = v_config.rollback_inquiry_id
      and status = 'pending'
      and answer_body is null
      and answered_at is null
  ) or exists (
    select 1 from public.support_inquiry_admin_actions
    where inquiry_id = v_config.rollback_inquiry_id
  ) or exists (
    select 1 from public.notifications
    where inquiry_id = v_config.rollback_inquiry_id
  ) then
    raise exception 'FAIL inquiry notification failure retained answer, action, or notification data';
  end if;
end
$answer_rollback_assertions$;

-- Closed inquiries retain the existing rejection and cannot add notifications.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(admin_user_id)
from _commatch_notification_events_it_config;

do $close_and_reject_answer$
declare
  v_config _commatch_notification_events_it_config%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_notification_events_it_config;
  select inquiry.updated_at into v_updated_at
  from public.get_admin_support_inquiry(v_config.inquiry_id) as inquiry;
  perform public.close_admin_support_inquiry(v_config.inquiry_id, v_updated_at);

  perform pg_temp._commatch_notification_events_expect_error(
    'closed inquiry answer',
    '22023',
    format(
      'select * from public.answer_admin_support_inquiry(%L::uuid, %L::timestamptz, %L)',
      v_config.inquiry_id,
      (select inquiry.updated_at
       from public.get_admin_support_inquiry(v_config.inquiry_id) as inquiry),
      'closed answer'
    )
  );
end
$close_and_reject_answer$;

reset role;

do $target_constraint_assertions$
begin
  perform pg_temp._commatch_notification_events_expect_error(
    'new_like with match target',
    '23514',
    format(
      'insert into public.notifications(recipient_user_id,type,match_id) select first_user_id,%L,match_id from _commatch_notification_events_it_config',
      'new_like'
    )
  );
  perform pg_temp._commatch_notification_events_expect_error(
    'duplicate inquiry notification',
    '23505',
    format(
      'insert into public.notifications(recipient_user_id,type,inquiry_id) select first_user_id,%L,inquiry_id from _commatch_notification_events_it_config',
      'support_inquiry_answered'
    )
  );
end
$target_constraint_assertions$;

-- Authenticated clients retain SELECT-only access and recipient RLS.
set local role authenticated;
select pg_temp._commatch_notification_events_set_user(first_user_id)
from _commatch_notification_events_it_config;

do $recipient_rls$
declare v_config _commatch_notification_events_it_config%rowtype;
begin
  select * into v_config from _commatch_notification_events_it_config;
  if exists (
    select 1 from public.notifications
    where recipient_user_id = v_config.second_user_id
  ) then
    raise exception 'FAIL first member can select second member notifications';
  end if;
end
$recipient_rls$;

select pg_temp._commatch_notification_events_expect_error(
  'direct authenticated notification insert',
  '42501',
  format(
    'insert into public.notifications(recipient_user_id,type) values (%L::uuid,%L)',
    first_user_id,
    'new_like'
  )
) from _commatch_notification_events_it_config;

reset role;

select 'PASS first-party notification event integration tests; all fixture changes rolled back'
  as test_result;

rollback;
