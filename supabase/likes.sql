-- ComMatch SCR-007 likes.
--
-- Apply after favorites.sql, matching-chat.sql, member-service-write-guards.sql,
-- and member-profile-visibility.sql. This preserves every existing match as a
-- legacy match, but stops future matches from being created by favorites.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write_pair(uuid,uuid)') is null then
    raise exception 'Required ComMatch member, visibility, or matching dependencies are missing';
  end if;
end
$preflight$;

-- Existing matches are intentionally untouched. Removing only this trigger
-- prevents subsequent reciprocal interests from creating more matches.
drop trigger if exists favorites_create_mutual_match on public.favorites;

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  liked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_user_liked_unique unique (user_id, liked_user_id),
  constraint likes_cannot_like_self check (user_id <> liked_user_id)
);

create index if not exists likes_liked_user_created_at_idx
  on public.likes (liked_user_id, created_at desc);

alter table public.likes enable row level security;

drop policy if exists "Users can read own sent or received likes" on public.likes;
drop policy if exists "Users can read own sent likes" on public.likes;
create policy "Users can read own sent likes"
  on public.likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own likes" on public.likes;
create policy "Users can delete own likes"
  on public.likes for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select public.is_member_service_allowed())
  );

-- Likes are sent through the RPC below. Direct INSERT is intentionally not
-- granted so target visibility, target access, idempotency, and matching stay
-- in one transaction.
revoke all on table public.likes from public, anon, authenticated;
grant select, delete on table public.likes to authenticated;

create or replace function public.send_member_like(target_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_inserted_like_id uuid;
  v_match_id uuid;
  v_target_is_allowed boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if target_user_id is null or target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'A member cannot like themselves';
  end if;

  perform public.lock_member_service_write_pair(v_user_id, target_user_id);

  select
    exists (select 1 from public.profiles as profile where profile.id = target_user_id)
    and public.is_member_profile_visible(target_user_id)
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = target_user_id
        and restriction.account_status <> 'active'
        and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
    )
  into v_target_is_allowed;

  if not coalesce(v_target_is_allowed, false) then
    raise exception using errcode = '42501', message = 'Target member is not available';
  end if;

  insert into public.likes (user_id, liked_user_id)
  values (v_user_id, target_user_id)
  on conflict (user_id, liked_user_id) do nothing
  returning id into v_inserted_like_id;

  if exists (
    select 1
    from public.likes as reciprocal_like
    where reciprocal_like.user_id = target_user_id
      and reciprocal_like.liked_user_id = v_user_id
  ) then
    insert into public.matches (user_1_id, user_2_id, status, matched_at)
    values (least(v_user_id, target_user_id), greatest(v_user_id, target_user_id), 'active', pg_catalog.now())
    on conflict (user_1_id, user_2_id) do nothing
    returning id into v_match_id;

    return case when v_match_id is null then 'already_matched' else 'matched' end;
  end if;

  return case when v_inserted_like_id is null then 'already_liked' else 'liked' end;
end
$function$;

comment on function public.send_member_like(uuid)
  is 'Sends an idempotent SCR-007 like and creates a match only for reciprocal likes';

alter function public.send_member_like(uuid) owner to postgres;
revoke all on function public.send_member_like(uuid) from public, anon, authenticated, service_role;
grant execute on function public.send_member_like(uuid) to authenticated, service_role;

-- One list RPC prevents per-card like queries in /favorites while leaving the
-- pre-existing get_my_favorite_members() contract intact for current clients.
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
    -- Keep the legacy response shape without exposing received-like data.
    -- received_likes is discoverable only through its Premium RPC.
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
revoke all on function public.get_my_favorite_members_with_likes() from public, anon, authenticated, service_role;
grant execute on function public.get_my_favorite_members_with_likes() to authenticated, service_role;

commit;
