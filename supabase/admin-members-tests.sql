-- ComMatch administrator member list rollback integration tests.
--
-- Apply admin-members.sql first. In a Supabase SQL Editor tab, replace the
-- eight PASTE_* UUID placeholders with one existing active super administrator
-- and seven user-confirmed disposable, non-production Auth users. The seven
-- disposable users must have no profile, administrator, restriction, or Premium
-- rows. This script never changes auth.users and always ends with ROLLBACK.

begin;

create temp table _commatch_members_it_config (
  super_admin_id uuid,
  role_test_user_id uuid,
  missing_user_id uuid,
  in_progress_user_id uuid,
  completed_user_id uuid,
  indefinite_user_id uuid,
  future_user_id uuid,
  expired_user_id uuid,
  fixture_confirmation text
) on commit drop;

insert into _commatch_members_it_config values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_ROLE_TEST_USER_ID', 'PASTE_' || 'ROLE_TEST_USER_ID')::uuid,
  nullif('PASTE_MISSING_USER_ID', 'PASTE_' || 'MISSING_USER_ID')::uuid,
  nullif('PASTE_IN_PROGRESS_USER_ID', 'PASTE_' || 'IN_PROGRESS_USER_ID')::uuid,
  nullif('PASTE_COMPLETED_USER_ID', 'PASTE_' || 'COMPLETED_USER_ID')::uuid,
  nullif('PASTE_INDEFINITE_USER_ID', 'PASTE_' || 'INDEFINITE_USER_ID')::uuid,
  nullif('PASTE_FUTURE_USER_ID', 'PASTE_' || 'FUTURE_USER_ID')::uuid,
  nullif('PASTE_EXPIRED_USER_ID', 'PASTE_' || 'EXPIRED_USER_ID')::uuid,
  nullif(
    'PASTE_TEST_FIXTURE_CONFIRMATION',
    'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'
  )
);

grant select on _commatch_members_it_config to anon, authenticated;

do $preflight$
declare
  v_config _commatch_members_it_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_members_it_config;
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
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.super_admin_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'The supplied super administrator must already be active';
  end if;
  if exists (
    select 1 from public.admin_accounts
    where user_id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.profiles where id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.member_restrictions where user_id = any(v_ids[2:8])
  ) or exists (
    select 1 from public.premium_memberships where user_id = any(v_ids[2:8])
  ) then
    raise exception 'Disposable users must start without administrator, profile, restriction, or Premium rows';
  end if;
  if pg_catalog.to_regprocedure(
       'public.get_admin_members(text,text,text,text,integer,integer,text,text)'
     ) is null then
    raise exception 'Administrator member list SQL is not installed';
  end if;
  if pg_catalog.to_regprocedure(
       'public.get_admin_dashboard_operational_summary(integer)'
     ) is null then
    raise exception 'Dashboard operational summary SQL is not installed';
  end if;

  raise notice 'PASS fixture and object preflight';
end
$preflight$;

create function pg_temp._commatch_members_it_set_user(p_user_id uuid)
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

create function pg_temp._commatch_members_it_assert(p_label text, p_condition boolean)
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

create function pg_temp._commatch_members_it_expect_sqlstate(
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

grant execute on function pg_temp._commatch_members_it_set_user(uuid)
  to anon, authenticated;
grant execute on function pg_temp._commatch_members_it_assert(text, boolean)
  to anon, authenticated;
grant execute on function pg_temp._commatch_members_it_expect_sqlstate(text, text, text)
  to anon, authenticated;

insert into public.admin_accounts (user_id, role, status)
select role_test_user_id, 'admin', 'active'
from _commatch_members_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, height, region, job, education,
  hobby, drinking, smoking, marriage_history, introduction, marriage_values,
  profile_image, profile_images
)
select
  in_progress_user_id,
  '__commatch_members_partial__',
  '남성',
  date '1991-01-01',
  175,
  '부산',
  '기획자',
  '대졸',
  '운동',
  '가끔 함',
  '비흡연',
  'first_marriage',
  '123456789',
  'abcdefghij',
  'profiles/partial/photo.jpg',
  array[]::text[]
