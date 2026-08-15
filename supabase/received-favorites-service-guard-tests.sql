-- Rollback-safe integration tests for the guarded Premium received favorites RPC.
-- Apply received-favorites-service-guard.sql first, then replace the four
-- placeholders with distinct disposable Auth users that already have profiles.

begin;

create temp table _commatch_received_favorites_it_config (
  premium_user_id uuid,
  standard_user_id uuid,
  expired_user_id uuid,
  inactive_user_id uuid,
  older_favorite_id uuid not null,
  newer_favorite_id uuid not null,
  reciprocal_favorite_id uuid not null,
  match_id uuid not null,
  older_created_at timestamptz not null,
  newer_created_at timestamptz not null,
  standard_nickname text,
  standard_birth_date text,
  standard_region text,
  standard_job text,
  standard_profile_image text,
  standard_profile_images text[],
  expired_nickname text,
  expired_birth_date text,
  expired_region text,
  expired_job text,
  expired_profile_image text,
  expired_profile_images text[]
) on commit drop;

insert into _commatch_received_favorites_it_config (
  premium_user_id,
  standard_user_id,
  expired_user_id,
  inactive_user_id,
  older_favorite_id,
  newer_favorite_id,
  reciprocal_favorite_id,
  match_id,
  older_created_at,
  newer_created_at
) values (
  nullif('PASTE_PREMIUM_USER_ID', 'PASTE_' || 'PREMIUM_USER_ID')::uuid,
  nullif('PASTE_STANDARD_USER_ID', 'PASTE_' || 'STANDARD_USER_ID')::uuid,
  nullif('PASTE_EXPIRED_USER_ID', 'PASTE_' || 'EXPIRED_USER_ID')::uuid,
  nullif('PASTE_INACTIVE_USER_ID', 'PASTE_' || 'INACTIVE_USER_ID')::uuid,
  '00000000-0000-4000-8000-00000000f101'::uuid,
  '00000000-0000-4000-8000-00000000f102'::uuid,
  '00000000-0000-4000-8000-00000000f103'::uuid,
  '00000000-0000-4000-8000-00000000f104'::uuid,
  pg_catalog.now() - interval '2 hours',
  pg_catalog.now() - interval '1 hour'
);

grant select on _commatch_received_favorites_it_config to authenticated;

create function pg_temp._commatch_received_favorites_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text end,
    true
  );
end
$function$;

create function pg_temp._commatch_received_favorites_expect_42501(
  p_label text,
  p_sql text,
  p_expected_message text default 'Premium feature access required'
)
returns void
language plpgsql
as $function$
declare
  v_message text;
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_message = message_text;
      if v_message <> p_expected_message then
        raise exception 'FAIL %: expected message %, got %', p_label, p_expected_message, v_message;
      end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_received_favorites_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_received_favorites_expect_42501(text, text, text)
  to authenticated;

