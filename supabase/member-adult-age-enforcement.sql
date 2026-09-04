-- Enforce ComMatch's current minimum age (19) at profile writes and at the
-- shared member-service authorization boundary.
--
-- Apply after member-service-consent-access-guards.sql and
-- member-service-write-guards.sql.

begin;

do $preflight$
declare
  v_profile_insert_policy_count integer;
  v_profile_update_policy_count integer;
  v_function_oid oid;
  v_authenticated_oid oid;
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.user_consent_events') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regprocedure('public.get_my_member_access()') is null
     or pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)') is null
     or pg_catalog.to_regprocedure(
       'public.has_completed_required_member_consents()'
     ) is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null then
    raise exception 'Required member profile, consent, restriction, or guard objects are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'birth_date'
      and column_info.data_type = 'date'
  ) then
    raise exception 'public.profiles.birth_date is missing or is not date';
  end if;

  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if v_authenticated_oid is null then
    raise exception 'authenticated role is missing';
  end if;

  select pg_catalog.count(*) filter (where policy_info.polcmd = 'a'),
    pg_catalog.count(*) filter (where policy_info.polcmd = 'w')
  into v_profile_insert_policy_count, v_profile_update_policy_count
  from pg_catalog.pg_policy as policy_info
  where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
    and policy_info.polcmd in ('a', 'w')
    and (
      policy_info.polroles = array[0::oid]
      or v_authenticated_oid = any(policy_info.polroles)
    );

  if v_profile_insert_policy_count = 0 or v_profile_update_policy_count = 0 then
    raise exception 'public.profiles INSERT/UPDATE RLS policies are missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd in ('a', 'w')
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
      and (
        policy_info.polwithcheck is null
        or (
          pg_catalog.strpos(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(
                policy_info.polwithcheck, policy_info.polrelid
              )),
              '[[:space:]"]',
              '',
              'g'
            ),
            'is_member_service_allowed('
          ) = 0
          and pg_catalog.strpos(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(
                policy_info.polwithcheck, policy_info.polrelid
              )),
              '[[:space:]"]',
              '',
              'g'
            ),
            'is_member_profile_write_allowed('
          ) = 0
        )
        or (
          policy_info.polcmd = 'w'
          and (
            policy_info.polqual is null
            or (
              pg_catalog.strpos(
                pg_catalog.regexp_replace(
                  pg_catalog.lower(pg_catalog.pg_get_expr(
                    policy_info.polqual, policy_info.polrelid
                  )),
                  '[[:space:]"]',
                  '',
                  'g'
                ),
                'is_member_service_allowed('
              ) = 0
              and pg_catalog.strpos(
                pg_catalog.regexp_replace(
                  pg_catalog.lower(pg_catalog.pg_get_expr(
                    policy_info.polqual, policy_info.polrelid
                  )),
                  '[[:space:]"]',
                  '',
                  'g'
                ),
                'is_member_profile_write_allowed('
              ) = 0
            )
          )
        )
      )
  ) then
    raise exception 'A public.profiles write policy is missing the established member guard';
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.is_member_profile_write_allowed(date)'
  );
  if v_function_oid is not null
     and pg_catalog.obj_description(v_function_oid, 'pg_proc') is distinct from
       'commatch_member_adult_age_enforcement_v1: authorizes an adult profile row write while preserving member and consent guards' then
    raise exception 'public.is_member_profile_write_allowed(date) exists without the approved marker';
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.enforce_adult_profile_birth_date()'
  );
  if v_function_oid is not null
     and pg_catalog.obj_description(v_function_oid, 'pg_proc') is distinct from
       'commatch_member_adult_age_enforcement_v1: rejects profile birth dates below age 19' then
    raise exception 'public.enforce_adult_profile_birth_date() exists without the approved marker';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
      and trigger_info.tgname = 'profiles_enforce_adult_birth_date'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid is distinct from pg_catalog.to_regprocedure(
        'public.enforce_adult_profile_birth_date()'
      )
  ) then
    raise exception 'profiles_enforce_adult_birth_date exists with an incompatible function';
  end if;
end
$preflight$;

