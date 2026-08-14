-- SESSION A: run this first. Start SESSION B while this script is sleeping.

begin;
set local role authenticated;

select pg_catalog.set_config('request.jwt.claim.sub', first_user_id::text, true),
       pg_catalog.set_config(
         'request.jwt.claims',
         pg_catalog.jsonb_build_object(
           'sub', first_user_id::text,
           'role', 'authenticated'
         )::text,
         true
       )
from public._commatch_received_likes_concurrency;

do $session_a_like$
declare
  v_fixture public._commatch_received_likes_concurrency%rowtype;
  v_result record;
begin
  select * into v_fixture from public._commatch_received_likes_concurrency;
  select * into v_result
  from public.send_member_like_with_match(v_fixture.second_user_id);

  if v_result.like_result <> 'liked' or v_result.match_id is not null then
    raise exception 'FAIL SESSION A expected liked without a match, got % / %',
      v_result.like_result, v_result.match_id;
  end if;
end
$session_a_like$;

-- Keep the normalized pair advisory/transaction lock until SESSION B has
-- started and is waiting on the reciprocal write.
select pg_catalog.pg_sleep(10);

commit;

select 'PASS received likes concurrency SESSION A' as test_result;
