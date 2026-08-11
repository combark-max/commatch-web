-- ComMatch administrator member detail rollback integration tests.
--
-- Apply admin-member-detail.sql first. In a Supabase SQL Editor tab, replace
-- the same eight PASTE_* Auth UUID placeholders used by admin-members-tests.sql.
-- Supply one existing active super administrator and seven user-confirmed
-- disposable, non-production Auth users. The disposable users must have no
-- profile, administrator, restriction, or Premium rows. This script never
-- changes auth.users and always ends with ROLLBACK.

begin;

create temp table _commatch_member_detail_it_config (
  super_admin_id uuid,
  role_test_user_id uuid,
  missing_user_id uuid,
  in_progress_user_id uuid,
  completed_user_id uuid,
  indefinite_user_id uuid,
  future_user_id uuid,
  expired_user_id uuid,
  non_auth_user_id uuid not null,
  fixture_confirmation text
) on commit drop;

insert into _commatch_member_detail_it_config values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_ROLE_TEST_USER_ID', 'PASTE_' || 'ROLE_TEST_USER_ID')::uuid,
  nullif('PASTE_MISSING_USER_ID', 'PASTE_' || 'MISSING_USER_ID')::uuid,
  nullif('PASTE_IN_PROGRESS_USER_ID', 'PASTE_' || 'IN_PROGRESS_USER_ID')::uuid,
  nullif('PASTE_COMPLETED_USER_ID', 'PASTE_' || 'COMPLETED_USER_ID')::uuid,
  nullif('PASTE_INDEFINITE_USER_ID', 'PASTE_' || 'INDEFINITE_USER_ID')::uuid,
  nullif('PASTE_FUTURE_USER_ID', 'PASTE_' || 'FUTURE_USER_ID')::uuid,
  nullif('PASTE_EXPIRED_USER_ID', 'PASTE_' || 'EXPIRED_USER_ID')::uuid,
  pg_catalog.gen_random_uuid(),
  nullif(
    'PASTE_TEST_FIXTURE_CONFIRMATION',
    'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'
  )
);

grant select on _commatch_member_detail_it_config to anon, authenticated;

do $preflight$
declare
  v_config _commatch_member_detail_it_config%rowtype;
  v_ids uuid[];
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_admin_member_detail(uuid)');
begin
  select * into v_config from _commatch_member_detail_it_config;
  v_ids := array[
    v_config.super_admin_id,
    v_config.role_test_user_id,
    v_config.missing_user_id,
    v_config.in_progress_user_id,
    v_config.completed_user_id,
    v_config.indefinite_user_id,
    v_config.future_user_id,
    v_config.expired_user_id
  ];

  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace all eight PASTE_* Auth UUID values in the SQL Editor tab';
  end if;
  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required confirmation token';
  end if;
  if (select pg_catalog.count(distinct fixture.user_id)
      from pg_catalog.unnest(v_ids) as fixture(user_id)) <> 8 then
    raise exception 'Every configured Auth UUID must be distinct';
  end if;
  if (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 8 then
    raise exception 'Every configured UUID must identify an existing Auth user';
  end if;
  if exists (select 1 from auth.users where id = v_config.non_auth_user_id) then
    raise exception 'Generated missing-target UUID unexpectedly identifies an Auth user';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.super_admin_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if exists (
    select 1 from public.admin_accounts where user_id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.profiles where id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.member_restrictions where user_id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.premium_memberships where user_id = any(v_ids[2:8])
  ) then
    raise exception 'Disposable users must start without administrator, profile, restriction, or Premium rows';
  end if;
  if v_function_oid is null then
    raise exception 'Administrator member detail SQL is not installed';
  end if;
  if pg_catalog.to_regprocedure('public.get_visible_member_detail(uuid)') is null then
    raise exception 'General visible member detail function is missing';
  end if;
  if pg_catalog.obj_description(
       'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure,
       'pg_proc'
     ) is distinct from 'commatch_member_profile_visibility_v1' then
    raise exception 'General visible member detail function marker changed';
  end if;
  if pg_catalog.pg_get_function_result(v_function_oid) <>
    'TABLE(member_user_id uuid, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, nickname text, gender text, birth_date date, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, premium_started_at timestamp with time zone, premium_expires_at timestamp with time zone)' then
    raise exception 'Administrator member detail return contract differs';
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
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'Administrator member detail function attributes differ';
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
    raise exception 'Administrator member detail function ACL differs';
  end if;

  raise notice 'PASS fixture, function attributes, return contract, and ACL preflight';
end
$preflight$;

create function pg_temp._commatch_member_detail_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text
    end,
    true
  );
  if auth.uid() is distinct from p_user_id then
    raise exception 'auth.uid() setup failed';
  end if;
