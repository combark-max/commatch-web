begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_member_detail_v1';
  v_function record;
  v_function_oid oid;
  v_list_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_members(text,text,text,text,integer,integer,text,text)'
  );
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null then
    raise exception 'Required member tables must exist before installing the administrator member detail';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing the administrator member detail';
  end if;

  if v_list_function_oid is null
     or pg_catalog.obj_description(v_list_function_oid, 'pg_proc') is distinct from
       'commatch_admin_members_v1'
     or pg_catalog.pg_get_function_result(v_list_function_oid) <>
       'TABLE(member_user_id uuid, nickname text, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, total_count bigint)' then
    raise exception 'public.get_admin_members differs from the approved administrator member list dependency';
  end if;

  if exists (
    select required.column_name
    from (values
      ('auth', 'users', 'id', 'uuid', 'uuid', true),
      ('auth', 'users', 'created_at', 'timestamp with time zone', 'timestamptz', false),
      ('public', 'profiles', 'id', 'uuid', 'uuid', true),
      ('public', 'profiles', 'nickname', 'text', 'text', true),
      ('public', 'profiles', 'gender', 'text', 'text', false),
      ('public', 'profiles', 'birth_date', 'date', 'date', false),
      ('public', 'profiles', 'height', 'integer', 'int4', false),
      ('public', 'profiles', 'region', 'text', 'text', false),
      ('public', 'profiles', 'job', 'text', 'text', false),
      ('public', 'profiles', 'education', 'text', 'text', false),
      ('public', 'profiles', 'hobby', 'text', 'text', false),
      ('public', 'profiles', 'drinking', 'text', 'text', false),
      ('public', 'profiles', 'smoking', 'text', 'text', false),
      ('public', 'profiles', 'marriage_history', 'text', 'text', false),
      ('public', 'profiles', 'introduction', 'text', 'text', false),
      ('public', 'profiles', 'marriage_values', 'text', 'text', false),
      ('public', 'profiles', 'profile_image', 'text', 'text', false),
      ('public', 'profiles', 'profile_images', 'ARRAY', '_text', true),
      ('public', 'admin_accounts', 'user_id', 'uuid', 'uuid', true),
      ('public', 'premium_memberships', 'user_id', 'uuid', 'uuid', true),
      ('public', 'premium_memberships', 'started_at', 'timestamp with time zone', 'timestamptz', true),
      ('public', 'premium_memberships', 'expires_at', 'timestamp with time zone', 'timestamptz', false)
    ) as required(table_schema, table_name, column_name, data_type, udt_name, is_not_null)
    where not exists (
      select 1
      from information_schema.columns as column_info
      where column_info.table_schema = required.table_schema
        and column_info.table_name = required.table_name
        and column_info.column_name = required.column_name
        and column_info.data_type = required.data_type
        and column_info.udt_name = required.udt_name
        and (column_info.is_nullable = 'NO') = required.is_not_null
    )
  ) then
    raise exception 'Required administrator member detail columns differ from the approved definition';
  end if;

  for v_function in
    select
      function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_member_detail'
  loop
    if v_function.identity_arguments <> 'p_target_user_id uuid' then
      raise exception 'public.get_admin_member_detail already exists with an incompatible signature';
    end if;
  end loop;

  v_function_oid := pg_catalog.to_regprocedure('public.get_admin_member_detail(uuid)');
  if v_function_oid is not null
     and pg_catalog.obj_description(v_function_oid, 'pg_proc') is distinct from v_marker then
    raise exception 'public.get_admin_member_detail differs from the approved replacement source';
  end if;
end
$preflight$;

create or replace function public.get_admin_member_detail(
  p_target_user_id uuid
)
returns table (
  member_user_id uuid,
  joined_at timestamptz,
  profile_exists boolean,
  profile_status text,
  profile_visibility text,
  nickname text,
  gender text,
  birth_date date,
  height integer,
  region text,
  job text,
  education text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  introduction text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  stored_account_status text,
  current_account_status text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  premium_membership_exists boolean,
  premium_stored_status text,
  premium_is_available boolean,
  premium_period_state text,
  premium_started_at timestamptz,
  premium_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('member_restrictions_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;

  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = p_target_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;

  if exists (
    select 1
    from public.admin_accounts as target_admin
    where target_admin.user_id = p_target_user_id
  ) then
    raise exception using errcode = '22023', message = 'Administrator accounts are not member detail targets';
  end if;

  return query
  select
    member.member_user_id,
    member.joined_at,
    member.profile_exists,
    member.profile_status,
    member.profile_visibility,
    profile.nickname,
    profile.gender,
    profile.birth_date,
    profile.height,
    profile.region,
    profile.job,
    profile.education,
    profile.hobby,
    profile.drinking,
    profile.smoking,
    profile.marriage_history,
    profile.introduction,
    profile.marriage_values,
    profile.profile_image,
    profile.profile_images,
    member.stored_account_status,
    member.current_account_status,
    member.suspended_at,
    member.suspended_until,
    member.premium_membership_exists,
    member.premium_stored_status,
    member.premium_is_available,
    member.premium_period_state,
    membership.started_at,
    membership.expires_at
  from public.get_admin_members(
    p_target_user_id::text,
    'all',
    'all',
    'all',
    1,
    0,
    'joined_at',
    'desc'
  ) as member
  left join public.profiles as profile on profile.id = member.member_user_id
  left join public.premium_memberships as membership
    on membership.user_id = member.member_user_id
  where member.member_user_id = p_target_user_id;
end
$function$;

alter function public.get_admin_member_detail(uuid) owner to postgres;

comment on function public.get_admin_member_detail(uuid)
  is 'commatch_admin_member_detail_v1';

revoke all on function public.get_admin_member_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_member_detail(uuid)
  to authenticated;

do $installation_validation$
declare
  v_marker constant text := 'commatch_admin_member_detail_v1';
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_admin_member_detail(uuid)');
begin
  if v_function_oid is null then
    raise exception 'Administrator member detail function was not created';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_member_detail'
  ) <> 1 then
    raise exception 'Administrator member detail function must have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(member_user_id uuid, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, nickname text, gender text, birth_date date, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, premium_started_at timestamp with time zone, premium_expires_at timestamp with time zone)' then
    raise exception 'Administrator member detail return contract differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargs = 1
      and function_info.pronargdefaults = 0
      and pg_catalog.pg_get_function_identity_arguments(function_info.oid) =
        'p_target_user_id uuid'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Administrator member detail function attributes differ from the approved definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid = v_function_oid
      and acl_info.privilege_type = 'EXECUTE'
      and acl_info.grantee = 0::oid
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'Administrator member detail function privileges differ from the approved definition';
  end if;
end
$installation_validation$;

commit;

-- Read-only post-install verification:
-- select pg_catalog.pg_get_functiondef(
--   'public.get_admin_member_detail(uuid)'::pg_catalog.regprocedure
-- );
