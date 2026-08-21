-- ComMatch launch Premium promotion rollback-safe integration tests.
--
-- Apply launch-premium-promotion-migration.sql first. Run only in a disposable
-- or staging database. Generated Auth/profile/Premium fixtures are rolled back.

begin;

create temporary table _commatch_launch_premium_it_config (
  fixture_name text primary key,
  user_id uuid not null unique
) on commit drop;

insert into _commatch_launch_premium_it_config (fixture_name, user_id)
select fixture_name, pg_catalog.gen_random_uuid()
from pg_catalog.unnest(array[
  'trigger_eligible',
  'backfill_eligible',
  'existing_active',
  'existing_indefinite',
  'existing_partial',
  'existing_revoked',
  'existing_suspended',
  'existing_expired',
  'admin_active',
  'admin_suspended',
  'admin_revoked',
  'unconfirmed',
  'missing_profile',
  'closed_campaign',
  'service_suspended',
  'admin_actor',
  'admin_create_target',
  'admin_override_target',
  'delete_target'
]::text[]) as fixture(fixture_name);

grant select on _commatch_launch_premium_it_config to authenticated;

create function pg_temp._commatch_launch_assert(
  p_label text,
  p_passed boolean,
  p_detail text default ''
)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_passed, false) then
    raise exception 'FAIL %: %', p_label, p_detail;
  end if;
  raise notice 'PASS %', p_label;
end
$function$;

create function pg_temp._commatch_launch_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
end
$function$;

do $preflight$
declare
  v_source_instance_id uuid;
begin
  select auth_user.instance_id
  into v_source_instance_id
  from auth.users as auth_user
  limit 1;

  if v_source_instance_id is null then
    raise exception 'At least one existing Auth user is required to source a disposable instance_id';
  end if;

  if pg_catalog.to_regprocedure(
       'public.grant_launch_premium_membership(uuid,timestamp with time zone)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.grant_launch_premium_after_profile_insert()'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.set_admin_premium_grant_source()'
     ) is null then
    raise exception 'Apply launch-premium-promotion-migration.sql first';
  end if;
end
$preflight$;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  email_confirmed_at,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  fixture.user_id,
  source.instance_id,
  'authenticated',
  'authenticated',
  fixture.fixture_name || '.' || fixture.user_id || '@launch-premium.invalid',
  case
    when fixture.fixture_name in (
      'backfill_eligible',
      'unconfirmed',
      'closed_campaign',
      'admin_create_target'
    ) then null
    else pg_catalog.now()
  end,
  null,
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
from _commatch_launch_premium_it_config as fixture
cross join lateral (
  select auth_user.instance_id
  from auth.users as auth_user
  limit 1
) as source;

insert into public.admin_accounts (
  user_id,
  role,
  status,
  suspended_at,
  revoked_at
)
select
  fixture.user_id,
  case when fixture.fixture_name = 'admin_actor' then 'super_admin' else 'moderator' end,
  case
    when fixture.fixture_name = 'admin_suspended' then 'suspended'
    when fixture.fixture_name = 'admin_revoked' then 'revoked'
    else 'active'
  end,
  case when fixture.fixture_name = 'admin_suspended' then pg_catalog.now() else null end,
  case when fixture.fixture_name = 'admin_revoked' then pg_catalog.now() else null end
from _commatch_launch_premium_it_config as fixture
where fixture.fixture_name in (
  'admin_active',
  'admin_suspended',
  'admin_revoked',
  'admin_actor'
);