end
$function$;

create function pg_temp._commatch_member_detail_it_assert(
  p_label text,
  p_condition boolean
)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FAIL %', p_label;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

create function pg_temp._commatch_member_detail_it_expect_sqlstate(
  p_label text,
  p_expected_state text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate is distinct from p_expected_state then
        raise exception 'FAIL %: expected SQLSTATE %, received % (%)',
          p_label, p_expected_state, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS % (SQLSTATE %)', p_label, p_expected_state;
  end;
end
$function$;

grant execute on function pg_temp._commatch_member_detail_it_set_user(uuid)
  to anon, authenticated;
grant execute on function pg_temp._commatch_member_detail_it_assert(text, boolean)
  to anon, authenticated;
grant execute on function pg_temp._commatch_member_detail_it_expect_sqlstate(text, text, text)
  to anon, authenticated;

insert into public.admin_accounts (user_id, role, status)
select role_test_user_id, 'admin', 'active'
from _commatch_member_detail_it_config;

insert into public.profiles (
  id, nickname, introduction, marriage_values, profile_image, profile_images
)
select
  in_progress_user_id,
  '__commatch_detail_partial__',
  '123456789',
  'abcdefghij',
  null::text,
  array['', '  ']::text[]
from _commatch_member_detail_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, height, region, job, education,
  hobby, drinking, smoking, marriage_history, introduction, marriage_values,
  profile_image, profile_images
)
select
  completed_user_id,
  '__commatch_detail_hidden__',
  '여성',
  date '1990-01-01',
  165,
  '서울',
  '개발자',
  '대졸',
  '독서',
  '가끔 함',
  '비흡연',
  'first_marriage',
  '1234567890',
  'abcdefghij',
  '',
  array['', '  ', 'profiles/hidden/photo.jpg']::text[]
from _commatch_member_detail_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, height, region, job, education,
  hobby, drinking, smoking, marriage_history, introduction, marriage_values,
  profile_image, profile_images
)
select
  indefinite_user_id,
  '__commatch_detail_visible__',
  '남성',
  date '1991-02-03',
  175,
  '부산',
  '기획자',
  '대졸',
  '운동',
  '가끔 함',
  '비흡연',
  'first_marriage',
  'ABCDEFGHIJ',
  '0123456789',
  'profiles/visible/main.jpg',
  array[]::text[]
from _commatch_member_detail_it_config;

-- Separate INSERT statements avoid UNION type inference for nullable timestamp
-- columns and keep every fixture's state explicit.
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select completed_user_id, 'active', 'hidden', null::timestamptz, null::timestamptz
from _commatch_member_detail_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select indefinite_user_id, 'suspended', 'visible', pg_catalog.now() - interval '2 days', null::timestamptz
from _commatch_member_detail_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select future_user_id, 'suspended', 'visible', pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '1 day'
from _commatch_member_detail_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select expired_user_id, 'suspended', 'visible', pg_catalog.now() - interval '2 days', pg_catalog.transaction_timestamp()
from _commatch_member_detail_it_config;

