-- ComMatch first-party notification event expansion.
--
-- Apply after notifications.sql, matching-chat.sql,
-- member-service-write-guards.sql, cancel-member-like.sql, and
-- support-inquiries.sql. This forward migration preserves the existing
-- new_match contract while adding new_message, anonymous new_like, and
-- support_inquiry_answered notifications.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.notifications') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.support_inquiries') is null
     or pg_catalog.to_regprocedure('public.send_match_message(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.mark_match_read(uuid)') is null
     or pg_catalog.to_regprocedure('public.send_member_like(uuid)') is null
     or pg_catalog.to_regprocedure('public.answer_admin_support_inquiry(uuid,timestamptz,text)') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write_pair(uuid,uuid)') is null then
    raise exception 'Required notification, chat, like, support, or member access dependencies are missing';
  end if;

  if pg_catalog.pg_get_function_result(
       'public.send_match_message(uuid,text)'::pg_catalog.regprocedure
     ) <> 'uuid'
     or pg_catalog.pg_get_function_result(
       'public.mark_match_read(uuid)'::pg_catalog.regprocedure
     ) <> 'bigint'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like(uuid)'::pg_catalog.regprocedure
     ) <> 'text'
     or pg_catalog.pg_get_function_result(
       'public.answer_admin_support_inquiry(uuid,timestamptz,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(inquiry_id uuid, status text, answered_at timestamp with time zone, answer_updated_at timestamp with time zone, updated_at timestamp with time zone)' then
    raise exception 'An existing notification writer has an incompatible return contract';
  end if;
end
$preflight$;

alter table public.notifications
  add column if not exists inquiry_id uuid;

alter table public.notifications
  alter column match_id drop not null;

alter table public.notifications
  drop constraint if exists notifications_type_check,
  drop constraint if exists notifications_target_check,
  drop constraint if exists notifications_inquiry_id_fkey,
  drop constraint if exists notifications_recipient_type_inquiry_unique;

alter table public.notifications
  add constraint notifications_type_check
    check (type in ('new_match', 'new_message', 'new_like', 'support_inquiry_answered')),
  add constraint notifications_target_check
    check (
      (type in ('new_match', 'new_message') and match_id is not null and inquiry_id is null)
      or (type = 'new_like' and match_id is null and inquiry_id is null)
      or (type = 'support_inquiry_answered' and match_id is null and inquiry_id is not null)
    ),
  add constraint notifications_inquiry_id_fkey
    foreign key (inquiry_id) references public.support_inquiries(id) on delete cascade,
  add constraint notifications_recipient_type_inquiry_unique
    unique (recipient_user_id, type, inquiry_id);

create or replace function public.send_match_message(p_match_id uuid, p_content text)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_content text;
  v_match public.matches%rowtype;
  v_message_id uuid;
  v_recipient_user_id uuid;
  v_created_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  v_content := pg_catalog.btrim(p_content);
  if v_content is null or pg_catalog.char_length(v_content) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Message content must be between 1 and 1000 characters';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;

  if v_user_id <> v_match.user_1_id and v_user_id <> v_match.user_2_id then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  if v_match.status <> 'active' then
    raise exception using errcode = '55000', message = 'Messages cannot be sent to an ended match';
  end if;

  v_recipient_user_id := case
    when v_user_id = v_match.user_1_id then v_match.user_2_id
    else v_match.user_1_id
  end;

  insert into public.messages (
    match_id,
    sender_id,
    content,
    message_type,
    read_at,
    created_at
  ) values (
    p_match_id,
    v_user_id,
    v_content,
    'text',
    null,
    v_created_at
  )
  returning id into v_message_id;

  update public.matches as match_row
  set last_message_at = v_created_at,
      updated_at = v_created_at
  where match_row.id = p_match_id;

  insert into public.notifications (
    recipient_user_id,
    type,
    match_id,
    read_at,
    created_at
  ) values (
    v_recipient_user_id,
    'new_message',
    p_match_id,
    null,
    v_created_at
  )
  on conflict (recipient_user_id, type, match_id)
  do update
  set read_at = null,
      created_at = excluded.created_at;

  return v_message_id;
end
$function$;

comment on function public.send_match_message(uuid, text) is 'commatch_matching_chat_v1';

create or replace function public.mark_match_read(p_match_id uuid)
returns bigint
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_match public.matches%rowtype;
  v_updated_count bigint;
  v_read_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = p_match_id
  for update;

  if not found
     or (v_match.user_1_id <> v_user_id and v_match.user_2_id <> v_user_id) then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  update public.messages as message_row
  set read_at = v_read_at
  where message_row.match_id = p_match_id
    and message_row.sender_id <> v_user_id
    and message_row.read_at is null;

  get diagnostics v_updated_count = row_count;

  update public.notifications as notification_row
  set read_at = v_read_at
  where notification_row.recipient_user_id = v_user_id
    and notification_row.type = 'new_message'
    and notification_row.match_id = p_match_id
    and notification_row.read_at is null;

  return v_updated_count;
end
$function$;

comment on function public.mark_match_read(uuid) is 'commatch_matching_chat_v1';

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
      insert into public.notifications (recipient_user_id, type, match_id)
      values
        (v_user_id, 'new_match', v_match_id),
        (target_user_id, 'new_match', v_match_id);
    end if;

    return case when v_match_id is null then 'already_matched' else 'matched' end;
  end if;

  if v_inserted_like_id is not null then
    insert into public.notifications (recipient_user_id, type)
    values (target_user_id, 'new_like');
  end if;

  return case when v_inserted_like_id is null then 'already_liked' else 'liked' end;
end
$function$;

comment on function public.send_member_like(uuid)
  is 'Sends an idempotent like, creates an anonymous one-way-like notification, and atomically creates a match with two new-match notifications for reciprocal likes';

create or replace function public.answer_admin_support_inquiry(
  p_inquiry_id uuid,
  p_expected_updated_at timestamptz,
  p_answer_body text
)
returns table (
  inquiry_id uuid,
  status text,
  answered_at timestamptz,
  answer_updated_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_answer_body text := nullif(pg_catalog.btrim(p_answer_body), '');
  v_previous_status text;
  v_current_updated_at timestamptz;
  v_answered_at timestamptz;
  v_recipient_user_id uuid;
  v_changed_at timestamptz := pg_catalog.clock_timestamp();
  v_result record;
begin
  if not coalesce(public.has_admin_permission('support_inquiries_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_inquiry_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Inquiry ID and expected update time are required';
  end if;
  if v_answer_body is null or pg_catalog.char_length(v_answer_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Answer must be between 1 and 5000 characters';
  end if;

  select inquiry.status, inquiry.updated_at, inquiry.answered_at, inquiry.user_id
  into v_previous_status, v_current_updated_at, v_answered_at, v_recipient_user_id
  from public.support_inquiries as inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Inquiry not found'; end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'SUPPORT_INQUIRY_STALE_VERSION';
  end if;
  if v_previous_status not in ('pending', 'answered') then
    raise exception using errcode = '22023', message = 'Closed inquiries cannot be answered';
  end if;

  update public.support_inquiries as inquiry
  set status = 'answered', answer_body = v_answer_body,
      answered_by_admin_user_id = v_admin_user_id,
      answered_at = coalesce(v_answered_at, v_changed_at),
      answer_updated_at = v_changed_at
  where inquiry.id = p_inquiry_id
  returning inquiry.id, inquiry.status, inquiry.answered_at,
    inquiry.answer_updated_at, inquiry.updated_at into v_result;

  insert into public.support_inquiry_admin_actions (
    inquiry_id, admin_user_id, action, previous_status, new_status, created_at
  ) values (
    p_inquiry_id, v_admin_user_id,
    case when v_previous_status = 'pending' then 'answer' else 'answer_update' end,
    v_previous_status, 'answered', v_result.updated_at
  );

  if v_previous_status = 'pending' then
    insert into public.notifications (recipient_user_id, type, inquiry_id)
    values (v_recipient_user_id, 'support_inquiry_answered', p_inquiry_id)
    on conflict on constraint notifications_recipient_type_inquiry_unique
    do nothing;
  end if;

  return query select v_result.id, v_result.status, v_result.answered_at,
    v_result.answer_updated_at, v_result.updated_at;
end
$function$;

comment on function public.answer_admin_support_inquiry(uuid, timestamptz, text)
  is 'commatch_support_inquiries_v1';

do $notification_realtime$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'notifications'
  ) then
    raise exception 'public.notifications was not added to the supabase_realtime publication';
  end if;
end
$notification_realtime$;

commit;

select
  pubname,
  schemaname,
  tablename
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'notifications';
