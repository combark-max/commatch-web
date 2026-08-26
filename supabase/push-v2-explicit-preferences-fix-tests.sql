-- ComMatch Web Push v2 explicit preference rollback-safe regression tests.
--
-- Run in the Supabase SQL Editor after applying, in order:
--   1. push-additional-events-v1.sql
--   2. push-v2-explicit-preferences-fix.sql
-- Replace the placeholder with one disposable active member. Every fixture
-- write is rolled back. Run push-additional-events-v1-tests.sql afterward for
-- new_message, new_like, new_match, support, delivery, claim, and retry coverage.

begin;

create temp table _commatch_push_v2_preference_fix_config (
  member_id uuid,
  endpoint_new text,
  endpoint_combinations text,
  endpoint_changed text,
  endpoint_v1 text
) on commit drop;

insert into _commatch_push_v2_preference_fix_config (
  member_id,
  endpoint_new,
  endpoint_combinations,
  endpoint_changed,
  endpoint_v1
) values (
  nullif('PASTE_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'DISPOSABLE_MEMBER_ID')::uuid,
  'https://push.test/v2-fix-new-' || extensions.gen_random_uuid()::text,
  'https://push.test/v2-fix-combinations-' || extensions.gen_random_uuid()::text,
  'https://push.test/v2-fix-changed-' || extensions.gen_random_uuid()::text,
  'https://push.test/v2-fix-v1-' || extensions.gen_random_uuid()::text
);

grant select on _commatch_push_v2_preference_fix_config to authenticated;

create function pg_temp._commatch_push_v2_preference_fix_set_user(p_user_id uuid)
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

grant execute on function pg_temp._commatch_push_v2_preference_fix_set_user(uuid)
  to authenticated;

do $preflight$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;

  if v_config.member_id is null then
    raise exception 'Replace PASTE_DISPOSABLE_MEMBER_ID';
  end if;
  if not exists (select 1 from auth.users where id = v_config.member_id)
     or not exists (select 1 from public.profiles where id = v_config.member_id) then
    raise exception 'The disposable member must have an Auth user and profile';
  end if;
  if pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.register_my_push_subscription(text,text,text,timestamptz,boolean,boolean)'
     ) is null
     or pg_catalog.to_regprocedure('public.revoke_my_push_subscription(text)') is null then
    raise exception 'Apply the Push subscription migrations first';
  end if;
end
$preflight$;

set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;

-- A. A new v2 endpoint must preserve true, false, false, false exactly.
select public.register_my_push_subscription_v2(
  endpoint_new,
  pg_catalog.repeat('A', 88),
  pg_catalog.repeat('B', 22),
  null,
  true,
  false,
  false,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $new_endpoint_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1
    from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_new
      and new_message_enabled
      and not new_like_enabled
      and not new_match_enabled
      and not support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 new endpoint did not preserve explicit preferences';
  end if;
end
$new_endpoint_assertion$;

-- B. Multiple explicit v2 combinations must be stored without default override.
set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;

select public.register_my_push_subscription_v2(
  endpoint_combinations,
  pg_catalog.repeat('C', 88),
  pg_catalog.repeat('D', 22),
  null,
  false,
  true,
  true,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $first_combination_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_combinations
      and not new_message_enabled
      and new_like_enabled
      and new_match_enabled
      and not support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 first explicit preference combination';
  end if;
end
$first_combination_assertion$;

set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;

select public.register_my_push_subscription_v2(
  endpoint_combinations,
  pg_catalog.repeat('E', 88),
  pg_catalog.repeat('F', 22),
  null,
  true,
  true,
  false,
  true
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $second_combination_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_combinations
      and new_message_enabled
      and new_like_enabled
      and not new_match_enabled
      and support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 second explicit preference combination';
  end if;
end
$second_combination_assertion$;

-- C. Updating an active endpoint must continue to preserve both false values.
set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;

select public.register_my_push_subscription_v2(
  endpoint_new,
  pg_catalog.repeat('G', 88),
  pg_catalog.repeat('H', 22),
  null,
  false,
  true,
  false,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $active_update_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_new
      and not new_message_enabled
      and new_like_enabled
      and not new_match_enabled
      and not support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 active endpoint update changed explicit false preferences';
  end if;
end
$active_update_assertion$;

-- D. Revoking and re-registering the same endpoint must preserve explicit false.
set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;
select public.revoke_my_push_subscription(endpoint_new)
from _commatch_push_v2_preference_fix_config;
select public.register_my_push_subscription_v2(
  endpoint_new,
  pg_catalog.repeat('I', 88),
  pg_catalog.repeat('J', 22),
  null,
  true,
  false,
  false,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $revoked_reregistration_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_new
      and new_message_enabled
      and not new_like_enabled
      and not new_match_enabled
      and not support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 revoked endpoint re-registration enabled disabled preferences';
  end if;
end
$revoked_reregistration_assertion$;

-- E. A changed endpoint is another new row and must also preserve false.
set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;
select public.register_my_push_subscription_v2(
  endpoint_changed,
  pg_catalog.repeat('K', 88),
  pg_catalog.repeat('L', 22),
  null,
  true,
  false,
  false,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $changed_endpoint_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_changed
      and new_message_enabled
      and not new_like_enabled
      and not new_match_enabled
      and not support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v2 changed endpoint did not preserve explicit false preferences';
  end if;
end
$changed_endpoint_assertion$;

-- F. The legacy v1 RPC must retain default ON for new and revoked endpoints.
set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;
select public.register_my_push_subscription(
  endpoint_v1,
  pg_catalog.repeat('M', 88),
  pg_catalog.repeat('N', 22),
  null,
  true,
  false
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $v1_new_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_v1
      and new_message_enabled
      and not new_like_enabled
      and new_match_enabled
      and support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v1 new endpoint default policy changed';
  end if;
end
$v1_new_assertion$;

set local role authenticated;
select pg_temp._commatch_push_v2_preference_fix_set_user(member_id)
from _commatch_push_v2_preference_fix_config;
select public.revoke_my_push_subscription(endpoint_v1)
from _commatch_push_v2_preference_fix_config;
select public.register_my_push_subscription(
  endpoint_v1,
  pg_catalog.repeat('O', 88),
  pg_catalog.repeat('P', 22),
  null,
  false,
  true
)
from _commatch_push_v2_preference_fix_config;
reset role;

do $v1_revoked_reregistration_assertion$
declare
  v_config _commatch_push_v2_preference_fix_config%rowtype;
begin
  select * into v_config from _commatch_push_v2_preference_fix_config;
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_config.member_id
      and endpoint = v_config.endpoint_v1
      and not new_message_enabled
      and new_like_enabled
      and new_match_enabled
      and support_inquiry_answered_enabled
      and revoked_at is null
  ) then
    raise exception 'FAIL v1 revoked endpoint default policy changed';
  end if;
end
$v1_revoked_reregistration_assertion$;

select 'PASS Web Push v2 explicit preferences; all fixture changes rolled back'
  as test_result;

rollback;
