-- ComMatch member restriction foundation.
-- Run after admin-accounts.sql, reports.sql, and admin-report-management.sql.
-- This migration is intentionally safe to run repeatedly: approved objects are
-- retained, incompatible pre-existing objects cause an explicit error, and no
-- member restriction or action rows are deleted.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_member_restrictions_v1';
  v_relation_name text;
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.reports') is null then
    raise exception 'Required Auth, profiles, admin accounts, or reports objects are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_info
    where attribute_info.attrelid = 'public.profiles'::pg_catalog.regclass
      and attribute_info.attname = 'id'
      and attribute_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and attribute_info.attnum > 0
      and not attribute_info.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_info
    where attribute_info.attrelid = 'public.profiles'::pg_catalog.regclass
      and attribute_info.attname = 'nickname'
      and attribute_info.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and attribute_info.attnum > 0
      and not attribute_info.attisdropped
  ) then
    raise exception 'public.profiles must contain uuid id and text nickname columns';
  end if;

  if pg_catalog.to_regprocedure('public.get_my_admin_access()') is null
     or pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'Required admin permission functions are missing';
  end if;

  if pg_catalog.pg_get_function_result(
       pg_catalog.to_regprocedure('public.get_my_admin_access()')
     ) <> 'TABLE(is_admin boolean, role text, status text, permissions text[])'
     or pg_catalog.pg_get_function_result(
       pg_catalog.to_regprocedure('public.has_admin_permission(text)')
     ) <> 'boolean' then
    raise exception 'Admin permission function return types are incompatible';
  end if;

  foreach v_relation_name in array array[
    'member_restrictions',
    'member_restriction_actions'
  ]
  loop
    if pg_catalog.to_regclass('public.' || v_relation_name) is not null
       and pg_catalog.obj_description(
         pg_catalog.to_regclass('public.' || v_relation_name),
         'pg_class'
       ) is distinct from v_marker then
      raise exception 'public.% already exists without the approved definition marker',
        v_relation_name;
    end if;
  end loop;

  for v_function in
    select
      function_info.oid,
      function_info.proname,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'set_member_restrictions_updated_at',
        'get_my_member_access',
        'is_member_service_allowed',
        'get_admin_member_restriction',
        'get_admin_member_restriction_actions',
        'update_admin_member_restriction'
      )
  loop
    if pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.%(%) already exists without the approved definition marker',
        v_function.proname, v_function.arguments;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.member_restrictions (
  user_id uuid primary key,
  account_status text not null default 'active',
  profile_visibility text not null default 'visible',
  suspended_at timestamptz null,
  suspended_until timestamptz null,
  reason text null,
  admin_note text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint member_restrictions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint member_restrictions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint member_restrictions_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null,
  constraint member_restrictions_account_status_check
    check (account_status in ('active', 'suspended')),
  constraint member_restrictions_profile_visibility_check
    check (profile_visibility in ('visible', 'hidden')),
  constraint member_restrictions_suspension_shape_check
    check (
      (
        account_status = 'active'
        and suspended_at is null
        and suspended_until is null
      )
      or
      (
        account_status = 'suspended'
        and suspended_at is not null
        and (suspended_until is null or suspended_until > suspended_at)
      )
    ),
  constraint member_restrictions_reason_check
    check (
      reason is null
      or (reason = pg_catalog.btrim(reason) and pg_catalog.char_length(reason) between 1 and 500)
    ),
  constraint member_restrictions_admin_note_check
    check (
      admin_note is null
      or (admin_note = pg_catalog.btrim(admin_note) and pg_catalog.char_length(admin_note) between 1 and 2000)
    )
);

comment on table public.member_restrictions
  is 'commatch_admin_member_restrictions_v1';

