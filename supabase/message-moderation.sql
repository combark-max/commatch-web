-- ComMatch message moderation.
--
-- This forward-only migration adds reversible administrator message visibility,
-- a member-safe message projection, append-only audit history, and content-free
-- client table privileges. Existing matching, message sending, read receipts,
-- notifications, Push, reports, and account-deletion lifecycles are preserved.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.reports') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null
     or pg_catalog.to_regprocedure('public.get_my_matches()') is null
     or pg_catalog.to_regprocedure('public.get_admin_report_detail(uuid)') is null then
    raise exception 'Required message moderation dependency is missing';
  end if;
end
$preflight$;

alter table public.messages
  add column if not exists moderation_visibility text;

update public.messages
set moderation_visibility = 'visible'
where moderation_visibility is null;

alter table public.messages
  alter column moderation_visibility set default 'visible',
  alter column moderation_visibility set not null;

do $message_visibility_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.messages'::pg_catalog.regclass
      and constraint_info.conname = 'messages_moderation_visibility_check'
  ) then
    alter table public.messages
      add constraint messages_moderation_visibility_check
      check (moderation_visibility in ('visible', 'hidden'));
  end if;
end
$message_visibility_constraint$;

create table if not exists public.message_moderation_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  message_id uuid not null,
  report_id uuid null,
  admin_user_id uuid null,
  admin_role text not null,
  action text not null,
  reason text null,
  previous_visibility text not null,
  new_visibility text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint message_moderation_actions_report_id_fkey
    foreign key (report_id) references public.reports(id) on delete set null,
  constraint message_moderation_actions_admin_user_id_fkey
    foreign key (admin_user_id) references auth.users(id) on delete set null,
  constraint message_moderation_actions_admin_role_check
    check (admin_role in ('super_admin', 'admin', 'moderator')),
  constraint message_moderation_actions_action_check
    check (action in ('hide', 'restore')),
  constraint message_moderation_actions_previous_visibility_check
    check (previous_visibility in ('visible', 'hidden')),
  constraint message_moderation_actions_new_visibility_check
    check (new_visibility in ('visible', 'hidden')),
  constraint message_moderation_actions_transition_check
    check (
      previous_visibility <> new_visibility
      and (
        (action = 'hide' and previous_visibility = 'visible' and new_visibility = 'hidden')
        or
        (action = 'restore' and previous_visibility = 'hidden' and new_visibility = 'visible')
      )
    ),
  constraint message_moderation_actions_reason_check
    check (
      (action = 'hide' and reason is not null)
      or action = 'restore'
    ),
  constraint message_moderation_actions_reason_format_check
    check (
      reason is null
      or (
        reason = pg_catalog.btrim(reason)
        and pg_catalog.char_length(reason) between 1 and 500
      )
    )
);

comment on table public.message_moderation_actions
  is 'commatch_message_moderation_v1';
comment on column public.message_moderation_actions.message_id
  is 'Immutable UUID snapshot without a foreign key so account deletion cannot erase or block audit history';

create index if not exists message_moderation_actions_message_created_idx
  on public.message_moderation_actions (message_id, created_at desc, id desc);
create index if not exists message_moderation_actions_report_created_idx
  on public.message_moderation_actions (report_id, created_at desc, id desc);

create or replace function public.get_match_messages(p_match_id uuid)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  content text,
  moderation_visibility text,
  message_type text,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_match_id is null then
    raise exception using errcode = '22023', message = 'Match ID is required';
  end if;
  if not exists (
    select 1
    from public.matches as match_row
    where match_row.id = p_match_id
      and (match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id)
  ) then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  return query
  select
    message_row.id,
    message_row.match_id,
    message_row.sender_id,
    case
      when message_row.moderation_visibility = 'hidden'
        then '관리자에 의해 비노출된 메시지입니다.'::text
      else message_row.content
    end,
    message_row.moderation_visibility,
    message_row.message_type,
    message_row.read_at,
    message_row.created_at
  from public.messages as message_row
  where message_row.match_id = p_match_id
  order by message_row.created_at, message_row.id;
end
$function$;

comment on function public.get_match_messages(uuid)
  is 'commatch_message_moderation_v1';

