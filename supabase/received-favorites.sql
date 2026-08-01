-- ComMatch received favorites lookup.
--
-- Before applying this file to Supabase, verify the deployed foreign-key
-- metadata for favorites.user_id. The repository's favorites.sql references
-- auth.users(id), while matching-chat.sql expects a profiles(id) reference.
-- This migration intentionally changes neither foreign key and relies only on
-- the shared user UUID values.

begin;

do $premium_dependency_validation$
begin
  if pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       where function_info.oid = pg_catalog.to_regprocedure(
           'public.has_premium_feature(text)'
         )
         and function_info.pronargs = 1
         and not function_info.proretset
         and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
     ) then
    raise exception 'public.has_premium_feature(text) is missing or incompatible';
  end if;
end
$premium_dependency_validation$;

create index if not exists favorites_received_created_at_idx
on public.favorites (favorite_user_id, created_at desc);

create or replace function public.get_received_favorites()
returns table (
  favorite_id uuid,
  sender_user_id uuid,
  created_at timestamptz,
  nickname text,
  birth_date text,
  region text,
  job text,
  profile_image text,
  profile_images text[],
  is_mutual boolean,
  match_id uuid,
  match_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  select auth.uid() into v_user_id;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if not coalesce(
    public.has_premium_feature('likes_received'),
    false
  ) then
    raise exception using
      errcode = '42501',
      message = 'Premium feature access required';
  end if;

  return query
  select
    received_favorite.id,
    received_favorite.user_id,
    received_favorite.created_at,
    sender_profile.nickname,
    sender_profile.birth_date::text,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    exists (
      select 1
      from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = v_user_id
        and reciprocal_favorite.favorite_user_id = received_favorite.user_id
    ),
    existing_match.id,
    existing_match.status
  from public.favorites as received_favorite
  join public.profiles as sender_profile
    on sender_profile.id = received_favorite.user_id
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (
      match_row.user_1_id = received_favorite.user_id
      and match_row.user_2_id = v_user_id
    ) or (
      match_row.user_1_id = v_user_id
      and match_row.user_2_id = received_favorite.user_id
    )
    order by
      (match_row.status = 'active') desc,
      match_row.matched_at desc,
      match_row.id
    limit 1
  ) as existing_match on true
  where received_favorite.favorite_user_id = v_user_id
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = received_favorite.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by received_favorite.created_at desc, received_favorite.id;
end
$function$;

comment on function public.get_received_favorites() is
  'Returns received favorites for auth.uid() with Premium feature access';

revoke all on function public.get_received_favorites() from public, anon, authenticated, service_role;
grant execute on function public.get_received_favorites() to authenticated, service_role;

commit;