do $preflight$
declare
  v_ids uuid[];
  v_fixture_ids uuid[];
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_received_favorites()');
begin
  select
    array[premium_user_id, standard_user_id, expired_user_id, inactive_user_id],
    array[older_favorite_id, newer_favorite_id, reciprocal_favorite_id, match_id]
  into v_ids, v_fixture_ids
  from _commatch_received_favorites_it_config;

  if pg_catalog.array_position(v_ids, null) is not null
     or pg_catalog.cardinality(v_ids) <> (
       select pg_catalog.count(distinct fixture.user_id)
       from pg_catalog.unnest(v_ids) as fixture(user_id)
     ) then
    raise exception 'Replace all PASTE_* values with four distinct disposable member IDs';
  end if;

  if (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 4
     or (select pg_catalog.count(*) from public.profiles where id = any(v_ids)) <> 4 then
    raise exception 'All fixture IDs must identify Auth users with profiles';
  end if;

  if v_function_oid is null
     or pg_catalog.obj_description(v_function_oid, 'pg_proc') <>
       'Returns received favorites for auth.uid() with member service and Premium feature access' then
    raise exception 'Apply received-favorites-service-guard.sql first';
  end if;

  if exists (select 1 from public.favorites where id = any(v_fixture_ids))
     or exists (select 1 from public.matches where id = any(v_fixture_ids)) then
    raise exception 'Reserved received favorites fixture IDs already exist';
  end if;
end
$preflight$;

update _commatch_received_favorites_it_config as config
set standard_nickname = standard_profile.nickname,
    standard_birth_date = standard_profile.birth_date::text,
    standard_region = standard_profile.region,
    standard_job = standard_profile.job,
    standard_profile_image = standard_profile.profile_image,
    standard_profile_images = standard_profile.profile_images,
    expired_nickname = expired_profile.nickname,
    expired_birth_date = expired_profile.birth_date::text,
    expired_region = expired_profile.region,
    expired_job = expired_profile.job,
    expired_profile_image = expired_profile.profile_image,
    expired_profile_images = expired_profile.profile_images
from public.profiles as standard_profile,
  public.profiles as expired_profile
where standard_profile.id = config.standard_user_id
  and expired_profile.id = config.expired_user_id;

delete from public.matches as match_row
using _commatch_received_favorites_it_config as config
where (
  match_row.user_1_id = least(config.premium_user_id, config.standard_user_id)
  and match_row.user_2_id = greatest(config.premium_user_id, config.standard_user_id)
) or (
  match_row.user_1_id = least(config.premium_user_id, config.expired_user_id)
  and match_row.user_2_id = greatest(config.premium_user_id, config.expired_user_id)
);

delete from public.favorites as favorite_row
using _commatch_received_favorites_it_config as config
where favorite_row.user_id in (
    config.premium_user_id,
    config.standard_user_id,
    config.expired_user_id,
    config.inactive_user_id
  )
   or favorite_row.favorite_user_id in (
    config.premium_user_id,
    config.standard_user_id,
    config.expired_user_id,
    config.inactive_user_id
  );

delete from public.member_restrictions as restriction
using _commatch_received_favorites_it_config as config
where restriction.user_id in (
  config.premium_user_id,
  config.standard_user_id,
  config.expired_user_id,
  config.inactive_user_id
);

delete from public.premium_memberships as membership
using _commatch_received_favorites_it_config as config
where membership.user_id in (
  config.premium_user_id,
  config.standard_user_id,
  config.expired_user_id,
  config.inactive_user_id
);

-- Exercise the real favorite visibility trigger and INSERT policy as each sender.
set local role authenticated;
select pg_temp._commatch_received_favorites_set_user(standard_user_id)
from _commatch_received_favorites_it_config;
insert into public.favorites (id, user_id, favorite_user_id, created_at)
select older_favorite_id, standard_user_id, premium_user_id, older_created_at
from _commatch_received_favorites_it_config;

select pg_temp._commatch_received_favorites_set_user(expired_user_id)
from _commatch_received_favorites_it_config;
insert into public.favorites (id, user_id, favorite_user_id, created_at)
select newer_favorite_id, expired_user_id, premium_user_id, newer_created_at
from _commatch_received_favorites_it_config;

select pg_temp._commatch_received_favorites_set_user(premium_user_id)
from _commatch_received_favorites_it_config;
insert into public.favorites (id, user_id, favorite_user_id, created_at)
select reciprocal_favorite_id, premium_user_id, standard_user_id, newer_created_at
from _commatch_received_favorites_it_config;
reset role;

-- The reciprocal fixture may create a match through the existing trigger.
delete from public.matches as match_row
using _commatch_received_favorites_it_config as config
where match_row.user_1_id = least(config.premium_user_id, config.standard_user_id)
  and match_row.user_2_id = greatest(config.premium_user_id, config.standard_user_id);

insert into public.matches (id, user_1_id, user_2_id, status)
select match_id, least(premium_user_id, standard_user_id),
  greatest(premium_user_id, standard_user_id), 'active'
from _commatch_received_favorites_it_config;

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys, granted_reason, status_reason
)
select premium_user_id, 'active', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day', array['likes_received']::text[],
  'received favorites integration test', 'received favorites integration test'
from _commatch_received_favorites_it_config
union all
select expired_user_id, 'active', pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '1 day', array['likes_received']::text[],
  'received favorites integration test', 'received favorites integration test'
from _commatch_received_favorites_it_config
union all
select inactive_user_id, 'suspended', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day', array['likes_received']::text[],
  'received favorites integration test', 'received favorites integration test'
from _commatch_received_favorites_it_config;

-- The function has no receiver parameter and preserves its metadata and ACL.
do $security_contract$
declare
  v_function_oid oid := 'public.get_received_favorites()'::pg_catalog.regprocedure;
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_received_favorites'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = v_function_oid
      and function_info.pronargs = 0
      and pg_catalog.pg_get_function_identity_arguments(function_info.oid) = ''
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)'
      and pg_catalog.strpos(pg_catalog.lower(function_info.prosrc), 'auth.uid()') > 0
  )
     or pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'FAIL get_received_favorites metadata, zero-argument identity, or ACL';
  end if;
end
$security_contract$;

set local role authenticated;

