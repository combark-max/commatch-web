-- ComMatch received likes production migration.
--
-- This updates already-installed databases. After it succeeds, apply the
-- current admin-premium-memberships.sql so the administrator update RPC uses
-- the four-key validation, then apply received-likes.sql.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regclass('public.premium_membership_actions') is null
     or pg_catalog.to_regclass('public.premium_membership_request_receipts') is null
     or pg_catalog.to_regprocedure('public.get_my_favorite_members_with_likes()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null then
    raise exception 'Required likes or Premium objects are missing';
  end if;
end
$preflight$;

drop policy if exists "Users can read own sent or received likes" on public.likes;
drop policy if exists "Users can read own sent likes" on public.likes;
create policy "Users can read own sent likes"
  on public.likes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Preserve the existing favorites RPC result shape, but stop its unused
-- liked_by_member field from leaking received-like state outside the new
-- Premium endpoint.
create or replace function public.get_my_favorite_members_with_likes()
returns table (
  favorite_id uuid,
  favorited_at timestamptz,
  member_id uuid,
  nickname text,
  age integer,
  profile_image_url text,
  region text,
  job text,
  is_mutual boolean,
  has_liked boolean,
  liked_by_member boolean,
  match_id uuid,
  match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select
    favorite_row.id,
    favorite_row.created_at,
    target_profile.id,
    target_profile.nickname,
    case when target_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, target_profile.birth_date))::integer end,
    coalesce(nullif(pg_catalog.btrim(target_profile.profile_image), ''), fallback_image.path),
    target_profile.region,
    target_profile.job,
    exists (
      select 1 from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = target_profile.id
        and reciprocal_favorite.favorite_user_id = v_user_id
    ),
    exists (
      select 1 from public.likes as sent_like
      where sent_like.user_id = v_user_id and sent_like.liked_user_id = target_profile.id
    ),
    false,
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.favorites as favorite_row
  join public.profiles as target_profile on target_profile.id = favorite_row.favorite_user_id
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(target_profile.profile_images) with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (match_row.user_1_id = v_user_id and match_row.user_2_id = target_profile.id)
       or (match_row.user_1_id = target_profile.id and match_row.user_2_id = v_user_id)
    order by (match_row.status = 'active') desc, match_row.matched_at desc, match_row.id
    limit 1
  ) as existing_match on true
  where favorite_row.user_id = v_user_id
    and public.is_member_profile_visible(target_profile.id)
  order by favorite_row.created_at desc, favorite_row.id;
end
$function$;

alter function public.get_my_favorite_members_with_likes() owner to postgres;
revoke all on function public.get_my_favorite_members_with_likes()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_favorite_members_with_likes()
  to authenticated, service_role;

alter table public.premium_memberships
  drop constraint if exists premium_memberships_feature_keys_check;
alter table public.premium_memberships
  add constraint premium_memberships_feature_keys_check
  check (
    pg_catalog.cardinality(feature_keys) between 1 and 4
    and pg_catalog.array_position(feature_keys, null) is null
    and feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations'
    ]::text[]
    and pg_catalog.cardinality(feature_keys) =
      (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
  );

alter table public.premium_membership_actions
  drop constraint if exists premium_membership_actions_previous_feature_keys_check;
alter table public.premium_membership_actions
  add constraint premium_membership_actions_previous_feature_keys_check
  check (
    previous_feature_keys is null
    or (
      pg_catalog.cardinality(previous_feature_keys) between 1 and 4
      and pg_catalog.array_position(previous_feature_keys, null) is null
      and previous_feature_keys <@ array[
        'likes_received',
        'received_likes',
        'advanced_member_search',
        'expanded_recommendations'
      ]::text[]
      and pg_catalog.cardinality(previous_feature_keys) =
        (case when 'likes_received' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'received_likes' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'advanced_member_search' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'expanded_recommendations' = any(previous_feature_keys) then 1 else 0 end)
    )
  );

alter table public.premium_membership_actions
  drop constraint if exists premium_membership_actions_new_feature_keys_check;
alter table public.premium_membership_actions
  add constraint premium_membership_actions_new_feature_keys_check
  check (
    pg_catalog.cardinality(new_feature_keys) between 1 and 4
    and pg_catalog.array_position(new_feature_keys, null) is null
    and new_feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations'
    ]::text[]
    and pg_catalog.cardinality(new_feature_keys) =
      (case when 'likes_received' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(new_feature_keys) then 1 else 0 end)
  );

alter table public.premium_membership_request_receipts
  drop constraint if exists premium_membership_request_receipts_feature_keys_check;
alter table public.premium_membership_request_receipts
  add constraint premium_membership_request_receipts_feature_keys_check
  check (
    pg_catalog.cardinality(feature_keys) between 1 and 4
    and pg_catalog.array_position(feature_keys, null) is null
    and feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations'
    ]::text[]
    and pg_catalog.cardinality(feature_keys) =
      (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
  );

create or replace function public.has_premium_feature(p_feature_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when p_feature_key is null
      or p_feature_key not in (
        'likes_received',
        'received_likes',
        'advanced_member_search',
        'expanded_recommendations'
      )
    then false
    else exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
        and p_feature_key = any(membership.feature_keys)
    )
  end
$function$;

comment on function public.has_premium_feature(text)
  is 'commatch_premium_memberships_v1';
revoke all on function public.has_premium_feature(text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_premium_feature(text) to authenticated;

do $post_migration_validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.likes'::pg_catalog.regclass
      and policy_info.polname = 'Users can read own sent likes'
      and policy_info.polcmd = 'r'
  ) or exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.likes'::pg_catalog.regclass
      and policy_info.polname = 'Users can read own sent or received likes'
  ) then
    raise exception 'likes SELECT policy was not migrated to sent-only access';
  end if;

  if public.has_premium_feature('not_a_feature') then
    raise exception 'Unknown Premium feature key was unexpectedly allowed';
  end if;
end
$post_migration_validation$;

commit;

select 'PASS received likes Premium production migration' as migration_result;