create table if not exists public.member_restriction_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid null,
  subject_user_id uuid not null,
  admin_user_id uuid null,
  report_id uuid null,
  action_type text not null,
  previous_account_status text not null,
  new_account_status text not null,
  previous_profile_visibility text not null,
  new_profile_visibility text not null,
  previous_suspended_until timestamptz null,
  new_suspended_until timestamptz null,
  reason text null,
  note text null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint member_restriction_actions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  constraint member_restriction_actions_admin_user_id_fkey
    foreign key (admin_user_id) references auth.users(id) on delete set null,
  constraint member_restriction_actions_report_id_fkey
    foreign key (report_id) references public.reports(id) on delete set null,
  constraint member_restriction_actions_action_type_check
    check (action_type in (
      'account_suspended',
      'account_reactivated',
      'profile_hidden',
      'profile_restored',
      'suspension_updated',
      'restriction_updated'
    )),
  constraint member_restriction_actions_previous_account_status_check
    check (previous_account_status in ('active', 'suspended')),
  constraint member_restriction_actions_new_account_status_check
    check (new_account_status in ('active', 'suspended')),
  constraint member_restriction_actions_previous_profile_visibility_check
    check (previous_profile_visibility in ('visible', 'hidden')),
  constraint member_restriction_actions_new_profile_visibility_check
    check (new_profile_visibility in ('visible', 'hidden')),
  constraint member_restriction_actions_reason_check
    check (
      reason is null
      or (reason = pg_catalog.btrim(reason) and pg_catalog.char_length(reason) between 1 and 500)
    ),
  constraint member_restriction_actions_note_check
    check (
      note is null
      or (note = pg_catalog.btrim(note) and pg_catalog.char_length(note) between 1 and 2000)
    )
);

comment on table public.member_restriction_actions
  is 'commatch_admin_member_restrictions_v1';
comment on column public.member_restriction_actions.subject_user_id
  is 'Immutable target UUID retained after the Auth user and nullable user_id FK are deleted';

create index if not exists member_restrictions_account_status_idx
  on public.member_restrictions (account_status);
create index if not exists member_restrictions_profile_visibility_idx
  on public.member_restrictions (profile_visibility);
create index if not exists member_restrictions_suspended_until_idx
  on public.member_restrictions (suspended_until);
create index if not exists member_restrictions_updated_by_idx
  on public.member_restrictions (updated_by);

create index if not exists member_restriction_actions_user_created_idx
  on public.member_restriction_actions (user_id, created_at desc, id desc);
create index if not exists member_restriction_actions_subject_created_idx
  on public.member_restriction_actions (subject_user_id, created_at desc, id desc);
create index if not exists member_restriction_actions_admin_user_idx
  on public.member_restriction_actions (admin_user_id);
create index if not exists member_restriction_actions_report_idx
  on public.member_restriction_actions (report_id);

do $table_validation$
declare
  v_columns text[];
  v_constraint_names text[];
  v_index_names text[];
