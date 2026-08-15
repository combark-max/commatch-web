-- ComMatch priority recommendation formal Premium SQL integration tests.
--
-- Apply priority-recommendation-premium-migration.sql first. Replace the
-- administrator UUID and confirmation token with a disposable non-production
-- fixture. Generated member fixtures and all writes are rolled back.

begin;

create temporary table _commatch_priority_it_config (
  super_admin_id uuid,
  fixture_confirmation text,
  viewer_id uuid not null,
  active_priority_id uuid not null,
  active_without_priority_id uuid not null,
  expired_priority_id uuid not null,
  suspended_priority_id uuid not null,
  revoked_priority_id uuid not null,
  future_priority_id uuid not null,
  service_suspended_priority_id uuid not null,
  pilot_only_id uuid not null,
  admin_target_id uuid not null,
  grant_request_id uuid not null,
  revoke_request_id uuid not null
) on commit drop;

insert into _commatch_priority_it_config values (
  nullif('PASTE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION'),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
);

grant select on _commatch_priority_it_config to authenticated;

do $preflight$
declare
  v_config _commatch_priority_it_config%rowtype;
begin
  select * into v_config from _commatch_priority_it_config;
  if v_config.super_admin_id is null then
    raise exception 'Replace PASTE_SUPER_ADMIN_USER_ID';
  end if;
  if v_config.fixture_confirmation is distinct from
       'CONFIRMED_DISPOSABLE_NON_PRODUCTION_ADMIN' then
    raise exception 'Replace PASTE_TEST_FIXTURE_CONFIRMATION with the required token';
  end if;
  if v_config.grant_request_id = v_config.revoke_request_id then
    raise exception 'Grant and revoke request UUIDs must be distinct';
  end if;
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_config.super_admin_id
      and admin_account.role = 'super_admin'
      and admin_account.status = 'active'
  ) then
    raise exception 'Configured administrator is not an active super administrator';
  end if;
  if pg_catalog.obj_description(
       'public.get_ai_match_candidates()'::pg_catalog.regprocedure,
       'pg_proc'
     ) is distinct from 'commatch_priority_recommendation_membership_v1' then
    raise exception 'Formal priority recommendation migration is not installed';
  end if;
end
$preflight$;

create function pg_temp._commatch_priority_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end
$function$;

create function pg_temp._commatch_priority_it_expect_sqlstate(
  p_label text,
  p_expected_sqlstate text,
  p_statement text
)
returns void
language plpgsql
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

insert into auth.users (
  id, instance_id, aud, role, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select fixture.user_id, source.instance_id, 'authenticated', 'authenticated', null,
  '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from _commatch_priority_it_config as config
cross join lateral (
  values
    (config.viewer_id, 0),
    (config.active_priority_id, 1),
    (config.active_without_priority_id, 2),
    (config.expired_priority_id, 3),
    (config.suspended_priority_id, 4),
    (config.revoked_priority_id, 5),
    (config.future_priority_id, 6),
    (config.service_suspended_priority_id, 7),
    (config.pilot_only_id, 8),
    (config.admin_target_id, 9)
) as fixture(user_id, position)
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  where auth_user.id = config.super_admin_id
) as source;

insert into public.profiles (id, nickname, gender, profile_images)
select fixture.user_id,
  '__priority_it_' || fixture.position || '_' || pg_catalog.left(fixture.user_id::text, 8),
  case when fixture.position = 0 then '남성' else '여성' end,
  array[]::text[]
from _commatch_priority_it_config as config
cross join lateral (
  values
    (config.viewer_id, 0),
    (config.active_priority_id, 1),
    (config.active_without_priority_id, 2),
    (config.expired_priority_id, 3),
    (config.suspended_priority_id, 4),
    (config.revoked_priority_id, 5),
    (config.future_priority_id, 6),
    (config.service_suspended_priority_id, 7),
    (config.pilot_only_id, 8),
    (config.admin_target_id, 9)
) as fixture(user_id, position);

-- Existing four-key rows, the standalone new key, and all five keys remain valid.
insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys
)
select active_without_priority_id, 'active', pg_catalog.now() - interval '1 hour', null,
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations']::text[]
from _commatch_priority_it_config
union all
select active_priority_id, 'active', pg_catalog.now() - interval '1 hour', null,
  array['likes_received','received_likes','advanced_member_search','expanded_recommendations','priority_recommendation']::text[]
