-- ComMatch new-match web notifications.
--
-- Apply after supabase/likes.sql. This migration preserves the existing
-- send_member_like(uuid) return contract while adding two atomic notifications
-- whenever that function creates a new match.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regprocedure('public.send_member_like(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write_pair(uuid,uuid)') is null then
    raise exception 'Required ComMatch likes, matching, or member access dependencies are missing';
  end if;

  if pg_catalog.pg_get_function_result(
    'public.send_member_like(uuid)'::pg_catalog.regprocedure
  ) <> 'text' then
    raise exception 'public.send_member_like(uuid) must retain its text return contract';
  end if;
end
$preflight$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type = 'new_match'),
  constraint notifications_recipient_type_match_unique
    unique (recipient_user_id, type, match_id)
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_user_id, created_at desc, id desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc, id desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_recipient on public.notifications;
create policy notifications_select_recipient
  on public.notifications
  for select
  to authenticated
  using (
    (select auth.uid()) = recipient_user_id
    and (select public.is_member_service_allowed())
  );

-- Authenticated clients may read only rows admitted by RLS. All writes stay in
-- the narrowly scoped SECURITY DEFINER functions below.
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;

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

    if v_match_id is not null then
      -- Do not suppress errors here. A newly created match is valid only when
      -- both participant notifications are inserted in this same transaction.
      insert into public.notifications (recipient_user_id, type, match_id)
      values
        (v_user_id, 'new_match', v_match_id),
        (target_user_id, 'new_match', v_match_id);
    end if;

    return case when v_match_id is null then 'already_matched' else 'matched' end;
  end if;

  return case when v_inserted_like_id is null then 'already_liked' else 'liked' end;
end
$function$;

comment on function public.send_member_like(uuid)
  is 'Sends an idempotent like and atomically creates a match with two new-match notifications';

alter function public.send_member_like(uuid) owner to postgres;

create or replace function public.send_member_like_with_match(target_user_id uuid)
returns table (
  like_result text,
  match_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_like_result text;
  v_match_id uuid;
begin
  -- The existing function remains the sole writer for likes, matches, and
  -- notifications. This wrapper only returns the resulting match identifier.
  v_like_result := public.send_member_like(target_user_id);

  if v_like_result in ('matched', 'already_matched') then
    select match_row.id
    into v_match_id
    from public.matches as match_row
    where match_row.user_1_id = least(v_user_id, target_user_id)
      and match_row.user_2_id = greatest(v_user_id, target_user_id);

    if v_match_id is null then
      raise exception 'Match result invariant failed';
    end if;
  end if;

  return query select v_like_result, v_match_id;
end
$function$;

comment on function public.send_member_like_with_match(uuid)
  is 'Calls send_member_like(uuid) and returns its result with the participant match id';

alter function public.send_member_like_with_match(uuid) owner to postgres;
revoke all on function public.send_member_like_with_match(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_member_like_with_match(uuid) to authenticated;

create or replace function public.mark_my_notification_read(notification_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_is_owned boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if notification_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.notifications as notification_row
    where notification_row.id = notification_id
      and notification_row.recipient_user_id = v_user_id
  ) into v_is_owned;

  if not v_is_owned then
    return false;
  end if;

  update public.notifications as notification_row
  set read_at = pg_catalog.now()
  where notification_row.id = notification_id
    and notification_row.recipient_user_id = v_user_id
    and notification_row.read_at is null;

  return true;
end
$function$;

comment on function public.mark_my_notification_read(uuid)
  is 'Idempotently marks one notification owned by auth.uid() as read';

alter function public.mark_my_notification_read(uuid) owner to postgres;
revoke all on function public.mark_my_notification_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;

commit;
