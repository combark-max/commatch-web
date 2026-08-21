-- SESSION B: run while SESSION A is sleeping. It should wait, then no-op.

begin;

do $session_b_grant$
declare
  v_user_id uuid := (
    select user_id from public._commatch_launch_premium_concurrency
  );
begin
  if public.grant_launch_premium_membership(v_user_id, pg_catalog.now()) then
    raise exception 'FAIL SESSION B created a duplicate membership';
  end if;
end
$session_b_grant$;

commit;

select 'PASS launch Premium concurrency SESSION B' as test_result;