-- Install every protected pre-existing state before profile insertion. The
-- profile trigger must observe the row and leave it untouched.
insert into public.premium_memberships (
  user_id,
  status,
  started_at,
  expires_at,
  feature_keys,
  grant_source,
  granted_reason
)
select
  fixture.user_id,
  case
    when fixture.fixture_name = 'existing_revoked' then 'revoked'
    when fixture.fixture_name = 'existing_suspended' then 'suspended'
    else 'active'
  end,
  case
    when fixture.fixture_name = 'existing_expired' then pg_catalog.now() - interval '2 days'
    else pg_catalog.now() - interval '1 day'
  end,
  case
    when fixture.fixture_name = 'existing_expired' then pg_catalog.now()
    when fixture.fixture_name = 'existing_indefinite' then null
    else '2027-06-01 00:00:00+09'::timestamptz
  end,
  case
    when fixture.fixture_name = 'existing_partial'
      then array['likes_received']::text[]
    else array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations',
      'priority_recommendation'
    ]::text[]
  end,
  'legacy',
  'rollback-safe protected fixture'
from _commatch_launch_premium_it_config as fixture
where fixture.fixture_name in (
  'existing_active',
  'existing_indefinite',
  'existing_partial',
  'existing_revoked',
  'existing_suspended',
  'existing_expired'
);

create temporary table _commatch_launch_protected_snapshot on commit drop as
select membership.id, pg_catalog.to_jsonb(membership) as row_data
from public.premium_memberships as membership
join _commatch_launch_premium_it_config as fixture
  on fixture.user_id = membership.user_id
where fixture.fixture_name like 'existing_%';

insert into public.profiles (id, nickname, gender, profile_images)
select
  fixture.user_id,
  '__launch_it_' || fixture.fixture_name || '_' || pg_catalog.left(fixture.user_id::text, 8),
  case when fixture.fixture_name = 'trigger_eligible' then '남성' else '여성' end,
  array[]::text[]
from _commatch_launch_premium_it_config as fixture
where fixture.fixture_name <> 'missing_profile'
  and fixture.fixture_name <> 'admin_actor';

do $trigger_and_exclusion_checks$
declare
  v_trigger_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'trigger_eligible'
  );
begin
  perform pg_temp._commatch_launch_assert(
    'profile insert creates one launch membership',
    (select pg_catalog.count(*) = 1
     from public.premium_memberships where user_id = v_trigger_user)
  );

  perform pg_temp._commatch_launch_assert(
    'launch membership exact contract',
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = v_trigger_user
        and membership.status = 'active'
        and membership.grant_source = 'launch_promotion'
        and membership.started_at < membership.expires_at
        and membership.expires_at = '2027-01-01 00:00:00+09'::timestamptz
        and pg_catalog.cardinality(membership.feature_keys) = 5
        and membership.feature_keys @> array[
          'likes_received',
          'received_likes',
          'advanced_member_search',
          'expanded_recommendations',
          'priority_recommendation'
        ]::text[]
    )
  );

  perform pg_temp._commatch_launch_assert(
    'all administrator states are excluded',
    not exists (
      select 1
      from public.premium_memberships as membership
      join _commatch_launch_premium_it_config as fixture
        on fixture.user_id = membership.user_id
      where fixture.fixture_name in ('admin_active', 'admin_suspended', 'admin_revoked')
    )
  );

  perform pg_temp._commatch_launch_assert(
    'unconfirmed and missing-profile users are excluded',
    not exists (
      select 1
      from public.premium_memberships as membership
      join _commatch_launch_premium_it_config as fixture
        on fixture.user_id = membership.user_id
      where fixture.fixture_name in ('unconfirmed', 'missing_profile')
    )
  );

  perform pg_temp._commatch_launch_assert(
    'all protected existing rows remain byte-for-byte unchanged',
    not exists (
      select 1
      from _commatch_launch_protected_snapshot as snapshot
      left join public.premium_memberships as membership
        on membership.id = snapshot.id
      where membership.id is null
         or pg_catalog.to_jsonb(membership) is distinct from snapshot.row_data
    )
  );

  update public.profiles
  set nickname = nickname || '_updated'
  where id = v_trigger_user;

  perform pg_temp._commatch_launch_assert(
    'profile update does not create another membership',
    (select pg_catalog.count(*) = 1
     from public.premium_memberships where user_id = v_trigger_user)
  );

  perform pg_temp._commatch_launch_assert(
    'duplicate system grant is a no-op',
    not public.grant_launch_premium_membership(v_trigger_user, pg_catalog.now())
  );
