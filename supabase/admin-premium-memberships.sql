-- ComMatch administrator Premium membership management foundation.
--
-- Prerequisites are admin-accounts.sql and premium-memberships.sql. The member
-- restriction SQL may run before or after this file; all three administrator
-- SQL files define the same final permission matrix and accept each other's
-- approved function markers. This file creates no Premium membership rows.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_premium_memberships_v1';
  v_admin_marker text;
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null then
    raise exception 'Required Auth, profile, administrator, or Premium objects are missing';
  end if;

  if pg_catalog.obj_description(
       'public.premium_memberships'::pg_catalog.regclass,
       'pg_class'
     ) is distinct from 'commatch_premium_memberships_v1' then
    raise exception 'public.premium_memberships has an incompatible definition marker';
  end if;

  if pg_catalog.to_regprocedure('public.get_my_admin_access()') is null
     or pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'Required administrator permission functions are missing';
  end if;

  if pg_catalog.pg_get_function_result('public.get_my_admin_access()'::pg_catalog.regprocedure)
       <> 'TABLE(is_admin boolean, role text, status text, permissions text[])'
     or pg_catalog.pg_get_function_result(
       'public.has_admin_permission(text)'::pg_catalog.regprocedure
     ) <> 'boolean' then
    raise exception 'Administrator permission function contracts are incompatible';
  end if;

  select pg_catalog.obj_description(
    'public.get_my_admin_access()'::pg_catalog.regprocedure,
    'pg_proc'
  ) into v_admin_marker;

  if v_admin_marker is null or v_admin_marker not in (
    'commatch_admin_accounts_v1',
    'commatch_admin_member_restrictions_v1',
    v_marker
  ) or pg_catalog.obj_description(
    'public.has_admin_permission(text)'::pg_catalog.regprocedure,
    'pg_proc'
  ) is distinct from v_admin_marker then
    raise exception 'Administrator permission functions have an unapproved definition marker';
  end if;

  if pg_catalog.to_regclass('public.premium_membership_actions') is not null
     and pg_catalog.obj_description(
       pg_catalog.to_regclass('public.premium_membership_actions'),
       'pg_class'
     ) is distinct from v_marker then
    raise exception 'public.premium_membership_actions exists without the approved marker';
  end if;

  if pg_catalog.to_regclass('public.premium_membership_request_receipts') is not null
     and pg_catalog.obj_description(
       pg_catalog.to_regclass('public.premium_membership_request_receipts'),
       'pg_class'
     ) is distinct from v_marker then
    raise exception 'public.premium_membership_request_receipts exists without the approved marker';
  end if;

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
        'lock_premium_membership_write',
        'get_admin_premium_memberships',
        'get_admin_premium_membership',
        'update_admin_premium_membership'
      )
  loop
    if pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.%(%) exists without the approved marker',
        v_function.proname, v_function.arguments;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.premium_membership_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_id uuid not null,
  membership_id uuid null,
  subject_user_id uuid not null,
  action_type text not null,
  previous_status text null,
  new_status text not null,
  previous_started_at timestamptz null,
  new_started_at timestamptz not null,
  previous_expires_at timestamptz null,
  new_expires_at timestamptz null,
  previous_feature_keys text[] null,
  new_feature_keys text[] not null,
  reason text not null,
  performed_by uuid not null,
  membership_updated_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint premium_membership_actions_request_id_unique unique (request_id),
  constraint premium_membership_actions_membership_id_fkey
    foreign key (membership_id)
    references public.premium_memberships(id)
    on delete set null,
  constraint premium_membership_actions_action_type_check
    check (action_type in (
      'granted',
      'updated',
      'suspended',
      'reactivated',
      'revoked',
      'regranted'
    )),
  constraint premium_membership_actions_previous_status_check
    check (previous_status is null or previous_status in ('active', 'suspended', 'revoked')),
  constraint premium_membership_actions_new_status_check
    check (new_status in ('active', 'suspended', 'revoked')),
  constraint premium_membership_actions_previous_period_check
    check (
      previous_started_at is null
      or previous_expires_at is null
      or previous_expires_at > previous_started_at
    ),
  constraint premium_membership_actions_new_period_check
    check (new_expires_at is null or new_expires_at > new_started_at),
  constraint premium_membership_actions_previous_feature_keys_check
    check (
      previous_feature_keys is null
      or (
        pg_catalog.cardinality(previous_feature_keys) between 1 and 3
        and pg_catalog.array_position(previous_feature_keys, null) is null
        and previous_feature_keys <@ array[
          'likes_received',
          'advanced_member_search',
          'expanded_recommendations'
        ]::text[]
        and pg_catalog.cardinality(previous_feature_keys) =
          (case when 'likes_received' = any(previous_feature_keys) then 1 else 0 end)
          + (case when 'advanced_member_search' = any(previous_feature_keys) then 1 else 0 end)
          + (case when 'expanded_recommendations' = any(previous_feature_keys) then 1 else 0 end)
      )
    ),
  constraint premium_membership_actions_new_feature_keys_check
    check (
      pg_catalog.cardinality(new_feature_keys) between 1 and 3
      and pg_catalog.array_position(new_feature_keys, null) is null
      and new_feature_keys <@ array[
        'likes_received',
        'advanced_member_search',
        'expanded_recommendations'
      ]::text[]
      and pg_catalog.cardinality(new_feature_keys) =
        (case when 'likes_received' = any(new_feature_keys) then 1 else 0 end)
        + (case when 'advanced_member_search' = any(new_feature_keys) then 1 else 0 end)
        + (case when 'expanded_recommendations' = any(new_feature_keys) then 1 else 0 end)
    ),
  constraint premium_membership_actions_reason_check
    check (
      reason = pg_catalog.btrim(reason)
      and pg_catalog.char_length(reason) between 1 and 500
    )
);

