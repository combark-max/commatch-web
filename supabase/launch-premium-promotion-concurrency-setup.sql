-- ComMatch launch Premium backfill/profile-trigger concurrency setup.
-- Run only in a disposable or staging database, then open both session files.

begin;

do $stale_fixture_guard$
begin
  if pg_catalog.to_regclass('public._commatch_launch_premium_concurrency') is not null then
    raise exception 'Concurrency fixture already exists; run launch-premium-promotion-concurrency-cleanup.sql first';
  end if;
end
$stale_fixture_guard$;

create table public._commatch_launch_premium_concurrency (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique
);

insert into public._commatch_launch_premium_concurrency (user_id)
values (pg_catalog.gen_random_uuid());

do $auth_source_preflight$
begin
  if not exists (select 1 from auth.users) then
    raise exception 'At least one existing Auth user is required to source a disposable instance_id';
  end if;
end
$auth_source_preflight$;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email_confirmed_at,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  fixture.user_id,
  source.instance_id,
  'authenticated',
  'authenticated',
  null,
  null,
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
from public._commatch_launch_premium_concurrency as fixture
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user limit 1
) as source;

insert into public.profiles (id, nickname, gender, profile_images)
select user_id,
  '__launch_concurrency_' || pg_catalog.left(user_id::text, 8),
  '여성',
  array[]::text[]
from public._commatch_launch_premium_concurrency;

update auth.users as auth_user
set email_confirmed_at = pg_catalog.now(), updated_at = pg_catalog.now()
from public._commatch_launch_premium_concurrency as fixture
where auth_user.id = fixture.user_id;

do $fixture_validation$
begin
  if not exists (select 1 from public._commatch_launch_premium_concurrency)
     or exists (
       select 1
       from public.premium_memberships as membership
       join public._commatch_launch_premium_concurrency as fixture
         on fixture.user_id = membership.user_id
     ) then
    raise exception 'Launch Premium concurrency fixture is not eligible and empty';
  end if;
end
$fixture_validation$;

commit;

select 'PASS launch Premium concurrency fixture setup' as test_result;