begin
  select pg_catalog.array_agg(
    attribute_info.attname || ':'
      || attribute_info.atttypid::pg_catalog.regtype::text || ':'
      || case when attribute_info.attnotnull then 'NO' else 'YES' end
    order by attribute_info.attnum
  )
  into v_columns
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = 'public.member_restrictions'::pg_catalog.regclass
    and attribute_info.attnum > 0
    and not attribute_info.attisdropped;

  if v_columns <> array[
    'user_id:uuid:NO',
    'account_status:text:NO',
    'profile_visibility:text:NO',
    'suspended_at:timestamp with time zone:YES',
    'suspended_until:timestamp with time zone:YES',
    'reason:text:YES',
    'admin_note:text:YES',
    'created_by:uuid:YES',
    'updated_by:uuid:YES',
    'created_at:timestamp with time zone:NO',
    'updated_at:timestamp with time zone:NO'
  ]::text[] then
    raise exception 'public.member_restrictions columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    attribute_info.attname || ':'
      || attribute_info.atttypid::pg_catalog.regtype::text || ':'
      || case when attribute_info.attnotnull then 'NO' else 'YES' end
    order by attribute_info.attnum
  )
  into v_columns
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = 'public.member_restriction_actions'::pg_catalog.regclass
    and attribute_info.attnum > 0
    and not attribute_info.attisdropped;

  if v_columns <> array[
    'id:uuid:NO',
    'user_id:uuid:YES',
    'subject_user_id:uuid:NO',
    'admin_user_id:uuid:YES',
    'report_id:uuid:YES',
    'action_type:text:NO',
    'previous_account_status:text:NO',
    'new_account_status:text:NO',
    'previous_profile_visibility:text:NO',
    'new_profile_visibility:text:NO',
    'previous_suspended_until:timestamp with time zone:YES',
    'new_suspended_until:timestamp with time zone:YES',
    'reason:text:YES',
    'note:text:YES',
    'created_at:timestamp with time zone:NO'
  ]::text[] then
    raise exception 'public.member_restriction_actions columns differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attrdef as default_info
    join pg_catalog.pg_attribute as attribute_info
      on attribute_info.attrelid = default_info.adrelid
      and attribute_info.attnum = default_info.adnum
    where default_info.adrelid = 'public.member_restrictions'::pg_catalog.regclass
      and attribute_info.attname = 'account_status'
      and pg_catalog.pg_get_expr(default_info.adbin, default_info.adrelid) = '''active''::text'
  ) or not exists (
    select 1
    from pg_catalog.pg_attrdef as default_info
    join pg_catalog.pg_attribute as attribute_info
      on attribute_info.attrelid = default_info.adrelid
      and attribute_info.attnum = default_info.adnum
    where default_info.adrelid = 'public.member_restrictions'::pg_catalog.regclass
      and attribute_info.attname = 'profile_visibility'
      and pg_catalog.pg_get_expr(default_info.adbin, default_info.adrelid) = '''visible''::text'
  ) or not exists (
    select 1
    from pg_catalog.pg_attrdef as default_info
    join pg_catalog.pg_attribute as attribute_info
      on attribute_info.attrelid = default_info.adrelid
      and attribute_info.attnum = default_info.adnum
    where default_info.adrelid = 'public.member_restriction_actions'::pg_catalog.regclass
      and attribute_info.attname = 'id'
      and pg_catalog.pg_get_expr(default_info.adbin, default_info.adrelid) in (
        'gen_random_uuid()',
        'pg_catalog.gen_random_uuid()'
      )
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_attrdef as default_info
    join pg_catalog.pg_attribute as attribute_info
      on attribute_info.attrelid = default_info.adrelid
      and attribute_info.attnum = default_info.adnum
    where (
      default_info.adrelid = 'public.member_restrictions'::pg_catalog.regclass
      and attribute_info.attname in ('created_at', 'updated_at')
      or default_info.adrelid = 'public.member_restriction_actions'::pg_catalog.regclass
      and attribute_info.attname = 'created_at'
    )
      and pg_catalog.pg_get_expr(default_info.adbin, default_info.adrelid) in (
        'now()',
        'pg_catalog.now()'
      )
  ) <> 3 then
    raise exception 'Member restriction defaults differ from the approved definition';
  end if;

  select pg_catalog.array_agg(constraint_info.conname order by constraint_info.conname)
  into v_constraint_names
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.member_restrictions'::pg_catalog.regclass;

  if v_constraint_names <> array[
    'member_restrictions_account_status_check',
    'member_restrictions_admin_note_check',
    'member_restrictions_created_by_fkey',
    'member_restrictions_pkey',
    'member_restrictions_profile_visibility_check',
    'member_restrictions_reason_check',
    'member_restrictions_suspension_shape_check',
    'member_restrictions_updated_by_fkey',
    'member_restrictions_user_id_fkey'
  ]::text[] then
    raise exception 'public.member_restrictions constraints differ from the approved definition';
  end if;

  select pg_catalog.array_agg(constraint_info.conname order by constraint_info.conname)
  into v_constraint_names
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.member_restriction_actions'::pg_catalog.regclass;

  if v_constraint_names <> array[
    'member_restriction_actions_action_type_check',
    'member_restriction_actions_admin_user_id_fkey',
    'member_restriction_actions_new_account_status_check',
    'member_restriction_actions_new_profile_visibility_check',
    'member_restriction_actions_note_check',
    'member_restriction_actions_pkey',
    'member_restriction_actions_previous_account_status_check',
    'member_restriction_actions_previous_profile_visibility_check',
    'member_restriction_actions_reason_check',
    'member_restriction_actions_report_id_fkey',
    'member_restriction_actions_user_id_fkey'
  ]::text[] then
    raise exception 'public.member_restriction_actions constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.member_restrictions'::pg_catalog.regclass
      and constraint_info.conname = 'member_restrictions_user_id_fkey'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'c'
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid in (
      'public.member_restrictions'::pg_catalog.regclass,
      'public.member_restriction_actions'::pg_catalog.regclass
    )
      and constraint_info.contype = 'f'
      and constraint_info.conname <> 'member_restrictions_user_id_fkey'
      and constraint_info.confdeltype <> 'n'
  ) <> 0 then
    raise exception 'Member restriction foreign-key delete behavior differs from the approved definition';
  end if;

  select pg_catalog.array_agg(index_info.relname order by index_info.relname)
  into v_index_names
  from pg_catalog.pg_index as index_catalog
  join pg_catalog.pg_class as index_info on index_info.oid = index_catalog.indexrelid
  where index_catalog.indrelid in (
    'public.member_restrictions'::pg_catalog.regclass,
    'public.member_restriction_actions'::pg_catalog.regclass
  )
    and not index_catalog.indisprimary;

  if v_index_names <> array[
    'member_restriction_actions_admin_user_idx',
    'member_restriction_actions_report_idx',
    'member_restriction_actions_subject_created_idx',
    'member_restriction_actions_user_created_idx',
    'member_restrictions_account_status_idx',
    'member_restrictions_profile_visibility_idx',
    'member_restrictions_suspended_until_idx',
    'member_restrictions_updated_by_idx'
  ]::text[] or exists (
    select 1
    from pg_catalog.pg_index as index_catalog
    join pg_catalog.pg_class as index_info on index_info.oid = index_catalog.indexrelid
    where index_info.relname = any(v_index_names)
      and (not index_catalog.indisvalid or not index_catalog.indisready)
  ) then
    raise exception 'Member restriction indexes differ from the approved definition';
  end if;
