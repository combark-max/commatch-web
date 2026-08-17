begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_members_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null then
    raise exception 'Required member tables must exist before installing the administrator member list';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing the administrator member list';
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
      ('public', 'member_restrictions', 'user_id', 'uuid', 'uuid', true),
      ('public', 'member_restrictions', 'account_status', 'text', 'text', true),
      ('public', 'member_restrictions', 'profile_visibility', 'text', 'text', true),
      ('public', 'member_restrictions', 'suspended_at', 'timestamp with time zone', 'timestamptz', false),
      ('public', 'member_restrictions', 'suspended_until', 'timestamp with time zone', 'timestamptz', false),
      ('public', 'premium_memberships', 'user_id', 'uuid', 'uuid', true),
      ('public', 'premium_memberships', 'status', 'text', 'text', true),
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
    raise exception 'Required administrator member list columns differ from the approved definition';
  end if;

  for v_function in
    select
      function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_members'
  loop
    if v_function.identity_arguments not in (
      'p_search text, p_account text, p_profile text, p_visibility text, p_limit integer, p_offset integer, p_sort_key text, p_sort_direction text',
      'p_search text, p_account text, p_profile text, p_visibility text, p_limit integer, p_offset integer, p_sort_key text, p_sort_direction text, p_gender text, p_age_group text, p_region text, p_job text, p_marriage_history text'
    ) then
      raise exception 'public.get_admin_members already exists with an incompatible signature';
    end if;
    if pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.get_admin_members differs from the approved replacement source';
    end if;
  end loop;

end
$preflight$;

drop function if exists public.get_admin_members(
  text, text, text, text, integer, integer, text, text, text, text, text, text, text
);
drop function if exists public.get_admin_members(text, text, text, text, integer, integer, text, text);