from _commatch_members_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, height, region, job, education,
  hobby, drinking, smoking, marriage_history, introduction, marriage_values,
  profile_image, profile_images
)
select
  completed_user_id,
  '__commatch_members_completed__',
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
  array['', '  ', 'profiles/completed/photo.jpg']::text[]
from _commatch_members_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until
)
select completed_user_id, 'active', 'hidden', null::timestamptz, null::timestamptz
from _commatch_members_it_config
union all
select indefinite_user_id, 'suspended', 'visible', pg_catalog.now() - interval '2 days', null::timestamptz
from _commatch_members_it_config
union all
select future_user_id, 'suspended', 'visible', pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '1 day'
from _commatch_members_it_config
union all
select expired_user_id, 'suspended', 'visible', pg_catalog.now() - interval '2 days', pg_catalog.transaction_timestamp()
from _commatch_members_it_config;

-- Permission matrix. The disposable administrator is excluded from list rows in
-- every role and status because exclusion is based on row existence.
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'super_admin can query',
  (select pg_catalog.count(*) >= 0 from public.get_admin_members())
);
reset role;

set local role authenticated;
select pg_temp._commatch_members_it_set_user(role_test_user_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'admin can query',
  (select pg_catalog.count(*) >= 0 from public.get_admin_members())
);
reset role;

