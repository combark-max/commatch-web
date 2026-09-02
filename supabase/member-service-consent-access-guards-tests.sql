-- ComMatch member-service consent/access guard rollback-safe integration tests.
--
-- Run after supabase/member-service-consent-access-guards.sql in a disposable
-- or staging database as a database owner capable of SET ROLE and inserting
-- rollback-only auth.users fixtures. This script never commits fixture data.

begin;

create temporary table _commatch_member_access_it_config (
  normal_user_id uuid not null,
  no_consent_user_id uuid not null,
  partial_consent_user_id uuid not null,
  withdrawn_consent_user_id uuid not null,
  legacy_consent_user_id uuid not null,
  complete_consent_user_id uuid not null,
  indefinite_suspended_user_id uuid not null,
  timed_suspended_user_id uuid not null,
  expired_suspension_user_id uuid not null,
  premium_user_id uuid not null,
  premium_no_consent_user_id uuid not null,
  premium_suspended_user_id uuid not null,
  hidden_target_user_id uuid not null,
  admin_target_user_id uuid not null,
  normal_match_id uuid not null,
  incomplete_match_id uuid not null,
  suspended_match_id uuid not null,
  normal_message_id uuid not null,
  incomplete_message_id uuid not null,
  suspended_message_id uuid not null
) on commit drop;

insert into _commatch_member_access_it_config values (
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid()
);

grant select on table pg_temp._commatch_member_access_it_config to authenticated;

create function pg_temp._commatch_member_access_set_user(p_user_id uuid)
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