create function public.get_admin_members(
  p_search text default null,
  p_account text default 'all',
  p_profile text default 'all',
  p_visibility text default 'all',
  p_limit integer default 20,
  p_offset integer default 0,
  p_sort_key text default 'joined_at',
  p_sort_direction text default 'desc',
  p_gender text default 'all',
  p_age_group text default 'all',
  p_region text default 'all',
  p_job text default 'all',
  p_marriage_history text default 'all'
)
returns table (
  member_user_id uuid,
  nickname text,
  joined_at timestamptz,
  profile_exists boolean,
  profile_status text,
  profile_visibility text,
  gender text,
  age integer,
  region text,
  job text,
  marriage_history text,
  stored_account_status text,
  current_account_status text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  premium_membership_exists boolean,
  premium_stored_status text,
  premium_is_available boolean,
  premium_period_state text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_search text := nullif(pg_catalog.btrim(p_search), '');
  v_account text := coalesce(nullif(pg_catalog.btrim(p_account), ''), 'all');
  v_profile text := coalesce(nullif(pg_catalog.btrim(p_profile), ''), 'all');
  v_visibility text := coalesce(nullif(pg_catalog.btrim(p_visibility), ''), 'all');
  v_sort_key text := coalesce(nullif(pg_catalog.btrim(p_sort_key), ''), 'joined_at');
  v_sort_direction text := coalesce(nullif(pg_catalog.btrim(p_sort_direction), ''), 'desc');
  v_gender text := coalesce(nullif(pg_catalog.btrim(p_gender), ''), 'all');
  v_age_group text := coalesce(nullif(pg_catalog.btrim(p_age_group), ''), 'all');
  v_region text := coalesce(nullif(pg_catalog.btrim(p_region), ''), 'all');
  v_job text := coalesce(nullif(pg_catalog.btrim(p_job), ''), 'all');
  v_marriage_history text := coalesce(nullif(pg_catalog.btrim(p_marriage_history), ''), 'all');
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('member_restrictions_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  if v_search is not null and pg_catalog.char_length(v_search) > 100 then
    raise exception using errcode = '22023', message = 'Search must be at most 100 characters';
  end if;

  if v_account not in ('all', 'active', 'suspended')
     or v_profile not in ('all', 'missing', 'in_progress', 'completed')
     or v_visibility not in ('all', 'visible', 'hidden')
     or v_sort_key not in ('joined_at', 'nickname')
     or v_sort_direction not in ('asc', 'desc')
     or v_gender not in ('all', 'male', 'female', 'unspecified')
     or v_age_group not in ('all', 'under_20', '20s', '30s', '40s', '50s', '60_plus', 'unspecified')
     or v_region not in (
       'all', 'unspecified', '서울특별시', '부산광역시', '대구광역시', '인천광역시',
       '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도',
       '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
       '경상북도', '경상남도', '제주특별자치도'
     )
     or v_job not in (
       'all', 'other', 'unspecified', '회사원', '공무원', '교직원', '전문직', '의료인',
       '금융직', '연구직', 'IT·개발', '교육직', '자영업', '프리랜서', '예술·문화',
       '서비스직', '생산·기술직', '학생', '취업준비'
     )
     or v_marriage_history not in ('all', 'first_marriage', 'remarriage', 'unspecified')
     or p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Invalid administrator member list parameters';
  end if;

  return query
  with member_population as (
    select
      auth_user.id as member_user_id,
      profile.nickname,
      auth_user.created_at as joined_at,
      profile.id is not null as profile_exists,
      case
        when profile.id is null then 'missing'
        when (
          nullif(pg_catalog.btrim(profile.profile_image), '') is not null
          or exists (
            select 1
            from pg_catalog.unnest(profile.profile_images) as profile_image(image_path)
            where nullif(pg_catalog.btrim(profile_image.image_path), '') is not null
          )
        )
        and nullif(pg_catalog.btrim(profile.nickname), '') is not null
        and nullif(pg_catalog.btrim(profile.gender), '') is not null
        and profile.birth_date is not null
        and profile.height is not null
        and profile.height > 0
        and nullif(pg_catalog.btrim(profile.region), '') is not null
        and nullif(pg_catalog.btrim(profile.job), '') is not null
        and nullif(pg_catalog.btrim(profile.education), '') is not null
        and nullif(pg_catalog.btrim(profile.hobby), '') is not null
        and nullif(pg_catalog.btrim(profile.drinking), '') is not null
        and nullif(pg_catalog.btrim(profile.smoking), '') is not null
        and nullif(pg_catalog.btrim(profile.marriage_history), '') is not null
        and pg_catalog.char_length(pg_catalog.btrim(profile.introduction)) >= 10
        and pg_catalog.char_length(pg_catalog.btrim(profile.marriage_values)) >= 10
          then 'completed'
        else 'in_progress'
      end as profile_status,
      case
        when profile.id is null then null
        when restriction.profile_visibility = 'hidden' then 'hidden'
        else 'visible'
      end as profile_visibility,
      nullif(pg_catalog.btrim(profile.gender), '') as gender,
      case
        when profile.birth_date is null then null
        else pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date))::integer
      end as age,
      nullif(pg_catalog.btrim(profile.region), '') as region,
      case nullif(pg_catalog.btrim(profile.region), '')
        when '서울' then '서울특별시'
        when '부산' then '부산광역시'
        when '대구' then '대구광역시'
        when '인천' then '인천광역시'
        when '광주' then '광주광역시'
        when '대전' then '대전광역시'
        when '울산' then '울산광역시'
        when '세종' then '세종특별자치시'
        when '경기' then '경기도'
        when '강원' then '강원특별자치도'
        when '충북' then '충청북도'
        when '충남' then '충청남도'
        when '전북' then '전북특별자치도'
        when '전남' then '전라남도'
        when '경북' then '경상북도'
        when '경남' then '경상남도'
        when '제주' then '제주특별자치도'
        else nullif(pg_catalog.btrim(profile.region), '')
      end as normalized_region,
      nullif(pg_catalog.btrim(profile.job), '') as job,
      nullif(pg_catalog.btrim(profile.marriage_history), '') as marriage_history,
      coalesce(restriction.account_status, 'active') as stored_account_status,
      case
        when restriction.account_status = 'suspended'
          and (restriction.suspended_until is null or restriction.suspended_until > v_now)
          then 'suspended'
        else 'active'
      end as current_account_status,
      restriction.suspended_at,
      restriction.suspended_until,
      membership.user_id is not null as premium_membership_exists,
      membership.status as premium_stored_status,
      coalesce(
        membership.status = 'active'
          and membership.started_at <= v_now
          and (membership.expires_at is null or membership.expires_at > v_now),
        false
      ) as premium_is_available,
      case
        when membership.user_id is null then 'none'
        when membership.started_at > v_now then 'not_started'
        when membership.expires_at is not null and membership.expires_at <= v_now then 'expired'
        when membership.status = 'suspended' then 'suspended'
        when membership.status = 'revoked' then 'revoked'
        else 'available'
      end as premium_period_state
    from auth.users as auth_user
    left join public.profiles as profile on profile.id = auth_user.id
    left join public.member_restrictions as restriction on restriction.user_id = auth_user.id
    left join public.premium_memberships as membership on membership.user_id = auth_user.id
    where not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = auth_user.id
    )
  ),
  filtered_members as (
    select member.*
    from member_population as member
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(member.nickname, '')),
        pg_catalog.lower(v_search)
      ) > 0
      or pg_catalog.left(member.member_user_id::text, pg_catalog.char_length(v_search)) =
        pg_catalog.lower(v_search)
    )
      and (v_account = 'all' or member.current_account_status = v_account)
      and (v_profile = 'all' or member.profile_status = v_profile)
      and (v_visibility = 'all' or member.profile_visibility = v_visibility)
      and (
        v_gender = 'all'
        or v_gender = 'male' and member.gender in ('남성', 'male')
        or v_gender = 'female' and member.gender in ('여성', 'female')
        or v_gender = 'unspecified'
          and (member.gender is null or member.gender not in ('남성', 'male', '여성', 'female'))
      )
      and (
        v_age_group = 'all'
        or v_age_group = 'under_20' and member.age < 20
        or v_age_group = '20s' and member.age between 20 and 29
        or v_age_group = '30s' and member.age between 30 and 39
        or v_age_group = '40s' and member.age between 40 and 49
        or v_age_group = '50s' and member.age between 50 and 59
        or v_age_group = '60_plus' and member.age >= 60
        or v_age_group = 'unspecified' and member.age is null
      )
      and (
        v_region = 'all'
        or v_region = 'unspecified' and member.region is null
        or member.normalized_region = v_region
      )
      and (
        v_job = 'all'
        or v_job = 'unspecified' and member.job is null
        or v_job = 'other' and member.job is not null and member.job not in (
          '회사원', '공무원', '교직원', '전문직', '의료인', '금융직', '연구직',
          'IT·개발', '교육직', '자영업', '프리랜서', '예술·문화', '서비스직',
          '생산·기술직', '학생', '취업준비'
        )
        or v_job not in ('all', 'other', 'unspecified') and member.job = v_job
      )
      and (
        v_marriage_history = 'all'
        or v_marriage_history = 'first_marriage' and member.marriage_history = 'first_marriage'
        or v_marriage_history = 'remarriage' and member.marriage_history = 'remarriage'
        or v_marriage_history = 'unspecified'
          and (member.marriage_history is null
            or member.marriage_history not in ('first_marriage', 'remarriage'))
      )
  )
  select
    member.member_user_id,
    member.nickname,
    member.joined_at,
    member.profile_exists,
    member.profile_status,
    member.profile_visibility,
    member.gender,
    member.age,
    member.region,
    member.job,
    member.marriage_history,
    member.stored_account_status,
    member.current_account_status,
    member.suspended_at,
    member.suspended_until,
    member.premium_membership_exists,
    member.premium_stored_status,
    member.premium_is_available,
    member.premium_period_state,
    pg_catalog.count(*) over () as total_count
  from filtered_members as member
  order by
    case when v_sort_key = 'joined_at' and v_sort_direction = 'asc' then member.joined_at end asc,
    case when v_sort_key = 'joined_at' and v_sort_direction = 'desc' then member.joined_at end desc,
    case when v_sort_key = 'nickname' and v_sort_direction = 'asc'
      then pg_catalog.lower(pg_catalog.btrim(member.nickname)) end asc nulls last,
    case when v_sort_key = 'nickname' and v_sort_direction = 'desc'
      then pg_catalog.lower(pg_catalog.btrim(member.nickname)) end desc nulls last,
    case when v_sort_direction = 'asc' then member.member_user_id end asc,
    case when v_sort_direction = 'desc' then member.member_user_id end desc
  limit p_limit
  offset p_offset;
