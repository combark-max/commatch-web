-- ComMatch unmatched sent-like cancellation rollback-safe integration test.
--
-- Apply supabase/cancel-member-like.sql first. Replace the three placeholders
-- with distinct disposable Auth users that have profiles. Every fixture write
-- is rolled back. The optional cross-session race described at the end must be
-- run manually because one SQL Editor transaction cannot create concurrency.

begin;

create temp table _commatch_cancel_like_it_config (
  first_user_id uuid,
  second_user_id uuid,
  third_user_id uuid,
  unrelated_match_id uuid,
  unrelated_message_id uuid,
  tested_match_id uuid
) on commit drop;

insert into _commatch_cancel_like_it_config (
  first_user_id,
  second_user_id,
  third_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_THIRD_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'THIRD_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_cancel_like_it_config to anon, authenticated;

create function pg_temp._commatch_cancel_like_set_user(p_user_id uuid)
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

create function pg_temp._commatch_cancel_like_expect_42501(
  p_label text,
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
    when sqlstate '42501' then null;
  end;
end
$function$;

grant execute on function pg_temp._commatch_cancel_like_set_user(uuid)
  to anon, authenticated;
grant execute on function pg_temp._commatch_cancel_like_expect_42501(text, text)
  to anon, authenticated;

do $preflight$
declare
  v_config _commatch_cancel_like_it_config%rowtype;
  v_ids uuid[];
  v_function_oid oid := pg_catalog.to_regprocedure('public.cancel_member_like(uuid)');
begin
  select * into v_config from _commatch_cancel_like_it_config;
  v_ids := array[v_config.first_user_id, v_config.second_user_id, v_config.third_user_id];

  if pg_catalog.array_position(v_ids, null) is not null
     or pg_catalog.cardinality(v_ids) <> (
       select pg_catalog.count(distinct fixture.user_id)
       from pg_catalog.unnest(v_ids) as fixture(user_id)
     ) then
    raise exception 'Replace all PASTE_* values with three distinct disposable member IDs';
  end if;

  if (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 3
     or (select pg_catalog.count(*) from public.profiles where id = any(v_ids)) <> 3 then
    raise exception 'All fixture IDs must identify Auth users with profiles';
  end if;

  if v_function_oid is null
     or pg_catalog.to_regprocedure('public.send_member_like_with_match(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_received_likes()') is null
     or pg_catalog.to_regprocedure('public.get_received_favorites()') is null
     or pg_catalog.to_regprocedure('public.send_match_message(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.end_match(uuid)') is null then
    raise exception 'Apply current likes, notifications, received-list, matching, and cancellation SQL first';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'cancel_member_like'
  ) <> 1 then
    raise exception 'cancel_member_like must have exactly one non-spoofable signature';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    where function_info.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and function_info.pronargs = 1
      and function_info.proargtypes = '2950'::pg_catalog.oidvector
      and function_info.prorettype = 'pg_catalog.text'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'cancel_member_like metadata differs from the approved contract';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'cancel_member_like EXECUTE ACL differs from the approved contract';
  end if;

  if pg_catalog.has_table_privilege('public', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.likes', 'DELETE')
     or exists (
       select 1 from pg_catalog.pg_policy as policy_info
       where policy_info.polrelid = 'public.likes'::pg_catalog.regclass
         and policy_info.polcmd = 'd'
     ) then
    raise exception 'Direct likes DELETE is still exposed';
  end if;
end
$preflight$;

-- Normalize only disposable fixture state. The outer rollback restores it.
delete from public.matches as match_row
where match_row.user_1_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
)
   or match_row.user_2_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
);

delete from public.likes as like_row
where like_row.user_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
)
   or like_row.liked_user_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
);

delete from public.favorites as favorite_row
where favorite_row.user_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
)
   or favorite_row.favorite_user_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
);

delete from public.member_restrictions
where user_id in (
  select first_user_id from _commatch_cancel_like_it_config
  union all select second_user_id from _commatch_cancel_like_it_config
  union all select third_user_id from _commatch_cancel_like_it_config
);

delete from public.premium_memberships
where user_id = (select second_user_id from _commatch_cancel_like_it_config);

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys,
  granted_reason, status_reason
)
select second_user_id, 'active', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day',
  array['likes_received', 'received_likes']::text[],
  'cancel like integration test', 'cancel like integration test'
