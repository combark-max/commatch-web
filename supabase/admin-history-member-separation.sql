-- Apply after member-storage-onboarding-guard.sql, member-public-age-contracts.sql,
-- push-business-events-v1.sql, notification-events-v1.sql, and
-- match-ended-notifications-push-v1.sql.
-- Existing relationship, message, audit, and administrator rows are preserved.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regprocedure('public.get_my_member_access()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_onboarding_allowed()') is null
     or pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.is_member_profile_onboarding_allowed()'::pg_catalog.regprocedure
       ),
       'get_my_member_access'
     ) = 0 then
    raise exception 'Administrator-history member-separation prerequisites are missing';
  end if;
end
$preflight$;

create or replace function public.is_non_admin_member_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = p_user_id
    )
$function$;

comment on function public.is_non_admin_member_account(uuid)
  is 'Returns false for every account with administrator history, regardless of current administrator status';
alter function public.is_non_admin_member_account(uuid) owner to postgres;
revoke all on function public.is_non_admin_member_account(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_non_admin_member_account(uuid)
  to authenticated, service_role;

create or replace function public.get_my_member_access()
returns table (
  is_allowed boolean,
  account_status text,
  profile_visibility text,
  suspended_until timestamptz,
  reason text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    case
      when auth_context.user_id is null then false
      when not public.is_non_admin_member_account(auth_context.user_id) then false
      when restriction.account_status is null then true
      when restriction.account_status = 'active' then true
      when restriction.suspended_until is not null
        and restriction.suspended_until <= pg_catalog.now() then true
      else false
    end as is_allowed,
    case
      when auth_context.user_id is null then null::text
      when not public.is_non_admin_member_account(auth_context.user_id) then 'suspended'::text
      else coalesce(restriction.account_status, 'active')
    end as account_status,
    case
      when auth_context.user_id is null then null::text
      when not public.is_non_admin_member_account(auth_context.user_id) then 'hidden'::text
      else coalesce(restriction.profile_visibility, 'visible')
    end as profile_visibility,
    case when auth_context.user_id is null then null else restriction.suspended_until end,
    case
      when auth_context.user_id is null then null::text
      when not public.is_non_admin_member_account(auth_context.user_id)
        then '관리자 이력 계정은 일반 회원 서비스를 이용할 수 없습니다.'::text
      else restriction.reason
    end as reason
  from (select auth.uid() as user_id) as auth_context
  left join public.member_restrictions as restriction
    on restriction.user_id = auth_context.user_id
$function$;

comment on function public.get_my_member_access()
  is 'commatch_admin_member_restrictions_v1';
alter function public.get_my_member_access() owner to postgres;
revoke all on function public.get_my_member_access()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_member_access()
  to authenticated, service_role;

create or replace function public.enforce_non_admin_member_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_first_user_id uuid;
  v_second_user_id uuid;
begin
  if tg_table_schema <> 'public' then
    raise exception using errcode = '42501', message = 'Unsupported relationship table';
  end if;

  case tg_table_name
    when 'favorites' then
      v_first_user_id := new.user_id;
      v_second_user_id := new.favorite_user_id;
    when 'likes' then
      v_first_user_id := new.user_id;
      v_second_user_id := new.liked_user_id;
    when 'matches' then
      v_first_user_id := new.user_1_id;
      v_second_user_id := new.user_2_id;
    when 'messages' then
      select match_row.user_1_id, match_row.user_2_id
      into v_first_user_id, v_second_user_id
      from public.matches as match_row
      where match_row.id = new.match_id;
    else
      raise exception using errcode = '42501', message = 'Unsupported relationship table';
  end case;

  if not coalesce(public.is_non_admin_member_account(v_first_user_id), false)
     or not coalesce(public.is_non_admin_member_account(v_second_user_id), false) then
    raise exception using errcode = '42501', message = 'Administrator-history accounts cannot use member relationships';
  end if;

  return new;
end
$function$;

comment on function public.enforce_non_admin_member_relationship()
  is 'Prevents new or changed member relationship data from involving an administrator-history account';
alter function public.enforce_non_admin_member_relationship() owner to postgres;
revoke all on function public.enforce_non_admin_member_relationship()
  from public, anon, authenticated, service_role;

drop trigger if exists favorites_non_admin_member_relationship on public.favorites;
create trigger favorites_non_admin_member_relationship
  before insert or update on public.favorites
  for each row execute function public.enforce_non_admin_member_relationship();

drop trigger if exists likes_non_admin_member_relationship on public.likes;
create trigger likes_non_admin_member_relationship
  before insert or update on public.likes
  for each row execute function public.enforce_non_admin_member_relationship();

drop trigger if exists matches_non_admin_member_relationship on public.matches;
create trigger matches_non_admin_member_relationship
  before insert or update on public.matches
  for each row execute function public.enforce_non_admin_member_relationship();

drop trigger if exists messages_non_admin_member_relationship on public.messages;
create trigger messages_non_admin_member_relationship
  before insert or update on public.messages
  for each row execute function public.enforce_non_admin_member_relationship();

drop policy if exists "Users can read own favorites" on public.favorites;
create policy "Users can read own favorites"
on public.favorites for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
  and public.is_non_admin_member_account(favorite_user_id)
);

drop policy if exists "Users can insert own favorites" on public.favorites;
create policy "Users can insert own favorites"
on public.favorites for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
  and public.is_non_admin_member_account(favorite_user_id)
);

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites"
on public.favorites for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
  and public.is_non_admin_member_account(favorite_user_id)
);

