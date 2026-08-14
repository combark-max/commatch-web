-- Run after both concurrency sessions commit.

do $verify_concurrency_result$
declare
  v_fixture public._commatch_received_likes_concurrency%rowtype;
  v_match_id uuid;
begin
  select * into v_fixture from public._commatch_received_likes_concurrency;

  if (select pg_catalog.count(*)
      from public.likes as like_row
      where (like_row.user_id = v_fixture.first_user_id
             and like_row.liked_user_id = v_fixture.second_user_id)
         or (like_row.user_id = v_fixture.second_user_id
             and like_row.liked_user_id = v_fixture.first_user_id)) <> 2 then
    raise exception 'FAIL concurrency result must contain exactly two directional likes';
  end if;

  select match_row.id
  into v_match_id
  from public.matches as match_row
  where match_row.user_1_id = least(v_fixture.first_user_id, v_fixture.second_user_id)
    and match_row.user_2_id = greatest(v_fixture.first_user_id, v_fixture.second_user_id);

  if v_match_id is null
     or (select pg_catalog.count(*)
         from public.matches as match_row
         where match_row.user_1_id = least(v_fixture.first_user_id, v_fixture.second_user_id)
           and match_row.user_2_id = greatest(v_fixture.first_user_id, v_fixture.second_user_id)) <> 1 then
    raise exception 'FAIL concurrency result must contain exactly one match';
  end if;

  if (select pg_catalog.count(*)
      from public.notifications as notification_row
      where notification_row.match_id = v_match_id
        and notification_row.type = 'new_match') <> 2 then
    raise exception 'FAIL concurrency result must contain exactly two new_match notifications';
  end if;
end
$verify_concurrency_result$;

select 'PASS received likes concurrency: likes=2, matches=1, new_match notifications=2'
  as test_result;
