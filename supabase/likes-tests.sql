-- ComMatch SCR-007 likes integration test.
--
-- Run in the Supabase SQL Editor only after supabase/likes.sql. Replace the
-- two placeholders with distinct, disposable non-production Auth users that
-- have profiles and no existing favorite/like/match relation with each other.
-- Every fixture write is rolled back.

begin;

create temp table _commatch_likes_it_config (
  first_user_id uuid,
  second_user_id uuid
) on commit drop;

insert into _commatch_likes_it_config values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid
);

grant select on _commatch_likes_it_config to authenticated;

create function pg_temp._commatch_likes_set_user(p_user_id uuid)
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

grant execute on function pg_temp._commatch_likes_set_user(uuid) to anon, authenticated;

do $preflight$
declare
  v_config _commatch_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_likes_it_config;
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
  if exists (
    select 1 from public.favorites
    where (user_id, favorite_user_id) in ((v_config.first_user_id, v_config.second_user_id), (v_config.second_user_id, v_config.first_user_id))
  ) or exists (
    select 1 from public.likes
    where (user_id, liked_user_id) in ((v_config.first_user_id, v_config.second_user_id), (v_config.second_user_id, v_config.first_user_id))
  ) or exists (
    select 1 from public.matches
    where user_1_id = least(v_config.first_user_id, v_config.second_user_id)
      and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'Fixture members must not already have favorite, like, or match rows together';
  end if;
end
$preflight$;

-- Reciprocal interests remain interests only; no new match is permitted.
set local role authenticated;
select pg_temp._commatch_likes_set_user(first_user_id) from _commatch_likes_it_config;
insert into public.favorites (user_id, favorite_user_id)
select first_user_id, second_user_id from _commatch_likes_it_config;

set local role authenticated;
select pg_temp._commatch_likes_set_user(second_user_id) from _commatch_likes_it_config;
insert into public.favorites (user_id, favorite_user_id)
select second_user_id, first_user_id from _commatch_likes_it_config;

do $favorites_only$
declare v_config _commatch_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_likes_it_config;
  if exists (
    select 1 from public.matches
    where user_1_id = least(v_config.first_user_id, v_config.second_user_id)
      and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)
  ) then
    raise exception 'FAIL reciprocal favorites created a match';
  end if;
end
$favorites_only$;

set local role authenticated;
select pg_temp._commatch_likes_set_user(first_user_id) from _commatch_likes_it_config;
do $first_like$
declare v_status text;
begin
  select public.send_member_like(second_user_id) into v_status from _commatch_likes_it_config;
  if v_status <> 'liked' then raise exception 'FAIL first like status: %', v_status; end if;
  select public.send_member_like(second_user_id) into v_status from _commatch_likes_it_config;
  if v_status <> 'already_liked' then raise exception 'FAIL repeated like status: %', v_status; end if;
end
$first_like$;

set local role authenticated;
select pg_temp._commatch_likes_set_user(second_user_id) from _commatch_likes_it_config;
do $reciprocal_like$
declare v_status text;
begin
  select public.send_member_like(first_user_id) into v_status from _commatch_likes_it_config;
  if v_status <> 'matched' then raise exception 'FAIL reciprocal like status: %', v_status; end if;
end
$reciprocal_like$;

do $assertions$
declare v_config _commatch_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_likes_it_config;
  if (select count(*) from public.likes where (user_id, liked_user_id) in ((v_config.first_user_id, v_config.second_user_id), (v_config.second_user_id, v_config.first_user_id))) <> 2 then
    raise exception 'FAIL duplicate or missing likes';
  end if;
  if (select count(*) from public.matches where user_1_id = least(v_config.first_user_id, v_config.second_user_id) and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)) <> 1 then
    raise exception 'FAIL reciprocal likes did not create exactly one match';
  end if;
end
$assertions$;

-- Deleting an interest removes only that interest. The match remains intact.
set local role authenticated;
select pg_temp._commatch_likes_set_user(first_user_id) from _commatch_likes_it_config;
delete from public.favorites
where user_id = (select first_user_id from _commatch_likes_it_config)
  and favorite_user_id = (select second_user_id from _commatch_likes_it_config);

do $delete_assertion$
declare v_config _commatch_likes_it_config%rowtype;
begin
  select * into v_config from _commatch_likes_it_config;
  if exists (select 1 from public.favorites where user_id = v_config.first_user_id and favorite_user_id = v_config.second_user_id) then
    raise exception 'FAIL favorite was not deleted';
  end if;
  if not exists (select 1 from public.matches where user_1_id = least(v_config.first_user_id, v_config.second_user_id) and user_2_id = greatest(v_config.first_user_id, v_config.second_user_id)) then
    raise exception 'FAIL favorite deletion removed the match';
  end if;
end
$delete_assertion$;

select 'PASS SCR-007 favorites/likes integration test; rolling back fixture writes' as test_result;
rollback;