create temporary table _commatch_adult_age_function_contract
on commit drop
as
select
  pg_catalog.pg_get_function_result(function_info.oid) as result_type,
  function_info.proacl,
  pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name,
  pg_catalog.obj_description(function_info.oid, 'pg_proc') as description
from pg_catalog.pg_proc as function_info
where function_info.oid =
  'public.is_member_service_allowed()'::pg_catalog.regprocedure;

create temporary table _commatch_adult_age_profile_policy_contract
on commit drop
as
select
  policy_info.polname,
  policy_info.polcmd,
  policy_info.polpermissive,
  policy_info.polroles
from pg_catalog.pg_policy as policy_info
where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
  and policy_info.polcmd in ('a', 'w')
  and (
    policy_info.polroles = array[0::oid]
    or (
      select role_info.oid
      from pg_catalog.pg_roles as role_info
      where role_info.rolname = 'authenticated'
    ) = any(policy_info.polroles)
  );

create temporary table _commatch_adult_age_column_contract
on commit drop
as
select column_info.is_nullable
from information_schema.columns as column_info
where column_info.table_schema = 'public'
  and column_info.table_name = 'profiles'
  and column_info.column_name = 'birth_date';

create or replace function public.is_member_profile_write_allowed(
  p_birth_date date
)
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
  -- commatch_member_adult_age_enforcement_v1
  if v_user_id is null then
    return false;
  end if;

  -- Preserve the existing nullable column contract. A null profile remains
  -- ineligible for member service, but this helper does not make the column
  -- physically NOT NULL or prevent maintenance of a legacy null row.
  if p_birth_date is not null
     and p_birth_date > (current_date - interval '19 years')::date then
    return false;
  end if;

  perform public.lock_member_service_write(v_user_id);

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

comment on function public.is_member_profile_write_allowed(date)
  is 'commatch_member_adult_age_enforcement_v1: authorizes an adult profile row write while preserving member and consent guards';
alter function public.is_member_profile_write_allowed(date) owner to postgres;
revoke all on function public.is_member_profile_write_allowed(date)
  from public, anon, authenticated, service_role;
grant execute on function public.is_member_profile_write_allowed(date)
  to authenticated, service_role;

create or replace function public.enforce_adult_profile_birth_date()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  -- Existing null rows remain untouched and retain the current column
  -- nullability contract. The service guard below still denies them.
  if new.birth_date is not null
     and new.birth_date > (current_date - interval '19 years')::date then
    raise exception using
      errcode = '23514',
      message = 'ComMatch requires members to be at least 19 years old',
      constraint = 'profiles_birth_date_minimum_age_check';
  end if;

  return new;
end
$function$;

comment on function public.enforce_adult_profile_birth_date()
  is 'commatch_member_adult_age_enforcement_v1: rejects profile birth dates below age 19';
alter function public.enforce_adult_profile_birth_date() owner to postgres;
revoke all on function public.enforce_adult_profile_birth_date()
  from public, anon, authenticated, service_role;

drop trigger if exists profiles_enforce_adult_birth_date on public.profiles;
create trigger profiles_enforce_adult_birth_date
before insert or update of birth_date on public.profiles
for each row
execute function public.enforce_adult_profile_birth_date();
comment on trigger profiles_enforce_adult_birth_date on public.profiles
  is 'commatch_member_adult_age_enforcement_v1';

