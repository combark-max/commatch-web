-- ComMatch public member-profile Premium badge.
--
-- This forward migration extends only get_visible_member_detail(uuid). It
-- returns one boolean for the target member's current Premium availability and
-- does not expose stored status, dates, feature keys, or administrator data.

begin;

do $preflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_visible_member_detail(uuid)'
  );
  v_result_type text;
  v_marker text;
  v_dependent_objects text;
  v_previous_result constant text :=
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])';
  v_target_result constant text :=
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)';
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null then
    raise exception 'Required profile visibility or Premium dependency is missing';
  end if;

  if v_function_oid is null then
    raise exception 'public.get_visible_member_detail(uuid) is missing';
  end if;

  select
    pg_catalog.pg_get_function_result(function_info.oid),
    pg_catalog.obj_description(function_info.oid, 'pg_proc')
  into v_result_type, v_marker
  from pg_catalog.pg_proc as function_info
  join pg_catalog.pg_language as language_info
    on language_info.oid = function_info.prolang
  where function_info.oid = v_function_oid
    and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
    and language_info.lanname = 'plpgsql'
    and function_info.prosecdef
    and function_info.provolatile = 'v'
    and function_info.proconfig is not distinct from array['search_path=""']::text[];

  if v_result_type is null
     or not (
       v_result_type = v_previous_result
       and v_marker = 'commatch_member_profile_visibility_v1'
       or v_result_type = v_target_result
       and v_marker = 'commatch_member_profile_premium_badge_v1'
     ) then
    raise exception 'public.get_visible_member_detail(uuid) differs from an approved source contract';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid = v_function_oid
      and acl_info.grantee = 0::oid
      and acl_info.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_visible_member_detail(uuid) privileges differ from the approved contract';
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
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  is_premium_available boolean
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
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_history,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images,
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = target_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
    ) as is_premium_available
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and public.is_member_profile_visible(target_profile.id);
end
$function$;

alter function public.get_visible_member_detail(uuid) owner to postgres;
comment on function public.get_visible_member_detail(uuid)
  is 'commatch_member_profile_premium_badge_v1';
revoke all on function public.get_visible_member_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid)
  to authenticated, service_role;

do $validation$
declare
  v_function_oid oid := 'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_function_oid);
begin
  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)' then
    raise exception 'public.get_visible_member_detail(uuid) return contract differs';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'commatch_member_profile_premium_badge_v1'
  ) then
    raise exception 'public.get_visible_member_detail(uuid) attributes differ';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid = v_function_oid
      and acl_info.grantee = 0::oid
      and acl_info.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_visible_member_detail(uuid) privileges differ';
  end if;

  if pg_catalog.strpos(v_definition, 'public.lock_member_service_write(p_target_user_id)') = 0
     or pg_catalog.strpos(v_definition, 'public.is_member_profile_visible(target_profile.id)') = 0
     or pg_catalog.strpos(v_definition, 'membership.status = ''active''') = 0
     or pg_catalog.strpos(v_definition, 'membership.started_at <= pg_catalog.now()') = 0
     or pg_catalog.strpos(v_definition, 'membership.expires_at > pg_catalog.now()') = 0
     or pg_catalog.strpos(v_definition, 'membership.feature_keys') > 0 then
    raise exception 'public.get_visible_member_detail(uuid) security or Premium predicate differs';
  end if;
end
$validation$;

commit;

select 'PASS member profile Premium badge forward migration' as migration_result;