end
$table_validation$;

create or replace function public.set_member_restrictions_updated_at()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$function$;

comment on function public.set_member_restrictions_updated_at()
  is 'commatch_admin_member_restrictions_v1';

do $updated_at_trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.member_restrictions'::pg_catalog.regclass
      and trigger_info.tgname = 'member_restrictions_set_updated_at'
      and not trigger_info.tgisinternal
  ) then
    create trigger member_restrictions_set_updated_at
      before update on public.member_restrictions
      for each row
      execute function public.set_member_restrictions_updated_at();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.member_restrictions'::pg_catalog.regclass
      and trigger_info.tgname = 'member_restrictions_set_updated_at'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid =
        'public.set_member_restrictions_updated_at()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 19
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgnargs = 0
  ) then
    raise exception 'member_restrictions_set_updated_at has an incompatible definition';
  end if;
end
$updated_at_trigger$;

-- Preserve the original return type and permission ordering while extending the
-- role matrix with the two member restriction permissions.
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
          'member_restrictions_manage'
        ]::text[]
      when admin_account.role = 'admin'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'member_restrictions_view',
          'member_restrictions_manage'
        ]::text[]
      when admin_account.role = 'moderator'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'member_restrictions_view'
        ]::text[]
      else array[]::text[]
    end as permissions
  from (select auth.uid() as user_id) as auth_context
  left join public.admin_accounts as admin_account
    on admin_account.user_id = auth_context.user_id