-- Keep every existing profile ownership predicate, policy name, role, and
-- permissive/restrictive mode. Replace only the shared service guard with a
-- write-specific guard that can validate NEW.birth_date before a profile row
-- exists, preventing a first-profile deadlock.
do $profile_write_policy_split$
declare
  v_policy record;
  v_using_expression text;
  v_check_expression text;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  for v_policy in
    select
      policy_info.polname,
      policy_info.polcmd,
      policy_info.polqual,
      policy_info.polwithcheck,
      policy_info.polrelid
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd in ('a', 'w')
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
    order by policy_info.polname
  loop
    v_using_expression := case
      when v_policy.polqual is null then null
      else pg_catalog.pg_get_expr(v_policy.polqual, v_policy.polrelid)
    end;
    v_check_expression := case
      when v_policy.polwithcheck is null then null
      else pg_catalog.pg_get_expr(v_policy.polwithcheck, v_policy.polrelid)
    end;

    if v_using_expression is not null then
      v_using_expression := pg_catalog.regexp_replace(
        v_using_expression,
        '("is_member_service_allowed"|\mis_member_service_allowed\M)[[:space:]]*\([[:space:]]*\)',
        'is_member_profile_write_allowed(null::date)',
        'gi'
      );
    end if;
    if v_check_expression is not null then
      v_check_expression := pg_catalog.regexp_replace(
        v_check_expression,
        '("is_member_service_allowed"|\mis_member_service_allowed\M)[[:space:]]*\([[:space:]]*\)',
        'is_member_profile_write_allowed(birth_date)',
        'gi'
      );
    end if;

    if v_check_expression is null
       or pg_catalog.strpos(
         pg_catalog.regexp_replace(
           pg_catalog.lower(v_check_expression), '[[:space:]"]', '', 'g'
         ),
         'is_member_service_allowed('
       ) > 0
       or pg_catalog.strpos(
         pg_catalog.regexp_replace(
           pg_catalog.lower(v_check_expression), '[[:space:]"]', '', 'g'
         ),
         'is_member_profile_write_allowed('
       ) = 0 then
      raise exception 'Profile policy % WITH CHECK guard rewrite failed',
        v_policy.polname;
    end if;

    if v_policy.polcmd = 'w'
       and (
         v_using_expression is null
         or pg_catalog.strpos(
           pg_catalog.regexp_replace(
             pg_catalog.lower(v_using_expression), '[[:space:]"]', '', 'g'
           ),
           'is_member_service_allowed('
         ) > 0
         or pg_catalog.strpos(
           pg_catalog.regexp_replace(
             pg_catalog.lower(v_using_expression), '[[:space:]"]', '', 'g'
           ),
           'is_member_profile_write_allowed('
         ) = 0
       ) then
      raise exception 'Profile policy % USING guard rewrite failed',
        v_policy.polname;
    end if;

    if v_policy.polcmd = 'a' then
      execute pg_catalog.format(
        'alter policy %I on public.profiles with check (%s)',
        v_policy.polname,
        v_check_expression
      );
    else
      execute pg_catalog.format(
        'alter policy %I on public.profiles using (%s) with check (%s)',
        v_policy.polname,
        v_using_expression,
        v_check_expression
      );
    end if;
  end loop;
end
$profile_write_policy_split$;

create or replace function public.is_member_service_allowed()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_birth_date date;
  v_is_allowed boolean;
begin
  -- commatch_member_service_consent_access_guards_v1
  -- commatch_member_adult_age_enforcement_v1
  if v_user_id is null then
    return false;
  end if;

  perform public.lock_member_service_write(v_user_id);

  -- Read the profile only after the established member-write lock so an age
  -- decision cannot use a birth date made stale by a concurrent profile write.
  select profile.birth_date
  into v_birth_date
  from public.profiles as profile
  where profile.id = v_user_id;

  if not found or v_birth_date is null
     or v_birth_date > (current_date - interval '19 years')::date then
    return false;
  end if;

  -- Preserve the existing READ COMMITTED restriction check after the blocking
  -- lock so a restriction committed while waiting is observed.
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

comment on function public.is_member_service_allowed()
  is 'commatch_admin_member_restrictions_v1';
alter function public.is_member_service_allowed() owner to postgres;

