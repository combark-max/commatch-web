-- Rollback-safe integration tests for profile-images-batch-access.sql.
-- Run only in a disposable/local database after the batch migration and the
-- current member consent/access migrations.

begin;

create temporary table _commatch_profile_image_batch_config (
  viewer_id uuid not null,
  visible_id uuid not null,
  same_gender_id uuid not null,
  hidden_id uuid not null,
  suspended_id uuid not null,
  related_id uuid not null,
  admin_history_owner_id uuid not null,
  active_admin_id uuid not null,
  match_id uuid not null
) on commit drop;

insert into _commatch_profile_image_batch_config
select
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid();

grant select on table pg_temp._commatch_profile_image_batch_config to authenticated;

create function pg_temp._commatch_profile_image_batch_set_user(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text
    end,
    true
  );
  if auth.uid() is distinct from p_user_id then
    raise exception 'auth.uid() fixture setup failed';
  end if;
end
$function$;

create function pg_temp._commatch_profile_image_batch_expect_sqlstate(
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
  exception when others then
    if sqlstate is distinct from p_expected_sqlstate then
      raise exception 'FAIL %: expected SQLSTATE %, received % (%)',
        p_label, p_expected_sqlstate, sqlstate, sqlerrm;
    end if;
  end;
  raise notice 'PASS %', p_label;
end
$function$;

grant execute on function pg_temp._commatch_profile_image_batch_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_profile_image_batch_expect_sqlstate(text, text, text)
  to authenticated;

do $contract$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.can_access_profile_images(text[])'
  );
  v_definition text;
