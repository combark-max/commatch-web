-- ComMatch public member age contract integration tests.
-- Run after supabase/member-public-age-contracts.sql and the current consent
-- document version migration as a database owner.
-- All fixtures are transaction-local and rolled back at the end.

begin;

create temporary table _commatch_public_age_it_config (
  viewer_id uuid not null,
  premium_viewer_id uuid not null,
  before_birthday_id uuid not null,
  birthday_today_id uuid not null,
  after_birthday_id uuid not null,
  leap_birthday_id uuid not null,
  null_birthday_id uuid not null,
  hidden_id uuid not null,
  suspended_target_id uuid not null,
  admin_id uuid not null,
  same_sex_id uuid not null,
  incomplete_consent_id uuid not null,
  suspended_caller_id uuid not null,
  expired_caller_id uuid not null,
  outsider_id uuid not null,
  match_id uuid not null,
  message_id uuid not null
) on commit drop;

insert into _commatch_public_age_it_config
select
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid();

grant select on table pg_temp._commatch_public_age_it_config to authenticated;

create function pg_temp._commatch_public_age_set_user(p_user_id uuid)
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

create function pg_temp._commatch_public_age_expect_sqlstate(
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

grant execute on function pg_temp._commatch_public_age_set_user(uuid) to authenticated;
grant execute on function pg_temp._commatch_public_age_expect_sqlstate(text, text, text) to authenticated;

do $contract_preflight$
declare
  expected record;
  function_oid oid;
begin
  for expected in
    select * from (values
      ('get_visible_member_summaries', '',
       'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)',
       'commatch_member_candidate_admin_exclusion_v1', true, 'u'::"char"),
      ('search_members_advanced', 'p_height_min integer, p_height_max integer, p_education text, p_drinking text, p_hobby text',
       'TABLE(id uuid, nickname text, age integer, gender text, region text, job text, introduction text, profile_image text)',
       'commatch_member_candidate_admin_exclusion_v1', true, 'u'::"char"),
      ('get_visible_member_detail', 'p_target_user_id uuid',
       'TABLE(id uuid, nickname text, age integer, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)',
       'commatch_member_candidate_admin_exclusion_v1', true, 'u'::"char"),
      ('get_ai_match_candidates', '',
       'TABLE(id uuid, nickname text, age integer, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)',
       'commatch_member_candidate_admin_exclusion_v1', true, 'u'::"char"),
      ('get_received_favorites', '',
       'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, age integer, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)',
       'Returns received favorites for auth.uid() with member service and Premium feature access', true, 'u'::"char"),
      ('get_received_likes', '',
       'TABLE(like_id uuid, sender_user_id uuid, liked_at timestamp with time zone, nickname text, age integer, region text, job text, profile_image text, profile_images text[], has_liked boolean, is_mutual_like boolean, match_id uuid, match_status text, matched_at timestamp with time zone)',
       'Returns Premium received likes for auth.uid() while enforcing member access and sender availability', false, 'u'::"char"),
      ('get_my_matches', '',
       'TABLE(match_id uuid, match_status text, matched_at timestamp with time zone, ended_at timestamp with time zone, last_message_at timestamp with time zone, other_user_id uuid, other_nickname text, other_age integer, other_profile_image text, other_region text, other_job text, latest_message_content text, latest_message_at timestamp with time zone, latest_message_sender_id uuid, unread_count bigint)',
       'commatch_message_moderation_v1', true, 'u'::"char")
    ) as contract(function_name, identity_arguments, result_contract, object_comment, service_role_execute, parallel_mode)
  loop
    select procedure_row.oid into function_oid
    from pg_catalog.pg_proc as procedure_row
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = expected.function_name
      and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) = expected.identity_arguments;

    if function_oid is null
       or pg_catalog.pg_get_function_result(function_oid) <> expected.result_contract then
      raise exception 'FAIL return contract for public.%', expected.function_name;
    end if;
    if pg_catalog.pg_get_function_result(function_oid) like '%birth_date%' then
      raise exception 'FAIL public.% still exposes a birth date field', expected.function_name;
    end if;
    if (
      select language_row.lanname <> 'plpgsql'
        or not procedure_row.prosecdef
        or procedure_row.provolatile <> 'v'
        or procedure_row.proparallel <> expected.parallel_mode
        or procedure_row.pronargdefaults <> case
          when expected.function_name = 'search_members_advanced' then 5 else 0
        end
        or procedure_row.proowner <> 'postgres'::regrole
        or procedure_row.proconfig is distinct from array['search_path=""']::text[]
      from pg_catalog.pg_proc as procedure_row
      join pg_catalog.pg_language as language_row on language_row.oid = procedure_row.prolang
      where procedure_row.oid = function_oid
    ) then
      raise exception 'FAIL metadata for public.%', expected.function_name;
    end if;
    if pg_catalog.obj_description(function_oid, 'pg_proc') is distinct from expected.object_comment then
      raise exception 'FAIL comment for public.%', expected.function_name;
    end if;
    if pg_catalog.has_function_privilege('public', function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE')
          is distinct from expected.service_role_execute then
      raise exception 'FAIL ACL for public.%', expected.function_name;
    end if;
  end loop;
  raise notice 'PASS seven RPC return and metadata contracts';
end
$contract_preflight$;

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
from _commatch_public_age_it_config as config
cross join lateral (
  values
    (config.viewer_id), (config.premium_viewer_id),
    (config.before_birthday_id), (config.birthday_today_id),
    (config.after_birthday_id), (config.leap_birthday_id),
    (config.null_birthday_id), (config.hidden_id),
    (config.suspended_target_id), (config.admin_id),
    (config.same_sex_id), (config.incomplete_consent_id),
    (config.suspended_caller_id), (config.expired_caller_id),
    (config.outsider_id)
) as fixture(user_id)
cross join lateral (
  select auth_user.instance_id from auth.users as auth_user
  where auth_user.instance_id is not null
  order by auth_user.created_at, auth_user.id limit 1
) as source;

insert into public.profiles (
  id, nickname, birth_date, gender, height, region, job, education, hobby,
  drinking, smoking, marriage_history, introduction, marriage_values, profile_images
)
select fixture.user_id, fixture.nickname, fixture.birth_date, fixture.gender,
  fixture.height, '서울', '회사원', '대졸', '독서', '가끔 함', '비흡연',
  'first_marriage', '통합 테스트 소개 문구입니다.', '통합 테스트 결혼 가치관입니다.', array[]::text[]
from _commatch_public_age_it_config as config
cross join lateral (
  values
    (config.viewer_id, '__age_viewer', (current_date - interval '35 years')::date, '남성', 175),
    (config.premium_viewer_id, '__age_premium', (current_date - interval '35 years')::date, '남성', 175),
    (config.before_birthday_id, '__age_before', (current_date - interval '30 years' + interval '1 day')::date, '여성', 165),
    (config.birthday_today_id, '__age_today', (current_date - interval '30 years')::date, '여성', 165),
    (config.after_birthday_id, '__age_after', (current_date - interval '30 years' - interval '1 day')::date, '여성', 165),
    (config.leap_birthday_id, '__age_leap', date '2000-02-29', '여성', 165),
    (config.null_birthday_id, '__age_null', null::date, '여성', 165),
    (config.hidden_id, '__age_hidden', date '1991-04-05', '여성', 165),
    (config.suspended_target_id, '__age_suspended_target', date '1992-05-06', '여성', 165),
    (config.admin_id, '__age_admin', date '1993-06-07', '여성', 165),
    (config.same_sex_id, '__age_same_sex', date '1994-07-08', '남성', 175),
    (config.incomplete_consent_id, '__age_incomplete', date '1990-01-01', '남성', 175),
    (config.suspended_caller_id, '__age_suspended_caller', date '1990-01-01', '남성', 175),
    (config.expired_caller_id, '__age_expired_caller', date '1990-01-01', '남성', 175),
    (config.outsider_id, '__age_outsider', date '1990-01-01', '남성', 175)
) as fixture(user_id, nickname, birth_date, gender, height);

delete from public.premium_memberships as membership
using _commatch_public_age_it_config as config
where membership.user_id = any(array[
  config.viewer_id, config.premium_viewer_id, config.before_birthday_id,
  config.birthday_today_id, config.after_birthday_id, config.leap_birthday_id,
  config.null_birthday_id, config.hidden_id, config.suspended_target_id,
  config.admin_id, config.same_sex_id, config.incomplete_consent_id,
  config.suspended_caller_id, config.expired_caller_id, config.outsider_id
]);

insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select fixture.user_id, consent.consent_type, 'accepted', consent.document_version,
  'email_verification', pg_catalog.gen_random_uuid(), pg_catalog.now() - interval '5 minutes'
from _commatch_public_age_it_config as config
cross join lateral (
  values
    (config.viewer_id), (config.premium_viewer_id),
    (config.before_birthday_id), (config.birthday_today_id),
    (config.after_birthday_id), (config.leap_birthday_id),
    (config.null_birthday_id), (config.hidden_id),
    (config.suspended_target_id), (config.admin_id),
    (config.same_sex_id), (config.suspended_caller_id),
    (config.expired_caller_id), (config.outsider_id)
) as fixture(user_id)
cross join lateral (values
  ('terms', 'terms-v1.1'),
  ('privacy', 'privacy-v1.1'),
  ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select hidden_id, 'active', 'hidden',
  null, null::timestamptz, 'public age integration test'
from _commatch_public_age_it_config
union all
select suspended_target_id, 'suspended', 'visible', pg_catalog.now(), null, 'public age integration test'
from _commatch_public_age_it_config
union all
select suspended_caller_id, 'suspended', 'visible', pg_catalog.now(), null, 'public age integration test'
from _commatch_public_age_it_config
union all
select expired_caller_id, 'suspended', 'visible', pg_catalog.now() - interval '2 hours',
  pg_catalog.now() - interval '1 hour', 'public age integration test'
from _commatch_public_age_it_config;

insert into public.admin_accounts (user_id, role, status)
select admin_id, 'moderator', 'active' from _commatch_public_age_it_config;

insert into public.premium_memberships (user_id, status, started_at, expires_at, feature_keys)
select premium_viewer_id, 'active', pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  array['likes_received', 'received_likes', 'advanced_member_search']::text[]
from _commatch_public_age_it_config;

set local role authenticated;
select pg_temp._commatch_public_age_set_user(before_birthday_id) from _commatch_public_age_it_config;
insert into public.favorites (user_id, favorite_user_id)
select before_birthday_id, premium_viewer_id from _commatch_public_age_it_config;
reset role;

insert into public.likes (user_id, liked_user_id)
select before_birthday_id, premium_viewer_id from _commatch_public_age_it_config;

insert into public.matches (id, user_1_id, user_2_id, status, matched_at)
select match_id, least(viewer_id, before_birthday_id), greatest(viewer_id, before_birthday_id),
  'active', pg_catalog.now() from _commatch_public_age_it_config;

insert into public.messages (
  id, match_id, sender_id, content, message_type, moderation_visibility, created_at
)
select message_id, match_id, before_birthday_id, '__exact_private_message',
  'text', 'hidden', pg_catalog.now()
from _commatch_public_age_it_config;

set local role authenticated;
select pg_temp._commatch_public_age_set_user(viewer_id) from _commatch_public_age_it_config;

do $age_and_candidate_assertions$
declare
  config record;
  row_json jsonb;
  listed_age integer;
  detail_age integer;
  ai_age integer;
  leap_expected integer;
begin
  select * into config from pg_temp._commatch_public_age_it_config;

  select to_jsonb(summary_row), summary_row.age into row_json, listed_age
  from public.get_visible_member_summaries() as summary_row
  where summary_row.id = config.before_birthday_id;
  if row_json ? 'birth_date'
     or pg_catalog.strpos(row_json::text, (current_date - interval '30 years' + interval '1 day')::date::text) > 0
     or listed_age <> 29 then
    raise exception 'FAIL before-birthday summary age/public shape: %', row_json;
  end if;

  select detail_row.age into detail_age
  from public.get_visible_member_detail(config.before_birthday_id) as detail_row;
  select candidate_row.age into ai_age
  from public.get_ai_match_candidates() as candidate_row
  where candidate_row.id = config.before_birthday_id;
  if detail_age <> listed_age or ai_age <> listed_age then
    raise exception 'FAIL list/detail/AI age consistency: %, %, %', listed_age, detail_age, ai_age;
  end if;

  if exists (
    select 1 from public.get_ai_match_candidates()
    where id in (config.hidden_id, config.suspended_target_id, config.admin_id, config.same_sex_id)
  ) then
    raise exception 'FAIL AI candidate security exclusion';
  end if;

  if (select age from public.get_visible_member_summaries() where id = config.birthday_today_id) <> 30
     or (select age from public.get_visible_member_summaries() where id = config.after_birthday_id) <> 30 then
    raise exception 'FAIL birthday-today or after-birthday age';
  end if;

  leap_expected := extract(year from current_date)::integer - 2000
    - case when pg_catalog.to_char(current_date, 'MMDD') < '0229' then 1 else 0 end;
  if (select age from public.get_visible_member_summaries() where id = config.leap_birthday_id)
       is distinct from leap_expected then
    raise exception 'FAIL leap-day age';
  end if;

  if (select age from public.get_visible_member_summaries() where id = config.null_birthday_id)
       is not null then
    raise exception 'FAIL NULL birth date did not become NULL age';
  end if;

  if exists (
    select 1 from public.get_visible_member_summaries()
    where id in (config.hidden_id, config.suspended_target_id, config.admin_id, config.same_sex_id)
  ) then
    raise exception 'FAIL candidate security exclusion';
  end if;
  if exists (select 1 from public.get_visible_member_detail(config.hidden_id))
     or exists (select 1 from public.get_visible_member_detail(config.suspended_target_id))
     or exists (select 1 from public.get_visible_member_detail(config.admin_id))
     or exists (select 1 from public.get_visible_member_detail(config.same_sex_id)) then
    raise exception 'FAIL detail UUID security exclusion';
  end if;

  raise notice 'PASS age boundaries, consistency, public shape, and candidate security';
end
$age_and_candidate_assertions$;

do $match_assertions$
declare
  config record;
  match_json jsonb;
begin
  select * into config from pg_temp._commatch_public_age_it_config;
  select to_jsonb(match_row) into match_json
  from public.get_my_matches() as match_row
  where match_row.match_id = config.match_id;

  if match_json ? 'other_birth_date'
     or (match_json ->> 'other_age')::integer <> 29
     or match_json ->> 'latest_message_content' <> '관리자에 의해 비노출된 메시지입니다.' then
    raise exception 'FAIL match age/public shape/moderation: %', match_json;
  end if;
  raise notice 'PASS participant match age and moderation masking';
end
$match_assertions$;

select pg_temp._commatch_public_age_set_user(outsider_id) from _commatch_public_age_it_config;
do $nonparticipant_assertion$
declare config record;
begin
  select * into config from pg_temp._commatch_public_age_it_config;
  if exists (select 1 from public.get_my_matches() where match_id = config.match_id) then
    raise exception 'FAIL nonparticipant received a match';
  end if;
  raise notice 'PASS nonparticipant match exclusion';
end
$nonparticipant_assertion$;

select pg_temp._commatch_public_age_set_user(incomplete_consent_id) from _commatch_public_age_it_config;
select pg_temp._commatch_public_age_expect_sqlstate(
  'incomplete consent remains blocked', '42501',
  'select * from public.get_visible_member_summaries()'
);

select pg_temp._commatch_public_age_set_user(suspended_caller_id) from _commatch_public_age_it_config;
select pg_temp._commatch_public_age_expect_sqlstate(
  'current suspension remains blocked', '42501',
  'select * from public.get_visible_member_summaries()'
);

select pg_temp._commatch_public_age_set_user(expired_caller_id) from _commatch_public_age_it_config;
do $expired_suspension_assertion$
begin
  perform * from public.get_visible_member_summaries();
  raise notice 'PASS expired suspension restores member access';
end
$expired_suspension_assertion$;

select pg_temp._commatch_public_age_set_user(premium_viewer_id) from _commatch_public_age_it_config;
do $premium_assertions$
declare
  config record;
  favorite_json jsonb;
  like_json jsonb;
begin
  select * into config from pg_temp._commatch_public_age_it_config;
  if not exists (
    select 1 from public.search_members_advanced(160, 170, '대졸', '가끔 함', '독서')
    where id = config.before_birthday_id and age = 29
  ) then
    raise exception 'FAIL advanced search age/filter contract';
  end if;

  select to_jsonb(favorite_row) into favorite_json
  from public.get_received_favorites() as favorite_row
  where favorite_row.sender_user_id = config.before_birthday_id;
  select to_jsonb(like_row) into like_json
  from public.get_received_likes() as like_row
  where like_row.sender_user_id = config.before_birthday_id;

  if favorite_json is null or favorite_json ? 'birth_date'
     or (favorite_json ->> 'age')::integer <> 29 then
    raise exception 'FAIL Premium received favorites age contract: %', favorite_json;
  end if;
  if like_json is null or like_json ? 'birth_date'
     or (like_json ->> 'age')::integer <> 29 then
    raise exception 'FAIL Premium received likes age contract: %', like_json;
  end if;
  raise notice 'PASS Premium entitlement keys and received member age contracts';
end
$premium_assertions$;

select pg_temp._commatch_public_age_set_user(viewer_id) from _commatch_public_age_it_config;
select pg_temp._commatch_public_age_expect_sqlstate(
  'non-Premium advanced search remains blocked', '42501',
  'select * from public.search_members_advanced()'
);
select pg_temp._commatch_public_age_expect_sqlstate(
  'non-Premium received favorites remains blocked', '42501',
  'select * from public.get_received_favorites()'
);
select pg_temp._commatch_public_age_expect_sqlstate(
  'non-Premium received likes remains blocked', '42501',
  'select * from public.get_received_likes()'
);
reset role;

select 'PASS member public age contract integration tests; rolling back all fixtures' as test_result;

rollback;