from _commatch_cancel_like_it_config;

-- Anonymous callers cannot execute the cancellation RPC.
set local role anon;
select pg_temp._commatch_cancel_like_set_user(null);
select pg_temp._commatch_cancel_like_expect_42501(
  'anonymous cancellation RPC',
  'select public.cancel_member_like(null::uuid)'
);
reset role;

-- Keep one received favorite independent from likes.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
insert into public.favorites (user_id, favorite_user_id)
select first_user_id, second_user_id from _commatch_cancel_like_it_config;

do $invalid_targets$
declare v_user_id uuid;
begin
  select first_user_id into v_user_id from _commatch_cancel_like_it_config;

  begin
    perform public.cancel_member_like(null);
    raise exception 'FAIL null target unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.cancel_member_like(v_user_id);
    raise exception 'FAIL self target unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;
end
$invalid_targets$;

-- A likes B. The duplicate call verifies the existing send regression.
do $first_send$
declare
  v_config _commatch_cancel_like_it_config%rowtype;
  v_result record;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  select * into v_result
  from public.send_member_like_with_match(v_config.second_user_id);
  if v_result.like_result <> 'liked' or v_result.match_id is not null then
    raise exception 'FAIL existing liked result';
  end if;

  select * into v_result
  from public.send_member_like_with_match(v_config.second_user_id);
  if v_result.like_result <> 'already_liked' or v_result.match_id is not null then
    raise exception 'FAIL existing already_liked result';
  end if;
end
$first_send$;
reset role;

-- Build an unrelated B/C match with a message and its two notifications.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(third_user_id)
from _commatch_cancel_like_it_config;
select * from public.send_member_like_with_match(
  (select second_user_id from _commatch_cancel_like_it_config)
);

select pg_temp._commatch_cancel_like_set_user(second_user_id)
from _commatch_cancel_like_it_config;
do $unrelated_match$
declare
  v_config _commatch_cancel_like_it_config%rowtype;
  v_result record;
  v_message_id uuid;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  select * into v_result
  from public.send_member_like_with_match(v_config.third_user_id);
  if v_result.like_result <> 'matched' or v_result.match_id is null then
    raise exception 'FAIL unrelated match setup';
  end if;

  select public.send_match_message(v_result.match_id, 'cancel-like unrelated lifecycle')
  into v_message_id;
  update _commatch_cancel_like_it_config
  set unrelated_match_id = v_result.match_id,
      unrelated_message_id = v_message_id;
end
$unrelated_match$;

-- Before cancellation, Premium B sees both incoming likes.
do $received_before_cancel$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if (select pg_catalog.count(*) from public.get_received_likes()) <> 2
     or not exists (
       select 1 from public.get_received_likes()
       where sender_user_id = v_config.first_user_id
     ) then
    raise exception 'FAIL received likes setup before cancellation';
  end if;
end
$received_before_cancel$;
reset role;

-- A cancels only A -> B. A cannot spoof C as a sender by targeting B.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
do $cancel_unmatched$
declare
  v_config _commatch_cancel_like_it_config%rowtype;
  v_result text;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  v_result := public.cancel_member_like(v_config.second_user_id);
  if v_result <> 'cancelled' then
    raise exception 'FAIL unmatched cancellation result: %', v_result;
  end if;

  if exists (
    select 1 from public.likes
    where user_id = v_config.first_user_id
      and liked_user_id = v_config.second_user_id
  ) then
    raise exception 'FAIL unmatched sent like remains';
  end if;

  v_result := public.cancel_member_like(v_config.second_user_id);
  if v_result <> 'not_liked' then
    raise exception 'FAIL duplicate cancellation result: %', v_result;
  end if;

  v_result := public.cancel_member_like(v_config.third_user_id);
  if v_result <> 'not_liked' then
    raise exception 'FAIL non-owned sender isolation result: %', v_result;
  end if;
end
$cancel_unmatched$;

-- Direct DELETE is denied even for the caller's own logical row.
select pg_temp._commatch_cancel_like_expect_42501(
  'authenticated direct likes DELETE',
  pg_catalog.format(
    'delete from public.likes where user_id=%L and liked_user_id=%L',
    (select first_user_id from _commatch_cancel_like_it_config),
    (select second_user_id from _commatch_cancel_like_it_config)
  )
);
reset role;

