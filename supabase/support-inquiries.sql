-- ComMatch member support inquiries and administrator answers.
-- Run after notices.sql and admin-member-restrictions.sql.

begin;

do $preflight$
declare
  v_object record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regprocedure('public.get_my_admin_access()') is null
     or pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'Auth users and administrator permission functions must exist before installing support inquiries';
  end if;

  for v_object in
    select object_name, object_oid, object_type
    from (values
      ('support_inquiries', pg_catalog.to_regclass('public.support_inquiries')::oid, 'pg_class'),
      ('support_inquiry_admin_actions', pg_catalog.to_regclass('public.support_inquiry_admin_actions')::oid, 'pg_class')
    ) as objects(object_name, object_oid, object_type)
    where object_oid is not null
  loop
    if pg_catalog.obj_description(v_object.object_oid, v_object.object_type) <> 'commatch_support_inquiries_v1' then
      raise exception 'public.% already exists without the approved definition marker', v_object.object_name;
    end if;
  end loop;

  for v_object in
    select function_info.oid as object_oid, function_info.proname as object_name
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'set_support_inquiries_updated_at', 'create_my_support_inquiry',
        'get_my_support_inquiries', 'get_my_support_inquiry',
        'get_admin_support_inquiries', 'get_admin_support_inquiry',
        'get_admin_support_inquiry_actions', 'answer_admin_support_inquiry',
        'close_admin_support_inquiry'
      )
  loop
    if pg_catalog.obj_description(v_object.object_oid, 'pg_proc') <> 'commatch_support_inquiries_v1' then
      raise exception 'public.% already exists without the approved definition marker', v_object.object_name;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.support_inquiries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending',
  answer_body text null,
  answered_by_admin_user_id uuid null,
  answered_at timestamptz null,
  answer_updated_at timestamptz null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint support_inquiries_category_check
    check (category in ('account', 'matching', 'premium', 'report', 'service', 'other')),
  constraint support_inquiries_subject_check
    check (subject = pg_catalog.btrim(subject) and pg_catalog.char_length(subject) between 1 and 150),
  constraint support_inquiries_body_check
    check (body = pg_catalog.btrim(body) and pg_catalog.char_length(body) between 1 and 5000),
  constraint support_inquiries_status_check
    check (status in ('pending', 'answered', 'closed')),
  constraint support_inquiries_answer_body_check
    check (
      answer_body is null
      or (answer_body = pg_catalog.btrim(answer_body) and pg_catalog.char_length(answer_body) between 1 and 5000)
    ),
  constraint support_inquiries_lifecycle_check
    check (
      (
        status = 'pending'
        and answer_body is null
        and answered_by_admin_user_id is null
        and answered_at is null
        and answer_updated_at is null
      )
      or
      (
        status in ('answered', 'closed')
        and answer_body is not null
        and answered_by_admin_user_id is not null
        and answered_at is not null
        and answer_updated_at is not null
      )
    ),
  constraint support_inquiries_timestamp_check
    check (
      updated_at >= created_at
      and (answered_at is null or answered_at >= created_at)
      and (answer_updated_at is null or answer_updated_at >= answered_at)
    )
);

comment on table public.support_inquiries is 'commatch_support_inquiries_v1';
comment on column public.support_inquiries.user_id is
  'Auth-user ownership; cascades on account deletion because no separate inquiry-retention policy is established.';
comment on column public.support_inquiries.answered_by_admin_user_id is
  'Immutable answering administrator UUID retained without a foreign key so the answered lifecycle remains valid if that administrator account is deleted.';

create index if not exists support_inquiries_user_created_idx
  on public.support_inquiries (user_id, created_at desc, id desc);
create index if not exists support_inquiries_status_created_idx
  on public.support_inquiries (status, created_at desc, id desc);

create table if not exists public.support_inquiry_admin_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  inquiry_id uuid not null references public.support_inquiries(id) on delete cascade,
  admin_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  previous_status text not null,
  new_status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint support_inquiry_admin_actions_action_check
    check (action in ('answer', 'answer_update', 'close')),
  constraint support_inquiry_admin_actions_previous_status_check
    check (previous_status in ('pending', 'answered', 'closed')),
  constraint support_inquiry_admin_actions_new_status_check
    check (new_status in ('pending', 'answered', 'closed')),
  constraint support_inquiry_admin_actions_transition_check
    check (
      (action = 'answer' and previous_status = 'pending' and new_status = 'answered')
      or (action = 'answer_update' and previous_status = 'answered' and new_status = 'answered')
      or (action = 'close' and previous_status = 'answered' and new_status = 'closed')
    )
);

