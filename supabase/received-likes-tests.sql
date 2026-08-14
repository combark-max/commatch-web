-- ComMatch Premium received likes rollback-safe integration test.
--
-- Apply the production SQL in the documented order, then replace the three
-- placeholders with distinct disposable Auth users that have profiles.

begin;

create temp table _commatch_received_likes_it_config (
  first_user_id uuid,
  second_user_id uuid,
  third_user_id uuid,
  match_id uuid
) on commit drop;

insert into _commatch_received_likes_it_config (
  first_user_id,
  second_user_id,
  third_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_THIRD_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'THIRD_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_received_likes_it_config to anon, authenticated;

create function pg_temp._commatch_received_likes_set_user(p_user_id uuid)
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

create function pg_temp._commatch_received_likes_expect_42501(
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

grant execute on function pg_temp._commatch_received_likes_set_user(uuid)
  to anon, authenticated;
grant execute on function pg_temp._commatch_received_likes_expect_42501(text, text)
  to anon, authenticated;

do $preflight$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_received_likes_it_config;
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

  if pg_catalog.to_regprocedure('public.get_received_likes()') is null
     or pg_catalog.to_regprocedure('public.send_member_like_with_match(uuid)') is null then
    raise exception 'Apply received-likes and notification production SQL first';
  end if;

  if pg_catalog.has_function_privilege(
       'public', 'public.get_received_likes()'::pg_catalog.regprocedure, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.get_received_likes()'::pg_catalog.regprocedure, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.get_received_likes()'::pg_catalog.regprocedure, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.get_received_likes()'::pg_catalog.regprocedure, 'EXECUTE'
     ) then
    raise exception 'get_received_likes EXECUTE ACL differs from the approved contract';
  end if;
end
$preflight$;

-- Normalize only disposable fixture state. The outer rollback restores it.
delete from public.matches as match_row
where match_row.user_1_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
)
   or match_row.user_2_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
);

delete from public.likes as like_row
where like_row.user_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
)
   or like_row.liked_user_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
);

delete from public.favorites as favorite_row
where favorite_row.user_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
)
   or favorite_row.favorite_user_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
);

delete from public.member_restrictions as restriction
where restriction.user_id in (
  select first_user_id from _commatch_received_likes_it_config
  union all select second_user_id from _commatch_received_likes_it_config
  union all select third_user_id from _commatch_received_likes_it_config
);

delete from public.premium_memberships as membership
where membership.user_id in (
  select second_user_id from _commatch_received_likes_it_config
  union all
  select third_user_id from _commatch_received_likes_it_config
);

insert into public.premium_memberships (
  user_id,
  status,
  started_at,
  expires_at,
  feature_keys,
  granted_reason,
  status_reason
)
select member.user_id, 'active', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day', array['received_likes']::text[],
  'received likes integration test', 'received likes integration test'
from (
  select second_user_id as user_id from _commatch_received_likes_it_config
  union all
  select third_user_id from _commatch_received_likes_it_config
) as member;

-- Anonymous callers cannot execute the RPC.
set local role anon;
select pg_temp._commatch_received_likes_set_user(null);
select pg_temp._commatch_received_likes_expect_42501(
  'anonymous received likes RPC',
  'select * from public.get_received_likes()'
);
reset role;

-- A likes B. A duplicate request remains idempotent.
set local role authenticated;
select pg_temp._commatch_received_likes_set_user(first_user_id)
from _commatch_received_likes_it_config;
do $first_like$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_result record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  select * into v_result
  from public.send_member_like_with_match(v_config.second_user_id);
  if v_result.like_result <> 'liked' or v_result.match_id is not null then
    raise exception 'FAIL first like result';
  end if;

  select * into v_result
  from public.send_member_like_with_match(v_config.second_user_id);
  if v_result.like_result <> 'already_liked' or v_result.match_id is not null then
    raise exception 'FAIL duplicate like idempotency';
  end if;
end
$first_like$;