begin
  if v_function_oid is null then
    raise exception 'FAIL can_access_profile_images(text[]) is missing';
  end if;

  select pg_catalog.pg_get_functiondef(v_function_oid)
  into v_definition;

  if pg_catalog.pg_get_function_result(v_function_oid) <> 'text[]'
     or v_definition !~ 'SET search_path TO '''''
     or v_definition !~ 'public.can_access_profile_image\(candidate.object_path\)'
     or v_definition !~ 'cardinality\(p_object_paths\) > 50'
     or v_definition ~ 'EXECUTE[^;]*p_object_paths' then
    raise exception 'FAIL batch profile image function contract differs';
  end if;

  if (
    select function_info.prosecdef
      or function_info.provolatile <> 'v'
      or function_info.proowner <> 'postgres'::pg_catalog.regrole
      or function_info.proconfig is distinct from array['search_path=""']::text[]
    from pg_catalog.pg_proc as function_info
    where function_info.oid = v_function_oid
  ) then
    raise exception 'FAIL batch profile image function metadata differs';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'FAIL batch profile image ACL differs';
  end if;

  raise notice 'PASS batch function metadata, scalar reuse, and ACL';
end
$contract$;

do $fixture_preflight$
begin
  if not exists (select 1 from auth.users where instance_id is not null) then
    raise exception 'At least one auth.users instance_id is required for rollback fixtures';
  end if;
end
$fixture_preflight$;

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from _commatch_profile_image_batch_config as config
cross join lateral (
  values
    (config.viewer_id), (config.visible_id), (config.same_gender_id),
    (config.hidden_id), (config.suspended_id), (config.related_id),
    (config.admin_history_owner_id), (config.active_admin_id)
) as fixture(user_id)
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.instance_id is not null
  order by auth_user.created_at, auth_user.id
  limit 1
) as source;

insert into public.profiles (
  id, nickname, birth_date, gender, height, region, job, education, hobby,
  drinking, smoking, marriage_history, introduction, marriage_values,
  profile_image, profile_images
)
select
  fixture.user_id,
  '__batch_' || pg_catalog.left(fixture.user_id::text, 8),
  date '1990-01-01', fixture.gender, fixture.height,
  '서울', '회사원', '대졸', '독서', '가끔 함', '비흡연',
  'first_marriage', '배치 이미지 권한 통합 테스트입니다.',
  '배치 이미지 권한 통합 테스트입니다.',
  fixture.user_id::text || '/' || fixture.file_name,
  array[fixture.user_id::text || '/' || fixture.file_name]::text[]
from _commatch_profile_image_batch_config as config
cross join lateral (
  values
    (config.viewer_id, '남성', 175, 'self.webp'),
    (config.visible_id, '여성', 165, 'visible.webp'),
    (config.same_gender_id, '남성', 176, 'same.webp'),
    (config.hidden_id, '여성', 164, 'hidden.webp'),
    (config.suspended_id, '여성', 163, 'suspended.webp'),
    (config.related_id, '여성', 162, 'related.webp'),
    (config.admin_history_owner_id, '여성', 161, 'admin-history.webp'),
    (config.active_admin_id, '남성', 177, 'active-admin.webp')
) as fixture(user_id, gender, height, file_name);

insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select config.viewer_id, consent.consent_type, 'accepted', consent.document_version,
  'email_verification', pg_catalog.gen_random_uuid(), pg_catalog.now() - interval '5 minutes'
from _commatch_profile_image_batch_config as config
cross join lateral (values
  ('terms', 'terms-v1.1'),
  ('privacy', 'privacy-v1.1'),
  ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

insert into public.matches (id, user_1_id, user_2_id, status, matched_at)
select match_id, least(viewer_id, related_id), greatest(viewer_id, related_id),
  'active', pg_catalog.now()
from _commatch_profile_image_batch_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select hidden_id, 'active', 'hidden', null, null, 'batch image test'
from _commatch_profile_image_batch_config
union all
select suspended_id, 'suspended', 'visible', pg_catalog.now(), null, 'batch image test'
from _commatch_profile_image_batch_config
union all
select related_id, 'active', 'hidden', null, null, 'batch image test'
from _commatch_profile_image_batch_config;

insert into public.admin_accounts (user_id, role, status, suspended_at)
select admin_history_owner_id, 'moderator', 'suspended', pg_catalog.now()
from _commatch_profile_image_batch_config;

insert into public.admin_accounts (user_id, role, status)
select active_admin_id, 'moderator', 'active'
from _commatch_profile_image_batch_config;

set local role authenticated;
select pg_temp._commatch_profile_image_batch_set_user(viewer_id)
from _commatch_profile_image_batch_config;

do $member_parity$
declare
  config record;
  v_input text[];
  v_expected text[];
  v_actual text[];
begin
  select * into config from pg_temp._commatch_profile_image_batch_config;
  v_input := array[
    config.viewer_id::text || '/self.webp',
    config.visible_id::text || '/visible.webp',
    config.visible_id::text || '/visible.webp',
    config.same_gender_id::text || '/same.webp',
    config.hidden_id::text || '/hidden.webp',
    config.suspended_id::text || '/suspended.webp',
    config.related_id::text || '/related.webp',
    config.admin_history_owner_id::text || '/admin-history.webp',
    config.visible_id::text || '/unregistered.webp',
    'malformed-path'
  ];

  select coalesce(
    pg_catalog.array_agg(candidate.object_path order by candidate.first_ordinality),
    array[]::text[]
  )
  into v_expected
  from (
    select input_path.object_path, pg_catalog.min(input_path.ordinality) as first_ordinality
    from pg_catalog.unnest(v_input) with ordinality as input_path(object_path, ordinality)
    group by input_path.object_path
  ) as candidate
  where public.can_access_profile_image(candidate.object_path);

  v_actual := public.can_access_profile_images(v_input);
  if v_actual is distinct from v_expected then
    raise exception 'FAIL batch and scalar authorization results differ: % <> %',
      v_actual, v_expected;
  end if;

  if v_actual is distinct from array[
    config.viewer_id::text || '/self.webp',
    config.visible_id::text || '/visible.webp',
    config.related_id::text || '/related.webp'
  ]::text[] then
    raise exception 'FAIL member self, browse, relationship, or denial policy differs: %', v_actual;
  end if;

  if public.can_access_profile_images(null::text[]) is distinct from array[]::text[]
     or public.can_access_profile_images(array[null]::text[]) is distinct from array[]::text[] then
    raise exception 'FAIL null batch inputs are not safely denied';
  end if;

  raise notice 'PASS scalar parity, order, deduplication, member policy, and malformed paths';
end
$member_parity$;

select pg_temp._commatch_profile_image_batch_expect_sqlstate(
  'raw arrays over 50 entries are rejected',
  '22023',
  pg_catalog.format(
    'select public.can_access_profile_images(array_fill(%L::text, array[51]))',
    viewer_id::text || '/self.webp'
  )
)
from _commatch_profile_image_batch_config;

select pg_temp._commatch_profile_image_batch_set_user(active_admin_id)
from _commatch_profile_image_batch_config;

do $active_admin$
declare
  config record;
  v_actual text[];
begin
  select * into config from pg_temp._commatch_profile_image_batch_config;
  v_actual := public.can_access_profile_images(array[
    config.admin_history_owner_id::text || '/admin-history.webp',
    config.suspended_id::text || '/suspended.webp',
    'malformed-path'
  ]);

  if v_actual is distinct from array[
    config.admin_history_owner_id::text || '/admin-history.webp',
    config.suspended_id::text || '/suspended.webp'
  ]::text[] then
    raise exception 'FAIL active administrator batch access differs: %', v_actual;
  end if;

  raise notice 'PASS active administrator operational image access';
end
$active_admin$;

reset role;
rollback;