update public.admin_accounts set role = 'moderator'
where user_id = (select role_test_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(role_test_user_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'moderator can query',
  (select pg_catalog.count(*) >= 0 from public.get_admin_members())
);
reset role;

update public.admin_accounts
set status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
where user_id = (select role_test_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(role_test_user_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_expect_sqlstate(
  'suspended administrator denied', '42501',
  'select * from public.get_admin_members()'
);
reset role;

update public.admin_accounts
set status = 'revoked', suspended_at = null, revoked_at = pg_catalog.now()
where user_id = (select role_test_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(role_test_user_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_expect_sqlstate(
  'revoked administrator denied', '42501',
  'select * from public.get_admin_members()'
);
reset role;

set local role authenticated;
select pg_temp._commatch_members_it_set_user(missing_user_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_expect_sqlstate(
  'ordinary authenticated member denied', '42501',
  'select * from public.get_admin_members()'
);
reset role;

set local role anon;
select pg_temp._commatch_members_it_set_user(null);
select pg_temp._commatch_members_it_expect_sqlstate(
  'anon denied by function ACL', '42501',
  'select * from public.get_admin_members()'
);
reset role;

-- Continue data-contract tests as the active super administrator.
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id)
from _commatch_members_it_config;

select pg_temp._commatch_members_it_assert(
  'administrator accounts excluded',
  not exists (
    select 1
    from public.get_admin_members(
      (select role_test_user_id::text from _commatch_members_it_config),
      'all', 'all', 'all', 100, 0, 'joined_at', 'desc'
    )
  )
);
select pg_temp._commatch_members_it_assert(
  'non-Auth UUID excluded',
  not exists (
    select 1 from public.get_admin_members(null, 'all', 'all', 'all', 100, 0, 'joined_at', 'desc')
    where member_user_id = '00000000-0000-4000-8000-000000000001'::uuid
  )
);
select pg_temp._commatch_members_it_assert(
  'missing profile is distinct',
  (select profile_status = 'missing' and not profile_exists
   from public.get_admin_members(null, 'all', 'missing', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select missing_user_id from _commatch_members_it_config))
);
select pg_temp._commatch_members_it_assert(
  'nine-character introduction remains in progress',
  (select profile_status = 'in_progress' and profile_exists
   from public.get_admin_members(null, 'all', 'in_progress', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select in_progress_user_id from _commatch_members_it_config))
  and not exists (
    select 1 from public.get_admin_members(null, 'all', 'missing', 'all', 100, 0, 'joined_at', 'desc')
    where member_user_id = (select in_progress_user_id from _commatch_members_it_config)
  )
  and not exists (
    select 1 from public.get_admin_members(null, 'all', 'completed', 'all', 100, 0, 'joined_at', 'desc')
    where member_user_id = (select in_progress_user_id from _commatch_members_it_config)
  )
);
reset role;

update public.profiles
set introduction = '1234567890', marriage_values = 'abcdefghi'
where id = (select in_progress_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id)
from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'nine-character marriage values remain in progress',
  (select profile_status = 'in_progress'
   from public.get_admin_members(null, 'all', 'in_progress', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select in_progress_user_id from _commatch_members_it_config))
);
select pg_temp._commatch_members_it_assert(
  'completed profile accepts a nonblank photo array item and ten-character texts',
  (select profile_status = 'completed'
   from public.get_admin_members(null, 'all', 'completed', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
select pg_temp._commatch_members_it_assert(
  'hidden filter requires an existing hidden profile',
  (select profile_exists and profile_visibility = 'hidden'
   from public.get_admin_members(null, 'all', 'all', 'hidden', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
  and not exists (
    select 1 from public.get_admin_members(null, 'all', 'all', 'visible', 100, 0, 'joined_at', 'desc')
    where member_user_id = (select missing_user_id from _commatch_members_it_config)
  )
);
select pg_temp._commatch_members_it_assert(
  'indefinite and future suspensions are current suspensions',
  (select pg_catalog.count(*) = 2
   from public.get_admin_members(null, 'suspended', 'all', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id in (
     select indefinite_user_id from _commatch_members_it_config
     union all select future_user_id from _commatch_members_it_config
   ))
);
select pg_temp._commatch_members_it_assert(
  'expiration boundary is active while stored state remains suspended',
  (select current_account_status = 'active'
      and stored_account_status = 'suspended'
   from public.get_admin_members(null, 'active', 'all', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select expired_user_id from _commatch_members_it_config))
);

select pg_temp._commatch_members_it_assert(
  'nickname substring search is literal',
  (select pg_catalog.count(*) = 1
   from public.get_admin_members('members_completed', 'all', 'all', 'all', 100, 0, 'joined_at', 'desc')
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
  and (select pg_catalog.count(*) = 0
       from public.get_admin_members('%_', 'all', 'all', 'all', 100, 0, 'joined_at', 'desc'))
);
select pg_temp._commatch_members_it_assert(
  'full UUID search',
  (select pg_catalog.count(*) = 1
   from public.get_admin_members(
     (select completed_user_id::text from _commatch_members_it_config),
     'all', 'all', 'all', 100, 0, 'joined_at', 'desc'
   ))
);
select pg_temp._commatch_members_it_assert(
  'UUID prefix search',
  (select pg_catalog.count(*) >= 1
   from public.get_admin_members(
     (select pg_catalog.left(completed_user_id::text, 12) from _commatch_members_it_config),
     'all', 'all', 'all', 100, 0, 'joined_at', 'desc'
   ))
);

select pg_temp._commatch_members_it_expect_sqlstate(
  'search over 100 characters rejected', '22023',
  $$select * from public.get_admin_members(repeat('a', 101))$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid account filter rejected', '22023',
  $$select * from public.get_admin_members(null, 'invalid')$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid profile filter rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'invalid')$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid visibility filter rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'all', 'invalid')$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid sort rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'all', 'all', 20, 0, 'invalid', 'desc')$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid direction rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'all', 'all', 20, 0, 'joined_at', 'sideways')$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid limit rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'all', 'all', 0, 0)$$
);
select pg_temp._commatch_members_it_expect_sqlstate(
  'invalid offset rejected', '22023',
  $$select * from public.get_admin_members(null, 'all', 'all', 'all', 20, -1)$$
);
select pg_temp._commatch_members_it_assert(
  'empty result is safe',
  (select pg_catalog.count(*) = 0
   from public.get_admin_members('__commatch_no_result__', 'all', 'all', 'all', 20, 0))
);
select pg_temp._commatch_members_it_assert(
  'pagination keeps filtered total_count',
  (select pg_catalog.bool_and(page_row.total_count >= page_row.page_count)
   from (
     select total_count, pg_catalog.count(*) over () as page_count
     from public.get_admin_members(null, 'all', 'all', 'all', 2, 0, 'joined_at', 'desc')
   ) as page_row)
);
select pg_temp._commatch_members_it_assert(
  'joined-at ordering has deterministic UUID tie-break direction',
  (select pg_catalog.array_agg(member_user_id)
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0, 'joined_at', 'desc'))
  =
  (select pg_catalog.array_agg(member_user_id)
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0, 'joined_at', 'desc'))
);

-- Premium states are updated one at a time on the same disposable member so the
-- test covers every display state without needing more Auth fixtures.
select pg_temp._commatch_members_it_assert(
  'Premium none',
  (select not premium_membership_exists
      and premium_stored_status is null
      and not premium_is_available
      and premium_period_state = 'none'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
reset role;

insert into public.premium_memberships (user_id, status, started_at, expires_at, feature_keys)
select completed_user_id, 'active', pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '1 day', array['likes_received']::text[]
from _commatch_members_it_config;
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id) from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'Premium currently available and independent of member account state',
  (select premium_is_available and premium_period_state = 'available'
      and current_account_status = 'active'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() + interval '1 day', expires_at = pg_catalog.now() + interval '2 days'
where user_id = (select completed_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id) from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'Premium not started',
  (select not premium_is_available and premium_period_state = 'not_started'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() - interval '2 days', expires_at = pg_catalog.now() - interval '1 day'
where user_id = (select completed_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id) from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'Premium expired',
  (select not premium_is_available and premium_period_state = 'expired'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
reset role;

update public.premium_memberships
set status = 'suspended', expires_at = null
where user_id = (select completed_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id) from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'Premium suspended',
  (select premium_stored_status = 'suspended' and premium_period_state = 'suspended'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);
reset role;

update public.premium_memberships set status = 'revoked'
where user_id = (select completed_user_id from _commatch_members_it_config);
set local role authenticated;
select pg_temp._commatch_members_it_set_user(super_admin_id) from _commatch_members_it_config;
select pg_temp._commatch_members_it_assert(
  'Premium revoked',
  (select premium_stored_status = 'revoked' and premium_period_state = 'revoked'
   from public.get_admin_members(null, 'all', 'all', 'all', 100, 0)
   where member_user_id = (select completed_user_id from _commatch_members_it_config))
);

-- Dashboard/list parity is checked inside the same transaction and timestamp.
select pg_temp._commatch_members_it_assert(
  'dashboard total member count parity',
  (select total_count from public.get_admin_members(null, 'all', 'all', 'all', 1, 0)) =
  (select total_member_count from public.get_admin_dashboard_operational_summary(30))
);
select pg_temp._commatch_members_it_assert(
  'dashboard active member count parity',
  (select total_count from public.get_admin_members(null, 'active', 'all', 'all', 1, 0)) =
  (select active_member_count from public.get_admin_dashboard_operational_summary(30))
);
select pg_temp._commatch_members_it_assert(
  'dashboard suspended member count parity',
  (select total_count from public.get_admin_members(null, 'suspended', 'all', 'all', 1, 0)) =
  (select suspended_member_count from public.get_admin_dashboard_operational_summary(30))
);
select pg_temp._commatch_members_it_assert(
  'dashboard hidden profile count parity',
  (select total_count from public.get_admin_members(null, 'all', 'all', 'hidden', 1, 0)) =
  (select hidden_profile_count from public.get_admin_dashboard_operational_summary(30))
);
select pg_temp._commatch_members_it_assert(
  'dashboard missing profile count parity',
  (select total_count from public.get_admin_members(null, 'all', 'missing', 'all', 1, 0)) =
  (select missing_profile_count from public.get_admin_dashboard_operational_summary(30))
);
select pg_temp._commatch_members_it_assert(
  'dashboard completed profile count parity',
  (select total_count from public.get_admin_members(null, 'all', 'completed', 'all', 1, 0)) =
  (select completed_profile_count from public.get_admin_dashboard_operational_summary(30))
);
reset role;

rollback;
