-- ComMatch administrator member statistics rollback integration tests.
--
-- Apply admin-member-statistics.sql first. Replace PASTE_SUPER_ADMIN_USER_ID
-- with an existing active super administrator and the confirmation placeholder
-- with CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS. Every fixture is rolled back.

begin isolation level repeatable read;

create temp table _commatch_member_stats_it_config (
  super_admin_id uuid,
  fixture_confirmation text,
  role_test_user_id uuid not null default pg_catalog.gen_random_uuid(),
  age_29_id uuid not null default pg_catalog.gen_random_uuid(),
  age_30_id uuid not null default pg_catalog.gen_random_uuid(),
  age_39_id uuid not null default pg_catalog.gen_random_uuid(),
  age_40_id uuid not null default pg_catalog.gen_random_uuid(),
  age_49_id uuid not null default pg_catalog.gen_random_uuid(),
  age_50_id uuid not null default pg_catalog.gen_random_uuid(),
  age_19_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_member_stats_it_config (super_admin_id, fixture_confirmation)
values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on pg_temp._commatch_member_stats_it_config to anon, authenticated, service_role;

create temp table _commatch_member_stats_it_baseline (
  total_members bigint not null,
  gender jsonb not null,
  age_groups jsonb not null,
  regions jsonb not null,
  marriage_history jsonb not null
) on commit drop;
grant select, insert on pg_temp._commatch_member_stats_it_baseline to authenticated;

create function pg_temp._commatch_member_stats_it_set_user(p_user_id uuid)
returns void language plpgsql as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text end,
    true
  );
end;
$function$;

create function pg_temp._commatch_member_stats_it_count(p_entries jsonb, p_category text)
returns bigint language sql immutable set search_path = '' as $function$
  select (entry.value ->> 'count')::bigint
  from pg_catalog.jsonb_array_elements(p_entries) as entry(value)
  where entry.value ->> 'category' = p_category
$function$;

create function pg_temp._commatch_member_stats_it_expect_error(
  p_label text, p_expected_state text, p_sql text
) returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception when others then
    if sqlstate is distinct from p_expected_state then
      raise exception 'FAIL %: expected SQLSTATE %, received % (%)',
        p_label, p_expected_state, sqlstate, sqlerrm;
    end if;
    raise notice 'PASS %', p_label;
  end;
end;
$function$;

grant execute on function pg_temp._commatch_member_stats_it_set_user(uuid)
  to anon, authenticated, service_role;
grant execute on function pg_temp._commatch_member_stats_it_expect_error(text, text, text)
  to anon, authenticated, service_role;

do $preflight$
declare
  v_config _commatch_member_stats_it_config%rowtype;
  v_ids uuid[];
begin
  select * into strict v_config from pg_temp._commatch_member_stats_it_config;
  v_ids := array[v_config.role_test_user_id, v_config.age_29_id, v_config.age_30_id,
    v_config.age_39_id, v_config.age_40_id, v_config.age_49_id, v_config.age_50_id,
    v_config.age_19_id];
  if v_config.super_admin_id is null then
    raise exception 'Replace PASTE_SUPER_ADMIN_USER_ID in the SQL Editor tab';
  end if;
  if v_config.fixture_confirmation is distinct from 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if not exists (
    select 1 from auth.users as auth_user
    join public.admin_accounts as admin_account on admin_account.user_id = auth_user.id
    where auth_user.id = v_config.super_admin_id
      and admin_account.role = 'super_admin' and admin_account.status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if (select pg_catalog.count(distinct id) from pg_catalog.unnest(v_ids) as fixture(id)) <> 8
     or v_config.super_admin_id = any(v_ids)
     or exists (select 1 from auth.users where id = any(v_ids)) then
    raise exception 'Generated fixture UUIDs must be new and distinct';
  end if;
  if pg_catalog.to_regprocedure('public.get_admin_member_statistics()') is null then
    raise exception 'Apply admin-member-statistics.sql before this test';
  end if;
  raise notice 'PASS fixture and object preflight';
end;
$preflight$;

do $contract$
declare
  v_oid oid := pg_catalog.to_regprocedure('public.get_admin_member_statistics()');
begin
  if pg_catalog.pg_get_function_result(v_oid) <>
    'TABLE(total_members bigint, gender jsonb, age_groups jsonb, regions jsonb, marriage_history jsonb)' then
    raise exception 'FAIL return contract';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc as function_info
    where function_info.oid = v_oid
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and function_info.prosecdef and function_info.provolatile = 's'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = 'commatch_admin_member_statistics_v1'
  ) then
    raise exception 'FAIL owner/STABLE/SECURITY DEFINER/search_path contract';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid = v_oid and acl_info.privilege_type = 'EXECUTE'
      and acl_info.grantee = 0::oid
  ) or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'FAIL ACL contract';
  end if;
  raise notice 'PASS owner, attributes, marker, return contract, and ACL';