from _commatch_priority_it_config
union all
select expired_priority_id, 'active', pg_catalog.now() - interval '2 days', pg_catalog.now() - interval '1 day',
  array['priority_recommendation']::text[]
from _commatch_priority_it_config
union all
select suspended_priority_id, 'suspended', pg_catalog.now() - interval '1 hour', null,
  array['priority_recommendation']::text[]
from _commatch_priority_it_config
union all
select revoked_priority_id, 'revoked', pg_catalog.now() - interval '1 hour', null,
  array['priority_recommendation']::text[]
from _commatch_priority_it_config
union all
select future_priority_id, 'active', pg_catalog.now() + interval '1 day', pg_catalog.now() + interval '2 days',
  array['priority_recommendation']::text[]
from _commatch_priority_it_config
union all
select service_suspended_priority_id, 'active', pg_catalog.now() - interval '1 hour', null,
  array['priority_recommendation']::text[]
from _commatch_priority_it_config;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select service_suspended_priority_id, 'suspended', 'visible',
  pg_catalog.now() - interval '1 hour', null, 'rollback priority fixture'
from _commatch_priority_it_config;

insert into public.premium_feature_access (
  user_id, feature_key, starts_at, ends_at, is_active
)
select pilot_only_id, 'priority_recommendation',
  pg_catalog.now() - interval '1 hour', pg_catalog.now() + interval '1 day', true
from _commatch_priority_it_config;

do $valid_key_contract$
begin
  if not exists (
    select 1 from public.premium_memberships
    where pg_catalog.cardinality(feature_keys) = 4
      and not ('priority_recommendation' = any(feature_keys))
  ) or not exists (
    select 1 from public.premium_memberships
    where feature_keys = array['priority_recommendation']::text[]
  ) or not exists (
    select 1 from public.premium_memberships
    where pg_catalog.cardinality(feature_keys) = 5
      and 'priority_recommendation' = any(feature_keys)
  ) then
    raise exception 'FAIL valid four-key, standalone priority, or five-key membership contract';
  end if;
  raise notice 'PASS valid four-key, standalone priority, and five-key memberships';
end
$valid_key_contract$;

select pg_temp._commatch_priority_it_expect_sqlstate(
  'unknown membership key', '23514',
  pg_catalog.format(
    'insert into public.premium_memberships(user_id,status,feature_keys) values (%L,''active'',array[''not_a_feature'']::text[])',
    (select admin_target_id from _commatch_priority_it_config)
  )
);
select pg_temp._commatch_priority_it_expect_sqlstate(
  'duplicate membership key', '23514',
  pg_catalog.format(
    'insert into public.premium_memberships(user_id,status,feature_keys) values (%L,''active'',array[''priority_recommendation'',''priority_recommendation'']::text[])',
    (select admin_target_id from _commatch_priority_it_config)
  )
);
select pg_temp._commatch_priority_it_expect_sqlstate(
  'six membership keys', '23514',
  pg_catalog.format(
    'insert into public.premium_memberships(user_id,status,feature_keys) values (%L,''active'',array[''likes_received'',''received_likes'',''advanced_member_search'',''expanded_recommendations'',''priority_recommendation'',''not_a_feature'']::text[])',
    (select admin_target_id from _commatch_priority_it_config)
  )
);

-- Administrator grant and revoke must persist the new key in action/receipt snapshots.
set local role authenticated;
select pg_temp._commatch_priority_it_set_user(super_admin_id)
from _commatch_priority_it_config;
do $admin_contract$
declare
  v_config _commatch_priority_it_config%rowtype;
  v_grant record;
  v_revoke record;
begin
  select * into v_config from _commatch_priority_it_config;
  select * into v_grant
  from public.update_admin_premium_membership(
    v_config.admin_target_id, null, 'active', pg_catalog.now(), null,
    array['priority_recommendation'], 'priority grant test', v_config.grant_request_id
  );
  if v_grant.action_type <> 'granted'
     or v_grant.feature_keys <> array['priority_recommendation']::text[] then
    raise exception 'FAIL administrator priority grant';
  end if;

  select * into v_revoke
  from public.update_admin_premium_membership(
    v_config.admin_target_id, v_grant.membership_updated_at, 'revoked',
    v_grant.started_at, null, v_grant.feature_keys,
    'priority revoke test', v_config.revoke_request_id
  );
  if v_revoke.action_type <> 'revoked' or v_revoke.stored_status <> 'revoked' then
    raise exception 'FAIL administrator priority revoke';
  end if;
  raise notice 'PASS administrator priority grant and revoke';