drop policy if exists "Users can read own sent likes" on public.likes;
create policy "Users can read own sent likes"
on public.likes for select
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
  and public.is_non_admin_member_account(liked_user_id)
);

drop policy if exists matches_select_participant on public.matches;
create policy matches_select_participant
on public.matches for select
to authenticated
using (
  (select public.is_member_service_allowed())
  and public.is_non_admin_member_account(user_1_id)
  and public.is_non_admin_member_account(user_2_id)
  and ((select auth.uid()) = user_1_id or (select auth.uid()) = user_2_id)
);

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant
on public.messages for select
to authenticated
using (
  (select public.is_member_service_allowed())
  and exists (
    select 1 from public.matches as participant_match
    where participant_match.id = match_id
      and public.is_non_admin_member_account(participant_match.user_1_id)
      and public.is_non_admin_member_account(participant_match.user_2_id)
      and ((select auth.uid()) = participant_match.user_1_id
        or (select auth.uid()) = participant_match.user_2_id)
  )
);

create or replace function public.get_my_favorite_members()
returns table (
  favorite_id uuid, favorited_at timestamptz, member_id uuid, nickname text,
  age integer, profile_image_url text, region text, job text,
  is_mutual boolean, match_id uuid, match_status text, matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
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
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.favorites as favorite_row
  join public.profiles as target_profile on target_profile.id = favorite_row.favorite_user_id
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(target_profile.profile_images) with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position limit 1
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
    and public.is_non_admin_member_account(target_profile.id)
  order by favorite_row.created_at desc, favorite_row.id;
end
$function$;

create or replace function public.get_my_favorite_members_with_likes()
returns table (
  favorite_id uuid, favorited_at timestamptz, member_id uuid, nickname text,
  age integer, profile_image_url text, region text, job text,
  is_mutual boolean, has_liked boolean, liked_by_member boolean,
  match_id uuid, match_status text, matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
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
    order by image_value.position limit 1
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
    and public.is_non_admin_member_account(target_profile.id)
  order by favorite_row.created_at desc, favorite_row.id;
end
$function$;

create or replace function public.get_received_favorites()
returns table (
  favorite_id uuid, sender_user_id uuid, created_at timestamptz, nickname text,
  age integer, region text, job text, profile_image text, profile_images text[],
  is_mutual boolean, match_id uuid, match_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if not coalesce(public.has_premium_feature('likes_received'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_favorite.id,
    received_favorite.user_id,
    received_favorite.created_at,
    sender_profile.nickname,
    case when sender_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, sender_profile.birth_date))::integer end,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    exists (
      select 1 from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = v_user_id
        and reciprocal_favorite.favorite_user_id = received_favorite.user_id
    ),
    existing_match.id,
    existing_match.status
  from public.favorites as received_favorite
  join public.profiles as sender_profile on sender_profile.id = received_favorite.user_id
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (match_row.user_1_id = received_favorite.user_id and match_row.user_2_id = v_user_id)
       or (match_row.user_1_id = v_user_id and match_row.user_2_id = received_favorite.user_id)
    order by (match_row.status = 'active') desc, match_row.matched_at desc, match_row.id
    limit 1
  ) as existing_match on true
  where received_favorite.favorite_user_id = v_user_id
    and public.is_non_admin_member_account(received_favorite.user_id)
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = received_favorite.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by received_favorite.created_at desc, received_favorite.id;
end
$function$;

create or replace function public.get_received_likes()
returns table (
  like_id uuid, sender_user_id uuid, liked_at timestamptz, nickname text,
  age integer, region text, job text, profile_image text, profile_images text[],
  has_liked boolean, is_mutual_like boolean, match_id uuid, match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if not coalesce(public.has_premium_feature('received_likes'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_like.id,
    sender_profile.id,
    received_like.created_at,
    sender_profile.nickname,
    case when sender_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, sender_profile.birth_date))::integer end,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    sent_like.has_liked,
    sent_like.has_liked,
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.likes as received_like
  join public.profiles as sender_profile on sender_profile.id = received_like.user_id
  left join lateral (
    select exists (
      select 1 from public.likes as my_like
      where my_like.user_id = v_user_id and my_like.liked_user_id = received_like.user_id
    ) as has_liked
  ) as sent_like on true
  left join public.matches as existing_match
    on existing_match.user_1_id = least(v_user_id, received_like.user_id)
   and existing_match.user_2_id = greatest(v_user_id, received_like.user_id)
  where received_like.liked_user_id = v_user_id
    and public.is_non_admin_member_account(received_like.user_id)
    and public.is_member_profile_visible(sender_profile.id)
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = sender_profile.id
        and restriction.account_status <> 'active'
        and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
    )
  order by received_like.created_at desc, received_like.id desc;
end
$function$;

create or replace function public.get_my_matches()
returns table (
  match_id uuid, match_status text, matched_at timestamptz, ended_at timestamptz,
  last_message_at timestamptz, other_user_id uuid, other_nickname text,
  other_age integer, other_profile_image text, other_region text, other_job text,
  latest_message_content text, latest_message_at timestamptz,
  latest_message_sender_id uuid, unread_count bigint
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    match_row.id,
    match_row.status,
    match_row.matched_at,
    match_row.ended_at,
    match_row.last_message_at,
    other_profile.id,
    other_profile.nickname,
    case when other_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, other_profile.birth_date))::integer end,
    coalesce(nullif(pg_catalog.btrim(other_profile.profile_image), ''), fallback_image.path),
    other_profile.region,
    other_profile.job,
    latest_message.content,
    latest_message.created_at,
    latest_message.sender_id,
    coalesce(unread_messages.unread_count, 0::bigint)
  from public.matches as match_row
  join public.profiles as other_profile
    on other_profile.id = case
      when match_row.user_1_id = v_user_id then match_row.user_2_id else match_row.user_1_id end
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(other_profile.profile_images) with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position limit 1
  ) as fallback_image on true
  left join lateral (
    select
      case when message_row.moderation_visibility = 'hidden'
        then '관리자에 의해 비노출된 메시지입니다.'::text else message_row.content end as content,
      message_row.created_at,
      message_row.sender_id
    from public.messages as message_row
    where message_row.match_id = match_row.id
    order by message_row.created_at desc, message_row.id desc limit 1
  ) as latest_message on true
  left join lateral (
    select pg_catalog.count(*)::bigint as unread_count
    from public.messages as unread_message
    where unread_message.match_id = match_row.id
      and unread_message.sender_id <> v_user_id
      and unread_message.read_at is null
  ) as unread_messages on true
  where (match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id)
    and public.is_non_admin_member_account(other_profile.id)
  order by (match_row.status = 'active') desc,
    coalesce(match_row.last_message_at, match_row.matched_at) desc,
    match_row.id;
