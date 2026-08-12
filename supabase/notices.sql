-- ComMatch public notices and administrator notice management.
-- Run after the administrator account and permission SQL files.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null then
    raise exception 'Auth users and admin_accounts must exist before installing notices';
  end if;
  if pg_catalog.to_regprocedure('public.get_my_admin_access()') is null
     or pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'Administrator permission functions must exist before installing notices';
  end if;
end
$preflight$;

create table if not exists public.notices (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  body text not null,
  status text not null default 'draft',
  published_at timestamptz,
  created_by_admin_user_id uuid references auth.users(id) on delete set null,
  updated_by_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint notices_title_length_check check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 150
  ),
  constraint notices_body_length_check check (
    pg_catalog.char_length(pg_catalog.btrim(body)) between 1 and 10000
  ),
  constraint notices_status_check check (status in ('draft', 'published', 'archived')),
  constraint notices_published_at_check check (
    (status = 'published' and published_at is not null)
    or (status = 'draft' and published_at is null)
    or status = 'archived'
  ),
  constraint notices_timestamp_order_check check (updated_at >= created_at)
);

create index if not exists notices_public_published_idx
  on public.notices (published_at desc, id desc)
  where status = 'published';

create index if not exists notices_admin_status_updated_idx
  on public.notices (status, updated_at desc, id desc);

create or replace function public.set_notices_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$function$;

drop trigger if exists notices_set_updated_at on public.notices;
create trigger notices_set_updated_at
  before update on public.notices
  for each row execute function public.set_notices_updated_at();

alter table public.notices enable row level security;

-- Preserve the existing return signature and permission ordering while adding
-- the notice permission only for active super_admin and admin accounts.
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
    coalesce(admin_account.status = 'active', false) as is_admin,
    admin_account.role,
    admin_account.status,
    case
      when admin_account.status is distinct from 'active'
        then array[]::text[]
      when admin_account.role = 'super_admin'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'admin_accounts_manage',
          'member_restrictions_view',
          'member_restrictions_manage',
          'premium_memberships_view',
          'premium_memberships_manage',
          'notices_manage'
        ]::text[]
      when admin_account.role = 'admin'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'member_restrictions_view',
          'member_restrictions_manage',
          'premium_memberships_view',
          'premium_memberships_manage',
          'notices_manage'
        ]::text[]
      when admin_account.role = 'moderator'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'member_restrictions_view',
          'premium_memberships_view'
        ]::text[]
      else array[]::text[]
    end as permissions
  from (select auth.uid() as user_id) as auth_context
  left join public.admin_accounts as admin_account
    on admin_account.user_id = auth_context.user_id
$function$;

comment on function public.get_my_admin_access()
  is 'commatch_notices_v1';

create or replace function public.has_admin_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_permission_key is null
      or p_permission_key = ''
      or p_permission_key not in (
        'admin_dashboard_view',
        'reports_view',
        'reports_manage',
        'admin_accounts_manage',
        'member_restrictions_view',
        'member_restrictions_manage',
        'premium_memberships_view',
        'premium_memberships_manage',
        'notices_manage'
      )
    then false
    else coalesce(
      (
        select p_permission_key = any(admin_access.permissions)
        from public.get_my_admin_access() as admin_access
      ),
      false
    )
  end
$function$;

comment on function public.has_admin_permission(text)
  is 'commatch_notices_v1';

