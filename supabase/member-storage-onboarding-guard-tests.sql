-- Rollback-safe integration tests for the profile-image onboarding guard.
-- Apply member-storage-onboarding-guard.sql first, then run this file as one
-- SQL Editor invocation with a database-owner role. All fixtures are rolled back.

begin;

create temporary table _commatch_storage_onboarding_it_config (
  onboarding_user_id uuid not null,
  no_consent_user_id uuid not null,
  suspended_user_id uuid not null,
  adult_profile_user_id uuid not null,
  null_birth_date_user_id uuid not null,
  minor_profile_user_id uuid not null,
  minor_onboarding_user_id uuid not null,
  other_user_id uuid not null
) on commit drop;

insert into _commatch_storage_onboarding_it_config values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
);

grant select on table pg_temp._commatch_storage_onboarding_it_config
  to authenticated;

create function pg_temp._commatch_storage_onboarding_set_user(p_user_id uuid)
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

create function pg_temp._commatch_storage_onboarding_expect_sqlstate(
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

create function pg_temp._commatch_storage_onboarding_expect_allowed(
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
  select public.is_member_profile_onboarding_allowed() into v_actual;
  if v_actual is distinct from p_expected then
    raise exception 'FAIL %: expected %, received %',
      p_label, p_expected, v_actual;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

grant execute on function pg_temp._commatch_storage_onboarding_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_storage_onboarding_expect_sqlstate(text, text, text)
  to authenticated;
grant execute on function pg_temp._commatch_storage_onboarding_expect_allowed(text, boolean)
  to authenticated;

do $preflight$
declare
  v_signature text;
begin
  if pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.user_consent_events') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null then
    raise exception 'Required onboarding test tables are missing';
  end if;

  foreach v_signature in array array[
    'public.is_member_profile_onboarding_allowed()',
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

  if not exists (
    select 1
    from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images'
  ) then
    raise exception 'profile_images bucket is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname = 'profile_images_insert'
      and policy_info.polcmd = 'a'
  ) then
    raise exception 'profile_images_insert policy is missing or incompatible';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.instance_id is not null
  ) then
    raise exception 'At least one auth.users instance_id is required for fixtures';
  end if;
end
$preflight$;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from _commatch_storage_onboarding_it_config as config
cross join lateral (
  values
    (config.onboarding_user_id),
    (config.no_consent_user_id),
    (config.suspended_user_id),
    (config.adult_profile_user_id),
    (config.null_birth_date_user_id),
    (config.minor_profile_user_id),
    (config.minor_onboarding_user_id),
    (config.other_user_id)
) as fixture(user_id)
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.instance_id is not null
  order by auth_user.created_at, auth_user.id
  limit 1
) as source;

-- Complete current required consent for every case except no_consent_user_id.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version,
  source, request_id, created_at
)
select fixture.user_id, consent.consent_type, 'accepted',
  consent.document_version, 'email_verification',
  pg_catalog.gen_random_uuid(), pg_catalog.now()
from _commatch_storage_onboarding_it_config as config
cross join lateral (
  values
    (config.onboarding_user_id),
    (config.suspended_user_id),
    (config.adult_profile_user_id),
    (config.null_birth_date_user_id),
    (config.minor_profile_user_id),
    (config.minor_onboarding_user_id),
    (config.other_user_id)
) as fixture(user_id)
cross join lateral (
  values
    ('terms', 'terms-v1.1'),
    ('privacy', 'privacy-v1.1'),
    ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

insert into public.member_restrictions (
  user_id, account_status, profile_visibility,
  suspended_at, suspended_until, reason
)
select suspended_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', null,
  'profile image onboarding integration test'
from _commatch_storage_onboarding_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, profile_images
)
select adult_profile_user_id,
  '__storage_adult_' || pg_catalog.left(adult_profile_user_id::text, 8),
  '남성',
  (current_date - interval '25 years')::date,
  array[]::text[]
from _commatch_storage_onboarding_it_config;

insert into public.profiles (
  id, nickname, gender, birth_date, profile_images
)
select null_birth_date_user_id,
  '__storage_null_' || pg_catalog.left(null_birth_date_user_id::text, 8),
  '남성', null, array[]::text[]
from _commatch_storage_onboarding_it_config;

-- Simulate a legacy minor row without weakening the production trigger.
alter table public.profiles disable trigger profiles_enforce_adult_birth_date;
insert into public.profiles (
  id, nickname, gender, birth_date, profile_images
)
select minor_profile_user_id,
  '__storage_minor_' || pg_catalog.left(minor_profile_user_id::text, 8),
  '남성',
  (current_date - interval '18 years')::date,
  array[]::text[]
from _commatch_storage_onboarding_it_config;
alter table public.profiles enable trigger profiles_enforce_adult_birth_date;

-- 1. A normal, fully consented user without a profile can insert into their
-- own UID folder through the onboarding branch.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(onboarding_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'profile-free consented active member onboarding helper', true
);
insert into storage.objects (bucket_id, name)
select 'profile_images', onboarding_user_id::text || '/onboarding.jpg'
from _commatch_storage_onboarding_it_config;
reset role;