-- Active Premium access succeeds and preserves fields, relationships, and order.
select pg_temp._commatch_received_favorites_set_user(premium_user_id)
from _commatch_received_favorites_it_config;
do $active_premium_result$
declare
  v_config _commatch_received_favorites_it_config%rowtype;
  v_row record;
  v_position integer := 0;
begin
  select * into v_config from _commatch_received_favorites_it_config;

  for v_row in select * from public.get_received_favorites()
  loop
    v_position := v_position + 1;

    if v_position = 1 and (
      v_row.favorite_id <> v_config.newer_favorite_id
      or v_row.sender_user_id <> v_config.expired_user_id
      or v_row.created_at <> v_config.newer_created_at
      or v_row.nickname is distinct from v_config.expired_nickname
      or v_row.birth_date is distinct from v_config.expired_birth_date
      or v_row.region is distinct from v_config.expired_region
      or v_row.job is distinct from v_config.expired_job
      or v_row.profile_image is distinct from v_config.expired_profile_image
      or v_row.profile_images is distinct from v_config.expired_profile_images
      or v_row.is_mutual
      or v_row.match_id is not null
      or v_row.match_status is not null
    ) then
      raise exception 'FAIL newer received favorite fields or ordering';
    end if;

    if v_position = 2 and (
      v_row.favorite_id <> v_config.older_favorite_id
      or v_row.sender_user_id <> v_config.standard_user_id
      or v_row.created_at <> v_config.older_created_at
      or v_row.nickname is distinct from v_config.standard_nickname
      or v_row.birth_date is distinct from v_config.standard_birth_date
      or v_row.region is distinct from v_config.standard_region
      or v_row.job is distinct from v_config.standard_job
      or v_row.profile_image is distinct from v_config.standard_profile_image
      or v_row.profile_images is distinct from v_config.standard_profile_images
      or not v_row.is_mutual
      or v_row.match_id is distinct from v_config.match_id
      or v_row.match_status <> 'active'
    ) then
      raise exception 'FAIL older received favorite profile, mutual, or match fields';
    end if;
  end loop;

  if v_position <> 2 then
    raise exception 'FAIL expected two received favorites, got %', v_position;
  end if;
end
$active_premium_result$;

-- A standard member has no entitlement.
select pg_temp._commatch_received_favorites_set_user(standard_user_id)
from _commatch_received_favorites_it_config;
select pg_temp._commatch_received_favorites_expect_42501(
  'standard member', 'select * from public.get_received_favorites()'
);

-- An expired Premium membership has no entitlement.
select pg_temp._commatch_received_favorites_set_user(expired_user_id)
from _commatch_received_favorites_it_config;
select pg_temp._commatch_received_favorites_expect_42501(
  'expired Premium member', 'select * from public.get_received_favorites()'
);

-- Suspended and revoked Premium membership states both have no entitlement.
select pg_temp._commatch_received_favorites_set_user(inactive_user_id)
from _commatch_received_favorites_it_config;
select pg_temp._commatch_received_favorites_expect_42501(
  'suspended Premium membership', 'select * from public.get_received_favorites()'
);

reset role;
update public.premium_memberships as membership
set status = 'revoked', status_changed_at = pg_catalog.now()
from _commatch_received_favorites_it_config as config
where membership.user_id = config.inactive_user_id;
set local role authenticated;
select pg_temp._commatch_received_favorites_set_user(inactive_user_id)
from _commatch_received_favorites_it_config;
select pg_temp._commatch_received_favorites_expect_42501(
  'revoked Premium membership', 'select * from public.get_received_favorites()'
);

-- A valid likes_received entitlement never bypasses a member-service suspension.
reset role;
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select premium_user_id, 'suspended', 'visible', pg_catalog.now(), null,
  'received favorites service guard integration test'
from _commatch_received_favorites_it_config;
set local role authenticated;
select pg_temp._commatch_received_favorites_set_user(premium_user_id)
from _commatch_received_favorites_it_config;
select pg_temp._commatch_received_favorites_expect_42501(
  'service-suspended Premium member',
  'select * from public.get_received_favorites()',
  'Member service access is not allowed'
);

reset role;
rollback;

do $rollback_verification$
begin
  if exists (
    select 1 from public.favorites
    where id in (
      '00000000-0000-4000-8000-00000000f101'::uuid,
      '00000000-0000-4000-8000-00000000f102'::uuid,
      '00000000-0000-4000-8000-00000000f103'::uuid
    )
  ) or exists (
    select 1 from public.matches
    where id = '00000000-0000-4000-8000-00000000f104'::uuid
  ) then
    raise exception 'FAIL rollback left received favorites fixture rows behind';
  end if;
end
$rollback_verification$;

select 'PASS received favorites service guard integration tests' as test_result;