-- Sender can still directly SELECT their sent like.
do $sent_like_select$
declare v_config _commatch_received_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_received_likes_it_config;
  if (select pg_catalog.count(*) from public.likes
      where user_id = v_config.first_user_id
        and liked_user_id = v_config.second_user_id) <> 1 then
    raise exception 'FAIL sender cannot directly SELECT their sent like';
  end if;
end
$sent_like_select$;

-- B cannot directly SELECT the received row, but can use the Premium RPC.
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $received_lookup$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  if exists (
    select 1 from public.likes
    where user_id = v_config.first_user_id
      and liked_user_id = v_config.second_user_id
  ) then
    raise exception 'FAIL receiver bypassed Premium through direct likes SELECT';
  end if;

  select * into v_row from public.get_received_likes();
  if v_row.like_id is null
     or v_row.sender_user_id <> v_config.first_user_id
     or v_row.liked_at is null
     or v_row.has_liked
     or v_row.is_mutual_like
     or v_row.match_id is not null
     or v_row.match_status is not null
     or v_row.matched_at is not null then
    raise exception 'FAIL B received-like row before mutual like';
  end if;
end
$received_lookup$;

-- The existing favorites RPC keeps its response contract but must not expose
-- received-like state through its unused liked_by_member field.
insert into public.favorites (user_id, favorite_user_id)
select second_user_id, first_user_id
from _commatch_received_likes_it_config;

do $legacy_favorites_rpc_no_received_like_leak$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  select * into v_row
  from public.get_my_favorite_members_with_likes()
  where member_id = v_config.first_user_id;

  if v_row.member_id is null or v_row.liked_by_member then
    raise exception 'FAIL legacy favorites RPC leaked received-like state';
  end if;
end
$legacy_favorites_rpc_no_received_like_leak$;

-- C has the same entitlement but no received like from A. This also proves the
-- receiver cannot be supplied or spoofed as an RPC argument.
select pg_temp._commatch_received_likes_set_user(third_user_id)
from _commatch_received_likes_it_config;
do $third_user_isolation$
declare v_config _commatch_received_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_received_likes_it_config;
  if exists (
    select 1 from public.get_received_likes()
    where sender_user_id = v_config.first_user_id
  ) then
    raise exception 'FAIL received likes leaked across receiver identities';
  end if;
  if pg_catalog.pg_get_function_identity_arguments(
       'public.get_received_likes()'::pg_catalog.regprocedure
     ) <> '' then
    raise exception 'FAIL get_received_likes unexpectedly accepts a spoofable argument';
  end if;
end
$third_user_isolation$;
reset role;

-- Premium membership states are enforced by the RPC.
delete from public.premium_memberships
where user_id = (select second_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'missing Premium membership',
  'select * from public.get_received_likes()'
);
reset role;

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys
)
select second_user_id, 'active', pg_catalog.now() + interval '1 hour',
  pg_catalog.now() + interval '2 hours', array['received_likes']::text[]
from _commatch_received_likes_it_config;

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'not-started Premium membership',
  'select * from public.get_received_likes()'
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() - interval '2 hours',
    expires_at = pg_catalog.now() - interval '1 hour'
where user_id = (select second_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'expired Premium membership',
  'select * from public.get_received_likes()'
);
reset role;

update public.premium_memberships
set status = 'suspended',
    started_at = pg_catalog.now() - interval '1 hour',
    expires_at = pg_catalog.now() + interval '1 hour'
where user_id = (select second_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'suspended Premium membership',
  'select * from public.get_received_likes()'
);
reset role;

update public.premium_memberships
set status = 'revoked'
where user_id = (select second_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'revoked Premium membership',
  'select * from public.get_received_likes()'
);
reset role;

update public.premium_memberships
set status = 'active'
where user_id = (select second_user_id from _commatch_received_likes_it_config);

-- A hidden or currently suspended sender is excluded. An elapsed suspension is
-- visible again without mutating the stored administrative state.
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until,
  reason, admin_note
)
select first_user_id, 'active', 'hidden', null, null,
  'received likes hidden sender test', 'rollback fixture'
from _commatch_received_likes_it_config;

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $hidden_sender$
begin
  if exists (select 1 from public.get_received_likes()) then
    raise exception 'FAIL hidden sender was returned';
  end if;