$function$;

comment on function public.get_my_admin_access()
  is 'commatch_admin_member_restrictions_v1';

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
        'member_restrictions_manage'
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
  is 'commatch_admin_member_restrictions_v1';

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
      when restriction.account_status is null then true
      when restriction.account_status = 'active' then true
      when restriction.suspended_until is not null
        and restriction.suspended_until <= pg_catalog.now() then true
      else false
    end as is_allowed,
    case
      when auth_context.user_id is null then null::text
      else coalesce(restriction.account_status, 'active')
    end as account_status,
    case
      when auth_context.user_id is null then null::text
      else coalesce(restriction.profile_visibility, 'visible')
    end as profile_visibility,
    case when auth_context.user_id is null then null else restriction.suspended_until end,
    case when auth_context.user_id is null then null else restriction.reason end
  from (select auth.uid() as user_id) as auth_context
  left join public.member_restrictions as restriction
    on restriction.user_id = auth_context.user_id
$function$;

comment on function public.get_my_member_access()
  is 'commatch_admin_member_restrictions_v1';

create or replace function public.is_member_service_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select member_access.is_allowed from public.get_my_member_access() as member_access),
    false
  )
$function$;

comment on function public.is_member_service_allowed()
  is 'commatch_admin_member_restrictions_v1';