create table if not exists public.premium_membership_request_receipts (
  request_id uuid primary key,
  subject_user_id uuid not null,
  is_noop boolean not null,
  membership_id uuid not null,
  stored_status text not null,
  result_is_available boolean not null,
  started_at timestamptz not null,
  expires_at timestamptz null,
  feature_keys text[] not null,
  membership_updated_at timestamptz not null,
  action_id uuid null,
  action_type text null,
  performed_by uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint premium_membership_request_receipts_status_check
    check (stored_status in ('active', 'suspended', 'revoked')),
  constraint premium_membership_request_receipts_availability_check
    check (
      result_is_available = (
        stored_status = 'active'
        and started_at <= created_at
        and (expires_at is null or expires_at > created_at)
      )
    ),
  constraint premium_membership_request_receipts_period_check
    check (expires_at is null or expires_at > started_at),
  constraint premium_membership_request_receipts_feature_keys_check
    check (
      pg_catalog.cardinality(feature_keys) between 1 and 3
      and pg_catalog.array_position(feature_keys, null) is null
      and feature_keys <@ array[
        'likes_received',
        'advanced_member_search',
        'expanded_recommendations'
      ]::text[]
      and pg_catalog.cardinality(feature_keys) =
        (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
        + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
        + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
    ),
  constraint premium_membership_request_receipts_action_shape_check
    check (
      (is_noop and action_id is null and action_type is null)
      or (
        not is_noop
        and action_id is not null
        and action_type is not null
        and action_type in (
          'granted',
          'updated',
          'suspended',
          'reactivated',
          'revoked',
          'regranted'
        )
      )
    )
);

comment on table public.premium_membership_actions
  is 'commatch_admin_premium_memberships_v1';
comment on column public.premium_membership_actions.subject_user_id
  is 'Immutable target UUID retained after Auth user deletion; intentionally has no foreign key';
comment on column public.premium_membership_actions.performed_by
  is 'Immutable administrator UUID retained after Auth or admin-account deletion; intentionally has no foreign key';
comment on column public.premium_membership_actions.membership_updated_at
  is 'Membership version returned by the original request and reused for idempotent responses';

comment on table public.premium_membership_request_receipts
  is 'commatch_admin_premium_memberships_v1';
comment on column public.premium_membership_request_receipts.subject_user_id
  is 'Immutable target UUID retained after Auth user deletion; intentionally has no foreign key';
comment on column public.premium_membership_request_receipts.membership_id
  is 'Immutable result UUID retained after membership deletion; intentionally has no foreign key';
comment on column public.premium_membership_request_receipts.action_id
  is 'Immutable action UUID snapshot; intentionally has no foreign key';
comment on column public.premium_membership_request_receipts.performed_by
  is 'Immutable administrator UUID retained after Auth or admin-account deletion; intentionally has no foreign key';

create index if not exists premium_membership_actions_subject_created_idx
  on public.premium_membership_actions (subject_user_id, created_at desc, id desc);
create index if not exists premium_membership_actions_membership_idx
  on public.premium_membership_actions (membership_id);
create index if not exists premium_membership_actions_performed_by_idx
  on public.premium_membership_actions (performed_by, created_at desc);
create index if not exists premium_membership_request_receipts_subject_created_idx
  on public.premium_membership_request_receipts (subject_user_id, created_at desc, request_id);
create index if not exists premium_membership_request_receipts_performed_by_idx
  on public.premium_membership_request_receipts (performed_by, created_at desc, request_id);
create index if not exists premium_membership_request_receipts_action_idx
  on public.premium_membership_request_receipts (action_id)
  where action_id is not null;

do $table_validation$
declare
  v_columns text[];
  v_constraints text[];
begin
  select pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s:%s',
      column_info.column_name,
      column_info.udt_name,
      column_info.is_nullable
    ) order by column_info.ordinal_position
  )
  into v_columns
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'premium_membership_actions';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'request_id:uuid:NO',
    'membership_id:uuid:YES',
    'subject_user_id:uuid:NO',
    'action_type:text:NO',
    'previous_status:text:YES',
    'new_status:text:NO',
    'previous_started_at:timestamptz:YES',
    'new_started_at:timestamptz:NO',
    'previous_expires_at:timestamptz:YES',
    'new_expires_at:timestamptz:YES',
    'previous_feature_keys:_text:YES',
    'new_feature_keys:_text:NO',
    'reason:text:NO',
    'performed_by:uuid:NO',
    'membership_updated_at:timestamptz:NO',
    'created_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.premium_membership_actions columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    constraint_info.conname || ':' || constraint_info.contype::text
    order by constraint_info.conname
  )
  into v_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.premium_membership_actions'::pg_catalog.regclass;

  if v_constraints is distinct from array[
    'premium_membership_actions_action_type_check:c',
    'premium_membership_actions_membership_id_fkey:f',
    'premium_membership_actions_new_feature_keys_check:c',
    'premium_membership_actions_new_period_check:c',
    'premium_membership_actions_new_status_check:c',
    'premium_membership_actions_pkey:p',
    'premium_membership_actions_previous_feature_keys_check:c',
    'premium_membership_actions_previous_period_check:c',
    'premium_membership_actions_previous_status_check:c',
    'premium_membership_actions_reason_check:c',
    'premium_membership_actions_request_id_unique:u'
  ]::text[] then
    raise exception 'public.premium_membership_actions constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_membership_actions'::pg_catalog.regclass
      and constraint_info.conname = 'premium_membership_actions_membership_id_fkey'
      and constraint_info.confrelid = 'public.premium_memberships'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
  ) then
    raise exception 'Premium action membership foreign key differs from the approved definition';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid = 'public.premium_membership_actions_subject_created_idx'::pg_catalog.regclass
  ) or not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid = 'public.premium_membership_actions_membership_idx'::pg_catalog.regclass
  ) or not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid = 'public.premium_membership_actions_performed_by_idx'::pg_catalog.regclass
  ) then
    raise exception 'A required Premium action index is missing';
  end if;
