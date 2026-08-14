-- SESSION B: run while SESSION A is sleeping. This call should wait for A,
-- then create exactly one match after the reciprocal like becomes visible.

begin;
set local role authenticated;

select pg_catalog.set_config('request.jwt.claim.sub', second_user_id::text, true),
       pg_catalog.set_config(
         'request.jwt.claims',
         pg_catalog.jsonb_build_object(
           'sub', second_user_id::text,
           'role', 'authenticated'
         )::text,
         true
       )
from public._commatch_received_likes_concurrency;

do $session_b_like$
declare
  v_fixture public._commatch_received_likes_concurrency%rowtype;
  v_result record;
begin
  select * into v_fixture from public._commatch_received_likes_concurrency;
  select * into v_result
  from public.send_member_like_with_match(v_fixture.first_user_id);

  if v_result.like_result <> 'matched' or v_result.match_id is null then
    raise exception 'FAIL SESSION B expected matched with a match id, got % / %',
      v_result.like_result, v_result.match_id;
  end if;
end
$session_b_like$;

commit;

select 'PASS received likes concurrency SESSION B' as test_result;