create or replace function public.get_admin_member_restriction(p_target_user_id uuid)
returns table (
  user_id uuid,
  profile_exists boolean,
  nickname text,
  account_status text,
  profile_visibility text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  reason text,
  admin_note text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(
    public.has_admin_permission('member_restrictions_view'),
    false
  ) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;

  return query
  select
    p_target_user_id,
    profile.id is not null,
    profile.nickname,
    coalesce(restriction.account_status, 'active'),
    coalesce(restriction.profile_visibility, 'visible'),
    restriction.suspended_at,
    restriction.suspended_until,
    restriction.reason,
    restriction.admin_note,
    restriction.created_at,
    restriction.updated_at,
    restriction.created_by,
    restriction.updated_by
  from (select 1) as singleton
  left join public.profiles as profile on profile.id = p_target_user_id
  left join public.member_restrictions as restriction
    on restriction.user_id = p_target_user_id;
end
$function$;

comment on function public.get_admin_member_restriction(uuid)
  is 'commatch_admin_member_restrictions_v1';

create or replace function public.get_admin_member_restriction_actions(
  p_target_user_id uuid
)
returns table (
  action_id uuid,
  action_type text,
  previous_account_status text,
  new_account_status text,
  previous_profile_visibility text,
  new_profile_visibility text,
  previous_suspended_until timestamptz,
  new_suspended_until timestamptz,
  reason text,
  note text,
  report_id uuid,
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
  if not coalesce(
    public.has_admin_permission('member_restrictions_view'),
    false
  ) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;

  return query
  select
    action.id,
    action.action_type,
    action.previous_account_status,
    action.new_account_status,
    action.previous_profile_visibility,
    action.new_profile_visibility,
    action.previous_suspended_until,
    action.new_suspended_until,
    action.reason,
    action.note,
    action.report_id,
    action.admin_user_id,
    admin_account.role,
    action.created_at
  from public.member_restriction_actions as action
  left join public.admin_accounts as admin_account
    on admin_account.user_id = action.admin_user_id
  where action.subject_user_id = p_target_user_id
  order by action.created_at desc, action.id desc;
end
$function$;

comment on function public.get_admin_member_restriction_actions(uuid)
  is 'commatch_admin_member_restrictions_v1';

create or replace function public.update_admin_member_restriction(
  p_target_user_id uuid,
  p_new_account_status text,
  p_new_profile_visibility text,
  p_new_suspended_until timestamptz,
  p_related_report_id uuid default null,
  p_restriction_reason text default null,
  p_admin_note text default null
)
returns table (
  user_id uuid,
  previous_account_status text,
  new_account_status text,
  previous_profile_visibility text,
  new_profile_visibility text,
  previous_suspended_until timestamptz,
  new_suspended_until timestamptz,
  reason text,
  note text,
  action_id uuid,
  changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_account_status text := nullif(pg_catalog.btrim(p_new_account_status), '');
  v_profile_visibility text := nullif(pg_catalog.btrim(p_new_profile_visibility), '');
  v_reason text := nullif(pg_catalog.btrim(p_restriction_reason), '');
  v_note text := nullif(pg_catalog.btrim(p_admin_note), '');
  v_previous_account_status text := 'active';
  v_previous_profile_visibility text := 'visible';
  v_previous_suspended_at timestamptz;
  v_previous_suspended_until timestamptz;
  v_previous_reason text;
  v_previous_note text;
  v_new_suspended_at timestamptz;
  v_action_type text;
  v_action_id uuid := pg_catalog.gen_random_uuid();
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(
    public.has_admin_permission('member_restrictions_manage'),
    false
  ) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_target_user_id = v_admin_user_id then
    raise exception using errcode = '42501', message = 'Administrators cannot restrict themselves';
  end if;
  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = p_target_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator accounts cannot be member-restricted';
  end if;

  if v_account_status is null or v_account_status not in ('active', 'suspended') then
    raise exception using errcode = '22023', message = 'Invalid account status';
  end if;
  if v_profile_visibility is null or v_profile_visibility not in ('visible', 'hidden') then
    raise exception using errcode = '22023', message = 'Invalid profile visibility';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Restriction reason must be 500 characters or fewer';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'Admin note must be 2000 characters or fewer';
  end if;
  if v_account_status = 'active' and p_new_suspended_until is not null then
    raise exception using errcode = '22023', message = 'Active accounts cannot have a suspension end time';
  end if;
  if v_account_status = 'suspended'
     and p_new_suspended_until is not null
     and p_new_suspended_until <= v_changed_at then
    raise exception using errcode = '22023', message = 'Suspension end time must be in the future';
  end if;

  if p_related_report_id is not null and not exists (
    select 1
    from public.reports as report
    where report.id = p_related_report_id
      and report.target_user_id = p_target_user_id
  ) then
    raise exception using errcode = '22023', message = 'Related report does not match the target user';
  end if;

  -- A transaction-scoped advisory lock also serializes the first write when no
  -- current-state row exists yet. Existing rows are additionally locked below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_user_id::text, 731947)
  );

  select
    restriction.account_status,
    restriction.profile_visibility,
    restriction.suspended_at,
    restriction.suspended_until,
    restriction.reason,
    restriction.admin_note
  into
    v_previous_account_status,
    v_previous_profile_visibility,
    v_previous_suspended_at,
    v_previous_suspended_until,
    v_previous_reason,
    v_previous_note
  from public.member_restrictions as restriction
  where restriction.user_id = p_target_user_id
  for update;

  if not found then
    v_previous_account_status := 'active';
    v_previous_profile_visibility := 'visible';
    v_previous_suspended_at := null;
    v_previous_suspended_until := null;
    v_previous_reason := null;
    v_previous_note := null;
  end if;

  if v_account_status = 'active' then
    v_new_suspended_at := null;
  elsif v_previous_account_status = 'suspended' then
    v_new_suspended_at := v_previous_suspended_at;
  else
    v_new_suspended_at := v_changed_at;
  end if;

  if v_account_status = 'suspended'
     and p_new_suspended_until is not null
     and p_new_suspended_until <= v_new_suspended_at then
    raise exception using errcode = '22023', message = 'Suspension end time must follow suspension start time';
  end if;

  if v_previous_account_status = v_account_status
     and v_previous_profile_visibility = v_profile_visibility
     and v_previous_suspended_until is not distinct from p_new_suspended_until
     and v_previous_reason is not distinct from v_reason
     and v_previous_note is not distinct from v_note then
    raise exception using errcode = '22023', message = 'Member restriction is unchanged';
  end if;

  v_action_type := case
    when v_previous_account_status = 'active'
      and v_account_status = 'suspended'
      and v_previous_profile_visibility = v_profile_visibility
      then 'account_suspended'
    when v_previous_account_status = 'suspended'
      and v_account_status = 'active'
      and v_previous_profile_visibility = v_profile_visibility
      then 'account_reactivated'
    when v_previous_account_status = v_account_status
      and v_previous_profile_visibility = 'visible'
      and v_profile_visibility = 'hidden'
      and v_previous_suspended_until is not distinct from p_new_suspended_until
      then 'profile_hidden'
    when v_previous_account_status = v_account_status
      and v_previous_profile_visibility = 'hidden'
      and v_profile_visibility = 'visible'
      and v_previous_suspended_until is not distinct from p_new_suspended_until
      then 'profile_restored'
    when v_previous_account_status = 'suspended'
      and v_account_status = 'suspended'
      and v_previous_profile_visibility = v_profile_visibility
      and v_previous_suspended_until is distinct from p_new_suspended_until
      then 'suspension_updated'
    else 'restriction_updated'
  end;

  insert into public.member_restrictions (
    user_id,
    account_status,
    profile_visibility,
    suspended_at,
    suspended_until,
    reason,
    admin_note,
    created_by,
    updated_by,
    created_at,
    updated_at
  ) values (
    p_target_user_id,
    v_account_status,
    v_profile_visibility,
    v_new_suspended_at,
    p_new_suspended_until,
    v_reason,
    v_note,
    v_admin_user_id,
    v_admin_user_id,
    v_changed_at,
    v_changed_at
  )
  on conflict on constraint member_restrictions_pkey do update
  set account_status = excluded.account_status,
      profile_visibility = excluded.profile_visibility,
      suspended_at = excluded.suspended_at,
      suspended_until = excluded.suspended_until,
      reason = excluded.reason,
      admin_note = excluded.admin_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  insert into public.member_restriction_actions (
    id,
    user_id,
    subject_user_id,
    admin_user_id,
    report_id,
    action_type,
    previous_account_status,
    new_account_status,
    previous_profile_visibility,
    new_profile_visibility,
    previous_suspended_until,
    new_suspended_until,
    reason,
    note,
    created_at
  ) values (
    v_action_id,
    p_target_user_id,
    p_target_user_id,
    v_admin_user_id,
    p_related_report_id,
    v_action_type,
    v_previous_account_status,
    v_account_status,
    v_previous_profile_visibility,
    v_profile_visibility,
    v_previous_suspended_until,
    p_new_suspended_until,
    v_reason,
    v_note,
    v_changed_at
  );

  return query
  select
    p_target_user_id,
    v_previous_account_status,
    v_account_status,
    v_previous_profile_visibility,
    v_profile_visibility,
    v_previous_suspended_until,
    p_new_suspended_until,
    v_reason,
    v_note,
    v_action_id,
    v_changed_at;
end
$function$;

comment on function public.update_admin_member_restriction(
  uuid, text, text, timestamptz, uuid, text, text
) is 'commatch_admin_member_restrictions_v1';

alter table public.member_restrictions enable row level security;
alter table public.member_restriction_actions enable row level security;

-- No RLS policies are intentionally created. Browser roles have neither table
-- privileges nor a policy, so all direct reads and writes are blocked.
revoke all on table public.member_restrictions
  from public, anon, authenticated, service_role;
revoke all on table public.member_restriction_actions
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.member_restrictions to service_role;
grant select, insert, update, delete on table public.member_restriction_actions to service_role;

revoke all on function public.set_member_restrictions_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_admin_access()
  from public, anon, authenticated, service_role;
revoke all on function public.has_admin_permission(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_member_access()
  from public, anon, authenticated, service_role;
revoke all on function public.is_member_service_allowed()
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_member_restriction(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_member_restriction_actions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_admin_member_restriction(
  uuid, text, text, timestamptz, uuid, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.get_my_member_access() to authenticated, service_role;
grant execute on function public.is_member_service_allowed() to authenticated, service_role;
grant execute on function public.get_admin_member_restriction(uuid)
  to authenticated, service_role;
grant execute on function public.get_admin_member_restriction_actions(uuid)
  to authenticated, service_role;
grant execute on function public.update_admin_member_restriction(
  uuid, text, text, timestamptz, uuid, text, text
) to authenticated, service_role;

do $installation_validation$
declare
  v_marker constant text := 'commatch_admin_member_restrictions_v1';
  v_function record;
  v_function_count integer := 0;
begin
  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.member_restrictions'::pg_catalog.regclass,
      'public.member_restriction_actions'::pg_catalog.regclass
    )
  ) then
    raise exception 'Member restriction tables must not contain direct-access RLS policies';
  end if;

  if exists (
    select 1
    from (values
      ('anon'::text),
      ('authenticated'::text)
    ) as browser_role(role_name)
    cross join (values
      ('public.member_restrictions'::text),
      ('public.member_restriction_actions'::text)
    ) as protected_table(table_name)
    where pg_catalog.has_table_privilege(
      browser_role.role_name,
      protected_table.table_name,
      'SELECT, INSERT, UPDATE, DELETE'
    )
  ) then
    raise exception 'Direct browser access to member restriction tables is not blocked';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.member_restrictions', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restrictions', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restrictions', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restrictions', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restriction_actions', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restriction_actions', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restriction_actions', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.member_restriction_actions', 'DELETE') then
    raise exception 'service_role table privileges differ from the approved definition';
  end if;

  for v_function in
    select
      function_info.oid,
      function_info.proname,
      function_info.prosecdef,
      function_info.provolatile,
      function_info.proconfig
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_my_admin_access',
        'has_admin_permission',
        'get_my_member_access',
        'is_member_service_allowed',
        'get_admin_member_restriction',
        'get_admin_member_restriction_actions',
        'update_admin_member_restriction'
      )
  loop
    v_function_count := v_function_count + 1;
    if not v_function.prosecdef
       or (v_function.proname = 'update_admin_member_restriction' and v_function.provolatile <> 'v')
       or (v_function.proname <> 'update_admin_member_restriction' and v_function.provolatile <> 's')
       or not exists (
         select 1
         from pg_catalog.unnest(v_function.proconfig) as function_config(setting)
         where function_config.setting = 'search_path=""'
       )
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
       or (
         v_function.proname in ('get_my_admin_access', 'has_admin_permission')
         and pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
       )
       or (
         v_function.proname not in ('get_my_admin_access', 'has_admin_permission')
         and not pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
       ) then
      raise exception 'public.% security or privileges differ from the approved definition',
        v_function.proname;
    end if;
  end loop;

  if v_function_count <> 7 then
    raise exception 'Member restriction function count differs from the approved definition';
  end if;

  if pg_catalog.pg_get_function_result(
       'public.get_my_member_access()'::pg_catalog.regprocedure
     ) <> 'TABLE(is_allowed boolean, account_status text, profile_visibility text, suspended_until timestamp with time zone, reason text)'
     or pg_catalog.pg_get_function_result(
       'public.update_admin_member_restriction(uuid,text,text,timestamp with time zone,uuid,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(user_id uuid, previous_account_status text, new_account_status text, previous_profile_visibility text, new_profile_visibility text, previous_suspended_until timestamp with time zone, new_suspended_until timestamp with time zone, reason text, note text, action_id uuid, changed_at timestamp with time zone)' then
    raise exception 'Member restriction function return types differ from the approved definition';
  end if;
end
$installation_validation$;

commit;