end
$admin_contract$;
reset role;

do $snapshot_contract$
declare
  v_config _commatch_priority_it_config%rowtype;
begin
  select * into v_config from _commatch_priority_it_config;
  if not exists (
    select 1 from public.premium_membership_actions
    where request_id = v_config.grant_request_id
      and new_feature_keys = array['priority_recommendation']::text[]
  ) or not exists (
    select 1 from public.premium_membership_request_receipts
    where request_id = v_config.grant_request_id
      and feature_keys = array['priority_recommendation']::text[]
  ) or not exists (
    select 1 from public.premium_membership_actions
    where request_id = v_config.revoke_request_id
      and new_feature_keys = array['priority_recommendation']::text[]
  ) then
    raise exception 'FAIL action or receipt priority snapshot';
  end if;
  raise notice 'PASS action and receipt priority snapshots';
end
$snapshot_contract$;

-- Member-facing entitlement evaluation follows the same membership lifecycle.
set local role authenticated;
do $member_feature_contract$
declare
  v_config _commatch_priority_it_config%rowtype;
begin
  select * into v_config from _commatch_priority_it_config;

  perform pg_temp._commatch_priority_it_set_user(v_config.active_priority_id);
  if not public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL active priority entitlement';
  end if;

  perform pg_temp._commatch_priority_it_set_user(v_config.active_without_priority_id);
  if public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL missing priority key entitlement';
  end if;

  perform pg_temp._commatch_priority_it_set_user(v_config.expired_priority_id);
  if public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL expired priority entitlement';
  end if;

  perform pg_temp._commatch_priority_it_set_user(v_config.suspended_priority_id);
  if public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL suspended priority entitlement';
  end if;

  perform pg_temp._commatch_priority_it_set_user(v_config.revoked_priority_id);
  if public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL revoked priority entitlement';
  end if;

  perform pg_temp._commatch_priority_it_set_user(v_config.future_priority_id);
  if public.has_premium_feature('priority_recommendation') then
    raise exception 'FAIL not-started priority entitlement';
  end if;

  raise notice 'PASS member priority entitlement lifecycle';
end
$member_feature_contract$;
reset role;

-- Candidate priority is membership-derived; legacy pilot access cannot enable it.
set local role authenticated;
select pg_temp._commatch_priority_it_set_user(viewer_id)
from _commatch_priority_it_config;
do $candidate_contract$
declare
  v_config _commatch_priority_it_config%rowtype;
begin
  select * into v_config from _commatch_priority_it_config;
  if not exists (
    select 1 from public.get_ai_match_candidates()
    where id = v_config.active_priority_id and is_priority_recommendation
  ) then
    raise exception 'FAIL active priority membership was not prioritized';
  end if;
  if exists (
    select 1 from public.get_ai_match_candidates()
    where id in (
      v_config.active_without_priority_id,
      v_config.expired_priority_id,
      v_config.suspended_priority_id,
      v_config.revoked_priority_id,
      v_config.future_priority_id,
      v_config.pilot_only_id,
      v_config.admin_target_id
    ) and is_priority_recommendation
  ) then
    raise exception 'FAIL invalid membership state, missing key, or pilot data enabled priority';
  end if;
  if exists (
    select 1 from public.get_ai_match_candidates()
    where id = v_config.service_suspended_priority_id
  ) then
    raise exception 'FAIL service-suspended candidate remained eligible';
  end if;
  raise notice 'PASS membership priority states, pilot separation, and service suspension exclusion';
end
$candidate_contract$;
reset role;

do $legacy_acl$
begin
  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.get_priority_recommendation_candidate_ids()',
       'EXECUTE'
     ) then
    raise exception 'FAIL authenticated can execute legacy pilot helper';
  end if;
  raise notice 'PASS legacy pilot helper is separated from member access';
end
$legacy_acl$;

select 'PASS priority recommendation formal Premium integration tests; rolling back fixtures' as test_result;

rollback;