end
$trigger_and_exclusion_checks$;

-- Model an eligible existing member whose profile predates confirmation, then
-- invoke the same internal primitive used by the migration backfill.
update auth.users
set email_confirmed_at = pg_catalog.now(), updated_at = pg_catalog.now()
where id = (
  select user_id from _commatch_launch_premium_it_config
  where fixture_name = 'backfill_eligible'
);

do $backfill_and_closed_campaign_checks$
declare
  v_backfill_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'backfill_eligible'
  );
  v_closed_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'closed_campaign'
  );
begin
  if not public.grant_launch_premium_membership(v_backfill_user, pg_catalog.now()) then
    raise exception 'FAIL backfill primitive did not create an eligible membership';
  end if;
  if public.grant_launch_premium_membership(v_backfill_user, pg_catalog.now()) then
    raise exception 'FAIL repeated backfill primitive changed an existing membership';
  end if;

  update auth.users
  set email_confirmed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_closed_user;

  perform pg_temp._commatch_launch_assert(
    'campaign exact end prevents creation',
    not public.grant_launch_premium_membership(
      v_closed_user,
      '2027-01-01 00:00:00+09'::timestamptz
    )
    and not exists (
      select 1 from public.premium_memberships where user_id = v_closed_user
    )
  );
end
$backfill_and_closed_campaign_checks$;

-- Administrator creation and a later explicit override must both transition
-- the current source to admin without bypassing the existing RPC/history path.
create temporary table _commatch_launch_admin_override_snapshot (
  user_id uuid primary key,
  updated_at timestamptz not null,
  started_at timestamptz not null,
  expires_at timestamptz null
) on commit drop;

insert into _commatch_launch_admin_override_snapshot (
  user_id,
  updated_at,
  started_at,
  expires_at
)
select
  membership.user_id,
  membership.updated_at,
  membership.started_at,
  membership.expires_at
from public.premium_memberships as membership
join _commatch_launch_premium_it_config as fixture
  on fixture.user_id = membership.user_id
where fixture.fixture_name = 'admin_override_target';

grant select on _commatch_launch_admin_override_snapshot to authenticated;

select pg_temp._commatch_launch_assert(
  'administrator override snapshot captures one membership',
  (select pg_catalog.count(*) = 1
   from _commatch_launch_admin_override_snapshot)
);

update auth.users
set email_confirmed_at = pg_catalog.now(), updated_at = pg_catalog.now()
where id = (
  select user_id from _commatch_launch_premium_it_config
  where fixture_name = 'admin_create_target'
);

set local role authenticated;
select pg_temp._commatch_launch_set_user(
  (select user_id from _commatch_launch_premium_it_config where fixture_name = 'admin_actor')
);

select *
from public.update_admin_premium_membership(
  (select user_id from _commatch_launch_premium_it_config where fixture_name = 'admin_create_target'),
  null,
  'active',
  pg_catalog.now(),
  '2027-06-01 00:00:00+09'::timestamptz,
  array[
    'likes_received',
    'received_likes',
    'advanced_member_search',
    'expanded_recommendations',
    'priority_recommendation'
  ]::text[],
  'rollback-safe administrator grant source test',
  pg_catalog.gen_random_uuid()
);

select *
from public.update_admin_premium_membership(
  (select user_id from _commatch_launch_premium_it_config where fixture_name = 'admin_override_target'),
  (
    select snapshot.updated_at
    from _commatch_launch_admin_override_snapshot as snapshot
  ),
  'revoked',
  (
    select snapshot.started_at
    from _commatch_launch_admin_override_snapshot as snapshot
  ),
  (
    select snapshot.expires_at
    from _commatch_launch_admin_override_snapshot as snapshot
  ),
  array[
    'likes_received',
    'received_likes',
    'advanced_member_search',
    'expanded_recommendations',
    'priority_recommendation'
  ]::text[],
  'rollback-safe administrator revoke source test',
  pg_catalog.gen_random_uuid()
);