do $postflight$
declare
  v_function record;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
      and trigger_info.tgname = 'profiles_enforce_adult_birth_date'
      and not trigger_info.tgisinternal
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgfoid =
        'public.enforce_adult_profile_birth_date()'::pg_catalog.regprocedure
      and pg_catalog.obj_description(trigger_info.oid, 'pg_trigger') =
        'commatch_member_adult_age_enforcement_v1'
  ) then
    raise exception 'Adult profile birth-date trigger contract is incompatible';
  end if;

  select
    pg_catalog.pg_get_userbyid(function_info.proowner) as owner_name,
    function_info.prosecdef,
    function_info.provolatile,
    function_info.proconfig
  into v_function
  from pg_catalog.pg_proc as function_info
  where function_info.oid =
    'public.is_member_profile_write_allowed(date)'::pg_catalog.regprocedure;

  if v_function.owner_name <> 'postgres'
     or not v_function.prosecdef
     or v_function.provolatile <> 'v'
     or v_function.proconfig is distinct from array['search_path=""']::text[]
     or pg_catalog.has_function_privilege(
       'public', 'public.is_member_profile_write_allowed(date)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', 'public.is_member_profile_write_allowed(date)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', 'public.is_member_profile_write_allowed(date)', 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', 'public.is_member_profile_write_allowed(date)', 'EXECUTE'
     ) then
    raise exception 'Profile-write guard metadata or ACL is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join pg_temp._commatch_adult_age_function_contract as baseline
    where function_info.oid =
      'public.is_member_service_allowed()'::pg_catalog.regprocedure
      and pg_catalog.pg_get_function_result(function_info.oid) = baseline.result_type
      and function_info.proacl is not distinct from baseline.proacl
      and pg_catalog.pg_get_userbyid(function_info.proowner) = baseline.owner_name
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') is not distinct from
        baseline.description
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.strpos(
        function_info.prosrc,
        'commatch_member_service_consent_access_guards_v1'
      ) > 0
      and pg_catalog.strpos(
        function_info.prosrc,
        'commatch_member_adult_age_enforcement_v1'
      ) > 0
  ) then
    raise exception 'Member service guard contract was not preserved';
  end if;

  if exists (
    select 1
    from pg_temp._commatch_adult_age_profile_policy_contract as baseline
    full join (
      select current_policy.*
      from pg_catalog.pg_policy as current_policy
      where current_policy.polrelid = 'public.profiles'::pg_catalog.regclass
        and current_policy.polcmd in ('a', 'w')
        and (
          current_policy.polroles = array[0::oid]
          or v_authenticated_oid = any(current_policy.polroles)
        )
    ) as policy_info
      on policy_info.polname = baseline.polname
     and policy_info.polcmd = baseline.polcmd
    where policy_info.oid is null
       or baseline.polname is null
       or policy_info.polpermissive is distinct from baseline.polpermissive
       or policy_info.polroles is distinct from baseline.polroles
  ) then
    raise exception 'A profile write policy identity, role, or mode changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd in ('a', 'w')
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
      and (
        policy_info.polwithcheck is null
        or pg_catalog.strpos(
          pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_expr(
              policy_info.polwithcheck, policy_info.polrelid
            )),
            '[[:space:]"]',
            '',
            'g'
          ),
          'is_member_profile_write_allowed('
        ) = 0
        or pg_catalog.strpos(
          pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_expr(
              policy_info.polwithcheck, policy_info.polrelid
            )),
            '[[:space:]"]',
            '',
            'g'
          ),
          'is_member_service_allowed('
        ) > 0
        or (
          policy_info.polcmd = 'w'
          and (
            policy_info.polqual is null
            or pg_catalog.strpos(
              pg_catalog.regexp_replace(
                pg_catalog.lower(pg_catalog.pg_get_expr(
                  policy_info.polqual, policy_info.polrelid
                )),
                '[[:space:]"]',
                '',
                'g'
              ),
              'is_member_profile_write_allowed('
            ) = 0
            or pg_catalog.strpos(
              pg_catalog.regexp_replace(
                pg_catalog.lower(pg_catalog.pg_get_expr(
                  policy_info.polqual, policy_info.polrelid
                )),
                '[[:space:]"]',
                '',
                'g'
              ),
              'is_member_service_allowed('
            ) > 0
          )
        )
      )
  ) then
    raise exception 'A profile write policy was not split from the profile-dependent service guard';
  end if;

  if (
    select column_info.is_nullable
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'birth_date'
  ) is distinct from (
    select baseline.is_nullable
    from pg_temp._commatch_adult_age_column_contract as baseline
  ) then
    raise exception 'public.profiles.birth_date nullability changed';
  end if;
end
$postflight$;

commit;