comment on table public.support_inquiry_admin_actions is 'commatch_support_inquiries_v1';
comment on column public.support_inquiry_admin_actions.action is
  'Append-only answer, answer correction, and close metadata; answer text snapshots are intentionally not duplicated.';

create index if not exists support_inquiry_admin_actions_inquiry_created_idx
  on public.support_inquiry_admin_actions (inquiry_id, created_at desc, id desc);

create or replace function public.set_support_inquiries_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$function$;

comment on function public.set_support_inquiries_updated_at()
  is 'commatch_support_inquiries_v1';

drop trigger if exists support_inquiries_set_updated_at on public.support_inquiries;
create trigger support_inquiries_set_updated_at
  before update on public.support_inquiries
  for each row execute function public.set_support_inquiries_updated_at();

-- Preserve every existing permission while granting inquiry access only to
-- active super_admin and admin accounts. Moderators intentionally receive none.
create or replace function public.get_my_admin_access()
returns table (
  is_admin boolean,
  role text,
  status text,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(admin_account.status = 'active', false),
    admin_account.role,
    admin_account.status,
    case
      when admin_account.status is distinct from 'active' then array[]::text[]
      when admin_account.role = 'super_admin' then array[
        'admin_dashboard_view', 'reports_view', 'reports_manage',
        'admin_accounts_manage', 'member_restrictions_view', 'member_restrictions_manage',
        'premium_memberships_view', 'premium_memberships_manage', 'notices_manage',
        'support_inquiries_view', 'support_inquiries_manage'
      ]::text[]
      when admin_account.role = 'admin' then array[
        'admin_dashboard_view', 'reports_view', 'reports_manage',
        'member_restrictions_view', 'member_restrictions_manage',
        'premium_memberships_view', 'premium_memberships_manage', 'notices_manage',
        'support_inquiries_view', 'support_inquiries_manage'
      ]::text[]
      when admin_account.role = 'moderator' then array[
        'admin_dashboard_view', 'reports_view', 'reports_manage',
        'member_restrictions_view', 'premium_memberships_view'
      ]::text[]
      else array[]::text[]
    end
  from (select auth.uid() as user_id) as auth_context
  left join public.admin_accounts as admin_account
    on admin_account.user_id = auth_context.user_id
$function$;

comment on function public.get_my_admin_access()
  is 'commatch_support_inquiries_v1';

create or replace function public.has_admin_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_permission_key is null or p_permission_key = '' or p_permission_key not in (
      'admin_dashboard_view', 'reports_view', 'reports_manage', 'admin_accounts_manage',
      'member_restrictions_view', 'member_restrictions_manage',
      'premium_memberships_view', 'premium_memberships_manage', 'notices_manage',
      'support_inquiries_view', 'support_inquiries_manage'
    ) then false
    else coalesce((
      select p_permission_key = any(admin_access.permissions)
      from public.get_my_admin_access() as admin_access
    ), false)
  end
$function$;

comment on function public.has_admin_permission(text)
  is 'commatch_support_inquiries_v1';

create or replace function public.create_my_support_inquiry(
  p_category text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_category text := nullif(pg_catalog.btrim(p_category), '');
  v_subject text := nullif(pg_catalog.btrim(p_subject), '');
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_inquiry_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if v_category is null or v_category not in ('account', 'matching', 'premium', 'report', 'service', 'other') then
    raise exception using errcode = '22023', message = 'Invalid inquiry category';
  end if;
  if v_subject is null or pg_catalog.char_length(v_subject) not between 1 and 150 then
    raise exception using errcode = '22023', message = 'Subject must be between 1 and 150 characters';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Body must be between 1 and 5000 characters';
  end if;

  insert into public.support_inquiries (user_id, category, subject, body)
  values (v_user_id, v_category, v_subject, v_body)
  returning id into v_inquiry_id;

  return v_inquiry_id;
end
$function$;

comment on function public.create_my_support_inquiry(text, text, text)
  is 'commatch_support_inquiries_v1';

create or replace function public.get_my_support_inquiries()
returns table (
  inquiry_id uuid,
  category text,
  subject text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  answered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select inquiry.id, inquiry.category, inquiry.subject, inquiry.status,
    inquiry.created_at, inquiry.updated_at, inquiry.answered_at
  from public.support_inquiries as inquiry
  where auth.uid() is not null and inquiry.user_id = auth.uid()
  order by inquiry.created_at desc, inquiry.id desc
$function$;

comment on function public.get_my_support_inquiries()
  is 'commatch_support_inquiries_v1';

create or replace function public.get_my_support_inquiry(p_inquiry_id uuid)
returns table (
  inquiry_id uuid,
  category text,
  subject text,
  body text,
  status text,
  answer_body text,
  answered_at timestamptz,
  answer_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select inquiry.id, inquiry.category, inquiry.subject, inquiry.body, inquiry.status,
    inquiry.answer_body, inquiry.answered_at, inquiry.answer_updated_at,
    inquiry.created_at, inquiry.updated_at
  from public.support_inquiries as inquiry
  where auth.uid() is not null
    and inquiry.user_id = auth.uid()
    and inquiry.id = p_inquiry_id
$function$;

comment on function public.get_my_support_inquiry(uuid)
  is 'commatch_support_inquiries_v1';

create or replace function public.get_admin_support_inquiries(
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  inquiry_id uuid,
  user_id uuid,
  user_nickname text,
  profile_exists boolean,
  category text,
  subject text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_status text := nullif(pg_catalog.btrim(p_status), '');
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 20), 50));
begin
  if not coalesce(public.has_admin_permission('support_inquiries_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_status is not null and v_status not in ('pending', 'answered', 'closed') then
    raise exception using errcode = '22023', message = 'Invalid inquiry status';
  end if;

  return query
  select inquiry.id, inquiry.user_id, profile.nickname, profile.id is not null,
    inquiry.category, inquiry.subject, inquiry.status, inquiry.created_at,
    inquiry.updated_at, pg_catalog.count(*) over ()
  from public.support_inquiries as inquiry
  left join public.profiles as profile on profile.id = inquiry.user_id
  where v_status is null or inquiry.status = v_status
  order by inquiry.created_at desc, inquiry.id desc
  limit v_page_size offset (v_page::bigint - 1) * v_page_size;
end
$function$;

comment on function public.get_admin_support_inquiries(text, integer, integer)
  is 'commatch_support_inquiries_v1';

create or replace function public.get_admin_support_inquiry(p_inquiry_id uuid)
returns table (
  inquiry_id uuid,
  user_id uuid,
  user_nickname text,
  profile_exists boolean,
  category text,
  subject text,
  body text,
  status text,
  answer_body text,
  answered_at timestamptz,
  answer_updated_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('support_inquiries_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;

  return query
  select inquiry.id, inquiry.user_id, profile.nickname, profile.id is not null,
    inquiry.category, inquiry.subject, inquiry.body, inquiry.status, inquiry.answer_body,
    inquiry.answered_at, inquiry.answer_updated_at, inquiry.created_at, inquiry.updated_at
  from public.support_inquiries as inquiry
  left join public.profiles as profile on profile.id = inquiry.user_id
  where inquiry.id = p_inquiry_id;
end
$function$;

comment on function public.get_admin_support_inquiry(uuid)
  is 'commatch_support_inquiries_v1';

create or replace function public.get_admin_support_inquiry_actions(p_inquiry_id uuid)
returns table (
  action_id uuid,
  action text,
  previous_status text,
  new_status text,
  admin_user_id uuid,
  admin_role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('support_inquiries_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;

  return query
  select action_row.id, action_row.action, action_row.previous_status,
    action_row.new_status, action_row.admin_user_id, admin_account.role, action_row.created_at
  from public.support_inquiry_admin_actions as action_row
  left join public.admin_accounts as admin_account
    on admin_account.user_id = action_row.admin_user_id
  where action_row.inquiry_id = p_inquiry_id
  order by action_row.created_at desc, action_row.id desc;
end
$function$;

comment on function public.get_admin_support_inquiry_actions(uuid)
  is 'commatch_support_inquiries_v1';

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

  select inquiry.status, inquiry.updated_at, inquiry.answered_at
  into v_previous_status, v_current_updated_at, v_answered_at
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

  return query select v_result.id, v_result.status, v_result.answered_at,
    v_result.answer_updated_at, v_result.updated_at;
end
$function$;

comment on function public.answer_admin_support_inquiry(uuid, timestamptz, text)
  is 'commatch_support_inquiries_v1';

create or replace function public.close_admin_support_inquiry(
  p_inquiry_id uuid,
  p_expected_updated_at timestamptz
)
returns table (inquiry_id uuid, status text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_previous_status text;
  v_current_updated_at timestamptz;
  v_result record;
begin
  if not coalesce(public.has_admin_permission('support_inquiries_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_inquiry_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Inquiry ID and expected update time are required';
  end if;

  select inquiry.status, inquiry.updated_at
  into v_previous_status, v_current_updated_at
  from public.support_inquiries as inquiry
  where inquiry.id = p_inquiry_id
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'Inquiry not found'; end if;
  if v_current_updated_at <> p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'SUPPORT_INQUIRY_STALE_VERSION';
  end if;
  if v_previous_status <> 'answered' then
    raise exception using errcode = '22023', message = 'Only answered inquiries can be closed';
  end if;

  update public.support_inquiries as inquiry
  set status = 'closed'
  where inquiry.id = p_inquiry_id
  returning inquiry.id, inquiry.status, inquiry.updated_at into v_result;

  insert into public.support_inquiry_admin_actions (
    inquiry_id, admin_user_id, action, previous_status, new_status, created_at
  ) values (p_inquiry_id, v_admin_user_id, 'close', 'answered', 'closed', v_result.updated_at);

  return query select v_result.id, v_result.status, v_result.updated_at;
end
$function$;

comment on function public.close_admin_support_inquiry(uuid, timestamptz)
  is 'commatch_support_inquiries_v1';

alter table public.support_inquiries owner to postgres;
alter table public.support_inquiry_admin_actions owner to postgres;
alter function public.get_my_admin_access() owner to postgres;
alter function public.has_admin_permission(text) owner to postgres;
alter function public.set_support_inquiries_updated_at() owner to postgres;
alter function public.create_my_support_inquiry(text, text, text) owner to postgres;
alter function public.get_my_support_inquiries() owner to postgres;
alter function public.get_my_support_inquiry(uuid) owner to postgres;
alter function public.get_admin_support_inquiries(text, integer, integer) owner to postgres;
alter function public.get_admin_support_inquiry(uuid) owner to postgres;
alter function public.get_admin_support_inquiry_actions(uuid) owner to postgres;
alter function public.answer_admin_support_inquiry(uuid, timestamptz, text) owner to postgres;
alter function public.close_admin_support_inquiry(uuid, timestamptz) owner to postgres;

alter table public.support_inquiries enable row level security;
alter table public.support_inquiry_admin_actions enable row level security;

revoke all on table public.support_inquiries from public, anon, authenticated, service_role;
revoke all on table public.support_inquiry_admin_actions from public, anon, authenticated, service_role;

revoke all on function public.set_support_inquiries_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.get_my_admin_access() from public, anon, authenticated, service_role;
revoke all on function public.has_admin_permission(text) from public, anon, authenticated, service_role;
revoke all on function public.create_my_support_inquiry(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_my_support_inquiries() from public, anon, authenticated, service_role;
revoke all on function public.get_my_support_inquiry(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_support_inquiries(text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_support_inquiry(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_support_inquiry_actions(uuid) from public, anon, authenticated, service_role;
revoke all on function public.answer_admin_support_inquiry(uuid, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.close_admin_support_inquiry(uuid, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.create_my_support_inquiry(text, text, text) to authenticated;
grant execute on function public.get_my_support_inquiries() to authenticated;
grant execute on function public.get_my_support_inquiry(uuid) to authenticated;
grant execute on function public.get_admin_support_inquiries(text, integer, integer) to authenticated;
grant execute on function public.get_admin_support_inquiry(uuid) to authenticated;
grant execute on function public.get_admin_support_inquiry_actions(uuid) to authenticated;
grant execute on function public.answer_admin_support_inquiry(uuid, timestamptz, text) to authenticated;
grant execute on function public.close_admin_support_inquiry(uuid, timestamptz) to authenticated;

commit;