-- 2. Missing required consent remains denied.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(no_consent_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'profile-free member without required consent', false
);
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'profile-free member without consent storage insert', '42501',
  pg_catalog.format(
    'insert into storage.objects(bucket_id,name) values (%L,%L)',
    'profile_images', no_consent_user_id::text || '/blocked.jpg'
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 3. A currently suspended member remains denied.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(suspended_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'profile-free suspended member', false
);
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'profile-free suspended member storage insert', '42501',
  pg_catalog.format(
    'insert into storage.objects(bucket_id,name) values (%L,%L)',
    'profile_images', suspended_user_id::text || '/blocked.jpg'
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 4. The folder ownership predicate remains mandatory.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(onboarding_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'onboarding member cannot insert into another UID folder', '42501',
  pg_catalog.format(
    'insert into storage.objects(bucket_id,name) values (%L,%L)',
    'profile_images', other_user_id::text || '/blocked.jpg'
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 5. An existing adult member continues through the service guard.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(adult_profile_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'existing adult cannot use onboarding branch', false
);
insert into storage.objects (bucket_id, name)
select 'profile_images', adult_profile_user_id::text || '/existing-adult.jpg'
from _commatch_storage_onboarding_it_config;
reset role;

-- 6. An existing null-birth-date profile cannot regain access through
-- onboarding.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(null_birth_date_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'existing null-birth-date profile onboarding bypass', false
);
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'existing null-birth-date profile storage insert', '42501',
  pg_catalog.format(
    'insert into storage.objects(bucket_id,name) values (%L,%L)',
    'profile_images', null_birth_date_user_id::text || '/blocked.jpg'
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 7. An existing legacy minor profile cannot regain access through onboarding.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(minor_profile_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'existing minor profile onboarding bypass', false
);
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'existing minor profile storage insert', '42501',
  pg_catalog.format(
    'insert into storage.objects(bucket_id,name) values (%L,%L)',
    'profile_images', minor_profile_user_id::text || '/blocked.jpg'
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 8. Storage onboarding does not weaken the authoritative adult profile
-- INSERT trigger.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(minor_onboarding_user_id)
from _commatch_storage_onboarding_it_config;
select pg_temp._commatch_storage_onboarding_expect_allowed(
  'profile-free minor claimant before profile write', true
);
select pg_temp._commatch_storage_onboarding_expect_sqlstate(
  'minor onboarding profile insert', '23514',
  pg_catalog.format(
    'insert into public.profiles(id,nickname,gender,birth_date,profile_images) values (%L,%L,%L,%L,array[]::text[])',
    minor_onboarding_user_id,
    '__storage_minor_onboarding_' || pg_catalog.left(minor_onboarding_user_id::text, 8),
    '남성',
    (current_date - interval '18 years')::date
  )
)
from _commatch_storage_onboarding_it_config;
reset role;

-- 9. The existing owner-folder DELETE cleanup path remains available even
-- before profile creation.
set local role authenticated;
select pg_temp._commatch_storage_onboarding_set_user(onboarding_user_id)
from _commatch_storage_onboarding_it_config;
delete from storage.objects
where bucket_id = 'profile_images'
  and name = (
    select onboarding_user_id::text || '/onboarding.jpg'
    from _commatch_storage_onboarding_it_config
  );
reset role;

do $cleanup_assertion$
begin
  if exists (
    select 1
    from storage.objects as storage_object
    cross join _commatch_storage_onboarding_it_config as config
    where storage_object.bucket_id = 'profile_images'
      and storage_object.name = config.onboarding_user_id::text || '/onboarding.jpg'
  ) then
    raise exception 'FAIL owner-folder DELETE cleanup did not remove onboarding object';
  end if;
  raise notice 'PASS owner-folder DELETE cleanup remains available';
end
$cleanup_assertion$;

-- 10. Only profile_images_insert contains the onboarding helper. UPDATE,
-- DELETE, and SELECT retain their existing service/ownership contracts.
do $policy_contract$
declare
  v_authenticated_oid oid;
  v_insert_check text;
  v_policy record;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

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
    raise exception 'FAIL profile_images_insert policy contract differs';
  end if;

  for v_policy in
    select
      policy_info.polname,
      case
        when policy_info.polqual is null then ''
        else pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)
      end || ' ' || case
        when policy_info.polwithcheck is null then ''
        else pg_catalog.pg_get_expr(
          policy_info.polwithcheck, policy_info.polrelid
        )
      end as definition
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_update',
        'profile_images_delete',
        'profile_images_select'
      )
  loop
    if pg_catalog.strpos(
      pg_catalog.lower(v_policy.definition),
      'is_member_profile_onboarding_allowed'
    ) > 0 then
      raise exception 'FAIL policy % gained onboarding access', v_policy.polname;
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_update',
        'profile_images_delete',
        'profile_images_select'
      )
  ) <> 3 then
    raise exception 'FAIL UPDATE/DELETE/SELECT policy count differs';
  end if;

  raise notice 'PASS profile image policy scope remains limited to INSERT';
end
$policy_contract$;

do $function_contract$
declare
  v_function_oid oid :=
    'public.is_member_profile_onboarding_allowed()'::pg_catalog.regprocedure;
begin
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
  ) then
    raise exception 'FAIL onboarding helper security contract differs';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     ) then
    raise exception 'FAIL onboarding helper ACL differs';
  end if;

  raise notice 'PASS onboarding helper security and ACL contract';
end
$function_contract$;

select 'PASS profile image onboarding guard integration tests; rolling back all fixtures'
  as test_result;

rollback;
