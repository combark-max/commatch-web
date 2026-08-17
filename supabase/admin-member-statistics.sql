begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_member_statistics_v1';
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null then
    raise exception 'Required member statistics tables must exist before installation';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) must exist before installing member statistics';
  end if;

  if exists (
    select required.column_name
    from (values
      ('auth', 'users', 'id', 'uuid', true),
      ('public', 'profiles', 'id', 'uuid', true),
      ('public', 'profiles', 'gender', 'text', false),
      ('public', 'profiles', 'birth_date', 'date', false),
      ('public', 'profiles', 'region', 'text', false),
      ('public', 'profiles', 'marriage_history', 'text', false),
      ('public', 'admin_accounts', 'user_id', 'uuid', true)
    ) as required(table_schema, table_name, column_name, data_type, is_not_null)
    where not exists (
      select 1
      from information_schema.columns as column_info
      where column_info.table_schema = required.table_schema
        and column_info.table_name = required.table_name
        and column_info.column_name = required.column_name
        and column_info.data_type = required.data_type
        and (column_info.is_nullable = 'NO') = required.is_not_null
    )
  ) then
    raise exception 'Required member statistics columns differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.profiles'::pg_catalog.regclass
      and constraint_info.conname = 'profiles_marriage_history_check'
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
  ) then
    raise exception 'public.profiles must retain the approved marriage history CHECK constraint';
  end if;

  for v_function in
    select function_info.oid,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_member_statistics'
  loop
    if v_function.identity_arguments <> ''
       or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.get_admin_member_statistics(%) already exists with an incompatible definition',
        v_function.identity_arguments;
    end if;
  end loop;
end;
$preflight$;

create or replace function public.get_admin_member_statistics()
returns table (
  total_members bigint,
  gender jsonb,
  age_groups jsonb,
  regions jsonb,
  marriage_history jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not coalesce(public.has_admin_permission('admin_dashboard_view'), false) then
    raise exception using
      errcode = '42501',
      message = 'Insufficient admin permission';
  end if;

  return query
  with member_population as materialized (
    select
      case
        when profile.gender = '남성' then 'male'
        when profile.gender = '여성' then 'female'
        else 'other_or_unspecified'
      end as gender_category,
      case
        when profile.birth_date is null then 'unspecified'
        when pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date)) < 20 then 'under_20'
        when pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date)) < 30 then '20s'
        when pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date)) < 40 then '30s'
        when pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date)) < 50 then '40s'
        when pg_catalog.date_part('year', pg_catalog.age(current_date, profile.birth_date)) < 60 then '50s'
        else '60_plus'
      end as age_category,
      coalesce(nullif(pg_catalog.btrim(profile.region), ''), '미입력') as region_category,
      case
        when profile.marriage_history = 'first_marriage' then 'first_marriage'
        when profile.marriage_history = 'remarriage' then 'remarriage'
        else 'unspecified'
      end as marriage_category
    from auth.users as auth_user
    left join public.profiles as profile on profile.id = auth_user.id
    where not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = auth_user.id
    )
  ),
  total_summary as (
    select pg_catalog.count(*) as total_members from member_population
  ),
  gender_categories(category, sort_order) as (
    values ('male', 1), ('female', 2), ('other_or_unspecified', 3)
  ),
  gender_counts as (
    select member.gender_category as category, pg_catalog.count(*) as count
    from member_population as member group by member.gender_category
  ),
  gender_summary as (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('category', category.category, 'count', coalesce(counts.count, 0))
      order by category.sort_order
    ) as gender
    from gender_categories as category
    left join gender_counts as counts on counts.category = category.category
  ),
  age_categories(category, sort_order) as (
    values ('under_20', 1), ('20s', 2), ('30s', 3), ('40s', 4),
      ('50s', 5), ('60_plus', 6), ('unspecified', 7)
  ),
  age_counts as (
    select member.age_category as category, pg_catalog.count(*) as count
    from member_population as member group by member.age_category
  ),
  age_summary as (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('category', category.category, 'count', coalesce(counts.count, 0))
      order by category.sort_order
    ) as age_groups
    from age_categories as category
    left join age_counts as counts on counts.category = category.category
  ),
  region_counts as (
    select member.region_category as category, pg_catalog.count(*) as count
    from member_population as member group by member.region_category
  ),
  region_summary as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('category', region.category, 'count', region.count)
        order by region.count desc, region.category asc
      ),
      '[]'::jsonb
    ) as regions
    from region_counts as region
  ),
  marriage_categories(category, sort_order) as (
    values ('first_marriage', 1), ('remarriage', 2), ('unspecified', 3)
  ),
  marriage_counts as (
    select member.marriage_category as category, pg_catalog.count(*) as count
    from member_population as member group by member.marriage_category
  ),
  marriage_summary as (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('category', category.category, 'count', coalesce(counts.count, 0))
      order by category.sort_order
    ) as marriage_history
    from marriage_categories as category
    left join marriage_counts as counts on counts.category = category.category
  )
  select total_summary.total_members, gender_summary.gender, age_summary.age_groups,
    region_summary.regions, marriage_summary.marriage_history
  from total_summary
  cross join gender_summary
  cross join age_summary
  cross join region_summary
  cross join marriage_summary;
end;
$function$;

alter function public.get_admin_member_statistics() owner to postgres;

comment on function public.get_admin_member_statistics()
  is 'commatch_admin_member_statistics_v1';

revoke all on function public.get_admin_member_statistics()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_member_statistics()
  to authenticated;

do $validation$
declare
  v_marker constant text := 'commatch_admin_member_statistics_v1';
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_admin_member_statistics()');
begin
  if v_function_oid is null then
    raise exception 'Administrator member statistics function was not created';
  end if;
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_admin_member_statistics'
  ) <> 1 then
    raise exception 'Administrator member statistics function must have exactly one signature';
  end if;
  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(total_members bigint, gender jsonb, age_groups jsonb, regions jsonb, marriage_history jsonb)' then
    raise exception 'Administrator member statistics return type differs from the approved definition';
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
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'Administrator member statistics function attributes differ from the approved definition';
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
    raise exception 'Administrator member statistics function privileges differ from the approved definition';
  end if;
end;
$validation$;

commit;

-- Read-only post-install verification for an authenticated active administrator:
-- select * from public.get_admin_member_statistics();