end
$table_validation$;

do $receipt_table_validation$
declare
  v_columns text[];
  v_constraints text[];
begin
  select pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s:%s',
      column_info.column_name,
      column_info.udt_name,
      column_info.is_nullable
    ) order by column_info.ordinal_position
  )
  into v_columns
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'premium_membership_request_receipts';

  if v_columns is distinct from array[
    'request_id:uuid:NO',
    'subject_user_id:uuid:NO',
    'is_noop:bool:NO',
    'membership_id:uuid:NO',
    'stored_status:text:NO',
    'result_is_available:bool:NO',
    'started_at:timestamptz:NO',
    'expires_at:timestamptz:YES',
    'feature_keys:_text:NO',
    'membership_updated_at:timestamptz:NO',
    'action_id:uuid:YES',
    'action_type:text:YES',
    'performed_by:uuid:NO',
    'created_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.premium_membership_request_receipts columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    constraint_info.conname || ':' || constraint_info.contype::text
    order by constraint_info.conname
  )
  into v_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid =
    'public.premium_membership_request_receipts'::pg_catalog.regclass;

  if v_constraints is distinct from array[
    'premium_membership_request_receipts_action_shape_check:c',
    'premium_membership_request_receipts_availability_check:c',
    'premium_membership_request_receipts_feature_keys_check:c',
    'premium_membership_request_receipts_period_check:c',
    'premium_membership_request_receipts_pkey:p',
    'premium_membership_request_receipts_status_check:c'
  ]::text[] then
    raise exception 'public.premium_membership_request_receipts constraints differ from the approved definition';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid =
      'public.premium_membership_request_receipts_subject_created_idx'::pg_catalog.regclass
  ) or not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid =
      'public.premium_membership_request_receipts_performed_by_idx'::pg_catalog.regclass
  ) or not exists (
    select 1 from pg_catalog.pg_class as index_info
    where index_info.oid =
      'public.premium_membership_request_receipts_action_idx'::pg_catalog.regclass
  ) then
    raise exception 'A required Premium request receipt index is missing';
  end if;
end
$receipt_table_validation$;

-- Extend the current permission matrix without changing any existing permission.
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
          'premium_memberships_manage'
        ]::text[]
      when admin_account.role = 'admin'
        then array[
          'admin_dashboard_view',
          'reports_view',
          'reports_manage',
          'member_restrictions_view',
          'member_restrictions_manage',
          'premium_memberships_view',
          'premium_memberships_manage'
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
  is 'commatch_admin_premium_memberships_v1';

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
        'premium_memberships_manage'
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
  is 'commatch_admin_premium_memberships_v1';

create or replace function public.lock_premium_membership_write(p_user_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 982451)
  );
end
$function$;

comment on function public.lock_premium_membership_write(uuid)
  is 'commatch_admin_premium_memberships_v1';