end
$function$;

alter function public.get_admin_members(
  text, text, text, text, integer, integer, text, text, text, text, text, text, text
)
  owner to postgres;

comment on function public.get_admin_members(
  text, text, text, text, integer, integer, text, text, text, text, text, text, text
)
  is 'commatch_admin_members_v1';

revoke all on function public.get_admin_members(
  text, text, text, text, integer, integer, text, text, text, text, text, text, text
)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_members(
  text, text, text, text, integer, integer, text, text, text, text, text, text, text
)
  to authenticated;

do $installation_validation$
declare
  v_marker constant text := 'commatch_admin_members_v1';
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_admin_members(text,text,text,text,integer,integer,text,text,text,text,text,text,text)'
  );
begin
  if v_function_oid is null then
    raise exception 'Administrator member list function was not created';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_members'
  ) <> 1 then
    raise exception 'Administrator member list function must have exactly one signature';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(member_user_id uuid, nickname text, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, gender text, age integer, region text, job text, marriage_history text, stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, total_count bigint)' then
    raise exception 'Administrator member list return contract differs from the approved definition';
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
      and function_info.pronargs = 13
      and function_info.pronargdefaults = 13
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Administrator member list function attributes differ from the approved definition';
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
    raise exception 'Administrator member list function privileges differ from the approved definition';
  end if;
end
$installation_validation$;

commit;

-- Read-only post-install checks:
-- select pg_catalog.pg_get_functiondef(
--   'public.get_admin_members(text,text,text,text,integer,integer,text,text,text,text,text,text,text)'::pg_catalog.regprocedure
-- );
-- select * from public.get_admin_members(null, 'all', 'all', 'all', 20, 0, 'joined_at', 'desc');
