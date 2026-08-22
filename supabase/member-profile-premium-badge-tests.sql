-- Rollback-safe integration tests for the public member-profile Premium badge.
-- Apply member-profile-premium-badge.sql first, then replace both placeholders
-- with distinct disposable Auth users that already have profiles.

begin;

create temp table _commatch_profile_badge_it_config (
  viewer_user_id uuid,
  target_user_id uuid
) on commit drop;

insert into _commatch_profile_badge_it_config values (
  nullif('PASTE_VIEWER_USER_ID', 'PASTE_' || 'VIEWER_USER_ID')::uuid,
  nullif('PASTE_TARGET_USER_ID', 'PASTE_' || 'TARGET_USER_ID')::uuid
);

grant select on _commatch_profile_badge_it_config to authenticated;

create temp table _commatch_profile_badge_it_baseline on commit drop as
select
  profile.id,
  profile.nickname,
  profile.birth_date::text as birth_date,
  profile.gender,
  profile.height,
  profile.job,
  profile.region,
  profile.introduction,
  profile.education,
  profile.hobby,
  profile.drinking,
  profile.smoking,
  profile.marriage_history,
  profile.marriage_values,
  profile.profile_image,
  profile.profile_images
from public.profiles as profile
where profile.id = (
  select target_user_id from _commatch_profile_badge_it_config
);

grant select on _commatch_profile_badge_it_baseline to authenticated;

create function pg_temp._commatch_profile_badge_it_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object(
        'sub', p_user_id::text,
        'role', 'authenticated'
      )::text
    end,
    true
  );
end
$function$;

create function pg_temp._commatch_profile_badge_it_assert(
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

grant execute on function pg_temp._commatch_profile_badge_it_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_profile_badge_it_assert(text, boolean)
  to authenticated;

do $preflight$
declare
  v_ids uuid[];
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_visible_member_detail(uuid)'
  );
begin
  select array[viewer_user_id, target_user_id]
  into v_ids
  from _commatch_profile_badge_it_config;

  if pg_catalog.array_position(v_ids, null) is not null
     or v_ids[1] = v_ids[2] then
    raise exception 'Replace both PASTE_* values with distinct disposable member IDs';
  end if;

  if (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 2
     or (select pg_catalog.count(*) from public.profiles where id = any(v_ids)) <> 2
     or (select pg_catalog.count(*) from _commatch_profile_badge_it_baseline) <> 1 then
    raise exception 'Both fixture IDs must identify Auth users with profiles';
  end if;

  if v_function_oid is null
     or pg_catalog.obj_description(v_function_oid, 'pg_proc') <>
       'commatch_member_profile_premium_badge_v1'
     or pg_catalog.pg_get_function_result(v_function_oid) <>
       'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)' then
    raise exception 'Apply member-profile-premium-badge.sql first';
  end if;
end
$preflight$;

delete from public.member_restrictions as restriction
where restriction.user_id = (
  select target_user_id from _commatch_profile_badge_it_config
);

delete from public.premium_memberships as membership
where membership.user_id = (
  select target_user_id from _commatch_profile_badge_it_config
);

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;

select pg_temp._commatch_profile_badge_it_assert(
  'existing public profile fields are preserved and no membership is not Premium',
  (
    select pg_catalog.count(*) = 1
      and pg_catalog.bool_and(
        detail.id = baseline.id
        and detail.nickname is not distinct from baseline.nickname
        and detail.birth_date is not distinct from baseline.birth_date
        and detail.gender is not distinct from baseline.gender
        and detail.height is not distinct from baseline.height
        and detail.job is not distinct from baseline.job
        and detail.region is not distinct from baseline.region
        and detail.introduction is not distinct from baseline.introduction
        and detail.education is not distinct from baseline.education
        and detail.hobby is not distinct from baseline.hobby
        and detail.drinking is not distinct from baseline.drinking
        and detail.smoking is not distinct from baseline.smoking
        and detail.marriage_history is not distinct from baseline.marriage_history
        and detail.marriage_values is not distinct from baseline.marriage_values
        and detail.profile_image is not distinct from baseline.profile_image
        and detail.profile_images is not distinct from baseline.profile_images
        and not detail.is_premium_available
      )
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    ) as detail
    cross join _commatch_profile_badge_it_baseline as baseline
  )
);

reset role;

insert into public.premium_memberships (
  user_id,
  status,
  started_at,
  expires_at,
  feature_keys,
  granted_reason,
  status_reason
)
select
  target_user_id,
  'active',
  pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day',
  array['likes_received']::text[],
  'member profile Premium badge integration test',
  'member profile Premium badge integration test'
from _commatch_profile_badge_it_config;

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'active current Premium membership returns true',
  (
    select is_premium_available
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);
select pg_temp._commatch_profile_badge_it_assert(
  'viewer cannot directly select the target Premium membership',
  (
    select pg_catalog.count(*) = 0
    from public.premium_memberships
    where user_id = (select target_user_id from _commatch_profile_badge_it_config)
  )
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() + interval '1 day',
    expires_at = pg_catalog.now() + interval '2 days'
where user_id = (select target_user_id from _commatch_profile_badge_it_config);

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'not-started Premium membership returns false',
  not (
    select is_premium_available
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);
reset role;

update public.premium_memberships
set started_at = pg_catalog.now() - interval '2 days',
    expires_at = pg_catalog.now() - interval '1 day'
where user_id = (select target_user_id from _commatch_profile_badge_it_config);

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'expired Premium membership returns false',
  not (
    select is_premium_available
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);
reset role;

update public.premium_memberships
set status = 'suspended',
    expires_at = null
where user_id = (select target_user_id from _commatch_profile_badge_it_config);

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'suspended Premium membership returns false',
  not (
    select is_premium_available
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);
reset role;

update public.premium_memberships
set status = 'revoked'
where user_id = (select target_user_id from _commatch_profile_badge_it_config);

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'revoked Premium membership returns false',
  not (
    select is_premium_available
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);
reset role;

insert into public.member_restrictions (
  user_id,
  account_status,
  profile_visibility
)
select target_user_id, 'active', 'hidden'
from _commatch_profile_badge_it_config;

set local role authenticated;
select pg_temp._commatch_profile_badge_it_set_user(viewer_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'hidden target profile still returns no detail row',
  (
    select pg_catalog.count(*) = 0
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);

select pg_temp._commatch_profile_badge_it_set_user(target_user_id)
from _commatch_profile_badge_it_config;
select pg_temp._commatch_profile_badge_it_assert(
  'self detail lookup still returns no row',
  (
    select pg_catalog.count(*) = 0
    from public.get_visible_member_detail(
      (select target_user_id from _commatch_profile_badge_it_config)
    )
  )
);

reset role;
rollback;

select 'PASS member profile Premium badge integration tests; all fixture changes rolled back'
  as test_result;
