-- Rollback-safe integration tests for ComMatch's minimum member age.
-- Apply member-adult-age-enforcement.sql first, then run this file as one SQL
-- Editor invocation with a database-owner role. All fixtures are rolled back.

begin;

create temporary table _commatch_adult_age_it_config (
  adult_user_id uuid not null,
  legacy_minor_user_id uuid not null,
  no_consent_user_id uuid not null,
  suspended_user_id uuid not null
) on commit drop;

insert into _commatch_adult_age_it_config values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
);

grant select on table pg_temp._commatch_adult_age_it_config to authenticated;

create temporary table _commatch_adult_age_existing_profiles
on commit drop
as select profile.id from public.profiles as profile;

create function pg_temp._commatch_adult_age_set_user(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    coalesce(p_user_id::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object(
        'sub', p_user_id,
        'role', 'authenticated'
      )::text
    end,
    true
  );
  if auth.uid() is distinct from p_user_id then
    raise exception 'auth.uid() fixture setup failed';
  end if;
end
$function$;

create function pg_temp._commatch_adult_age_expect_sqlstate(
  p_label text,
  p_expected_sqlstate text,
  p_statement text
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
begin
  begin
    execute p_statement;
    raise exception 'FAIL %: statement unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate is distinct from p_expected_sqlstate then
        raise exception 'FAIL %: expected SQLSTATE %, received % (%)',
          p_label, p_expected_sqlstate, sqlstate, sqlerrm;
      end if;
  end;
  raise notice 'PASS %', p_label;
end
$function$;

create function pg_temp._commatch_adult_age_expect_allowed(
  p_label text,
  p_expected boolean
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_actual boolean;
begin
  select public.is_member_service_allowed() into v_actual;
  if v_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, received %', p_label, p_expected, v_actual;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

grant execute on function pg_temp._commatch_adult_age_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_adult_age_expect_sqlstate(text, text, text)
  to authenticated;
grant execute on function pg_temp._commatch_adult_age_expect_allowed(text, boolean)
  to authenticated;

do $preflight$
declare
  v_signature text;
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.user_consent_events') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null then
    raise exception 'Required adult-age test tables are missing';
  end if;

  foreach v_signature in array array[
    'public.is_member_profile_write_allowed(date)',
    'public.enforce_adult_profile_birth_date()',
    'public.is_member_service_allowed()',
    'public.get_visible_member_summaries()',
    'public.send_match_message(uuid,text)'
  ]::text[] loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Required function % is missing', v_signature;
    end if;
  end loop;

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

  if not exists (select 1 from auth.users where instance_id is not null) then
    raise exception 'At least one auth.users instance_id is required for rollback fixtures';
  end if;
end
$preflight$;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from _commatch_adult_age_it_config as config
cross join lateral (
  values
    (config.adult_user_id),
    (config.legacy_minor_user_id),
    (config.no_consent_user_id),
    (config.suspended_user_id)
) as fixture(user_id)
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.instance_id is not null
  order by auth_user.created_at, auth_user.id
  limit 1
) as source;

-- Complete current consent for every case except the explicit no-consent user.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select fixture.user_id, consent.consent_type, 'accepted', consent.document_version,
  'email_verification', pg_catalog.gen_random_uuid(), pg_catalog.now()
from _commatch_adult_age_it_config as config
cross join lateral (
  values
    (config.adult_user_id),
    (config.legacy_minor_user_id),
    (config.suspended_user_id)
) as fixture(user_id)
cross join lateral (
  values
    ('terms', 'terms-v1.0'),
    ('privacy', 'privacy-v1.0'),
    ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

insert into public.member_restrictions (
  user_id, account_status, profile_visibility,
  suspended_at, suspended_until, reason
)
select suspended_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', null,
  'adult age enforcement integration test'
from _commatch_adult_age_it_config;

-- The first profile write must not deadlock on the profile-dependent service
-- guard. One day before the nineteenth birthday is rejected; the exact
-- nineteenth birthday is accepted through the authenticated RLS path.
set local role authenticated;
select pg_temp._commatch_adult_age_set_user(adult_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_sqlstate(
  'profile insert one day before nineteenth birthday',
  '23514',
  pg_catalog.format(
    'insert into public.profiles(id,nickname,gender,birth_date,profile_images) values (%L,%L,%L,%L,array[]::text[])',
    adult_user_id,
    '__adult_age_too_young_' || pg_catalog.left(adult_user_id::text, 8),
    '남성',
    (current_date - interval '19 years' + interval '1 day')::date
  )
)
from _commatch_adult_age_it_config;

insert into public.profiles(id, nickname, gender, birth_date, profile_images)
select adult_user_id,
  '__adult_age_adult_' || pg_catalog.left(adult_user_id::text, 8),
  '남성',
  (current_date - interval '19 years')::date,
  array[]::text[]
from _commatch_adult_age_it_config;

do $exact_boundary$
begin
  if not exists (
    select 1
    from public.profiles as profile
    cross join _commatch_adult_age_it_config as config
    where profile.id = config.adult_user_id
      and profile.birth_date =
        (current_date - interval '19 years')::date
  ) then
    raise exception 'FAIL exact nineteenth birthday profile insert';
  end if;
  raise notice 'PASS exact nineteenth birthday profile insert';
end
$exact_boundary$;

select pg_temp._commatch_adult_age_expect_sqlstate(
  'adult profile update to minor birth date',
  '23514',
  pg_catalog.format(
    'update public.profiles set birth_date=%L where id=%L',
    (current_date - interval '18 years')::date,
    adult_user_id
  )
)
from _commatch_adult_age_it_config;

update public.profiles
set birth_date = (current_date - interval '30 years')::date
where id = (
  select adult_user_id from _commatch_adult_age_it_config
);

do $adult_update$
begin
  if not exists (
    select 1
    from public.profiles as profile
    cross join _commatch_adult_age_it_config as config
    where profile.id = config.adult_user_id
      and profile.birth_date =
        (current_date - interval '30 years')::date
  ) then
    raise exception 'FAIL adult birth-date update';
  end if;
  raise notice 'PASS adult birth-date update';
end
$adult_update$;
reset role;

-- Simulate rows that predate this migration. Disabling only the new trigger
-- avoids changing or deleting legacy data while proving the common guard is
-- immediately fail-closed for an existing minor.
alter table public.profiles disable trigger profiles_enforce_adult_birth_date;
insert into public.profiles(id, nickname, gender, birth_date, profile_images)
select fixture.user_id,
  fixture.nickname_prefix || pg_catalog.left(fixture.user_id::text, 8),
  '여성',
  fixture.birth_date,
  array[]::text[]
from _commatch_adult_age_it_config as config
cross join lateral (
  values
    (
      config.legacy_minor_user_id,
      '__adult_age_legacy_minor_',
      (current_date - interval '18 years')::date
    ),
    (
      config.no_consent_user_id,
      '__adult_age_no_consent_',
      (current_date - interval '25 years')::date
    ),
    (
      config.suspended_user_id,
      '__adult_age_suspended_',
      (current_date - interval '25 years')::date
    )
) as fixture(user_id, nickname_prefix, birth_date);
alter table public.profiles enable trigger profiles_enforce_adult_birth_date;

set local role authenticated;
select pg_temp._commatch_adult_age_set_user(adult_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_allowed(
  'adult with current consents and normal access', true
);

-- Preserve the existing nullable column contract while requiring a real adult
-- birth date at the shared service boundary.
update public.profiles
set birth_date = null
where id = (
  select adult_user_id from _commatch_adult_age_it_config
);
select pg_temp._commatch_adult_age_expect_allowed(
  'profile with null birth date', false
);

-- Fixture cleanup is owner-only. A service-ineligible profile is not expected
-- to regain UPDATE visibility through the member-facing SELECT policy.
reset role;
update public.profiles
set birth_date = (current_date - interval '30 years')::date
where id = (
  select adult_user_id from _commatch_adult_age_it_config
);
set local role authenticated;
select pg_temp._commatch_adult_age_set_user(adult_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_allowed(
  'adult access restored after owner fixture cleanup', true
);

select pg_temp._commatch_adult_age_set_user(legacy_minor_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_allowed(
  'legacy minor with current consents', false
);
select pg_temp._commatch_adult_age_expect_sqlstate(
  'legacy minor member search RPC',
  '42501',
  'select * from public.get_visible_member_summaries()'
);
select pg_temp._commatch_adult_age_expect_sqlstate(
  'legacy minor message write RPC',
  '42501',
  pg_catalog.format(
    'select * from public.send_match_message(%L,%L)',
    pg_catalog.gen_random_uuid(),
    'blocked minor message'
  )
);

select pg_temp._commatch_adult_age_set_user(no_consent_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_allowed(
  'adult without required consents', false
);

select pg_temp._commatch_adult_age_set_user(suspended_user_id)
from _commatch_adult_age_it_config;
select pg_temp._commatch_adult_age_expect_allowed(
  'suspended adult with current consents', false
);
reset role;

do $metadata_acl_and_policies$
declare
  v_function record;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

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
    raise exception 'FAIL profile-write guard metadata or ACL';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid =
      'public.is_member_service_allowed()'::pg_catalog.regprocedure
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.strpos(
        function_info.prosrc,
        'commatch_member_adult_age_enforcement_v1'
      ) > 0
  ) then
    raise exception 'FAIL member service guard metadata or age marker';
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
    raise exception 'FAIL profile write policy split';
  end if;

  if exists (
    select baseline.id
    from pg_temp._commatch_adult_age_existing_profiles as baseline
    left join public.profiles as profile on profile.id = baseline.id
    where profile.id is null
  ) then
    raise exception 'FAIL an existing profile row was deleted';
  end if;

  raise notice 'PASS metadata, ACL, profile policy split, and existing-row preservation';
end
$metadata_acl_and_policies$;

rollback;