end
$function$;

create or replace function public.get_my_match_summary()
returns table (
  total_unread_count bigint,
  active_match_count bigint,
  total_match_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  return query
  select
    coalesce((
      select pg_catalog.count(*)::bigint
      from public.messages as message_row
      join public.matches as message_match on message_match.id = message_row.match_id
      where (message_match.user_1_id = v_user_id or message_match.user_2_id = v_user_id)
        and public.is_non_admin_member_account(message_match.user_1_id)
        and public.is_non_admin_member_account(message_match.user_2_id)
        and message_row.sender_id <> v_user_id
        and message_row.read_at is null
    ), 0::bigint),
    pg_catalog.count(*) filter (where match_row.status = 'active')::bigint,
    pg_catalog.count(*)::bigint
  from public.matches as match_row
  where (match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id)
    and public.is_non_admin_member_account(match_row.user_1_id)
    and public.is_non_admin_member_account(match_row.user_2_id);
end
$function$;

create or replace function public.get_match_messages(p_match_id uuid)
returns table (
  id uuid, match_id uuid, sender_id uuid, content text,
  moderation_visibility text, message_type text, read_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if p_match_id is null then
    raise exception using errcode = '22023', message = 'Match ID is required';
  end if;
  if not exists (
    select 1 from public.matches as match_row
    where match_row.id = p_match_id
      and (match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id)
      and public.is_non_admin_member_account(match_row.user_1_id)
      and public.is_non_admin_member_account(match_row.user_2_id)
  ) then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  return query
  select
    message_row.id,
    message_row.match_id,
    message_row.sender_id,
    case when message_row.moderation_visibility = 'hidden'
      then '관리자에 의해 비노출된 메시지입니다.'::text else message_row.content end,
    message_row.moderation_visibility,
    message_row.message_type,
    message_row.read_at,
    message_row.created_at
  from public.messages as message_row
  where message_row.match_id = p_match_id
  order by message_row.created_at, message_row.id;
end
$function$;

create or replace function public.cancel_member_like(target_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;
  if target_user_id is null or target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'A valid target member is required';
  end if;
  if not public.is_non_admin_member_account(target_user_id) then
    raise exception using errcode = '42501', message = 'Target member is not available';
  end if;

  perform public.lock_member_service_write_pair(v_user_id, target_user_id);
  if exists (
    select 1 from public.matches as match_row
    where match_row.user_1_id = least(v_user_id, target_user_id)
      and match_row.user_2_id = greatest(v_user_id, target_user_id)
  ) then
    return 'already_matched';
  end if;

  delete from public.likes as like_row
  where like_row.user_id = v_user_id and like_row.liked_user_id = target_user_id;
  get diagnostics v_deleted_count = row_count;
  return case when v_deleted_count = 1 then 'cancelled' else 'not_liked' end;
end
$function$;

alter function public.get_my_favorite_members() owner to postgres;
alter function public.get_my_favorite_members_with_likes() owner to postgres;
alter function public.get_received_favorites() owner to postgres;
alter function public.get_received_likes() owner to postgres;
alter function public.get_my_matches() owner to postgres;
alter function public.get_my_match_summary() owner to postgres;
alter function public.get_match_messages(uuid) owner to postgres;
alter function public.cancel_member_like(uuid) owner to postgres;

revoke all on function public.get_my_favorite_members() from public, anon, authenticated, service_role;
revoke all on function public.get_my_favorite_members_with_likes() from public, anon, authenticated, service_role;
revoke all on function public.get_received_favorites() from public, anon, authenticated, service_role;
revoke all on function public.get_received_likes() from public, anon, authenticated, service_role;
revoke all on function public.get_my_matches() from public, anon, authenticated, service_role;
revoke all on function public.get_my_match_summary() from public, anon, authenticated, service_role;
revoke all on function public.get_match_messages(uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_member_like(uuid) from public, anon, authenticated, service_role;

grant execute on function public.get_my_favorite_members() to authenticated, service_role;
grant execute on function public.get_my_favorite_members_with_likes() to authenticated, service_role;
grant execute on function public.get_received_favorites() to authenticated, service_role;
grant execute on function public.get_received_likes() to authenticated, service_role;
grant execute on function public.get_my_matches() to authenticated, service_role;
grant execute on function public.get_my_match_summary() to authenticated, service_role;
grant execute on function public.get_match_messages(uuid) to authenticated, service_role;
grant execute on function public.cancel_member_like(uuid) to authenticated;

do $postflight$
begin
  if pg_catalog.strpos(
    pg_catalog.pg_get_functiondef(
      'public.get_my_member_access()'::pg_catalog.regprocedure
    ),
    'is_non_admin_member_account'
  ) = 0 then
    raise exception 'Member access does not contain the administrator-history guard';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgname in (
      'favorites_non_admin_member_relationship',
      'likes_non_admin_member_relationship',
      'matches_non_admin_member_relationship',
      'messages_non_admin_member_relationship'
    ) and not trigger_info.tgisinternal
  ) <> 4 then
    raise exception 'Administrator-history relationship trigger count differs';
  end if;
end
$postflight$;

commit;