create or replace function public.get_admin_premium_memberships(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_sort_key text default 'updated_at',
  p_sort_direction text default 'desc'
)
returns table (
  member_user_id uuid,
  profile_exists boolean,
  nickname text,
  membership_exists boolean,
  membership_id uuid,
  stored_status text,
  is_available boolean,
  is_not_started boolean,
  is_expired boolean,
  started_at timestamptz,
  expires_at timestamptz,
  feature_keys text[],
  membership_updated_at timestamptz,
  account_status text,
  profile_visibility text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_search text := nullif(pg_catalog.btrim(p_search), '');
  v_status text := coalesce(nullif(pg_catalog.btrim(p_status), ''), 'all');
  v_sort_key text := coalesce(nullif(pg_catalog.btrim(p_sort_key), ''), 'updated_at');
  v_sort_direction text := coalesce(nullif(pg_catalog.btrim(p_sort_direction), ''), 'desc');
begin
  if not coalesce(public.has_admin_permission('premium_memberships_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_search is not null and pg_catalog.char_length(v_search) > 100 then
    raise exception using errcode = '22023', message = 'Search text must be 100 characters or fewer';
  end if;
  if v_status not in ('all', 'none', 'active', 'suspended', 'revoked') then
    raise exception using errcode = '22023', message = 'Invalid Premium status filter';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid pagination';
  end if;
  if v_sort_key not in ('updated_at', 'nickname', 'started_at', 'expires_at')
     or v_sort_direction not in ('asc', 'desc') then
    raise exception using errcode = '22023', message = 'Invalid sort option';
  end if;

  return query
  select
    auth_user.id,
    profile.id is not null,
    profile.nickname,
    membership.id is not null,
    membership.id,
    membership.status,
    coalesce(
      membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (membership.expires_at is null or membership.expires_at > pg_catalog.now()),
      false
    ),
    coalesce(membership.started_at > pg_catalog.now(), false),
    coalesce(membership.expires_at <= pg_catalog.now(), false),
    membership.started_at,
    membership.expires_at,
    coalesce(membership.feature_keys, array[]::text[]),
    membership.updated_at,
    coalesce(restriction.account_status, 'active'),
    coalesce(restriction.profile_visibility, 'visible'),
    pg_catalog.count(*) over()
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  left join public.premium_memberships as membership on membership.user_id = auth_user.id
  left join public.member_restrictions as restriction on restriction.user_id = auth_user.id
  where not exists (
      select 1
      from public.admin_accounts as target_admin
      where target_admin.user_id = auth_user.id
    )
    and (
      v_search is null
      or profile.nickname ilike '%' || v_search || '%'
      or auth_user.id::text ilike v_search || '%'
    )
    and (
      v_status = 'all'
      or (v_status = 'none' and membership.id is null)
      or membership.status = v_status
    )
  order by
    case when v_sort_key = 'updated_at' and v_sort_direction = 'asc' then membership.updated_at end asc nulls last,
    case when v_sort_key = 'updated_at' and v_sort_direction = 'desc' then membership.updated_at end desc nulls last,
    case when v_sort_key = 'nickname' and v_sort_direction = 'asc' then profile.nickname end asc nulls last,
    case when v_sort_key = 'nickname' and v_sort_direction = 'desc' then profile.nickname end desc nulls last,
    case when v_sort_key = 'started_at' and v_sort_direction = 'asc' then membership.started_at end asc nulls last,
    case when v_sort_key = 'started_at' and v_sort_direction = 'desc' then membership.started_at end desc nulls last,
    case when v_sort_key = 'expires_at' and v_sort_direction = 'asc' then membership.expires_at end asc nulls last,
    case when v_sort_key = 'expires_at' and v_sort_direction = 'desc' then membership.expires_at end desc nulls last,
    auth_user.id
  limit p_limit
  offset p_offset;
end
$function$;

comment on function public.get_admin_premium_memberships(text, text, integer, integer, text, text)
  is 'commatch_admin_premium_memberships_v1';

create or replace function public.get_admin_premium_membership(
  p_subject_user_id uuid,
  p_action_limit integer default 50
)
returns table (
  subject_user_id uuid,
  profile_exists boolean,
  nickname text,
  membership_exists boolean,
  membership_id uuid,
  stored_status text,
  is_available boolean,
  is_not_started boolean,
  is_expired boolean,
  started_at timestamptz,
  expires_at timestamptz,
  feature_keys text[],
  membership_updated_at timestamptz,
  account_status text,
  profile_visibility text,
  recent_actions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('premium_memberships_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_subject_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_action_limit is null or p_action_limit < 1 or p_action_limit > 100 then
    raise exception using errcode = '22023', message = 'Invalid action history limit';
  end if;
  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_subject_user_id) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1 from public.admin_accounts as target_admin
    where target_admin.user_id = p_subject_user_id
  ) then
    raise exception using errcode = '22023', message = 'Administrator accounts cannot receive member Premium access';
  end if;

  return query
  select
    p_subject_user_id,
    profile.id is not null,
    profile.nickname,
    membership.id is not null,
    membership.id,
    membership.status,
    coalesce(
      membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (membership.expires_at is null or membership.expires_at > pg_catalog.now()),
      false
    ),
    coalesce(membership.started_at > pg_catalog.now(), false),
    coalesce(membership.expires_at <= pg_catalog.now(), false),
    membership.started_at,
    membership.expires_at,
    coalesce(membership.feature_keys, array[]::text[]),
    membership.updated_at,
    coalesce(restriction.account_status, 'active'),
    coalesce(restriction.profile_visibility, 'visible'),
    action_history.recent_actions
  from (select 1) as singleton
  left join public.profiles as profile on profile.id = p_subject_user_id
  left join public.premium_memberships as membership on membership.user_id = p_subject_user_id
  left join public.member_restrictions as restriction on restriction.user_id = p_subject_user_id
  left join lateral (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', recent_action.id,
          'request_id', recent_action.request_id,
          'action_type', recent_action.action_type,
          'previous_status', recent_action.previous_status,
          'new_status', recent_action.new_status,
          'previous_started_at', recent_action.previous_started_at,
          'new_started_at', recent_action.new_started_at,
          'previous_expires_at', recent_action.previous_expires_at,
          'new_expires_at', recent_action.new_expires_at,
          'previous_feature_keys', recent_action.previous_feature_keys,
          'new_feature_keys', recent_action.new_feature_keys,
          'reason', recent_action.reason,
          'performed_by', recent_action.performed_by,
          'membership_updated_at', recent_action.membership_updated_at,
          'created_at', recent_action.created_at
        ) order by recent_action.created_at desc, recent_action.id desc
      ),
      '[]'::jsonb
    ) as recent_actions
    from (
      select action.*
      from public.premium_membership_actions as action
      where action.subject_user_id = p_subject_user_id
      order by action.created_at desc, action.id desc
      limit p_action_limit
    ) as recent_action
  ) as action_history on true;