do $unrelated_lifecycle_unchanged$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if not exists (
    select 1 from public.likes
    where user_id = v_config.third_user_id
      and liked_user_id = v_config.second_user_id
  )
     or (select pg_catalog.count(*) from public.matches
         where id = v_config.unrelated_match_id) <> 1
     or (select pg_catalog.count(*) from public.messages
         where id = v_config.unrelated_message_id) <> 1
     or (select pg_catalog.count(*) from public.notifications
         where match_id = v_config.unrelated_match_id and type = 'new_match') <> 2 then
    raise exception 'FAIL cancellation changed another like, match, message, or notification';
  end if;
end
$unrelated_lifecycle_unchanged$;

-- B's next Premium reads drop only A's like and retain A's received favorite.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(second_user_id)
from _commatch_cancel_like_it_config;
do $received_after_cancel$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if exists (
    select 1 from public.get_received_likes()
    where sender_user_id = v_config.first_user_id
  )
     or not exists (
       select 1 from public.get_received_likes()
       where sender_user_id = v_config.third_user_id
     )
     or not exists (
       select 1 from public.get_received_favorites()
       where sender_user_id = v_config.first_user_id
     ) then
    raise exception 'FAIL received likes or received favorites after cancellation';
  end if;
end
$received_after_cancel$;
reset role;

-- A can cancel while the target is hidden; target state is not revalidated.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select * from public.send_member_like_with_match(
  (select second_user_id from _commatch_cancel_like_it_config)
);
reset role;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, reason, admin_note
)
select second_user_id, 'active', 'hidden', 'hidden target cancellation test', 'rollback fixture'
from _commatch_cancel_like_it_config;

set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
do $hidden_target$
declare v_target uuid;
begin
  select second_user_id into v_target from _commatch_cancel_like_it_config;
  if public.cancel_member_like(v_target) <> 'cancelled' then
    raise exception 'FAIL hidden target blocked cancellation';
  end if;
end
$hidden_target$;
reset role;

delete from public.member_restrictions
where user_id = (select second_user_id from _commatch_cancel_like_it_config);

-- A can also cancel while the target is currently suspended.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select * from public.send_member_like_with_match(
  (select second_user_id from _commatch_cancel_like_it_config)
);
reset role;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until,
  reason, admin_note
)
select second_user_id, 'suspended', 'visible', pg_catalog.now(),
  pg_catalog.now() + interval '1 hour', 'suspended target cancellation test',
  'rollback fixture'
from _commatch_cancel_like_it_config;

set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
do $suspended_target$
declare v_target uuid;
begin
  select second_user_id into v_target from _commatch_cancel_like_it_config;
  if public.cancel_member_like(v_target) <> 'cancelled' then
    raise exception 'FAIL suspended target blocked cancellation';
  end if;
end
$suspended_target$;
reset role;

delete from public.member_restrictions
where user_id = (select second_user_id from _commatch_cancel_like_it_config);

-- A suspended caller cannot cancel, and the row remains until access returns.
set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select * from public.send_member_like_with_match(
  (select second_user_id from _commatch_cancel_like_it_config)
);
reset role;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until,
  reason, admin_note
)
select first_user_id, 'suspended', 'visible', pg_catalog.now(),
  pg_catalog.now() + interval '1 hour', 'suspended caller cancellation test',
  'rollback fixture'
from _commatch_cancel_like_it_config;

set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select pg_temp._commatch_cancel_like_expect_42501(
  'suspended caller cancellation',
  pg_catalog.format(
    'select public.cancel_member_like(%L)',
    (select second_user_id from _commatch_cancel_like_it_config)
  )
);
reset role;

do $suspended_caller_row_preserved$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if not exists (
    select 1 from public.likes
    where user_id = v_config.first_user_id
      and liked_user_id = v_config.second_user_id
  ) then
    raise exception 'FAIL suspended caller cancellation removed the like';
  end if;
end
$suspended_caller_row_preserved$;

delete from public.member_restrictions
where user_id = (select first_user_id from _commatch_cancel_like_it_config);

set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select public.cancel_member_like(
  (select second_user_id from _commatch_cancel_like_it_config)
);

