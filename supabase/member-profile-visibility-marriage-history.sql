-- Extend the public member detail RPC with the existing marriage_history field.
-- Run after member-profile-visibility.sql and profile-marriage-history.sql.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_member_profile_visibility_v1';
  v_old_result constant text :=
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, religion text, hobby text, drinking text, smoking text, marriage_values text, profile_image text, profile_images text[])';
  v_new_result constant text :=
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_visible_member_detail(uuid)'
  );
  v_dependent_objects text;
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null then
    raise exception 'Required member profile objects are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'marriage_history'
      and column_info.data_type = 'text'
      and column_info.udt_name = 'text'
  ) then
    raise exception 'public.profiles.marriage_history is missing or has an incompatible type';
  end if;

  if pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null then
    raise exception 'Required member visibility dependencies are missing';
  end if;

  if v_function_oid is null then
    raise exception 'public.get_visible_member_detail(uuid) must exist before replacement';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_visible_member_detail'
  ) <> 1 then
    raise exception 'public.get_visible_member_detail must have exactly one signature';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and function_info.prokind = 'f'
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.pronargs = 1
      and function_info.pronargdefaults = 0
      and pg_catalog.pg_get_function_identity_arguments(function_info.oid) =
        'p_target_user_id uuid'
      and function_info.proconfig = array['search_path=""']::text[]
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and pg_catalog.pg_get_function_result(function_info.oid) in (
        v_old_result,
        v_new_result
      )
  ) then
    raise exception 'public.get_visible_member_detail(uuid) differs from an approved replacement source';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_info.proacl,
        pg_catalog.acldefault('f', function_info.proowner)
      )
    ) as function_acl
    where function_info.oid = v_function_oid
      and function_acl.grantee = 0::oid
      and function_acl.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_visible_member_detail(uuid) privileges differ from the approved definition';
  end if;

  select pg_catalog.string_agg(
    pg_catalog.pg_describe_object(
      dependency_info.classid,
      dependency_info.objid,
      dependency_info.objsubid
    ),
    ', '
  )
  into v_dependent_objects
  from pg_catalog.pg_depend as dependency_info
  where dependency_info.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
    and dependency_info.refobjid = v_function_oid;

  if v_dependent_objects is not null then
    raise exception 'Cannot replace public.get_visible_member_detail(uuid) because dependent objects exist: %',
      v_dependent_objects;
  end if;
end
$preflight$;

drop function public.get_visible_member_detail(uuid);

create function public.get_visible_member_detail(p_target_user_id uuid)
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  height integer,
  job text,
  region text,
  introduction text,
  education text,
  religion text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  marriage_values text,
  profile_image text,
  profile_images text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_user_id then
    return;
  end if;

  perform public.lock_member_service_write(p_target_user_id);

  return query
  select
    target_profile.id,
    target_profile.nickname,
    target_profile.birth_date::text,
    target_profile.gender,
    target_profile.height,
    target_profile.job,
    target_profile.region,
    target_profile.introduction,
    target_profile.education,
    target_profile.religion,
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_history,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and public.is_member_profile_visible(target_profile.id);
end
$function$;

alter function public.get_visible_member_detail(uuid) owner to postgres;

comment on function public.get_visible_member_detail(uuid)
  is 'commatch_member_profile_visibility_v1';

revoke all on function public.get_visible_member_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid)
  to authenticated, service_role;

do $validation$
declare
  v_marker constant text := 'commatch_member_profile_visibility_v1';
  v_expected_result constant text :=
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, religion text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_visible_member_detail(uuid)'
  );
begin
  if v_function_oid is null then
    raise exception 'public.get_visible_member_detail(uuid) was not recreated';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'marriage_history'
      and column_info.data_type = 'text'
      and column_info.udt_name = 'text'
  ) then
    raise exception 'public.profiles.marriage_history changed during installation';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_visible_member_detail'
  ) <> 1 then
    raise exception 'public.get_visible_member_detail must have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <> v_expected_result then
    raise exception 'public.get_visible_member_detail(uuid) return type differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and function_info.prokind = 'f'
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.pronargs = 1
      and function_info.pronargdefaults = 0
      and pg_catalog.pg_get_function_identity_arguments(function_info.oid) =
        'p_target_user_id uuid'
      and function_info.proconfig = array['search_path=""']::text[]
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and pg_catalog.strpos(
        pg_catalog.pg_get_functiondef(function_info.oid),
        'target_profile.marriage_history'
      ) > 0
  ) then
    raise exception 'public.get_visible_member_detail(uuid) attributes or definition differ';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_info.proacl,
        pg_catalog.acldefault('f', function_info.proowner)
      )
    ) as function_acl
    where function_info.oid = v_function_oid
      and function_acl.grantee = 0::oid
      and function_acl.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_visible_member_detail(uuid) privileges differ after installation';
  end if;
end
$validation$;

commit;

-- Read-only post-install verification:
-- select pg_catalog.pg_get_function_result(
--   'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure
-- );