-- Keep the established return contract while masking a hidden latest-message
-- preview before it reaches any member client.
create or replace function public.get_my_matches()
returns table (
  match_id uuid,
  match_status text,
  matched_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  other_user_id uuid,
  other_nickname text,
  other_birth_date date,
  other_profile_image text,
  other_region text,
  other_job text,
  latest_message_content text,
  latest_message_at timestamptz,
  latest_message_sender_id uuid,
  unread_count bigint
)
language plpgsql
volatile
parallel unsafe
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
    match_row.id,
    match_row.status,
    match_row.matched_at,
    match_row.ended_at,
    match_row.last_message_at,
    other_profile.id,
    other_profile.nickname,
    other_profile.birth_date,
    coalesce(
      nullif(pg_catalog.btrim(other_profile.profile_image), ''),
      fallback_image.path
    ),
    other_profile.region,
    other_profile.job,
    latest_message.content,
    latest_message.created_at,
    latest_message.sender_id,
    coalesce(unread_messages.unread_count, 0::bigint)
  from public.matches as match_row
  join public.profiles as other_profile
    on other_profile.id = case
      when match_row.user_1_id = v_user_id then match_row.user_2_id
      else match_row.user_1_id
    end
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(other_profile.profile_images) with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select
      case
        when message_row.moderation_visibility = 'hidden'
          then '관리자에 의해 비노출된 메시지입니다.'::text
        else message_row.content
      end as content,
      message_row.created_at,
      message_row.sender_id
    from public.messages as message_row
    where message_row.match_id = match_row.id
    order by message_row.created_at desc, message_row.id desc
    limit 1
  ) as latest_message on true
  left join lateral (
    select pg_catalog.count(*)::bigint as unread_count
    from public.messages as unread_message
    where unread_message.match_id = match_row.id
      and unread_message.sender_id <> v_user_id
      and unread_message.read_at is null
  ) as unread_messages on true
  where match_row.user_1_id = v_user_id
     or match_row.user_2_id = v_user_id
  order by
    (match_row.status = 'active') desc,
    coalesce(match_row.last_message_at, match_row.matched_at) desc,
    match_row.id;
end
$function$;

comment on function public.get_my_matches()
  is 'commatch_message_moderation_v1';