-- Recreate A -> B, then B -> A creates the protected active match.
do $active_match_first_like$
declare v_target uuid; v_result record;
begin
  select second_user_id into v_target from _commatch_cancel_like_it_config;
  select * into v_result from public.send_member_like_with_match(v_target);
  if v_result.like_result <> 'liked' or v_result.match_id is not null then
    raise exception 'FAIL active match first like setup';
  end if;
end
$active_match_first_like$;

select pg_temp._commatch_cancel_like_set_user(second_user_id)
from _commatch_cancel_like_it_config;
do $active_match_second_like$
declare v_config _commatch_cancel_like_it_config%rowtype; v_result record;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  select * into v_result
  from public.send_member_like_with_match(v_config.first_user_id);
  if v_result.like_result <> 'matched' or v_result.match_id is null then
    raise exception 'FAIL existing matched result';
  end if;
  update _commatch_cancel_like_it_config set tested_match_id = v_result.match_id;

  select * into v_result
  from public.send_member_like_with_match(v_config.first_user_id);
  if v_result.like_result <> 'already_matched'
     or v_result.match_id is distinct from (
       select tested_match_id from _commatch_cancel_like_it_config
     ) then
    raise exception 'FAIL existing already_matched result';
  end if;
end
$active_match_second_like$;

select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
do $active_match_protected$
declare v_config _commatch_cancel_like_it_config%rowtype; v_result text;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  v_result := public.cancel_member_like(v_config.second_user_id);
  if v_result <> 'already_matched' then
    raise exception 'FAIL active match cancellation result: %', v_result;
  end if;
end
$active_match_protected$;
reset role;

do $active_match_history$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if (select pg_catalog.count(*) from public.likes
      where (user_id, liked_user_id) in (
        (v_config.first_user_id, v_config.second_user_id),
        (v_config.second_user_id, v_config.first_user_id)
      )) <> 2
     or (select pg_catalog.count(*) from public.matches
         where id = v_config.tested_match_id and status = 'active') <> 1
     or (select pg_catalog.count(*) from public.notifications
         where match_id = v_config.tested_match_id and type = 'new_match') <> 2 then
    raise exception 'FAIL active match history changed';
  end if;
end
$active_match_history$;

set local role authenticated;
select pg_temp._commatch_cancel_like_set_user(first_user_id)
from _commatch_cancel_like_it_config;
select public.end_match(tested_match_id)
from _commatch_cancel_like_it_config;

do $ended_match_protected$
declare v_config _commatch_cancel_like_it_config%rowtype; v_result text;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  v_result := public.cancel_member_like(v_config.second_user_id);
  if v_result <> 'already_matched' then
    raise exception 'FAIL ended match cancellation result: %', v_result;
  end if;
end
$ended_match_protected$;
reset role;

do $ended_match_history$
declare v_config _commatch_cancel_like_it_config%rowtype;
begin
  select * into v_config from _commatch_cancel_like_it_config;
  if (select pg_catalog.count(*) from public.likes
      where (user_id, liked_user_id) in (
        (v_config.first_user_id, v_config.second_user_id),
        (v_config.second_user_id, v_config.first_user_id)
      )) <> 2
     or (select pg_catalog.count(*) from public.matches
         where id = v_config.tested_match_id and status = 'ended') <> 1
     or (select pg_catalog.count(*) from public.notifications
         where match_id = v_config.tested_match_id and type = 'new_match') <> 2 then
    raise exception 'FAIL ended match history changed';
  end if;
end
$ended_match_history$;

select 'PASS cancel_member_like rollback-safe integration test; rolling back every fixture and data change' as test_result;
rollback;

-- Manual concurrency verification (two SQL Editor sessions, fresh unmatched
-- fixture pair): Session A calls cancel_member_like(B) while Session B calls
-- send_member_like_with_match(A). Both functions take the same pair lock.
-- Expected serialized outcomes are exactly one of:
--   1. cancellation wins: A -> B is removed; B -> A returns liked; no match.
--   2. reciprocal send wins: one match is created; cancellation returns
--      already_matched; both likes, the match, and two notifications remain.