-- Permission and target validation.
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'active super_admin can query hidden member detail',
  (select pg_catalog.count(*) = 1
   from public.get_admin_member_detail(
     (select completed_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'null target rejected', '22023',
  'select * from public.get_admin_member_detail(null)'
);
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'missing Auth target rejected', 'P0002',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select non_auth_user_id from _commatch_member_detail_it_config)
  )
);
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'administrator target rejected', '22023',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select role_test_user_id from _commatch_member_detail_it_config)
  )
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(role_test_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'active admin can query',
  (select pg_catalog.count(*) = 1
   from public.get_admin_member_detail(
     (select completed_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.admin_accounts set role = 'moderator'
where user_id = (select role_test_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(role_test_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'active moderator can query',
  (select pg_catalog.count(*) = 1
   from public.get_admin_member_detail(
     (select completed_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.admin_accounts
set status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
where user_id = (select role_test_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(role_test_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'suspended administrator denied', '42501',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select completed_user_id from _commatch_member_detail_it_config)
  )
);
reset role;

update public.admin_accounts
set status = 'revoked', suspended_at = null, revoked_at = pg_catalog.now()
where user_id = (select role_test_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(role_test_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'revoked administrator denied', '42501',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select completed_user_id from _commatch_member_detail_it_config)
  )
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(missing_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'ordinary authenticated member denied', '42501',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select completed_user_id from _commatch_member_detail_it_config)
  )
);
reset role;

set local role anon;
select pg_temp._commatch_member_detail_it_set_user(null);
select pg_temp._commatch_member_detail_it_expect_sqlstate(
  'anon denied by function ACL', '42501',
  pg_catalog.format(
    'select * from public.get_admin_member_detail(%L::uuid)',
    (select completed_user_id from _commatch_member_detail_it_config)
  )
);
reset role;

-- Hidden-profile regression: administrators can read the approved detail fields,
-- while the existing general RPC and profiles RLS continue to hide the target.
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'administrator receives complete hidden profile and raw image array',
  (select
     profile_exists
     and profile_status = 'completed'
     and profile_visibility = 'hidden'
     and nickname = '__commatch_detail_hidden__'
     and gender = '여성'
     and birth_date = date '1990-01-01'
     and height = 165
     and region = '서울'
     and job = '개발자'
     and education = '대졸'
     and hobby = '독서'
     and drinking = '가끔 함'
     and smoking = '비흡연'
     and marriage_history = 'first_marriage'
     and introduction = '1234567890'
     and marriage_values = 'abcdefghij'
     and profile_image = ''
     and profile_images = array['', '  ', 'profiles/hidden/photo.jpg']::text[]
   from public.get_admin_member_detail(
     (select completed_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(missing_user_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'general visible detail still hides hidden profile',
  (select pg_catalog.count(*) = 0
   from public.get_visible_member_detail(
     (select completed_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_assert(
  'profiles RLS still blocks direct hidden profile read',
  (select pg_catalog.count(*) = 0
   from public.profiles
   where id = (select completed_user_id from _commatch_member_detail_it_config))
);
select pg_temp._commatch_member_detail_it_assert(
  'general visible detail still returns public profile',
  (select pg_catalog.count(*) = 1
   from public.get_visible_member_detail(
     (select indefinite_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

-- Profile absence, nullable values, photo forms, and completion boundaries.
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'profile-missing Auth member returns singleton with null profile fields',
  (select
     pg_catalog.count(*) = 1
     and pg_catalog.bool_and(
       not profile_exists
       and profile_status = 'missing'
       and profile_visibility is null
       and nickname is null
       and gender is null
       and birth_date is null
       and height is null
       and profile_image is null
       and profile_images is null
     )
   from public.get_admin_member_detail(
     (select missing_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_assert(
  'nine-character introduction and blank image elements remain in progress',
  (select
     profile_exists
     and profile_status = 'in_progress'
     and introduction = '123456789'
     and marriage_values = 'abcdefghij'
     and profile_image is null
     and profile_images = array['', '  ']::text[]
   from public.get_admin_member_detail(
     (select in_progress_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_assert(
  'representative image and empty image array are returned',
  (select
     profile_status = 'completed'
     and profile_visibility = 'visible'
     and profile_image = 'profiles/visible/main.jpg'
     and profile_images = array[]::text[]
   from public.get_admin_member_detail(
     (select indefinite_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.profiles
set introduction = '1234567890', marriage_values = 'abcdefghi'
where id = (select in_progress_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'nine-character marriage values remain in progress',
  (select profile_status = 'in_progress'
   from public.get_admin_member_detail(
     (select in_progress_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

-- The parity query uses a typed target table to avoid an untyped UNION. It is
-- populated separately so every UUID retains its native type.
create temp table _commatch_member_detail_it_targets (target_id uuid primary key) on commit drop;
insert into _commatch_member_detail_it_targets
select missing_user_id from _commatch_member_detail_it_config;
insert into _commatch_member_detail_it_targets
select in_progress_user_id from _commatch_member_detail_it_config;
insert into _commatch_member_detail_it_targets
select completed_user_id from _commatch_member_detail_it_config;
insert into _commatch_member_detail_it_targets
select indefinite_user_id from _commatch_member_detail_it_config;
insert into _commatch_member_detail_it_targets
select future_user_id from _commatch_member_detail_it_config;
insert into _commatch_member_detail_it_targets
select expired_user_id from _commatch_member_detail_it_config;
grant select on _commatch_member_detail_it_targets to authenticated;

set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'all fixture detail status values match list RPC',
  (select pg_catalog.count(*) = 6 and pg_catalog.bool_and(
     detail.profile_status = member.profile_status
     and detail.profile_visibility is not distinct from member.profile_visibility
     and detail.stored_account_status = member.stored_account_status
     and detail.current_account_status = member.current_account_status
     and detail.suspended_at is not distinct from member.suspended_at
     and detail.suspended_until is not distinct from member.suspended_until
     and detail.premium_membership_exists = member.premium_membership_exists
     and detail.premium_stored_status is not distinct from member.premium_stored_status
     and detail.premium_is_available = member.premium_is_available
     and detail.premium_period_state = member.premium_period_state
   )
   from _commatch_member_detail_it_targets as target
   cross join lateral public.get_admin_member_detail(target.target_id) as detail
   cross join lateral public.get_admin_members(
     target.target_id::text, 'all', 'all', 'all', 1, 0, 'joined_at', 'desc'
   ) as member)
);

select pg_temp._commatch_member_detail_it_assert(
  'indefinite suspension remains currently suspended',
  (select current_account_status = 'suspended' and suspended_until is null
   from public.get_admin_member_detail(
     (select indefinite_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_assert(
  'future suspension remains currently suspended',
  (select current_account_status = 'suspended' and suspended_until > pg_catalog.now()
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
select pg_temp._commatch_member_detail_it_assert(
  'expired stored suspension is currently active',
  (select stored_account_status = 'suspended' and current_account_status = 'active'
   from public.get_admin_member_detail(
     (select expired_user_id from _commatch_member_detail_it_config)
   ))
);

-- Premium state matrix on one disposable target.
select pg_temp._commatch_member_detail_it_assert(
  'Premium none',
  (select
     not premium_membership_exists
     and premium_stored_status is null
     and not premium_is_available
     and premium_period_state = 'none'
     and premium_started_at is null
     and premium_expires_at is null
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys
)
select
  future_user_id,
  'active',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  array['likes_received']::text[]
from _commatch_member_detail_it_config;
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'Premium available with period fields',
  (select
     premium_membership_exists
     and premium_stored_status = 'active'
     and premium_is_available
     and premium_period_state = 'available'
     and premium_started_at is not null
     and premium_expires_at is not null
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() + interval '1 day',
    expires_at = pg_catalog.now() + interval '2 days'
where user_id = (select future_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'Premium not started',
  (select not premium_is_available and premium_period_state = 'not_started'
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() - interval '2 days',
    expires_at = pg_catalog.now() - interval '1 day'
where user_id = (select future_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'Premium expired',
  (select not premium_is_available and premium_period_state = 'expired'
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.premium_memberships
set status = 'suspended', expires_at = null
where user_id = (select future_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'Premium suspended',
  (select
     premium_stored_status = 'suspended'
     and not premium_is_available
     and premium_period_state = 'suspended'
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

update public.premium_memberships set status = 'revoked'
where user_id = (select future_user_id from _commatch_member_detail_it_config);
set local role authenticated;
select pg_temp._commatch_member_detail_it_set_user(super_admin_id)
from _commatch_member_detail_it_config;
select pg_temp._commatch_member_detail_it_assert(
  'Premium revoked',
  (select
     premium_stored_status = 'revoked'
     and not premium_is_available
     and premium_period_state = 'revoked'
   from public.get_admin_member_detail(
     (select future_user_id from _commatch_member_detail_it_config)
   ))
);
reset role;

rollback;