create or replace function public.get_public_notices()
returns table (
  notice_id uuid,
  title text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select notice.id, notice.title, notice.published_at
  from public.notices as notice
  where notice.status = 'published'
    and notice.published_at is not null
    and notice.published_at <= pg_catalog.now()
  order by notice.published_at desc, notice.id desc
$function$;

create or replace function public.get_public_notice(p_notice_id uuid)
returns table (
  notice_id uuid,
  title text,
  body text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select notice.id, notice.title, notice.body, notice.published_at
  from public.notices as notice
  where notice.id = p_notice_id
    and notice.status = 'published'
    and notice.published_at is not null
    and notice.published_at <= pg_catalog.now()
$function$;

create or replace function public.get_admin_notices()
returns table (
  notice_id uuid,
  title text,
  status text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('notices_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;

  return query
  select
    notice.id,
    notice.title,
    notice.status,
    notice.published_at,
    notice.created_at,
    notice.updated_at
  from public.notices as notice
  order by notice.updated_at desc, notice.id desc;
end
$function$;

create or replace function public.get_admin_notice(p_notice_id uuid)
returns table (
  notice_id uuid,
  title text,
  body text,
  status text,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('notices_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_notice_id is null then
    raise exception using errcode = '22023', message = 'Notice ID is required';
  end if;

  return query
  select
    notice.id,
    notice.title,
    notice.body,
    notice.status,
    notice.published_at,
    notice.created_at,
    notice.updated_at
  from public.notices as notice
  where notice.id = p_notice_id;
end
$function$;

create or replace function public.create_admin_notice(
  p_title text,
  p_body text
)
returns table (
  notice_id uuid,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_body text := pg_catalog.btrim(p_body);
begin
  if not coalesce(public.has_admin_permission('notices_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 150 then
    raise exception using errcode = '22023', message = 'Title must be between 1 and 150 characters';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Body must be between 1 and 10000 characters';
  end if;

  return query
  insert into public.notices (
    title,
    body,
    status,
    created_by_admin_user_id,
    updated_by_admin_user_id
  ) values (
    v_title,
    v_body,
    'draft',
    auth.uid(),
    auth.uid()
  )
  returning notices.id, notices.updated_at;
end
$function$;

create or replace function public.update_admin_notice(
  p_notice_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_body text
)
returns table (
  notice_id uuid,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_body text := pg_catalog.btrim(p_body);
begin
  if not coalesce(public.has_admin_permission('notices_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_notice_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Notice ID and expected update time are required';
  end if;
  if v_title is null or pg_catalog.char_length(v_title) not between 1 and 150 then
    raise exception using errcode = '22023', message = 'Title must be between 1 and 150 characters';
  end if;
  if v_body is null or pg_catalog.char_length(v_body) not between 1 and 10000 then
    raise exception using errcode = '22023', message = 'Body must be between 1 and 10000 characters';
  end if;

  return query
  update public.notices as notice
  set title = v_title,
      body = v_body,
      updated_by_admin_user_id = auth.uid()
  where notice.id = p_notice_id
    and notice.updated_at = p_expected_updated_at
    and notice.status <> 'archived'
  returning notice.id, notice.updated_at;

  if not found then
    if not exists (select 1 from public.notices as existing_notice where existing_notice.id = p_notice_id) then
      raise exception using errcode = 'P0002', message = 'Notice not found';
    end if;
    if exists (
      select 1
      from public.notices as existing_notice
      where existing_notice.id = p_notice_id
        and existing_notice.status = 'archived'
    ) then
      raise exception using errcode = '22023', message = 'Archived notices cannot be edited';
    end if;
    raise exception using errcode = 'P0001', message = 'NOTICE_STALE_VERSION';
  end if;
end
$function$;

create or replace function public.change_admin_notice_status(
  p_notice_id uuid,
  p_expected_updated_at timestamptz,
  p_new_status text
)
returns table (
  notice_id uuid,
  status text,
  published_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('notices_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_notice_id is null or p_expected_updated_at is null then
    raise exception using errcode = '22023', message = 'Notice ID and expected update time are required';
  end if;
  if p_new_status not in ('draft', 'published', 'archived') then
    raise exception using errcode = '22023', message = 'Unsupported notice status';
  end if;

  return query
  update public.notices as notice
  set status = p_new_status,
      published_at = case
        when p_new_status = 'published' then coalesce(notice.published_at, pg_catalog.now())
        when p_new_status = 'draft' then null
        else notice.published_at
      end,
      updated_by_admin_user_id = auth.uid()
  where notice.id = p_notice_id
    and notice.updated_at = p_expected_updated_at
    and notice.status <> 'archived'
    and notice.status <> p_new_status
    and (
      (notice.status = 'draft' and p_new_status in ('published', 'archived'))
      or (notice.status = 'published' and p_new_status in ('draft', 'archived'))
    )
  returning notice.id, notice.status, notice.published_at, notice.updated_at;

  if not found then
    if not exists (select 1 from public.notices as existing_notice where existing_notice.id = p_notice_id) then
      raise exception using errcode = 'P0002', message = 'Notice not found';
    end if;
    if exists (
      select 1
      from public.notices as existing_notice
      where existing_notice.id = p_notice_id
        and existing_notice.updated_at <> p_expected_updated_at
    ) then
      raise exception using errcode = 'P0001', message = 'NOTICE_STALE_VERSION';
    end if;
    raise exception using errcode = '22023', message = 'Unsupported notice status transition';
  end if;
end
$function$;

revoke all on table public.notices from public, anon, authenticated;
grant select, insert, update, delete on table public.notices to service_role;

revoke all on function public.set_notices_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.get_public_notices() from public, anon, authenticated, service_role;
revoke all on function public.get_public_notice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_notices() from public, anon, authenticated, service_role;
revoke all on function public.get_admin_notice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_notice(text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_admin_notice(uuid, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke all on function public.change_admin_notice_status(uuid, timestamptz, text) from public, anon, authenticated, service_role;

grant execute on function public.get_public_notices() to anon, authenticated;
grant execute on function public.get_public_notice(uuid) to anon, authenticated;
grant execute on function public.get_admin_notices() to authenticated;
grant execute on function public.get_admin_notice(uuid) to authenticated;
grant execute on function public.create_admin_notice(text, text) to authenticated;
grant execute on function public.update_admin_notice(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.change_admin_notice_status(uuid, timestamptz, text) to authenticated;

-- Reassert the existing access-function grants after replacing their bodies.
revoke all on function public.get_my_admin_access() from public, anon, authenticated, service_role;
revoke all on function public.has_admin_permission(text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;

commit;

-- Read-only verification examples:
-- select * from public.get_public_notices();
-- select * from public.get_public_notice('<NOTICE_UUID>'::uuid);