end
$function$;

comment on function public.get_admin_premium_membership(uuid, integer)
  is 'commatch_admin_premium_memberships_v1';

create or replace function public.update_admin_premium_membership(
  p_subject_user_id uuid,
  p_expected_updated_at timestamptz,
  p_new_status text,
  p_started_at timestamptz,
  p_expires_at timestamptz,
  p_feature_keys text[],
  p_reason text,
  p_request_id uuid
)
returns table (
  is_success boolean,
  is_noop boolean,
  is_duplicate_request boolean,
  membership_id uuid,
  subject_user_id uuid,
  stored_status text,
  is_available boolean,
  started_at timestamptz,
  expires_at timestamptz,
  feature_keys text[],
  membership_updated_at timestamptz,
  action_id uuid,
  action_type text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_status text := nullif(pg_catalog.btrim(p_new_status), '');
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_feature_keys text[];
  v_existing public.premium_memberships%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_receipt public.premium_membership_request_receipts%rowtype;
  v_action_id uuid := pg_catalog.gen_random_uuid();
  v_action_type text;
  v_changed_at timestamptz := pg_catalog.now();
  v_existing_canonical_keys text[];
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.has_admin_permission('premium_memberships_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_subject_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  -- Serialize each idempotency key before checking it. The target lock below is
  -- always acquired second, giving all callers a consistent lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 982452)
  );

  select receipt.* into v_receipt
  from public.premium_membership_request_receipts as receipt
  where receipt.request_id = p_request_id;

  if found then
    if v_receipt.subject_user_id is distinct from p_subject_user_id
       or v_receipt.performed_by is distinct from v_admin_user_id then
      raise exception using
        errcode = '22023',
        message = 'PREMIUM_REQUEST_ID_CONFLICT';
    end if;

    return query
    select
      true,
      v_receipt.is_noop,
      true,
      v_receipt.membership_id,
      v_receipt.subject_user_id,
      v_receipt.stored_status,
      v_receipt.result_is_available,
      v_receipt.started_at,
      v_receipt.expires_at,
      v_receipt.feature_keys,
      v_receipt.membership_updated_at,
      v_receipt.action_id,
      v_receipt.action_type;
    return;
  end if;

  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_subject_user_id) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1 from public.admin_accounts as target_admin
    where target_admin.user_id = p_subject_user_id
  ) then
    raise exception using errcode = '22023', message = 'Administrator accounts cannot receive member Premium access';
  end if;
  if v_status is null or v_status not in ('active', 'suspended', 'revoked') then
    raise exception using errcode = '22023', message = 'Invalid Premium status';
  end if;
  if p_started_at is null then
    raise exception using errcode = '22023', message = 'Premium start time is required';
  end if;
  if p_expires_at is not null and p_expires_at <= p_started_at then
    raise exception using errcode = '22023', message = 'Premium end time must follow the start time';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'Administrator reason is required';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Administrator reason must be 500 characters or fewer';
  end if;
  if p_feature_keys is null
     or pg_catalog.cardinality(p_feature_keys) < 1
     or pg_catalog.cardinality(p_feature_keys) > 3
     or pg_catalog.array_position(p_feature_keys, null) is not null
     or not p_feature_keys <@ array[
       'likes_received',
       'advanced_member_search',
       'expanded_recommendations'
     ]::text[] then
    raise exception using errcode = '22023', message = 'Invalid Premium feature keys';
  end if;

  select pg_catalog.array_agg(feature.feature_key order by feature.feature_key)
  into v_feature_keys
  from pg_catalog.unnest(p_feature_keys) as feature(feature_key);

  if pg_catalog.cardinality(v_feature_keys) <> (
    select pg_catalog.count(distinct feature.feature_key)
    from pg_catalog.unnest(p_feature_keys) as feature(feature_key)
  ) then
    raise exception using errcode = '22023', message = 'Duplicate Premium feature keys are not allowed';
  end if;

  perform public.lock_premium_membership_write(p_subject_user_id);

  select membership.* into v_existing
  from public.premium_memberships as membership
  where membership.user_id = p_subject_user_id
  for update;

  if found then
    if p_expected_updated_at is null
       or v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = '40001', message = 'PREMIUM_STALE_VERSION';
    end if;
    if v_existing.status = 'revoked' and v_status not in ('revoked', 'active') then
      raise exception using errcode = '22023', message = 'Revoked Premium can only remain revoked or be regranted as active';
    end if;

    select pg_catalog.array_agg(feature.feature_key order by feature.feature_key)
    into v_existing_canonical_keys
    from pg_catalog.unnest(v_existing.feature_keys) as feature(feature_key);

    if v_existing.status = v_status
       and v_existing.started_at = p_started_at
       and v_existing.expires_at is not distinct from p_expires_at
       and v_existing_canonical_keys = v_feature_keys then
      insert into public.premium_membership_request_receipts (
        request_id,
        subject_user_id,
        is_noop,
        membership_id,
        stored_status,
        result_is_available,
        started_at,
        expires_at,
        feature_keys,
        membership_updated_at,
        action_id,
        action_type,
        performed_by,
        created_at
      ) values (
        p_request_id,
        v_existing.user_id,
        true,
        v_existing.id,
        v_existing.status,
        v_existing.status = 'active'
          and v_existing.started_at <= v_changed_at
          and (v_existing.expires_at is null or v_existing.expires_at > v_changed_at),
        v_existing.started_at,
        v_existing.expires_at,
        v_existing_canonical_keys,
        v_existing.updated_at,
        null,
        null,
        v_admin_user_id,
        v_changed_at
      );

      return query
      select
        true,
        true,
        false,
        v_existing.id,
        v_existing.user_id,
        v_existing.status,
        v_existing.status = 'active'
          and v_existing.started_at <= pg_catalog.now()
          and (v_existing.expires_at is null or v_existing.expires_at > pg_catalog.now()),
        v_existing.started_at,
        v_existing.expires_at,
        v_existing_canonical_keys,
        v_existing.updated_at,
        null::uuid,
        null::text;
      return;
    end if;

    v_action_type := case
      when v_existing.status = 'revoked' and v_status = 'active' then 'regranted'
      when v_existing.status = 'active' and v_status = 'suspended' then 'suspended'
      when v_existing.status = 'suspended' and v_status = 'active' then 'reactivated'
      when v_existing.status in ('active', 'suspended') and v_status = 'revoked' then 'revoked'
      else 'updated'
    end;

    update public.premium_memberships as membership
    set status = v_status,
        started_at = p_started_at,
        expires_at = p_expires_at,
        feature_keys = v_feature_keys,
        granted_at = case
          when v_action_type = 'regranted' then v_changed_at
          else membership.granted_at
        end,
        granted_by = case
          when v_action_type = 'regranted' then v_admin_user_id
          else membership.granted_by
        end,
        granted_reason = case
          when v_action_type = 'regranted' then v_reason
          else membership.granted_reason
        end,
        status_changed_at = v_changed_at,
        status_changed_by = v_admin_user_id,
        status_reason = v_reason,
        updated_at = v_changed_at
    where membership.id = v_existing.id
    returning membership.* into v_membership;
  else
    if p_expected_updated_at is not null then
      raise exception using errcode = '40001', message = 'PREMIUM_STALE_VERSION';
    end if;
    if v_status <> 'active' then
      raise exception using errcode = '22023', message = 'A new Premium membership must be granted as active';
    end if;

    v_action_type := 'granted';

    insert into public.premium_memberships (
      user_id,
      status,
      started_at,
      expires_at,
      feature_keys,
      granted_at,
      granted_by,
      granted_reason,
      status_changed_at,
      status_changed_by,
      status_reason,
      created_at,
      updated_at
    ) values (
      p_subject_user_id,
      v_status,
      p_started_at,
      p_expires_at,
      v_feature_keys,
      v_changed_at,
      v_admin_user_id,
      v_reason,
      v_changed_at,
      v_admin_user_id,
      v_reason,
      v_changed_at,
      v_changed_at
    )
    returning * into v_membership;
  end if;

  insert into public.premium_membership_actions (
    id,
    request_id,
    membership_id,
    subject_user_id,
    action_type,
    previous_status,
    new_status,
    previous_started_at,
    new_started_at,
    previous_expires_at,
    new_expires_at,
    previous_feature_keys,
    new_feature_keys,
    reason,
    performed_by,
    membership_updated_at,
    created_at
  ) values (
    v_action_id,
    p_request_id,
    v_membership.id,
    p_subject_user_id,
    v_action_type,
    v_existing.status,
    v_membership.status,
    v_existing.started_at,
    v_membership.started_at,
    v_existing.expires_at,
    v_membership.expires_at,
    case when v_existing.id is null then null else v_existing.feature_keys end,
    v_membership.feature_keys,
    v_reason,
    v_admin_user_id,
    v_membership.updated_at,
    v_changed_at
  );

  insert into public.premium_membership_request_receipts (
    request_id,
    subject_user_id,
    is_noop,
    membership_id,
    stored_status,
    result_is_available,
    started_at,
    expires_at,
    feature_keys,
    membership_updated_at,
    action_id,
    action_type,
    performed_by,
    created_at
  ) values (
    p_request_id,
    v_membership.user_id,
    false,
    v_membership.id,
    v_membership.status,
    v_membership.status = 'active'
      and v_membership.started_at <= v_changed_at
      and (v_membership.expires_at is null or v_membership.expires_at > v_changed_at),
    v_membership.started_at,
    v_membership.expires_at,
    v_membership.feature_keys,
    v_membership.updated_at,
    v_action_id,
    v_action_type,
    v_admin_user_id,
    v_changed_at
  );

  return query
  select
    true,
    false,
    false,
    v_membership.id,
    v_membership.user_id,
    v_membership.status,
    v_membership.status = 'active'
      and v_membership.started_at <= pg_catalog.now()
      and (v_membership.expires_at is null or v_membership.expires_at > pg_catalog.now()),
    v_membership.started_at,
    v_membership.expires_at,
    v_membership.feature_keys,
    v_membership.updated_at,
    v_action_id,
    v_action_type;
