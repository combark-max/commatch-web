-- ComMatch received-likes reciprocal-like concurrency setup.
--
-- Replace both placeholders with distinct disposable members that have
-- profiles. Run this once before opening the two session scripts.

begin;

do $stale_fixture_guard$
begin
  if pg_catalog.to_regclass('public._commatch_received_likes_concurrency') is not null then
    raise exception 'Concurrency fixture already exists; run received-likes-concurrency-cleanup.sql first';
  end if;
end
$stale_fixture_guard$;

create table public._commatch_received_likes_concurrency (
  singleton boolean primary key default true check (singleton),
  first_user_id uuid not null,
  second_user_id uuid not null,
  constraint _commatch_received_likes_concurrency_distinct_check
    check (first_user_id <> second_user_id)
);

insert into public._commatch_received_likes_concurrency (
  first_user_id,
  second_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid
);

do $fixture_validation$
declare
  v_fixture public._commatch_received_likes_concurrency%rowtype;
begin
  select * into v_fixture from public._commatch_received_likes_concurrency;

  if v_fixture.first_user_id is null or v_fixture.second_user_id is null then
    raise exception 'Replace both PASTE_* values with disposable member IDs';
  end if;

  if (select pg_catalog.count(*)
      from auth.users
      where id in (v_fixture.first_user_id, v_fixture.second_user_id)) <> 2
     or (select pg_catalog.count(*)
         from public.profiles
         where id in (v_fixture.first_user_id, v_fixture.second_user_id)) <> 2 then
    raise exception 'Both fixture IDs must identify Auth users with profiles';
  end if;

  if pg_catalog.to_regprocedure('public.send_member_like_with_match(uuid)') is null then
    raise exception 'Apply the current notification/like production SQL first';
  end if;

  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id in (v_fixture.first_user_id, v_fixture.second_user_id)
      and (
        restriction.profile_visibility = 'hidden'
        or (
          restriction.account_status <> 'active'
          and (
            restriction.suspended_until is null
            or restriction.suspended_until > pg_catalog.now()
          )
        )
      )
  ) then
    raise exception 'Both disposable members must currently be visible and service-eligible';
  end if;
end
$fixture_validation$;

-- These must be disposable users. Cleanup any prior pair state so the test has
-- deterministic liked -> matched results.
delete from public.matches as match_row
using public._commatch_received_likes_concurrency as fixture
where match_row.user_1_id = least(fixture.first_user_id, fixture.second_user_id)
  and match_row.user_2_id = greatest(fixture.first_user_id, fixture.second_user_id);

delete from public.likes as like_row
using public._commatch_received_likes_concurrency as fixture
where (like_row.user_id = fixture.first_user_id
       and like_row.liked_user_id = fixture.second_user_id)
   or (like_row.user_id = fixture.second_user_id
       and like_row.liked_user_id = fixture.first_user_id);

grant select on public._commatch_received_likes_concurrency to authenticated;

commit;

select 'PASS received likes concurrency fixture setup' as test_result;