end;
$contract$;

set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(super_admin_id)
from pg_temp._commatch_member_stats_it_config;
insert into pg_temp._commatch_member_stats_it_baseline
select * from public.get_admin_member_statistics();
reset role;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now() - interval '90 days', pg_catalog.now()
from (
  select role_test_user_id as user_id from pg_temp._commatch_member_stats_it_config union all
  select age_29_id from pg_temp._commatch_member_stats_it_config union all
  select age_30_id from pg_temp._commatch_member_stats_it_config union all
  select age_39_id from pg_temp._commatch_member_stats_it_config union all
  select age_40_id from pg_temp._commatch_member_stats_it_config union all
  select age_49_id from pg_temp._commatch_member_stats_it_config union all
  select age_50_id from pg_temp._commatch_member_stats_it_config union all
  select age_19_id from pg_temp._commatch_member_stats_it_config
) as fixture
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user
  where auth_user.id = (select super_admin_id from pg_temp._commatch_member_stats_it_config)
) as source;

insert into public.profiles (
  id, nickname, gender, birth_date, region, marriage_history, profile_images
)
select fixture.user_id,
  fixture.nickname || '_' || pg_catalog.left(fixture.user_id::text, 8),
  fixture.gender, fixture.birth_date,
  fixture.region, fixture.marriage_history, array[]::text[]
from (
  select age_29_id, '__stats_29__', '남성', (current_date - interval '29 years')::date, '서울특별시', 'first_marriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_30_id, '__stats_30__', '여성', (current_date - interval '30 years')::date, '경기도', 'remarriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_39_id, '__stats_39__', '남성', (current_date - interval '39 years')::date, '서울특별시', 'first_marriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_40_id, '__stats_40__', '여성', (current_date - interval '40 years')::date, '부산광역시', 'remarriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_49_id, '__stats_49__', '남성', (current_date - interval '49 years')::date, null::text, 'first_marriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_50_id, '__stats_50__', '여성', (current_date - interval '50 years')::date, '  ', 'remarriage'
    from pg_temp._commatch_member_stats_it_config union all
  select age_19_id, '__stats_19__', null::text, (current_date - interval '19 years')::date, '제주특별자치도', null::text
    from pg_temp._commatch_member_stats_it_config
) as fixture(user_id, nickname, gender, birth_date, region, marriage_history);

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select age_49_id, 'active', 'hidden', null::timestamptz, null::timestamptz
from pg_temp._commatch_member_stats_it_config;
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select age_50_id, 'suspended', 'visible', pg_catalog.now() - interval '1 day', null::timestamptz
from pg_temp._commatch_member_stats_it_config;

set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(super_admin_id)
from pg_temp._commatch_member_stats_it_config;

do $fixture_deltas$
declare
  b _commatch_member_stats_it_baseline%rowtype;
  c record;
begin
  select * into strict b from pg_temp._commatch_member_stats_it_baseline;
  select * into strict c from public.get_admin_member_statistics();
  if c.total_members <> b.total_members + 8
    or pg_temp._commatch_member_stats_it_count(c.gender, 'male') <> pg_temp._commatch_member_stats_it_count(b.gender, 'male') + 3
    or pg_temp._commatch_member_stats_it_count(c.gender, 'female') <> pg_temp._commatch_member_stats_it_count(b.gender, 'female') + 3
    or pg_temp._commatch_member_stats_it_count(c.gender, 'other_or_unspecified') <> pg_temp._commatch_member_stats_it_count(b.gender, 'other_or_unspecified') + 2
    or pg_temp._commatch_member_stats_it_count(c.age_groups, 'under_20') <> pg_temp._commatch_member_stats_it_count(b.age_groups, 'under_20') + 1
    or pg_temp._commatch_member_stats_it_count(c.age_groups, '20s') <> pg_temp._commatch_member_stats_it_count(b.age_groups, '20s') + 1
    or pg_temp._commatch_member_stats_it_count(c.age_groups, '30s') <> pg_temp._commatch_member_stats_it_count(b.age_groups, '30s') + 2
    or pg_temp._commatch_member_stats_it_count(c.age_groups, '40s') <> pg_temp._commatch_member_stats_it_count(b.age_groups, '40s') + 2
    or pg_temp._commatch_member_stats_it_count(c.age_groups, '50s') <> pg_temp._commatch_member_stats_it_count(b.age_groups, '50s') + 1
    or pg_temp._commatch_member_stats_it_count(c.age_groups, '60_plus') <> pg_temp._commatch_member_stats_it_count(b.age_groups, '60_plus')
    or pg_temp._commatch_member_stats_it_count(c.age_groups, 'unspecified') <> pg_temp._commatch_member_stats_it_count(b.age_groups, 'unspecified') + 1
    or pg_temp._commatch_member_stats_it_count(c.regions, '서울특별시') <> coalesce(pg_temp._commatch_member_stats_it_count(b.regions, '서울특별시'), 0) + 2
    or pg_temp._commatch_member_stats_it_count(c.regions, '미입력') <> coalesce(pg_temp._commatch_member_stats_it_count(b.regions, '미입력'), 0) + 3
    or pg_temp._commatch_member_stats_it_count(c.marriage_history, 'first_marriage') <> pg_temp._commatch_member_stats_it_count(b.marriage_history, 'first_marriage') + 3
    or pg_temp._commatch_member_stats_it_count(c.marriage_history, 'remarriage') <> pg_temp._commatch_member_stats_it_count(b.marriage_history, 'remarriage') + 3
    or pg_temp._commatch_member_stats_it_count(c.marriage_history, 'unspecified') <> pg_temp._commatch_member_stats_it_count(b.marriage_history, 'unspecified') + 2 then
    raise exception 'FAIL member fixture deltas: baseline %, current %', pg_catalog.row_to_json(b), pg_catalog.row_to_json(c);
  end if;
  raise notice 'PASS total, gender, age boundaries, region/null, marriage/null, hidden and suspended inclusion';