end
$function$;

comment on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) is 'commatch_admin_premium_memberships_v1';

alter function public.get_my_admin_access() owner to postgres;
alter function public.has_admin_permission(text) owner to postgres;
alter function public.lock_premium_membership_write(uuid) owner to postgres;
alter function public.get_admin_premium_memberships(text, text, integer, integer, text, text)
  owner to postgres;
alter function public.get_admin_premium_membership(uuid, integer) owner to postgres;
alter function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) owner to postgres;
alter table public.premium_membership_actions owner to postgres;
alter table public.premium_membership_request_receipts owner to postgres;

alter table public.premium_membership_actions enable row level security;
alter table public.premium_membership_request_receipts enable row level security;

-- No policy is intentional. Browser roles have no direct table privilege and
-- administrators must use the SECURITY DEFINER RPCs.
revoke all on table public.premium_membership_actions
  from public, anon, authenticated, service_role;
revoke all on table public.premium_membership_request_receipts
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.premium_membership_actions
  to service_role;
grant select, insert, update, delete on table public.premium_membership_request_receipts
  to service_role;

revoke all on function public.get_my_admin_access()
  from public, anon, authenticated, service_role;
revoke all on function public.has_admin_permission(text)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_premium_membership_write(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_premium_memberships(text, text, integer, integer, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_premium_membership(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.get_admin_premium_memberships(
  text, text, integer, integer, text, text
) to authenticated;
grant execute on function public.get_admin_premium_membership(uuid, integer)
  to authenticated;
grant execute on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) to authenticated;

do $installation_validation$
declare
  v_marker constant text := 'commatch_admin_premium_memberships_v1';
  v_function record;
  v_count integer := 0;
begin
  if pg_catalog.pg_get_userbyid(
       (select table_info.relowner from pg_catalog.pg_class as table_info
        where table_info.oid='public.premium_membership_actions'::pg_catalog.regclass)
     ) <> 'postgres' then
    raise exception 'Premium action table owner differs from the approved definition';
  end if;
  if pg_catalog.pg_get_userbyid(
       (select table_info.relowner from pg_catalog.pg_class as table_info
        where table_info.oid='public.premium_membership_request_receipts'::pg_catalog.regclass)
     ) <> 'postgres' then
    raise exception 'Premium request receipt table owner differs from the approved definition';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.premium_membership_actions'::pg_catalog.regclass,
      'public.premium_membership_request_receipts'::pg_catalog.regclass
    )
  ) then
    raise exception 'Premium action and receipt tables must not contain direct-access policies';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.premium_membership_actions'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.premium_membership_actions';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.premium_membership_request_receipts'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.premium_membership_request_receipts';
  end if;

  if exists (
    select 1
    from (values ('anon'::text), ('authenticated'::text)) as browser_role(role_name)
    cross join (values
      ('public.premium_membership_actions'::text),
      ('public.premium_membership_request_receipts'::text)
    ) as protected_table(table_name)
    where pg_catalog.has_table_privilege(
      browser_role.role_name,
      protected_table.table_name,
      'SELECT, INSERT, UPDATE, DELETE'
    )
  ) then
    raise exception 'A browser role has an unapproved Premium action or receipt table privilege';
  end if;
  if not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_actions', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_actions', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_actions', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_actions', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_request_receipts', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_request_receipts', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_request_receipts', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.premium_membership_request_receipts', 'DELETE') then
    raise exception 'service_role Premium action or receipt privileges differ from the approved definition';
  end if;

  if exists (
    select 1
    from public.premium_membership_request_receipts as receipt
    left join public.premium_membership_actions as action
      on action.id = receipt.action_id
      and action.request_id = receipt.request_id
      and action.subject_user_id = receipt.subject_user_id
      and action.new_status = receipt.stored_status
      and action.new_started_at = receipt.started_at
      and action.new_expires_at is not distinct from receipt.expires_at
      and action.new_feature_keys = receipt.feature_keys
      and action.membership_updated_at = receipt.membership_updated_at
      and action.action_type = receipt.action_type
      and action.performed_by = receipt.performed_by
    where not receipt.is_noop
      and action.id is null
  ) or exists (
    select 1
    from public.premium_membership_actions as action
    where not exists (
      select 1
      from public.premium_membership_request_receipts as receipt
      where not receipt.is_noop
        and receipt.request_id = action.request_id
        and receipt.action_id = action.id
    )
  ) then
    raise exception 'Premium changed-request receipts and actions are inconsistent';
  end if;

  for v_function in
    select
      function_info.oid,
      function_info.proname,
      function_info.prosecdef,
      function_info.provolatile,
      function_info.proconfig,
      pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_my_admin_access',
        'has_admin_permission',
        'lock_premium_membership_write',
        'get_admin_premium_memberships',
        'get_admin_premium_membership',
        'update_admin_premium_membership'
      )
  loop
    v_count := v_count + 1;
    if v_function.owner_name <> 'postgres'
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker
       or not exists (
         select 1
         from pg_catalog.unnest(v_function.proconfig) as config(setting)
         where config.setting = 'search_path=""'
       )
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE') then
      raise exception 'public.% owner, marker, search_path, or anon ACL differs', v_function.proname;
    end if;

    if v_function.proname = 'lock_premium_membership_write' then
      if v_function.prosecdef
         or v_function.provolatile <> 'v'
         or pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE') then
        raise exception 'Premium lock helper security differs from the approved definition';
      end if;
    elsif not v_function.prosecdef
       or not pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE') then
      raise exception 'public.% security or authenticated ACL differs', v_function.proname;
    end if;
  end loop;

  if v_count <> 6 then
    raise exception 'Premium administrator function count differs from the approved definition';
  end if;

  if pg_catalog.pg_get_function_result(
       'public.get_admin_premium_memberships(text,text,integer,integer,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(member_user_id uuid, profile_exists boolean, nickname text, membership_exists boolean, membership_id uuid, stored_status text, is_available boolean, is_not_started boolean, is_expired boolean, started_at timestamp with time zone, expires_at timestamp with time zone, feature_keys text[], membership_updated_at timestamp with time zone, account_status text, profile_visibility text, total_count bigint)'
     or pg_catalog.pg_get_function_result(
       'public.get_admin_premium_membership(uuid,integer)'::pg_catalog.regprocedure
     ) <> 'TABLE(subject_user_id uuid, profile_exists boolean, nickname text, membership_exists boolean, membership_id uuid, stored_status text, is_available boolean, is_not_started boolean, is_expired boolean, started_at timestamp with time zone, expires_at timestamp with time zone, feature_keys text[], membership_updated_at timestamp with time zone, account_status text, profile_visibility text, recent_actions jsonb)'
     or pg_catalog.pg_get_function_result(
       'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(is_success boolean, is_noop boolean, is_duplicate_request boolean, membership_id uuid, subject_user_id uuid, stored_status text, is_available boolean, started_at timestamp with time zone, expires_at timestamp with time zone, feature_keys text[], membership_updated_at timestamp with time zone, action_id uuid, action_type text)' then
    raise exception 'A Premium administrator RPC return contract differs';
  end if;

  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'::pg_catalog.regprocedure
       ),
       'public.lock_premium_membership_write(p_subject_user_id)'
     ) = 0 then
    raise exception 'Premium update RPC does not use the approved target lock helper';
  end if;
end
$installation_validation$;

commit;
