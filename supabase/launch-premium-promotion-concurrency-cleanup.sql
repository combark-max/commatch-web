-- Run after concurrency verification. This removes only the generated fixture.

begin;

delete from public.profiles as profile
using public._commatch_launch_premium_concurrency as fixture
where profile.id = fixture.user_id;

delete from auth.users as auth_user
using public._commatch_launch_premium_concurrency as fixture
where auth_user.id = fixture.user_id;

drop table public._commatch_launch_premium_concurrency;

commit;

select 'PASS launch Premium concurrency fixture cleanup' as test_result;
