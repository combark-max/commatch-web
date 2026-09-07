-- Exclude currently suspended members from the advanced member search.
-- This corrective migration changes only public.search_members_advanced().
-- Apply after member-public-age-contracts.sql and admin-history-member-separation.sql.

begin;

do $preflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.search_members_advanced(integer,integer,text,text,text)'
  );
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regprocedure(
       'public.is_member_service_allowed()'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.has_premium_feature(text)'
     ) is null
     or v_function_oid is null then
    raise exception 'Required advanced-search dependencies are missing';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'search_members_advanced'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 5
      and function_info.pronargdefaults = 5
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'commatch_member_candidate_admin_exclusion_v1'
  ) then
    raise exception 'public.search_members_advanced() has an incompatible current contract';
  end if;
end
$preflight$;

create or replace function public.search_members_advanced(
  p_height_min integer default null,
  p_height_max integer default null,
  p_education text default null,
  p_drinking text default null,
  p_hobby text default null
)
returns table (
  id uuid,
  nickname text,
  age integer,
  gender text,
  region text,
  job text,
  introduction text,
  profile_image text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
  v_education text := nullif(pg_catalog.btrim(p_education), '');
  v_drinking text := nullif(pg_catalog.btrim(p_drinking), '');
  v_hobby text := nullif(pg_catalog.btrim(p_hobby), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if not coalesce(public.has_premium_feature('advanced_member_search'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  if p_height_min is not null and p_height_min < 0
     or p_height_max is not null and p_height_max < 0
     or p_height_min is not null and p_height_max is not null and p_height_min > p_height_max
     or v_education is not null
       and v_education <> all (array['고졸', '전문대졸', '대졸', '석사', '박사']::text[])
     or v_drinking is not null
       and v_drinking <> all (array['전혀 안 함', '가끔 함', '자주 함']::text[]) then
    raise exception using errcode = '22023', message = 'Invalid advanced search filters';
  end if;

  select viewer_profile.gender into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  return query
  select
    member_profile.id,
    member_profile.nickname,
    case
      when member_profile.birth_date is null then null::integer
      else pg_catalog.date_part('year', pg_catalog.age(current_date, member_profile.birth_date))::integer
    end,
    member_profile.gender,
    member_profile.region,
    member_profile.job,
    member_profile.introduction,
    member_profile.profile_image
  from public.profiles as member_profile
  where member_profile.id <> v_user_id
    and member_profile.gender = case when v_gender = '남성' then '여성' else '남성' end
    and not exists (
      select 1 from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (
              restriction.suspended_until is null
              or restriction.suspended_until > pg_catalog.now()
            )
          )
        )
    )
    and not exists (
      select 1 from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
    and (p_height_min is null or member_profile.height >= p_height_min)
    and (p_height_max is null or member_profile.height <= p_height_max)
    and (v_education is null or member_profile.education = v_education)
    and (v_drinking is null or member_profile.drinking = v_drinking)
    and (
      v_hobby is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(member_profile.hobby, '')),
        pg_catalog.lower(v_hobby)
      ) > 0
    );
end
$function$;

alter function public.search_members_advanced(integer, integer, text, text, text)
  owner to postgres;
revoke all on function public.search_members_advanced(integer, integer, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text)
  to authenticated, service_role;
comment on function public.search_members_advanced(integer, integer, text, text, text)
  is 'commatch_member_candidate_admin_exclusion_v1';

do $postflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.search_members_advanced(integer,integer,text,text,text)'
  );
  v_definition text;
  v_authenticated_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'authenticated'
  );
  v_service_role_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'service_role'
  );
begin
  if v_function_oid is null then
    raise exception 'public.search_members_advanced() is missing after correction';
  end if;

  v_definition := pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_function_oid)
  );

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 5
      and function_info.pronargdefaults = 5
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'commatch_member_candidate_admin_exclusion_v1'
  ) then
    raise exception 'public.search_members_advanced() contract correction failed';
  end if;

  if pg_catalog.strpos(v_definition, 'public.is_member_service_allowed()') = 0
     or pg_catalog.strpos(
       v_definition,
       'public.has_premium_feature(''advanced_member_search'')'
     ) = 0
     or pg_catalog.strpos(
       v_definition,
       'restriction.profile_visibility = ''hidden'''
     ) = 0
     or pg_catalog.strpos(
       v_definition,
       'restriction.account_status = ''suspended'''
     ) = 0
     or pg_catalog.strpos(
       v_definition,
       'restriction.suspended_until is null'
     ) = 0
     or pg_catalog.strpos(
       v_definition,
       'restriction.suspended_until > pg_catalog.now()'
     ) = 0
     or pg_catalog.strpos(
       v_definition,
       'from public.admin_accounts as admin_account'
     ) = 0 then
    raise exception 'public.search_members_advanced() policy correction failed';
  end if;

  if pg_catalog.has_function_privilege(
       'public', v_function_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     ) then
    raise exception 'public.search_members_advanced() EXECUTE ACL correction failed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_info.proacl,
        pg_catalog.acldefault('f', function_info.proowner)
      )
    ) as acl_entry
    where function_info.oid = v_function_oid
      and (
        acl_entry.privilege_type <> 'EXECUTE'
        or acl_entry.grantee not in (
          function_info.proowner,
          v_authenticated_oid,
          v_service_role_oid
        )
        or (
          acl_entry.grantee in (v_authenticated_oid, v_service_role_oid)
          and acl_entry.is_grantable
        )
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(function_info.proacl) as acl_entry
    where function_info.oid = v_function_oid
      and acl_entry.grantee = v_authenticated_oid
      and acl_entry.privilege_type = 'EXECUTE'
  ) or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(function_info.proacl) as acl_entry
    where function_info.oid = v_function_oid
      and acl_entry.grantee = v_service_role_oid
      and acl_entry.privilege_type = 'EXECUTE'
  ) then
    raise exception 'public.search_members_advanced() direct ACL correction failed';
  end if;
end
$postflight$;

commit;
