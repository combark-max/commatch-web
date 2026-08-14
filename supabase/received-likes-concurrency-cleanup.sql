-- Run after verification. This permanently removes only the disposable pair's
-- test relationship rows and the test configuration table.

begin;

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

drop table public._commatch_received_likes_concurrency;

commit;

select 'PASS received likes concurrency fixture cleanup' as test_result;