reset role;

do $admin_source_checks$
declare
  v_create_target uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'admin_create_target'
  );
  v_override_target uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'admin_override_target'
  );
begin
  perform pg_temp._commatch_launch_assert(
    'administrator grant source is admin',
    exists (
      select 1 from public.premium_memberships
      where user_id = v_create_target and grant_source = 'admin'
    )
  );
  perform pg_temp._commatch_launch_assert(
    'administrator override source and revoked state are preserved',
    exists (
      select 1 from public.premium_memberships
      where user_id = v_override_target
        and grant_source = 'admin'
        and status = 'revoked'
    )
    and not public.grant_launch_premium_membership(v_override_target, pg_catalog.now())
    and exists (
      select 1 from public.premium_memberships
      where user_id = v_override_target
        and grant_source = 'admin'
        and status = 'revoked'
    )
  );
  perform pg_temp._commatch_launch_assert(
    'administrator actions remain recorded',
    (select pg_catalog.count(*) = 2
     from public.premium_membership_actions as action
     where action.subject_user_id in (v_create_target, v_override_target))
  );
end
$admin_source_checks$;

do $access_and_service_checks$
declare
  v_trigger_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'trigger_eligible'
  );
  v_expired_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'existing_expired'
  );
  v_service_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'service_suspended'
  );
  v_key text;
begin
  perform pg_temp._commatch_launch_set_user(v_trigger_user);
  foreach v_key in array array[
    'likes_received',
    'received_likes',
    'advanced_member_search',
    'expanded_recommendations',
    'priority_recommendation'
  ]::text[] loop
    if not public.has_premium_feature(v_key) then
      raise exception 'FAIL active launch membership denied key %', v_key;
    end if;
  end loop;
  raise notice 'PASS all five launch keys are accessible before expiration';

  perform pg_temp._commatch_launch_set_user(v_expired_user);
  perform pg_temp._commatch_launch_assert(
    'access is false at the exact exclusive expiration timestamp',
    not public.has_premium_feature('likes_received')
  );

  insert into public.member_restrictions (
    user_id,
    account_status,
    profile_visibility,
    suspended_at,
    suspended_until,
    reason
  ) values (
    v_service_user,
    'suspended',
    'visible',
    pg_catalog.now(),
    null,
    'rollback-safe launch Premium service restriction test'
  );
  perform pg_temp._commatch_launch_set_user(v_service_user);
  perform pg_temp._commatch_launch_assert(
    'service restriction remains independent and takes precedence',
    public.has_premium_feature('likes_received')
    and not public.is_member_service_allowed()
  );
end
$access_and_service_checks$;

do $security_checks$
declare
  v_system_function oid := 'public.grant_launch_premium_membership(uuid,timestamp with time zone)'::pg_catalog.regprocedure;
begin
  perform pg_temp._commatch_launch_assert(
    'internal system grant has no client or service execute ACL',
    not pg_catalog.has_function_privilege('anon', v_system_function, 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', v_system_function, 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', v_system_function, 'EXECUTE')
  );
end
$security_checks$;

do $auth_delete_cascade$
declare
  v_delete_user uuid := (
    select user_id from _commatch_launch_premium_it_config
    where fixture_name = 'delete_target'
  );
begin
  if not exists (
    select 1 from public.premium_memberships where user_id = v_delete_user
  ) then
    raise exception 'FAIL delete target did not receive launch Premium';
  end if;

  delete from public.profiles where id = v_delete_user;

  if not exists (
    select 1 from public.premium_memberships where user_id = v_delete_user
  ) then
    raise exception 'FAIL profile deletion unexpectedly removed Premium before Auth deletion';
  end if;

  delete from auth.users where id = v_delete_user;

  perform pg_temp._commatch_launch_assert(
    'Auth deletion keeps Premium FK cascade',
    not exists (
      select 1 from public.premium_memberships where user_id = v_delete_user
    )
  );
end
$auth_delete_cascade$;

rollback;