end;
$fixture_deltas$;

select pg_temp._commatch_member_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_member_stats_it_config;
select pg_temp._commatch_member_stats_it_expect_error(
  'ordinary authenticated member', '42501', 'select * from public.get_admin_member_statistics()'
);
reset role;

set local role anon;
select pg_temp._commatch_member_stats_it_set_user(null);
select pg_temp._commatch_member_stats_it_expect_error(
  'anon ACL', '42501', 'select * from public.get_admin_member_statistics()'
);
reset role;

insert into public.admin_accounts (user_id, role, status, created_by)
select role_test_user_id, 'admin', 'active', super_admin_id
from pg_temp._commatch_member_stats_it_config;

set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_member_stats_it_config;
do $all_active_roles$
begin
  if (select pg_catalog.count(*) from public.get_admin_member_statistics()) <> 1 then
    raise exception 'FAIL active admin access';
  end if;
  raise notice 'PASS active admin access';
end;
$all_active_roles$;
reset role;

update public.admin_accounts set role = 'moderator'
where user_id = (select role_test_user_id from pg_temp._commatch_member_stats_it_config);
set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_member_stats_it_config;
do $moderator_access$ begin
  perform public.get_admin_member_statistics();
  raise notice 'PASS active moderator access';
end $moderator_access$;
reset role;

update public.admin_accounts set status = 'suspended', suspended_at = pg_catalog.now()
where user_id = (select role_test_user_id from pg_temp._commatch_member_stats_it_config);
set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(role_test_user_id)
from pg_temp._commatch_member_stats_it_config;
select pg_temp._commatch_member_stats_it_expect_error(
  'suspended administrator', '42501', 'select * from public.get_admin_member_statistics()'
);
reset role;

-- Classifying every remaining Auth account as an administrator creates an
-- empty member population without deleting or rewriting any account/profile.
-- The surrounding transaction rolls all temporary classifications back.
insert into public.admin_accounts (user_id, role, status, created_by)
select auth_user.id, 'moderator', 'active', config.super_admin_id
from auth.users as auth_user
cross join pg_temp._commatch_member_stats_it_config as config
where not exists (
  select 1 from public.admin_accounts as admin_account
  where admin_account.user_id = auth_user.id
);

set local role authenticated;
select pg_temp._commatch_member_stats_it_set_user(super_admin_id)
from pg_temp._commatch_member_stats_it_config;
do $empty_population$
declare
  v_result record;
begin
  select * into strict v_result from public.get_admin_member_statistics();
  if v_result.total_members <> 0
    or v_result.regions <> '[]'::jsonb
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_result.gender || v_result.age_groups || v_result.marriage_history
      ) as entry(value)
      where (entry.value ->> 'count')::bigint <> 0
    ) then
    raise exception 'FAIL empty member population contract: %', pg_catalog.row_to_json(v_result);
  end if;
  raise notice 'PASS empty member population returns fixed zero categories and no regions';
end;
$empty_population$;
reset role;

select 'PASS all administrator member statistics rollback integration tests; rolling back fixtures' as test_result;
rollback;
