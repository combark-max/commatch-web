-- ComMatch Web Push Phase 2-C business event integration.
--
-- Apply after notification-events-v1.sql and push-events-deliveries-v1.sql.
-- This forward migration preserves the existing message, like, match, and
-- notification contracts while atomically enqueueing their Push outbox events.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.notifications') is null
     or pg_catalog.to_regclass('public.push_events') is null
     or pg_catalog.to_regprocedure('public.send_match_message(uuid,text)') is null
     or pg_catalog.to_regprocedure('public.send_member_like(uuid)') is null
     or pg_catalog.to_regprocedure('public.send_member_like_with_match(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write_pair(uuid,uuid)') is null
     or pg_catalog.to_regprocedure(
       'public.enqueue_push_event(uuid,uuid,text,uuid)'
     ) is null then
    raise exception 'Required message, like, notification, or Push dependency is missing';
  end if;

  if pg_catalog.pg_get_function_result(
       'public.send_match_message(uuid,text)'::pg_catalog.regprocedure
     ) <> 'uuid'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like(uuid)'::pg_catalog.regprocedure
     ) <> 'text'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like_with_match(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(like_result text, match_id uuid)'
     or pg_catalog.pg_get_function_result(
       'public.enqueue_push_event(uuid,uuid,text,uuid)'::pg_catalog.regprocedure
     ) <> 'uuid' then
    raise exception 'An existing business or Push function has an incompatible return contract';
  end if;
end
$preflight$;

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
  v_notification_id uuid;
  v_recipient_user_id uuid;
  v_created_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  -- commatch_push_business_events_v1
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
      created_at = excluded.created_at
  returning id into v_notification_id;

  perform public.enqueue_push_event(
    v_recipient_user_id,
    v_notification_id,
    'new_message',
    v_message_id
  );

  return v_message_id;
end
$function$;

comment on function public.send_match_message(uuid, text) is 'commatch_matching_chat_v1';

create or replace function public.send_member_like(target_user_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_inserted_like_id uuid;
  v_notification_id uuid;
  v_match_id uuid;
  v_target_is_allowed boolean;
begin
  -- commatch_push_business_events_v1
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
    values (target_user_id, 'new_like')
    returning id into v_notification_id;

    perform public.enqueue_push_event(
      target_user_id,
      v_notification_id,
      'new_like',
      v_inserted_like_id
    );
  end if;

  return case when v_inserted_like_id is null then 'already_liked' else 'liked' end;
end
$function$;

comment on function public.send_member_like(uuid)
  is 'Sends an idempotent like, creates an anonymous one-way-like notification and Push event, and atomically creates a match with two new-match notifications for reciprocal likes';

alter function public.send_match_message(uuid, text) owner to postgres;
alter function public.send_member_like(uuid) owner to postgres;

revoke all on function public.send_match_message(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.send_member_like(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.send_match_message(uuid, text)
  to authenticated, service_role;
grant execute on function public.send_member_like(uuid)
  to authenticated, service_role;

do $contract_validation$
declare
  v_function_oid oid;
  v_postgres_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'postgres'
  );
begin
  foreach v_function_oid in array array[
    'public.send_match_message(uuid,text)'::pg_catalog.regprocedure::oid,
    'public.send_member_like(uuid)'::pg_catalog.regprocedure::oid
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      where function_info.oid = v_function_oid
        and function_info.proowner = v_postgres_oid
        and function_info.prosecdef
        and function_info.provolatile = 'v'
        and function_info.proparallel = 'u'
        and function_info.proconfig is not distinct from array['search_path=""']::text[]
        and pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(function_info.oid),
          'public.enqueue_push_event'
        ) > 0
    )
       or pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
      raise exception 'A Phase 2-C business function has an incompatible security or EXECUTE contract';
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
       'public.send_match_message(uuid,text)'::pg_catalog.regprocedure
     ) <> 'uuid'
     or pg_catalog.pg_get_function_result(
       'public.send_member_like(uuid)'::pg_catalog.regprocedure
     ) <> 'text' then
    raise exception 'A Phase 2-C business function changed its return contract';
  end if;
end
$contract_validation$;

commit;

select 'PASS Web Push Phase 2-C business event migration' as migration_result;