create or replace function public.set_admin_message_visibility(
  p_report_id uuid,
  p_message_id uuid,
  p_expected_visibility text,
  p_new_visibility text,
  p_reason text default null
)
returns table (
  message_id uuid,
  previous_visibility text,
  new_visibility text,
  reason text,
  changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_admin_role text;
  v_report_target_type text;
  v_report_message_id uuid;
  v_expected_visibility text := nullif(pg_catalog.btrim(p_expected_visibility), '');
  v_new_visibility text := nullif(pg_catalog.btrim(p_new_visibility), '');
  v_previous_visibility text;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_action text;
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.has_admin_permission('reports_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;

  select admin_account.role
  into v_admin_role
  from public.admin_accounts as admin_account
  where admin_account.user_id = v_admin_user_id
    and admin_account.status = 'active';

  if not found or v_admin_role not in ('super_admin', 'admin', 'moderator') then
    raise exception using errcode = '42501', message = 'Active administrator required';
  end if;
  if p_report_id is null or p_message_id is null then
    raise exception using errcode = '22023', message = 'Report ID and message ID are required';
  end if;
  if v_expected_visibility not in ('visible', 'hidden')
     or v_new_visibility not in ('visible', 'hidden') then
    raise exception using errcode = '22023', message = 'Invalid message visibility';
  end if;
  if v_expected_visibility = v_new_visibility then
    raise exception using errcode = 'P0001', message = 'MESSAGE_VISIBILITY_UNCHANGED';
  end if;

  v_action := case v_new_visibility when 'hidden' then 'hide' else 'restore' end;
  if v_action = 'hide' and v_reason is null then
    raise exception using errcode = '22023', message = 'A hide reason is required';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'A moderation reason must be 500 characters or fewer';
  end if;

  select report.target_type, report.target_message_id
  into v_report_target_type, v_report_message_id
  from public.reports as report
  where report.id = p_report_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found';
  end if;
  if v_report_target_type <> 'message' or v_report_message_id is distinct from p_message_id then
    raise exception using errcode = '22023', message = 'Report and message do not match';
  end if;

  select message_row.moderation_visibility
  into v_previous_visibility
  from public.messages as message_row
  where message_row.id = p_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Message not found';
  end if;
  if v_previous_visibility is distinct from v_expected_visibility then
    raise exception using errcode = 'P0001', message = 'MESSAGE_VISIBILITY_STALE';
  end if;
  if not (
    (v_previous_visibility = 'visible' and v_new_visibility = 'hidden')
    or (v_previous_visibility = 'hidden' and v_new_visibility = 'visible')
  ) then
    raise exception using errcode = '22023', message = 'Message visibility transition is not allowed';
  end if;

  update public.messages as message_row
  set moderation_visibility = v_new_visibility
  where message_row.id = p_message_id;

  insert into public.message_moderation_actions (
    message_id,
    report_id,
    admin_user_id,
    admin_role,
    action,
    reason,
    previous_visibility,
    new_visibility,
    created_at
  ) values (
    p_message_id,
    p_report_id,
    v_admin_user_id,
    v_admin_role,
    v_action,
    v_reason,
    v_previous_visibility,
    v_new_visibility,
    v_changed_at
  );

  return query
  select p_message_id, v_previous_visibility, v_new_visibility, v_reason, v_changed_at;
end
$function$;

comment on function public.set_admin_message_visibility(uuid, uuid, text, text, text)
  is 'commatch_message_moderation_v1';

create or replace function public.get_admin_message_moderation_actions(p_report_id uuid)
returns table (
  action_id uuid,
  message_id uuid,
  report_id uuid,
  admin_user_id uuid,
  admin_role text,
  action text,
  reason text,
  previous_visibility text,
  new_visibility text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_message_id uuid;
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'Report ID is required';
  end if;

  select report.target_message_id
  into v_message_id
  from public.reports as report
  where report.id = p_report_id
    and report.target_type = 'message';

  if not found then
    return;
  end if;

  return query
  select
    action_row.id,
    action_row.message_id,
    action_row.report_id,
    action_row.admin_user_id,
    action_row.admin_role,
    action_row.action,
    action_row.reason,
    action_row.previous_visibility,
    action_row.new_visibility,
    action_row.created_at
  from public.message_moderation_actions as action_row
  where action_row.message_id = v_message_id
  order by action_row.created_at desc, action_row.id desc;
end
$function$;

comment on function public.get_admin_message_moderation_actions(uuid)
  is 'commatch_message_moderation_v1';

-- The return shape is extended only with typed moderation/source fields. Live
-- data remains authoritative; the immutable report snapshot is used only after
-- the original message row has been removed by an existing cascade lifecycle.
drop function public.get_admin_report_detail(uuid);

create function public.get_admin_report_detail(p_report_id uuid)
returns table (
  report_id uuid,
  target_type text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reported_user_id uuid,
  message_id uuid,
  reporter_nickname text,
  reporter_gender text,
  reporter_birth_date date,
  reporter_region text,
  reporter_job text,
  reporter_profile_image text,
  reporter_member_exists boolean,
  reporter_profile_exists boolean,
  reported_nickname text,
  reported_gender text,
  reported_birth_date date,
  reported_region text,
  reported_job text,
  reported_profile_image text,
  reported_marriage_history text,
  reported_member_exists boolean,
  reported_profile_exists boolean,
  message_content text,
  message_sender_id uuid,
  message_sender_nickname text,
  message_sender_member_exists boolean,
  message_sender_profile_exists boolean,
  message_created_at timestamptz,
  match_id uuid,
  match_user_1_id uuid,
  match_user_1_nickname text,
  match_user_2_id uuid,
  match_user_2_nickname text,
  message_exists boolean,
  message_moderation_visibility text,
  message_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'Report ID is required';
  end if;

  return query
  select
    report.id,
    report.target_type,
    report.reason_code,
    report.reason_detail,
    report.status,
    report.created_at,
    report.reporter_id,
    report.target_user_id,
    report.target_message_id,
    reporter_profile.nickname,
    reporter_profile.gender,
    reporter_profile.birth_date,
    reporter_profile.region,
    reporter_profile.job,
    reporter_profile.profile_image,
    reporter_member.id is not null,
    reporter_profile.id is not null,
    reported_profile.nickname,
    reported_profile.gender,
    reported_profile.birth_date,
    reported_profile.region,
    reported_profile.job,
    reported_profile.profile_image,
    reported_profile.marriage_history,
    reported_member.id is not null,
    reported_profile.id is not null,
    case
      when report.target_type <> 'message' then null
      when reported_message.id is not null then reported_message.content
      else report.target_snapshot ->> 'content'
    end,
    case
      when report.target_type = 'message' then coalesce(reported_message.sender_id, report.target_user_id)
      else null
    end,
    case when report.target_type = 'message' then message_sender_profile.nickname else null end,
    case when report.target_type = 'message' then message_sender_member.id is not null else false end,
    case when report.target_type = 'message' then message_sender_profile.id is not null else false end,
    case
      when report.target_type <> 'message' then null
      when reported_message.id is not null then reported_message.created_at
      when pg_catalog.jsonb_typeof(report.target_snapshot -> 'created_at') = 'string'
        and (report.target_snapshot ->> 'created_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (report.target_snapshot ->> 'created_at')::timestamptz
      else null
    end,
    case
      when report.target_type = 'message' then coalesce(reported_message.match_id, report.target_match_id)
      else null
    end,
    case when report.target_type = 'message' then reported_match.user_1_id else null end,
    case when report.target_type = 'message' then match_user_1_profile.nickname else null end,
    case when report.target_type = 'message' then reported_match.user_2_id else null end,
    case when report.target_type = 'message' then match_user_2_profile.nickname else null end,
    case when report.target_type = 'message' then reported_message.id is not null else false end,
    case when report.target_type = 'message' then reported_message.moderation_visibility else null end,
    case
      when report.target_type <> 'message' then null
      when reported_message.id is not null then 'live'::text
      else 'snapshot'::text
    end
  from public.reports as report
  left join auth.users as reporter_member on reporter_member.id = report.reporter_id
  left join public.profiles as reporter_profile on reporter_profile.id = report.reporter_id
  left join auth.users as reported_member on reported_member.id = report.target_user_id
  left join public.profiles as reported_profile on reported_profile.id = report.target_user_id
  left join public.messages as reported_message
    on report.target_type = 'message' and reported_message.id = report.target_message_id
  left join public.profiles as message_sender_profile
    on report.target_type = 'message' and message_sender_profile.id = coalesce(reported_message.sender_id, report.target_user_id)
  left join auth.users as message_sender_member
    on report.target_type = 'message' and message_sender_member.id = coalesce(reported_message.sender_id, report.target_user_id)
  left join public.matches as reported_match
    on report.target_type = 'message' and reported_match.id = coalesce(reported_message.match_id, report.target_match_id)
  left join public.profiles as match_user_1_profile
    on report.target_type = 'message' and match_user_1_profile.id = reported_match.user_1_id
  left join public.profiles as match_user_2_profile
    on report.target_type = 'message' and match_user_2_profile.id = reported_match.user_2_id
  where report.id = p_report_id;
end
$function$;

comment on function public.get_admin_report_detail(uuid)
  is 'commatch_message_moderation_v1';

alter function public.get_match_messages(uuid) owner to postgres;
alter function public.get_my_matches() owner to postgres;
alter function public.set_admin_message_visibility(uuid, uuid, text, text, text) owner to postgres;
alter function public.get_admin_message_moderation_actions(uuid) owner to postgres;
alter function public.get_admin_report_detail(uuid) owner to postgres;

alter table public.message_moderation_actions enable row level security;

revoke all on table public.message_moderation_actions from public, anon, authenticated, service_role;
grant select, insert on table public.message_moderation_actions to service_role;

-- Remove every member path to raw message content. Safe metadata remains
-- selectable for participant-authorized Realtime Postgres Changes.
revoke select on table public.messages from authenticated;
revoke select (content) on table public.messages from authenticated;
grant select (
  id,
  match_id,
  sender_id,
  message_type,
  read_at,
  created_at,
  moderation_visibility
) on table public.messages to authenticated;

revoke all on function public.get_match_messages(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_admin_message_visibility(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_message_moderation_actions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_report_detail(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_match_messages(uuid) to authenticated;
grant execute on function public.set_admin_message_visibility(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.get_admin_message_moderation_actions(uuid) to authenticated;
grant execute on function public.get_admin_report_detail(uuid) to authenticated;

-- Preserve the existing member/service execution contract for match summaries.
revoke all on function public.get_my_matches() from public, anon, authenticated, service_role;
grant execute on function public.get_my_matches() to authenticated, service_role;

do $security_validation$
begin
  if pg_catalog.has_column_privilege('authenticated', 'public.messages', 'content', 'SELECT') then
    raise exception 'authenticated must not be able to select public.messages.content';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'match_id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'moderation_visibility', 'SELECT') then
    raise exception 'authenticated safe message metadata privileges are incomplete';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.message_moderation_actions'::pg_catalog.regclass
  ) then
    raise exception 'message_moderation_actions must not expose direct-access RLS policies';
  end if;
end
$security_validation$;

commit;
