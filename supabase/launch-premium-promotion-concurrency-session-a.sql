-- SESSION A: run first, then start SESSION B during the 10-second sleep.

begin;

do $session_a_grant$
declare
  v_user_id uuid := (
    select user_id from public._commatch_launch_premium_concurrency
  );
begin
  if not public.grant_launch_premium_membership(v_user_id, pg_catalog.now()) then
    raise exception 'FAIL SESSION A expected to create the membership';
  end if;
end
$session_a_grant$;

-- Hold the uncommitted user_id unique index entry while SESSION B attempts the
-- same internal primitive, modeling profile-trigger/backfill overlap.
select pg_catalog.pg_sleep(10);

commit;

select 'PASS launch Premium concurrency SESSION A' as test_result;
