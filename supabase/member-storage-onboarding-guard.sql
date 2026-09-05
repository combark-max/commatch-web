-- ComMatch profile-image Storage onboarding guard.
--
-- This migration changes only profile_images_insert. Existing profile members
-- continue through is_member_service_allowed(); profile-free onboarding members
-- may use the separate helper after the same write lock, restriction, and
-- required-consent checks. Profile age remains authoritative at profiles INSERT.

begin;

do $preflight$
declare
  v_authenticated_oid oid;
  v_insert_check text;
  v_signature text;
begin
  if pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.user_consent_events') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null then
    raise exception 'Required onboarding guard tables are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = 'storage.objects'::pg_catalog.regclass
      and relation_info.relrowsecurity
  ) then
    raise exception 'storage.objects must have RLS enabled';
  end if;

  foreach v_signature in array array[
    'public.is_member_service_allowed()',
    'public.has_completed_required_member_consents()',
    'public.get_my_member_access()',
    'public.lock_member_service_write(uuid)',
    'public.enforce_adult_profile_birth_date()'
  ]::text[] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Required function % is missing', v_signature;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
       'public.is_member_profile_onboarding_allowed()'
     ) is not null then
    raise exception 'public.is_member_profile_onboarding_allowed() already exists';
  end if;

  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if v_authenticated_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_roles as role_info
       where role_info.rolname = 'anon'
     )
     or not exists (
       select 1
       from pg_catalog.pg_roles as role_info
       where role_info.rolname = 'service_role'
     ) then
    raise exception 'Required API roles are missing';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_expr(
    policy_info.polwithcheck, policy_info.polrelid
  ))
  into v_insert_check
  from pg_catalog.pg_policy as policy_info
  where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy_info.polname = 'profile_images_insert'
    and policy_info.polcmd = 'a'
    and policy_info.polpermissive
    and policy_info.polroles = array[v_authenticated_oid]
    and policy_info.polqual is null
    and policy_info.polwithcheck is not null;

  if v_insert_check is null
     or pg_catalog.strpos(v_insert_check, 'bucket_id') = 0
     or pg_catalog.strpos(v_insert_check, 'profile_images') = 0
     or pg_catalog.strpos(v_insert_check, 'storage.foldername') = 0
     or pg_catalog.strpos(v_insert_check, 'auth.uid') = 0
     or pg_catalog.strpos(v_insert_check, 'is_member_service_allowed') = 0
     or pg_catalog.strpos(
       v_insert_check, 'is_member_profile_onboarding_allowed'
     ) > 0 then
    raise exception 'profile_images_insert has an unexpected pre-migration definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
      and trigger_info.tgname = 'profiles_enforce_adult_birth_date'
      and not trigger_info.tgisinternal
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgfoid =
        'public.enforce_adult_profile_birth_date()'::pg_catalog.regprocedure
  ) then
    raise exception 'Adult profile birth-date trigger is missing or incompatible';
  end if;
end
$preflight$;

-- Snapshot every Storage policy except the one approved for modification.
create temporary table _commatch_storage_onboarding_policy_baseline
on commit drop
as
select
  policy_info.oid as policy_oid,
  policy_info.polname,
  policy_info.polcmd,
  policy_info.polpermissive,
  policy_info.polroles,
  case
    when policy_info.polqual is null then null
    else pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)
  end as using_expression,
  case
    when policy_info.polwithcheck is null then null
    else pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)
  end as check_expression
from pg_catalog.pg_policy as policy_info
where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
  and policy_info.polname <> 'profile_images_insert';

create temporary table _commatch_storage_onboarding_insert_baseline
on commit drop
as
select
  policy_info.oid as policy_oid,
  policy_info.polname,
  policy_info.polcmd,
  policy_info.polpermissive,
  policy_info.polroles,
  case
    when policy_info.polqual is null then null
    else pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)
  end as using_expression
from pg_catalog.pg_policy as policy_info
where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
  and policy_info.polname = 'profile_images_insert';

create temporary table _commatch_storage_onboarding_security_baseline
on commit drop
as
select
  pg_catalog.pg_get_functiondef(
    'public.is_member_service_allowed()'::pg_catalog.regprocedure
  ) as service_guard_definition,
  pg_catalog.pg_get_functiondef(
    'public.enforce_adult_profile_birth_date()'::pg_catalog.regprocedure
  ) as adult_trigger_function_definition,
  pg_catalog.pg_get_triggerdef(trigger_info.oid) as adult_trigger_definition,
  trigger_info.tgenabled as adult_trigger_enabled
from pg_catalog.pg_trigger as trigger_info
where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
  and trigger_info.tgname = 'profiles_enforce_adult_birth_date'
  and not trigger_info.tgisinternal;

create or replace function public.is_member_profile_onboarding_allowed()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_is_allowed boolean;
begin
  -- commatch_member_storage_onboarding_guard_v1
  if v_user_id is null then
    return false;
  end if;

  -- Serialize this decision with profile writes and member restrictions.
  perform public.lock_member_service_write(v_user_id);

  -- This branch is strictly for first-profile onboarding. Existing null or
  -- minor profiles must continue to fail the adult-aware service guard.
  if exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
  ) then
    return false;
  end if;

  select member_access.is_allowed
  into v_is_allowed
  from public.get_my_member_access() as member_access;

  if not coalesce(v_is_allowed, false) then
    return false;
  end if;

  return coalesce(
    public.has_completed_required_member_consents(),
    false
  );
end
$function$;

comment on function public.is_member_profile_onboarding_allowed()
  is 'commatch_member_storage_onboarding_guard_v1: authorizes first-profile image upload while preserving consent and restriction guards';