create function pg_temp._commatch_member_access_expect_sqlstate(
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

create function pg_temp._commatch_member_access_expect_count(
  p_label text,
  p_statement text,
  p_expected_count bigint
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_count bigint;
begin
  execute pg_catalog.format(
    'select count(*)::bigint from (%s) as tested_rows',
    p_statement
  ) into v_count;
  if v_count is distinct from p_expected_count then
    raise exception 'FAIL %: expected % rows, received %',
      p_label, p_expected_count, v_count;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

create function pg_temp._commatch_member_access_expect_affected(
  p_label text,
  p_statement text,
  p_expected_count bigint
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_count bigint;
begin
  execute p_statement;
  get diagnostics v_count = row_count;
  if v_count is distinct from p_expected_count then
    raise exception 'FAIL %: expected % affected rows, received %',
      p_label, p_expected_count, v_count;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

grant execute on function pg_temp._commatch_member_access_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_member_access_expect_sqlstate(text, text, text)
  to authenticated;
grant execute on function pg_temp._commatch_member_access_expect_count(text, text, bigint)
  to authenticated;
grant execute on function pg_temp._commatch_member_access_expect_affected(text, text, bigint)
  to authenticated;

do $preflight$
declare
  v_signature text;
begin
  if pg_catalog.to_regprocedure(
       'public.has_completed_required_member_consents()'
     ) is null then
    raise exception 'Apply supabase/member-service-consent-access-guards.sql first';
  end if;

  foreach v_signature in array array[
    'public.is_member_service_allowed()',
    'public.get_visible_member_summaries()',
    'public.get_visible_member_detail(uuid)',
    'public.get_ai_match_candidates()',
    'public.get_my_favorite_members()',
    'public.get_my_favorite_members_with_likes()',
    'public.get_my_matches()',
    'public.get_my_match_summary()',
    'public.get_match_messages(uuid)'
  ]::text[] loop
    if pg_catalog.to_regprocedure(v_signature) is null
       or pg_catalog.strpos(
         (select function_info.prosrc
          from pg_catalog.pg_proc as function_info
          where function_info.oid = pg_catalog.to_regprocedure(v_signature)),
         'commatch_member_service_consent_access_guards_v1'
       ) = 0 then
      raise exception 'Guarded function % is missing or does not have the approved marker',
        v_signature;
    end if;
  end loop;

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
from _commatch_member_access_it_config as config
cross join lateral (
  values
    (config.normal_user_id),
    (config.no_consent_user_id),
    (config.partial_consent_user_id),
    (config.withdrawn_consent_user_id),
    (config.legacy_consent_user_id),
    (config.complete_consent_user_id),
    (config.indefinite_suspended_user_id),
    (config.timed_suspended_user_id),
    (config.expired_suspension_user_id),
    (config.premium_user_id),
    (config.premium_no_consent_user_id),
    (config.premium_suspended_user_id),
    (config.hidden_target_user_id),
    (config.admin_target_user_id)
) as fixture(user_id)
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.instance_id is not null
  order by auth_user.created_at, auth_user.id
  limit 1
) as source;

insert into public.profiles (id, nickname, gender, profile_images)
select fixture.user_id,
  '__member_access_it_' || fixture.position || '_'
    || pg_catalog.left(fixture.user_id::text, 8),
  case when fixture.gender_group = 'viewer' then '남성' else '여성' end,
  array[]::text[]
from _commatch_member_access_it_config as config
cross join lateral (
  values
    (config.normal_user_id, 1, 'viewer'),
    (config.no_consent_user_id, 2, 'viewer'),
    (config.partial_consent_user_id, 3, 'viewer'),
    (config.withdrawn_consent_user_id, 4, 'viewer'),
    (config.legacy_consent_user_id, 5, 'viewer'),
    (config.complete_consent_user_id, 6, 'candidate'),
    (config.indefinite_suspended_user_id, 7, 'candidate'),
    (config.timed_suspended_user_id, 8, 'viewer'),
    (config.expired_suspension_user_id, 9, 'candidate'),
    (config.premium_user_id, 10, 'viewer'),
    (config.premium_no_consent_user_id, 11, 'viewer'),
    (config.premium_suspended_user_id, 12, 'viewer'),
    (config.hidden_target_user_id, 13, 'candidate'),
    (config.admin_target_user_id, 14, 'candidate')
) as fixture(user_id, position, gender_group);

-- A launch-promotion trigger may grant fixture profiles a membership. Premium
-- cases below install their own exact entitlements, so remove only rollback-only
-- fixture memberships before those assertions.
delete from public.premium_memberships as membership
using _commatch_member_access_it_config as config
where membership.user_id = any(array[
  config.normal_user_id,
  config.no_consent_user_id,
  config.partial_consent_user_id,
  config.withdrawn_consent_user_id,
  config.legacy_consent_user_id,
  config.complete_consent_user_id,
  config.indefinite_suspended_user_id,
  config.timed_suspended_user_id,
  config.expired_suspension_user_id,
  config.premium_user_id,
  config.premium_no_consent_user_id,
  config.premium_suspended_user_id,
  config.hidden_target_user_id,
  config.admin_target_user_id
]);

insert into public.preferences (user_id)
select fixture.user_id
from _commatch_member_access_it_config as config
cross join lateral (
  values
    (config.normal_user_id),
    (config.partial_consent_user_id),
    (config.indefinite_suspended_user_id),
    (config.expired_suspension_user_id)
) as fixture(user_id);

-- Current complete consent fixtures. Suspended fixtures also receive complete
-- consent so their denial proves the restriction branch independently.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select fixture.user_id, consent.consent_type, 'accepted', consent.document_version,
  'email_verification', pg_catalog.gen_random_uuid(),
  pg_catalog.now() - interval '10 minutes'
from _commatch_member_access_it_config as config
cross join lateral (
  values
    (config.normal_user_id),
    (config.complete_consent_user_id),
    (config.indefinite_suspended_user_id),
    (config.timed_suspended_user_id),
    (config.expired_suspension_user_id),
    (config.premium_user_id),
    (config.premium_suspended_user_id),
    (config.hidden_target_user_id),
    (config.admin_target_user_id)
) as fixture(user_id)
cross join lateral (
  values
    ('terms', 'terms-v1.0'),
    ('privacy', 'privacy-v1.0'),
    ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

-- Only one required consent is present.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select partial_consent_user_id, 'terms', 'accepted', 'terms-v1.0',
  'email_verification', pg_catalog.gen_random_uuid(), pg_catalog.now()
from _commatch_member_access_it_config;

-- All current versions were accepted, but the latest privacy event withdrew it.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select config.withdrawn_consent_user_id, consent.consent_type, 'accepted',
  consent.document_version, 'email_verification', pg_catalog.gen_random_uuid(),
  pg_catalog.now() - interval '2 minutes'
from _commatch_member_access_it_config as config
cross join lateral (
  values
    ('terms', 'terms-v1.0'),
    ('privacy', 'privacy-v1.0'),
    ('adult_confirmation', 'adult-confirmation-v1.0')
) as consent(consent_type, document_version);

insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select withdrawn_consent_user_id, 'privacy', 'withdrawn', 'privacy-v1.0',
  'settings', pg_catalog.gen_random_uuid(), pg_catalog.now()
from _commatch_member_access_it_config;

-- All three are accepted, but only for obsolete document versions.
insert into public.user_consent_events (
  user_id, consent_type, action, document_version, source, request_id, created_at
)
select config.legacy_consent_user_id, consent.consent_type, 'accepted',
  consent.document_version, 'email_verification', pg_catalog.gen_random_uuid(),
  pg_catalog.now()
from _commatch_member_access_it_config as config
cross join lateral (
  values
    ('terms', 'terms-v0.9'),
    ('privacy', 'privacy-v0.9'),
    ('adult_confirmation', 'adult-confirmation-v0.9')
) as consent(consent_type, document_version);

insert into public.member_restrictions (
  user_id, account_status, profile_visibility,
  suspended_at, suspended_until, reason
)
select indefinite_suspended_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', null,
  'member access integration test'
from _commatch_member_access_it_config
union all
select timed_suspended_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', pg_catalog.now() + interval '1 hour',
  'member access integration test'
from _commatch_member_access_it_config
union all
select expired_suspension_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '2 hours', pg_catalog.now() - interval '1 hour',
  'member access integration test'
from _commatch_member_access_it_config
union all
select premium_suspended_user_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', null,
  'member access integration test'
from _commatch_member_access_it_config;

insert into public.admin_accounts (user_id, role, status)
select admin_target_user_id, 'moderator', 'active'
from _commatch_member_access_it_config;

insert into public.matches (id, user_1_id, user_2_id, status, matched_at)
select normal_match_id,
  least(normal_user_id, complete_consent_user_id),
  greatest(normal_user_id, complete_consent_user_id),
  'active', pg_catalog.now() - interval '10 minutes'
from _commatch_member_access_it_config
union all
select incomplete_match_id,
  least(partial_consent_user_id, complete_consent_user_id),
  greatest(partial_consent_user_id, complete_consent_user_id),
  'active', pg_catalog.now() - interval '9 minutes'
from _commatch_member_access_it_config
union all
select suspended_match_id,
  least(indefinite_suspended_user_id, complete_consent_user_id),
  greatest(indefinite_suspended_user_id, complete_consent_user_id),
  'active', pg_catalog.now() - interval '8 minutes'
from _commatch_member_access_it_config;

insert into public.messages (
  id, match_id, sender_id, content, message_type, created_at
)
select normal_message_id, normal_match_id, complete_consent_user_id,
  '__member_access_it_normal_message', 'text', pg_catalog.now()
from _commatch_member_access_it_config
union all
select incomplete_message_id, incomplete_match_id, complete_consent_user_id,
  '__member_access_it_incomplete_message', 'text', pg_catalog.now()
from _commatch_member_access_it_config
union all
select suspended_message_id, suspended_match_id, complete_consent_user_id,
  '__member_access_it_suspended_message', 'text', pg_catalog.now()
from _commatch_member_access_it_config;

select pg_temp._commatch_member_access_set_user(partial_consent_user_id)
from _commatch_member_access_it_config;
insert into public.favorites (user_id, favorite_user_id)
select partial_consent_user_id, complete_consent_user_id
from _commatch_member_access_it_config;

select pg_temp._commatch_member_access_set_user(indefinite_suspended_user_id)
from _commatch_member_access_it_config;
insert into public.favorites (user_id, favorite_user_id)
select indefinite_suspended_user_id, complete_consent_user_id
from _commatch_member_access_it_config;

select pg_temp._commatch_member_access_set_user(complete_consent_user_id)
from _commatch_member_access_it_config;
insert into public.favorites (user_id, favorite_user_id)
select complete_consent_user_id, premium_user_id
from _commatch_member_access_it_config;

select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
insert into public.favorites (user_id, favorite_user_id)
select normal_user_id, complete_consent_user_id
from _commatch_member_access_it_config;

insert into public.favorites (user_id, favorite_user_id)
select normal_user_id, hidden_target_user_id
from _commatch_member_access_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility,
  suspended_at, suspended_until, reason
)
select hidden_target_user_id, 'active', 'hidden', null, null,
  'member access integration test'
from _commatch_member_access_it_config;

select pg_temp._commatch_member_access_set_user(null);

insert into public.likes (user_id, liked_user_id)
select partial_consent_user_id, complete_consent_user_id
from _commatch_member_access_it_config
union all
select indefinite_suspended_user_id, complete_consent_user_id
from _commatch_member_access_it_config
union all
select complete_consent_user_id, premium_user_id
from _commatch_member_access_it_config;

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys
)
select normal_user_id, 'active', pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '1 day',
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations']::text[]
from _commatch_member_access_it_config
union all
select premium_user_id, 'active', pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations']::text[]
from _commatch_member_access_it_config
union all
select premium_no_consent_user_id, 'active', pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations']::text[]
from _commatch_member_access_it_config
union all
select premium_suspended_user_id, 'active', pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '1 day',
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations']::text[]
from _commatch_member_access_it_config;

-- Keep one authenticated fixture without a profile/preferences row so INSERT
-- protection is exercised independently from UPDATE protection.
delete from public.profiles as profile
using _commatch_member_access_it_config as config
where profile.id = config.no_consent_user_id;

-- Consent helper semantics: missing, partial, withdrawn, and obsolete versions
-- are denied; every current required version is accepted.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(no_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'no consent helper denied',
  'select 1 where public.has_completed_required_member_consents()', 0
);
select pg_temp._commatch_member_access_set_user(partial_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'partial consent helper denied',
  'select 1 where public.has_completed_required_member_consents()', 0
);
select pg_temp._commatch_member_access_set_user(withdrawn_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'withdrawn consent helper denied',
  'select 1 where public.has_completed_required_member_consents()', 0
);
select pg_temp._commatch_member_access_set_user(legacy_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'obsolete consent helper denied',
  'select 1 where public.has_completed_required_member_consents()', 0
);
select pg_temp._commatch_member_access_set_user(complete_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'complete consent helper allowed',
  'select 1 where public.has_completed_required_member_consents()', 1
);
select pg_temp._commatch_member_access_set_user(timed_suspended_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'timed current suspension denied by common gate',
  'select 1 where public.is_member_service_allowed()', 0
);
select pg_temp._commatch_member_access_set_user(expired_suspension_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'expired suspension allowed by common gate',
  'select 1 where public.is_member_service_allowed()', 1
);
reset role;

-- A. Incomplete consent blocks all approved member read RPCs.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(no_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'no-event member summaries', '42501',
  'select * from public.get_visible_member_summaries()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'no-event profile insert', '42501',
  $$insert into public.profiles(id, nickname, gender, profile_images)
    values (auth.uid(), '__blocked_profile_insert', '남성', array[]::text[])$$
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'no-event preferences insert', '42501',
  'insert into public.preferences(user_id) values (auth.uid())'
);
select pg_temp._commatch_member_access_set_user(partial_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete member summaries', '42501',
  'select * from public.get_visible_member_summaries()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete member detail', '42501',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', complete_consent_user_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete AI candidates', '42501',
  'select * from public.get_ai_match_candidates()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete favorite members', '42501',
  'select * from public.get_my_favorite_members()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete favorite members with likes', '42501',
  'select * from public.get_my_favorite_members_with_likes()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete match list', '42501',
  'select * from public.get_my_matches()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete match summary', '42501',
  'select * from public.get_my_match_summary()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete message history', '42501',
  (select pg_catalog.format(
    'select * from public.get_match_messages(%L)', incomplete_match_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_affected(
  'incomplete profile update',
  $$update public.profiles set nickname = nickname || '_blocked' where id = auth.uid()$$,
  0
);
select pg_temp._commatch_member_access_expect_affected(
  'incomplete preferences update',
  $$update public.preferences set introduction = '__blocked' where user_id = auth.uid()$$,
  0
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete favorite write', '42501',
  (select pg_catalog.format(
    'insert into public.favorites(user_id, favorite_user_id) values (auth.uid(), %L)',
    normal_user_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct profiles select',
  'select id from public.profiles where id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct preferences select',
  'select user_id from public.preferences where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct favorites select',
  'select id from public.favorites where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct likes select',
  'select id from public.likes where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct matches select',
  'select id from public.matches', 0
);
select pg_temp._commatch_member_access_expect_count(
  'incomplete direct message metadata select',
  'select id, match_id, sender_id, message_type, read_at, created_at, moderation_visibility from public.messages',
  0
);
reset role;

-- B. A currently suspended caller is denied the same reads and existing writes.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(indefinite_suspended_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended member summaries', '42501',
  'select * from public.get_visible_member_summaries()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended member detail', '42501',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', complete_consent_user_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended AI candidates', '42501',
  'select * from public.get_ai_match_candidates()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended favorite members', '42501',
  'select * from public.get_my_favorite_members()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended favorite members with likes', '42501',
  'select * from public.get_my_favorite_members_with_likes()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended match list', '42501', 'select * from public.get_my_matches()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended match summary', '42501',
  'select * from public.get_my_match_summary()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended message history', '42501',
  (select pg_catalog.format(
    'select * from public.get_match_messages(%L)', suspended_match_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended like write remains denied', '42501',
  (select pg_catalog.format(
    'select public.send_member_like(%L)', normal_user_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_affected(
  'suspended profile update remains denied',
  $$update public.profiles set nickname = nickname || '_blocked' where id = auth.uid()$$,
  0
);
select pg_temp._commatch_member_access_expect_affected(
  'suspended preferences update remains denied',
  $$update public.preferences set introduction = '__blocked' where user_id = auth.uid()$$,
  0
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended favorite write remains denied', '42501',
  (select pg_catalog.format(
    'insert into public.favorites(user_id, favorite_user_id) values (auth.uid(), %L)',
    normal_user_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct profiles select',
  'select id from public.profiles where id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct preferences select',
  'select user_id from public.preferences where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct favorites select',
  'select id from public.favorites where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct likes select',
  'select id from public.likes where user_id = auth.uid()', 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct matches select', 'select id from public.matches', 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended direct message metadata select',
  'select id, match_id, sender_id, message_type, read_at, created_at, moderation_visibility from public.messages',
  0
);
reset role;

-- C. UUID detail access matches normal discovery eligibility.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'normal opposite-gender visible detail',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', complete_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'self UUID detail remains denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', normal_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'same-gender UUID detail denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', legacy_consent_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended-visible UUID detail denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', indefinite_suspended_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended-visible member summary denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_summaries() where id = %L',
    indefinite_suspended_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'suspended-visible AI candidate denied',
  (select pg_catalog.format(
    'select * from public.get_ai_match_candidates() where id = %L',
    indefinite_suspended_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'hidden UUID detail remains denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', hidden_target_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'administrator UUID detail remains denied',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)', admin_target_user_id
  ) from _commatch_member_access_it_config), 0
);
select pg_temp._commatch_member_access_expect_count(
  'expired-suspension visible member summary restored',
  (select pg_catalog.format(
    'select * from public.get_visible_member_summaries() where id = %L',
    expired_suspension_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'expired-suspension visible member detail restored',
  (select pg_catalog.format(
    'select * from public.get_visible_member_detail(%L)',
    expired_suspension_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'expired-suspension visible AI candidate restored',
  (select pg_catalog.format(
    'select * from public.get_ai_match_candidates() where id = %L',
    expired_suspension_user_id
  ) from _commatch_member_access_it_config), 1
);
reset role;

-- D. Complete active members retain discovery, match, chat, like, and expired
-- suspension behavior.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'normal member summaries',
  (select pg_catalog.format(
    'select * from public.get_visible_member_summaries() where id = %L',
    complete_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal AI candidates include eligible members',
  (select pg_catalog.format(
    'select * from public.get_ai_match_candidates() where id = %L',
    complete_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal favorite members',
  'select * from public.get_my_favorite_members()', 2
);
select pg_temp._commatch_member_access_expect_count(
  'hidden target remains in legacy favorite member results',
  (select pg_catalog.format(
    'select * from public.get_my_favorite_members() where member_id = %L',
    hidden_target_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal favorite members with likes',
  'select * from public.get_my_favorite_members_with_likes()', 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal match list', 'select * from public.get_my_matches()', 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal match summary', 'select * from public.get_my_match_summary()', 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal message history',
  (select pg_catalog.format(
    'select * from public.get_match_messages(%L)', normal_match_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'normal direct own profile select',
  'select id from public.profiles where id = auth.uid()', 1
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'nonparticipant message access remains denied', '42501',
  (select pg_catalog.format(
    'select * from public.get_match_messages(%L)', incomplete_match_id
  ) from _commatch_member_access_it_config)
);
select pg_temp._commatch_member_access_expect_count(
  'first like succeeds once',
  (select pg_catalog.format(
    'select public.send_member_like(%L)', withdrawn_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'duplicate like call remains idempotent',
  (select pg_catalog.format(
    'select public.send_member_like(%L)', withdrawn_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_expect_count(
  'duplicate like stores one row',
  (select pg_catalog.format(
    'select id from public.likes where user_id = auth.uid() and liked_user_id = %L',
    withdrawn_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
select public.send_member_like(expired_suspension_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_set_user(expired_suspension_user_id)
from _commatch_member_access_it_config;
select public.send_member_like(normal_user_id)
from _commatch_member_access_it_config;
select public.send_member_like(normal_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'reciprocal and duplicate likes create one pair match',
  (select pg_catalog.format(
    'select id from public.matches where user_1_id = least(%L::uuid, %L::uuid) and user_2_id = greatest(%L::uuid, %L::uuid)',
    normal_user_id, expired_suspension_user_id,
    normal_user_id, expired_suspension_user_id
  ) from _commatch_member_access_it_config), 1
);
reset role;

set local role authenticated;
select pg_temp._commatch_member_access_set_user(expired_suspension_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'expired suspension restores access',
  (select pg_catalog.format(
    'select * from public.get_visible_member_summaries() where id = %L',
    normal_user_id
  ) from _commatch_member_access_it_config), 1
);
reset role;

-- E. Premium checks retain their entitlement rules and inherit the common gate.
set local role authenticated;
select pg_temp._commatch_member_access_set_user(premium_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_count(
  'active Premium received likes', 'select * from public.get_received_likes()', 1
);
select pg_temp._commatch_member_access_expect_count(
  'active Premium received favorites', 'select * from public.get_received_favorites()', 1
);
select pg_temp._commatch_member_access_expect_count(
  'active Premium advanced search',
  (select pg_catalog.format(
    'select * from public.search_members_advanced() where id = %L',
    complete_consent_user_id
  ) from _commatch_member_access_it_config), 1
);
select pg_temp._commatch_member_access_set_user(premium_no_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete Premium received likes', '42501',
  'select * from public.get_received_likes()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete Premium received favorites', '42501',
  'select * from public.get_received_favorites()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'incomplete Premium advanced search', '42501',
  'select * from public.search_members_advanced()'
);
select pg_temp._commatch_member_access_set_user(premium_suspended_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended Premium received likes', '42501',
  'select * from public.get_received_likes()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended Premium received favorites', '42501',
  'select * from public.get_received_favorites()'
);
select pg_temp._commatch_member_access_expect_sqlstate(
  'suspended Premium advanced search', '42501',
  'select * from public.search_members_advanced()'
);
select pg_temp._commatch_member_access_set_user(normal_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'expired Premium entitlement remains denied', '42501',
  'select * from public.search_members_advanced()'
);
select pg_temp._commatch_member_access_set_user(complete_consent_user_id)
from _commatch_member_access_it_config;
select pg_temp._commatch_member_access_expect_sqlstate(
  'missing Premium entitlement remains denied', '42501',
  'select * from public.search_members_advanced()'
);
reset role;

-- F. Existing table privileges and matching invariants remain intact.
do $privilege_regression$
begin
  if pg_catalog.has_column_privilege(
       'authenticated', 'public.messages', 'content', 'SELECT'
     ) then
    raise exception 'FAIL authenticated regained messages.content SELECT';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.likes', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.likes', 'DELETE') then
    raise exception 'FAIL authenticated likes INSERT/DELETE privilege changed';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.likes'::pg_catalog.regclass
      and constraint_info.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_info.oid)
        like '%(user_id, liked_user_id)%'
  ) then
    raise exception 'FAIL likes pair uniqueness is missing';
  end if;
  if pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.send_member_like(uuid)'::pg_catalog.regprocedure
       ),
       'public.lock_member_service_write_pair'
     ) = 0
     or pg_catalog.strpos(
       pg_catalog.pg_get_functiondef(
         'public.send_member_like(uuid)'::pg_catalog.regprocedure
       ),
       'on conflict (user_1_id, user_2_id)'
     ) = 0 then
    raise exception 'FAIL send_member_like pair lock or match conflict guard changed';
  end if;
  raise notice 'PASS existing message/likes/matching privilege regression';
end
$privilege_regression$;

-- Every fixture, consent event, restriction, match, message, Premium row, and
-- notification created by the test is reverted here.
select 'PASS member service consent/access guard integration tests; rolling back all fixtures'
  as test_result;

rollback;