end
$hidden_sender$;
reset role;

update public.member_restrictions
set account_status = 'suspended',
    profile_visibility = 'visible',
    suspended_at = pg_catalog.now() - interval '1 hour',
    suspended_until = pg_catalog.now() + interval '1 hour'
where user_id = (select first_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $suspended_sender$
begin
  if exists (select 1 from public.get_received_likes()) then
    raise exception 'FAIL currently suspended sender was returned';
  end if;
end
$suspended_sender$;
reset role;

update public.member_restrictions
set suspended_at = pg_catalog.now() - interval '2 hours',
    suspended_until = pg_catalog.now() - interval '1 hour'
where user_id = (select first_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $elapsed_sender_suspension$
begin
  if (select pg_catalog.count(*) from public.get_received_likes()) <> 1 then
    raise exception 'FAIL elapsed sender suspension did not restore visibility';
  end if;
end
$elapsed_sender_suspension$;
reset role;

delete from public.member_restrictions
where user_id = (select first_user_id from _commatch_received_likes_it_config);

-- The requesting member's current service suspension is enforced before the
-- Premium lookup.
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until,
  reason, admin_note
)
select second_user_id, 'suspended', 'visible', pg_catalog.now(),
  pg_catalog.now() + interval '1 hour', 'requester suspension test',
  'rollback fixture'
from _commatch_received_likes_it_config;

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select pg_temp._commatch_received_likes_expect_42501(
  'requesting member service suspension',
  'select * from public.get_received_likes()'
);
reset role;

delete from public.member_restrictions
where user_id = (select second_user_id from _commatch_received_likes_it_config);

-- B likes A. The existing writer creates exactly one match and two atomic
-- notifications, and the received list reports the active match.
set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $mutual_like$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_result record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  select * into v_result
  from public.send_member_like_with_match(v_config.first_user_id);
  if v_result.like_result <> 'matched' or v_result.match_id is null then
    raise exception 'FAIL reciprocal like did not create a match';
  end if;
  update _commatch_received_likes_it_config set match_id = v_result.match_id;
end
$mutual_like$;

do $active_match_result$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  select * into v_row from public.get_received_likes();
  if not v_row.has_liked
     or not v_row.is_mutual_like
     or v_row.match_id is distinct from v_config.match_id
     or v_row.match_status <> 'active'
     or v_row.matched_at is null then
    raise exception 'FAIL active mutual match fields';
  end if;
end
$active_match_result$;
reset role;

do $match_notification_counts$
declare v_config _commatch_received_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_received_likes_it_config;
  if (select pg_catalog.count(*) from public.matches where id = v_config.match_id) <> 1
     or (select pg_catalog.count(*) from public.notifications
         where match_id = v_config.match_id and type = 'new_match') <> 2 then
    raise exception 'FAIL mutual like match or notification count';
  end if;
end
$match_notification_counts$;

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
select public.end_match(match_id)
from _commatch_received_likes_it_config;

do $ended_match_result$
declare
  v_config _commatch_received_likes_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_received_likes_it_config;
  select * into v_row from public.get_received_likes();
  if v_row.match_id is distinct from v_config.match_id
     or v_row.match_status <> 'ended' then
    raise exception 'FAIL ended match fields';
  end if;
end
$ended_match_result$;
reset role;

-- Profile deletion cascades the sender's likes and removes the row. A savepoint
-- restores the disposable profile before the outer integration rollback.
savepoint before_sender_profile_delete;
delete from public.profiles
where id = (select first_user_id from _commatch_received_likes_it_config);

set local role authenticated;
select pg_temp._commatch_received_likes_set_user(second_user_id)
from _commatch_received_likes_it_config;
do $deleted_sender$
begin
  if exists (select 1 from public.get_received_likes()) then
    raise exception 'FAIL deleted sender was returned';
  end if;
end
$deleted_sender$;
reset role;
rollback to savepoint before_sender_profile_delete;

select 'PASS received likes Premium integration test; rolling back every fixture and data change' as test_result;
rollback;
