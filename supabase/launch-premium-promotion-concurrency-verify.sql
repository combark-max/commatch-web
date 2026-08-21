-- Run after both concurrency sessions complete.

do $verify$
declare
  v_user_id uuid := (
    select user_id from public._commatch_launch_premium_concurrency
  );
begin
  if (
    select pg_catalog.count(*)
    from public.premium_memberships
    where user_id = v_user_id
  ) <> 1 then
    raise exception 'FAIL concurrency test did not finish with exactly one membership';
  end if;

  if not exists (
    select 1
    from public.premium_memberships
    where user_id = v_user_id
      and grant_source = 'launch_promotion'
      and status = 'active'
      and expires_at = '2027-01-01 00:00:00+09'::timestamptz
  ) then
    raise exception 'FAIL concurrency membership differs from the launch contract';
  end if;
end
$verify$;

select 'PASS launch Premium concurrency verification' as test_result;
