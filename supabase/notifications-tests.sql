-- ComMatch new-match notifications integration test.
--
-- Run in the Supabase SQL Editor after, in order:
--   1. supabase/likes.sql
--   2. supabase/notifications.sql
-- Replace the two placeholders with distinct disposable, active, visible Auth
-- users that have profiles and no favorite/like/match relation with each other.
-- Every fixture write and test-only trigger is rolled back.

begin;

create temp table _commatch_notifications_it_config (
  first_user_id uuid,
  second_user_id uuid,
  created_match_id uuid,
  first_notification_id uuid,
  second_notification_id uuid
) on commit drop;

insert into _commatch_notifications_it_config (
  first_user_id,
  second_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_notifications_it_config to authenticated;

create function pg_temp._commatch_notifications_set_user(p_user_id uuid)
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

create function pg_temp._commatch_notifications_expect_42501(p_label text, p_sql text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when sqlstate '42501' then
      null;
  end;
end
$function$;

grant execute on function pg_temp._commatch_notifications_set_user(uuid) to authenticated;
grant execute on function pg_temp._commatch_notifications_expect_42501(text, text) to authenticated;

do $preflight$
declare
  v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;

  if v_config.first_user_id is null or v_config.second_user_id is null then
    raise exception 'Replace both PASTE_* disposable member IDs';
  end if;
  if v_config.first_user_id = v_config.second_user_id then
    raise exception 'The disposable member IDs must be distinct';
  end if;
  if (select count(*) from auth.users where id in (v_config.first_user_id, v_config.second_user_id)) <> 2
     or (select count(*) from public.profiles where id in (v_config.first_user_id, v_config.second_user_id)) <> 2 then
    raise exception 'Both fixture IDs must identify Auth users with profiles';
  end if;
  if not public.is_member_profile_visible(v_config.first_user_id)
     or not public.is_member_profile_visible(v_config.second_user_id) then
    raise exception 'Both fixture profiles must be visible';
  end if;
  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id in (v_config.first_user_id, v_config.second_user_id)
      and restriction.account_status <> 'active'
      and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
  ) then
    raise exception 'Both fixture members must currently have service access';
  end if;
  if exists (
    select 1 from public.favorites
    where (user_id, favorite_user_id) in (
      (v_config.first_user_id, v_config.second_user_id),
      (v_config.second_user_id, v_config.first_user_id)
    )
  ) or exists (
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
    raise exception 'Fixture members must not already have favorite, like, or match rows together';
  end if;
end
$preflight$;

-- A likes B: no match and no notification.
set local role authenticated;
select pg_temp._commatch_notifications_set_user(first_user_id)
from _commatch_notifications_it_config;

do $first_like$
declare
  v_config _commatch_notifications_it_config%rowtype;
  v_result text;
  v_match_id uuid;
begin
  select * into v_config from _commatch_notifications_it_config;
  select result.like_result, result.match_id
  into v_result, v_match_id
  from public.send_member_like_with_match(v_config.second_user_id) as result;

  if v_result <> 'liked' or v_match_id is not null then
    raise exception 'FAIL first like result: %, match id: %', v_result, v_match_id;
  end if;
end
$first_like$;

reset role;

do $non_mutual_assertions$
declare v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;
  if (select count(*) from public.likes where user_id = v_config.first_user_id and liked_user_id = v_config.second_user_id) <> 1 then
    raise exception 'FAIL first like was not stored exactly once';
  end if;
  if exists (
    select 1 from public.matches
    where user_1_id = least(v_config.first_user_id, v_config.second_user_id)
      and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'FAIL non-mutual like created a match';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id in (v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'FAIL non-mutual like created a notification';
  end if;
end
$non_mutual_assertions$;

-- Force the second participant notification to fail. The caught exception is
-- a subtransaction rollback: the second like, match, and first notification
-- from the failed RPC must all disappear.
create function pg_temp._commatch_notifications_force_insert_failure()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.recipient_user_id = (
    select config.second_user_id
    from pg_temp._commatch_notifications_it_config as config
  ) then
    raise exception 'forced notification insert failure';
  end if;
  return new;
end
$function$;

create trigger notifications_test_force_insert_failure
  before insert on public.notifications
  for each row
  execute function pg_temp._commatch_notifications_force_insert_failure();

set local role authenticated;
select pg_temp._commatch_notifications_set_user(second_user_id)
from _commatch_notifications_it_config;

do $forced_failure$
declare
  v_config _commatch_notifications_it_config%rowtype;
  v_failed boolean := false;
  v_error_message text;
begin
  select * into v_config from _commatch_notifications_it_config;
  begin
    perform * from public.send_member_like_with_match(v_config.first_user_id);
  exception when others then
    v_failed := true;
    v_error_message := sqlerrm;
  end;

  if not v_failed or v_error_message <> 'forced notification insert failure' then
    raise exception 'FAIL expected forced notification failure, got: %', v_error_message;
  end if;
end
$forced_failure$;

reset role;

do $atomicity_assertions$
declare v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;
  if exists (
    select 1 from public.likes
    where user_id = v_config.second_user_id and liked_user_id = v_config.first_user_id
  ) then
    raise exception 'FAIL failed RPC retained the second like';
  end if;
  if exists (
    select 1 from public.matches
    where user_1_id = least(v_config.first_user_id, v_config.second_user_id)
      and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'FAIL failed notification insert retained the match';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id in (v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'FAIL failed notification insert retained a partial notification';
  end if;
end
$atomicity_assertions$;

drop trigger notifications_test_force_insert_failure on public.notifications;

-- Retry without the failure trigger: one match and both notifications commit.
set local role authenticated;
select pg_temp._commatch_notifications_set_user(second_user_id)
from _commatch_notifications_it_config;

do $mutual_like$
declare
  v_config _commatch_notifications_it_config%rowtype;
  v_result text;
  v_match_id uuid;
begin
  select * into v_config from _commatch_notifications_it_config;
  select result.like_result, result.match_id
  into v_result, v_match_id
  from public.send_member_like_with_match(v_config.first_user_id) as result;

  if v_result <> 'matched' or v_match_id is null then
    raise exception 'FAIL mutual like result: %, match id: %', v_result, v_match_id;
  end if;

  update _commatch_notifications_it_config
  set created_match_id = v_match_id;
end
$mutual_like$;

reset role;

update _commatch_notifications_it_config as config
set first_notification_id = first_notification.id,
    second_notification_id = second_notification.id
from public.notifications as first_notification,
     public.notifications as second_notification
where first_notification.recipient_user_id = config.first_user_id
  and first_notification.type = 'new_match'
  and first_notification.match_id = config.created_match_id
  and second_notification.recipient_user_id = config.second_user_id
  and second_notification.type = 'new_match'
  and second_notification.match_id = config.created_match_id;

do $mutual_assertions$
declare v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;
  if (select count(*) from public.matches where id = v_config.created_match_id) <> 1 then
    raise exception 'FAIL returned match id does not identify exactly one match';
  end if;
  if (select count(*) from public.notifications where match_id = v_config.created_match_id and type = 'new_match') <> 2 then
    raise exception 'FAIL mutual match did not create exactly two notifications';
  end if;
  if (select count(*) from public.notifications where match_id = v_config.created_match_id and recipient_user_id = v_config.first_user_id) <> 1
     or (select count(*) from public.notifications where match_id = v_config.created_match_id and recipient_user_id = v_config.second_user_id) <> 1 then
    raise exception 'FAIL each participant must have exactly one notification';
  end if;
  if v_config.first_notification_id is null or v_config.second_notification_id is null then
    raise exception 'FAIL notification fixture ids were not captured';
  end if;
end
$mutual_assertions$;

-- Same RPC again: existing match id is returned and no notifications repeat.
set local role authenticated;
select pg_temp._commatch_notifications_set_user(second_user_id)
from _commatch_notifications_it_config;

do $retry$
declare
  v_config _commatch_notifications_it_config%rowtype;
  v_result text;
  v_match_id uuid;
begin
  select * into v_config from _commatch_notifications_it_config;
  select result.like_result, result.match_id
  into v_result, v_match_id
  from public.send_member_like_with_match(v_config.first_user_id) as result;

  if v_result <> 'already_matched' or v_match_id is distinct from v_config.created_match_id then
    raise exception 'FAIL retry result: %, match id: %', v_result, v_match_id;
  end if;
end
$retry$;

reset role;

do $retry_assertions$
declare v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;
  if (select count(*) from public.matches where id = v_config.created_match_id) <> 1
     or (select count(*) from public.notifications where match_id = v_config.created_match_id) <> 2 then
    raise exception 'FAIL retry created duplicate match or notification rows';
  end if;
end
$retry_assertions$;

-- RLS, ACL, unread count, ownership-safe and idempotent read handling.
set local role authenticated;
select pg_temp._commatch_notifications_set_user(first_user_id)
from _commatch_notifications_it_config;

do $first_user_security$
declare
  v_config _commatch_notifications_it_config%rowtype;
  v_first_read_at timestamptz;
  v_second_read_at timestamptz;
  v_marked boolean;
begin
  select * into v_config from _commatch_notifications_it_config;

  if (select count(*) from public.notifications) <> 1 then
    raise exception 'FAIL first user must see exactly their own notification';
  end if;
  if exists (
    select 1 from public.notifications where id = v_config.second_notification_id
  ) then
    raise exception 'FAIL first user can select the second user notification';
  end if;
  if (select count(*) from public.notifications where read_at is null) <> 1 then
    raise exception 'FAIL initial first-user unread count';
  end if;

  select public.mark_my_notification_read(v_config.second_notification_id) into v_marked;
  if v_marked then
    raise exception 'FAIL first user marked the second user notification';
  end if;

  select public.mark_my_notification_read(v_config.first_notification_id) into v_marked;
  if not v_marked then
    raise exception 'FAIL first user could not mark their notification read';
  end if;
  select read_at into v_first_read_at
  from public.notifications where id = v_config.first_notification_id;

  select public.mark_my_notification_read(v_config.first_notification_id) into v_marked;
  if not v_marked then
    raise exception 'FAIL repeated own read call was not idempotent';
  end if;
  select read_at into v_second_read_at
  from public.notifications where id = v_config.first_notification_id;

  if v_first_read_at is null or v_second_read_at is distinct from v_first_read_at then
    raise exception 'FAIL repeated read changed or cleared the original read_at';
  end if;
  if (select count(*) from public.notifications where read_at is null) <> 0 then
    raise exception 'FAIL first-user unread count did not decrease';
  end if;
end
$first_user_security$;

select pg_temp._commatch_notifications_expect_42501(
  'direct notification UPDATE',
  format(
    'update public.notifications set read_at=now() where id=%L',
    first_notification_id
  )
) from _commatch_notifications_it_config;

select pg_temp._commatch_notifications_set_user(second_user_id)
from _commatch_notifications_it_config;

do $second_user_unread$
begin
  if (select count(*) from public.notifications) <> 1
     or (select count(*) from public.notifications where read_at is null) <> 1 then
    raise exception 'FAIL second user own/unread notification count';
  end if;
end
$second_user_unread$;

reset role;

do $final_owner_assertions$
declare v_config _commatch_notifications_it_config%rowtype;
begin
  select * into v_config from _commatch_notifications_it_config;
  if (select read_at from public.notifications where id = v_config.second_notification_id) is not null then
    raise exception 'FAIL cross-user read attempt changed the second notification';
  end if;
end
$final_owner_assertions$;

select 'PASS new-match notifications integration test; rolling back fixture writes' as test_result;
rollback;