alter function public.is_member_profile_onboarding_allowed() owner to postgres;
revoke all on function public.is_member_profile_onboarding_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.is_member_profile_onboarding_allowed()
  to authenticated, service_role;

alter policy profile_images_insert
on storage.objects
with check (
  bucket_id = 'profile_images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (select public.is_member_service_allowed())
    or (select public.is_member_profile_onboarding_allowed())
  )
);

do $postflight$
declare
  v_authenticated_oid oid;
  v_function_oid oid :=
    'public.is_member_profile_onboarding_allowed()'::pg_catalog.regprocedure;
  v_function_definition text;
  v_insert_check text;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if exists (
    (
      select
        policy_info.oid,
        policy_info.polname,
        policy_info.polcmd,
        policy_info.polpermissive,
        policy_info.polroles,
        case
          when policy_info.polqual is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polqual, policy_info.polrelid
          )
        end,
        case
          when policy_info.polwithcheck is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polwithcheck, policy_info.polrelid
          )
        end
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
        and policy_info.polname <> 'profile_images_insert'
      except all
      select * from pg_temp._commatch_storage_onboarding_policy_baseline
    )
    union all
    (
      select * from pg_temp._commatch_storage_onboarding_policy_baseline
      except all
      select
        policy_info.oid,
        policy_info.polname,
        policy_info.polcmd,
        policy_info.polpermissive,
        policy_info.polroles,
        case
          when policy_info.polqual is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polqual, policy_info.polrelid
          )
        end,
        case
          when policy_info.polwithcheck is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polwithcheck, policy_info.polrelid
          )
        end
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
        and policy_info.polname <> 'profile_images_insert'
    )
  ) then
    raise exception 'A Storage policy outside profile_images_insert changed';
  end if;

  if exists (
    select 1
    from pg_temp._commatch_storage_onboarding_insert_baseline as baseline
    left join pg_catalog.pg_policy as policy_info
      on policy_info.oid = baseline.policy_oid
    where policy_info.oid is null
       or policy_info.polname <> baseline.polname
       or policy_info.polcmd <> baseline.polcmd
       or policy_info.polpermissive <> baseline.polpermissive
       or policy_info.polroles <> baseline.polroles
       or (
         case
           when policy_info.polqual is null then null
           else pg_catalog.pg_get_expr(
             policy_info.polqual, policy_info.polrelid
           )
         end
       ) is distinct from baseline.using_expression
  ) then
    raise exception 'profile_images_insert identity or metadata changed';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_expr(
    policy_info.polwithcheck, policy_info.polrelid
  ))
  into v_insert_check
  from pg_catalog.pg_policy as policy_info
  where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy_info.polname = 'profile_images_insert'
    and policy_info.polcmd = 'a'
    and policy_info.polpermissive
    and policy_info.polroles = array[v_authenticated_oid]
    and policy_info.polqual is null;

  if v_insert_check is null
     or pg_catalog.strpos(v_insert_check, 'bucket_id') = 0
     or pg_catalog.strpos(v_insert_check, 'profile_images') = 0
     or pg_catalog.strpos(v_insert_check, 'storage.foldername') = 0
     or pg_catalog.strpos(v_insert_check, 'auth.uid') = 0
     or pg_catalog.strpos(v_insert_check, 'is_member_service_allowed') = 0
     or pg_catalog.strpos(
       v_insert_check, 'is_member_profile_onboarding_allowed'
     ) = 0 then
    raise exception 'profile_images_insert onboarding contract differs';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_functiondef(v_function_oid))
  into v_function_definition;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and function_info.prokind = 'f'
      and language_info.lanname = 'plpgsql'
      and function_info.provolatile = 'v'
      and function_info.prosecdef
      and function_info.proparallel = 'u'
      and function_info.proconfig = array['search_path=""']::text[]
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and pg_catalog.pg_get_function_result(function_info.oid) = 'boolean'
  )
     or pg_catalog.strpos(
       v_function_definition, 'commatch_member_storage_onboarding_guard_v1'
     ) = 0
     or pg_catalog.strpos(
       v_function_definition, 'public.lock_member_service_write'
     ) = 0
     or pg_catalog.strpos(v_function_definition, 'public.profiles') = 0
     or pg_catalog.strpos(
       v_function_definition, 'public.get_my_member_access'
     ) = 0
     or pg_catalog.strpos(
       v_function_definition,
       'public.has_completed_required_member_consents'
     ) = 0 then
    raise exception 'Onboarding helper definition is incompatible';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     ) then
    raise exception 'Onboarding helper ACL is incompatible';
  end if;

  if (
    select pg_catalog.pg_get_functiondef(
      'public.is_member_service_allowed()'::pg_catalog.regprocedure
    )
  ) is distinct from (
    select baseline.service_guard_definition
    from pg_temp._commatch_storage_onboarding_security_baseline as baseline
  )
     or (
       select pg_catalog.pg_get_functiondef(
         'public.enforce_adult_profile_birth_date()'::pg_catalog.regprocedure
       )
     ) is distinct from (
       select baseline.adult_trigger_function_definition
       from pg_temp._commatch_storage_onboarding_security_baseline as baseline
     )
     or not exists (
       select 1
       from pg_catalog.pg_trigger as trigger_info
       cross join pg_temp._commatch_storage_onboarding_security_baseline
         as baseline
       where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
         and trigger_info.tgname = 'profiles_enforce_adult_birth_date'
         and not trigger_info.tgisinternal
         and trigger_info.tgenabled = baseline.adult_trigger_enabled
         and pg_catalog.pg_get_triggerdef(trigger_info.oid)
           = baseline.adult_trigger_definition
     ) then
    raise exception 'Member service guard or adult profile trigger changed';
  end if;
end
$postflight$;

commit;