-- When the manual concurrency fixture exists, this block verifies either
-- allowed outcome. A normal rollback-safe integration run has no such fixture
-- and skips this optional verification without changing its result.
do $verify_cancel_send_concurrency$
declare
  v_first_user_id uuid;
  v_second_user_id uuid;
  v_session_a_result text;
  v_session_b_result text;
  v_session_b_match_id uuid;
  v_a_to_b_count bigint;
  v_b_to_a_count bigint;
  v_match_count bigint;
  v_match_id uuid;
  v_match_status text;
  v_notification_count bigint;
begin
  if pg_catalog.to_regclass(
    'public._commatch_cancel_like_concurrency'
  ) is null then
    raise notice 'SKIP optional cancel/send concurrency VERIFY: fixture is not installed';
    return;
  end if;

  execute $query$
    select
      first_user_id,
      second_user_id,
      session_a_result,
      session_b_result,
      session_b_match_id
    from public._commatch_cancel_like_concurrency
  $query$
  into
    v_first_user_id,
    v_second_user_id,
    v_session_a_result,
    v_session_b_result,
    v_session_b_match_id;

  if v_session_a_result is null or v_session_b_result is null then
    raise exception 'VERIFY FAIL: both concurrency sessions must complete first';
  end if;

  select pg_catalog.count(*)
  into v_a_to_b_count
  from public.likes as like_row
  where like_row.user_id = v_first_user_id
    and like_row.liked_user_id = v_second_user_id;

  select pg_catalog.count(*)
  into v_b_to_a_count
  from public.likes as like_row
  where like_row.user_id = v_second_user_id
    and like_row.liked_user_id = v_first_user_id;

  select pg_catalog.count(*)
  into v_match_count
  from public.matches as match_row
  where match_row.user_1_id = least(v_first_user_id, v_second_user_id)
    and match_row.user_2_id = greatest(v_first_user_id, v_second_user_id);

  if v_match_count = 1 then
    select match_row.id, match_row.status
    into v_match_id, v_match_status
    from public.matches as match_row
    where match_row.user_1_id = least(v_first_user_id, v_second_user_id)
      and match_row.user_2_id = greatest(v_first_user_id, v_second_user_id);
  elsif v_match_count > 1 then
    raise exception 'VERIFY FAIL: pair has % matches; expected at most one',
      v_match_count;
  end if;

  select pg_catalog.count(*)
  into v_notification_count
  from public.notifications as notification_row
  where notification_row.match_id = v_match_id
    and notification_row.type = 'new_match';

  if v_session_a_result = 'cancelled'
     and v_session_b_result = 'liked' then
    if v_a_to_b_count <> 0
       or v_b_to_a_count <> 1
       or v_match_count <> 0
       or v_match_id is not null
       or v_session_b_match_id is not null
       or v_notification_count <> 0 then
      raise exception
        'VERIFY FAIL cancel-wins: A->B=%, B->A=%, matches=%, match_id=%, B match_id=%, notifications=%',
        v_a_to_b_count,
        v_b_to_a_count,
        v_match_count,
        v_match_id,
        v_session_b_match_id,
        v_notification_count;
    end if;

    raise notice 'PASS: cancel acquired the pair lock first';
    return;
  end if;

  if v_session_a_result = 'already_matched'
     and v_session_b_result = 'matched' then
    if v_a_to_b_count <> 1
       or v_b_to_a_count <> 1
       or v_match_count <> 1
       or v_match_id is null
       or v_match_status <> 'active'
       or v_session_b_match_id is distinct from v_match_id
       or v_notification_count <> 2 then
      raise exception
        'VERIFY FAIL reciprocal-wins: A->B=%, B->A=%, matches=%, match_id=%, status=%, B match_id=%, notifications=%',
        v_a_to_b_count,
        v_b_to_a_count,
        v_match_count,
        v_match_id,
        v_match_status,
        v_session_b_match_id,
        v_notification_count;
    end if;

    raise notice 'PASS: reciprocal send acquired the pair lock first';
    return;
  end if;

  raise exception
    'VERIFY FAIL unexpected outcome: session_a=%, session_b=%, A->B=%, B->A=%, matches=%, match_id=%, status=%, notifications=%',
    v_session_a_result,
    v_session_b_result,
    v_a_to_b_count,
    v_b_to_a_count,
    v_match_count,
    v_match_id,
    v_match_status,
    v_notification_count;
end
$verify_cancel_send_concurrency$;
