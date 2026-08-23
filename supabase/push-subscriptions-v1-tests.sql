-- ComMatch Web Push Phase 2-A rollback-safe integration tests.
--
-- Run after push-subscriptions-v1.sql. Replace both placeholders with distinct
-- disposable members that currently have member service access. All writes are
-- rolled back.

begin;

create temp table _commatch_push_subscriptions_it_config (
  first_user_id uuid,
  second_user_id uuid,
  first_subscription_id uuid
) on commit drop;

insert into _commatch_push_subscriptions_it_config (
  first_user_id,
  second_user_id
) values (
  nullif('PASTE_FIRST_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'FIRST_DISPOSABLE_MEMBER_ID')::uuid,
  nullif('PASTE_SECOND_DISPOSABLE_MEMBER_ID', 'PASTE_' || 'SECOND_DISPOSABLE_MEMBER_ID')::uuid
);

grant select, update on _commatch_push_subscriptions_it_config to authenticated;

create function pg_temp._commatch_push_subscriptions_set_user(p_user_id uuid)
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

create function pg_temp._commatch_push_subscriptions_expect_error(
  p_label text,
  p_expected_state text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate <> p_expected_state then
        raise exception 'FAIL %: expected SQLSTATE %, got % (%)',
          p_label, p_expected_state, sqlstate, sqlerrm;
      end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_push_subscriptions_set_user(uuid)
  to authenticated;
grant execute on function pg_temp._commatch_push_subscriptions_expect_error(text, text, text)
  to authenticated;

do $preflight$
declare
  v_config _commatch_push_subscriptions_it_config%rowtype;
  v_register_oid oid := 'public.register_my_push_subscription(text,text,text,timestamp with time zone,boolean,boolean)'::pg_catalog.regprocedure;
begin
  select * into v_config from _commatch_push_subscriptions_it_config;

  if v_config.first_user_id is null or v_config.second_user_id is null then
    raise exception 'Replace both PASTE_* disposable member IDs';
  end if;
  if v_config.first_user_id = v_config.second_user_id then
    raise exception 'Disposable members must be distinct';
  end if;
  if (select pg_catalog.count(*) from public.profiles
      where id in (v_config.first_user_id, v_config.second_user_id)) <> 2 then
    raise exception 'Both disposable members must have profiles';
  end if;
  if exists (
    select 1
    from public.member_restrictions as restriction
    where restriction.user_id in (v_config.first_user_id, v_config.second_user_id)
      and restriction.account_status <> 'active'
      and (restriction.suspended_until is null or restriction.suspended_until > pg_catalog.now())
  ) then
    raise exception 'Both disposable members must currently have service access';
  end if;
  if 'p_user_id' = any(
    select argument_name
    from pg_catalog.unnest(
      (select function_info.proargnames from pg_catalog.pg_proc as function_info where function_info.oid = v_register_oid)
    ) as argument_name
  ) then
    raise exception 'register_my_push_subscription must not accept user_id';
  end if;
end
$preflight$;

set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(first_user_id)
from _commatch_push_subscriptions_it_config;

with registered as (
  select *
  from public.register_my_push_subscription(
    'https://push.example.test/subscription/first',
    pg_catalog.repeat('A', 87),
    pg_catalog.repeat('B', 22),
    null,
    false,
    false
  )
)
update _commatch_push_subscriptions_it_config
set first_subscription_id = registered.subscription_id
from registered;

reset role;

do $first_registration$
declare v_config _commatch_push_subscriptions_it_config%rowtype;
begin
  select * into v_config from _commatch_push_subscriptions_it_config;
  if v_config.first_subscription_id is null
     or (select pg_catalog.count(*) from public.push_subscriptions
         where user_id = v_config.first_user_id
           and endpoint = 'https://push.example.test/subscription/first') <> 1
     or (select new_message_enabled or new_like_enabled
         from public.push_subscriptions
         where id = v_config.first_subscription_id) then
    raise exception 'FAIL first subscription registration or OFF defaults';
  end if;
end
$first_registration$;

set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(first_user_id)
from _commatch_push_subscriptions_it_config;

select *
from public.register_my_push_subscription(
  'https://push.example.test/subscription/first',
  pg_catalog.repeat('C', 87),
  pg_catalog.repeat('D', 22),
  null,
  true,
  true
);

select *
from public.register_my_push_subscription(
  'https://push.example.test/subscription/second',
  pg_catalog.repeat('E', 87),
  pg_catalog.repeat('F', 22),
  null,
  true,
  false
);

reset role;

do $idempotency_and_multiple_endpoints$
declare v_config _commatch_push_subscriptions_it_config%rowtype;
begin
  select * into v_config from _commatch_push_subscriptions_it_config;
  if (select pg_catalog.count(*) from public.push_subscriptions
      where user_id = v_config.first_user_id and revoked_at is null) <> 2 then
    raise exception 'FAIL one account did not retain two active endpoints';
  end if;
  if (select id from public.push_subscriptions
      where endpoint = 'https://push.example.test/subscription/first') <> v_config.first_subscription_id then
    raise exception 'FAIL repeated registration was not idempotent';
  end if;
  if not (select new_message_enabled and new_like_enabled
          from public.push_subscriptions
          where id = v_config.first_subscription_id) then
    raise exception 'FAIL message/like settings were not updated';
  end if;
end
$idempotency_and_multiple_endpoints$;

reset role;
set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(second_user_id)
from _commatch_push_subscriptions_it_config;

select *
from public.register_my_push_subscription(
  'https://push.example.test/subscription/third',
  pg_catalog.repeat('G', 87),
  pg_catalog.repeat('H', 22),
  null,
  false,
  true
);

select pg_temp._commatch_push_subscriptions_expect_error(
  'active endpoint ownership transfer',
  '23505',
  format(
    'select * from public.register_my_push_subscription(%L,%L,%L,null,true,true)',
    'https://push.example.test/subscription/first',
    pg_catalog.repeat('I', 87),
    pg_catalog.repeat('J', 22)
  )
);

reset role;
set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(first_user_id)
from _commatch_push_subscriptions_it_config;

do $cross_account_contract$
begin
  if exists (
    select 1
    from public.get_my_push_subscription_settings(
      'https://push.example.test/subscription/third'
    )
  ) then
    raise exception 'FAIL first member read second member subscription settings';
  end if;
  if public.revoke_my_push_subscription(
    'https://push.example.test/subscription/third'
  ) then
    raise exception 'FAIL first member revoked second member subscription';
  end if;
end
$cross_account_contract$;

do $revoke$
begin
  if not public.revoke_my_push_subscription(
    'https://push.example.test/subscription/first'
  ) then
    raise exception 'FAIL own subscription revoke';
  end if;
end
$revoke$;

reset role;

do $revoke_state$
declare
  v_config _commatch_push_subscriptions_it_config%rowtype;
begin
  select * into v_config from _commatch_push_subscriptions_it_config;
  if (select revoked_at from public.push_subscriptions
      where id = v_config.first_subscription_id) is null then
    raise exception 'FAIL own subscription revoke';
  end if;
end
$revoke_state$;

set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(first_user_id)
from _commatch_push_subscriptions_it_config;

select *
from public.register_my_push_subscription(
    'https://push.example.test/subscription/first',
    pg_catalog.repeat('K', 87),
    pg_catalog.repeat('L', 22),
    null,
    true,
    false
  );

reset role;

do $reregister_state$
declare v_config _commatch_push_subscriptions_it_config%rowtype;
begin
  select * into v_config from _commatch_push_subscriptions_it_config;
  if (select revoked_at from public.push_subscriptions
      where id = v_config.first_subscription_id) is not null then
    raise exception 'FAIL revoked subscription re-registration';
  end if;
end
$reregister_state$;

set local role authenticated;
select pg_temp._commatch_push_subscriptions_set_user(first_user_id)
from _commatch_push_subscriptions_it_config;

select pg_temp._commatch_push_subscriptions_expect_error(
  'direct authenticated subscription select',
  '42501',
  'select * from public.push_subscriptions'
);
select pg_temp._commatch_push_subscriptions_expect_error(
  'direct authenticated subscription insert',
  '42501',
  format(
    'insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values (%L::uuid,%L,%L,%L)',
    first_user_id,
    'https://push.example.test/subscription/direct',
    pg_catalog.repeat('M', 87),
    pg_catalog.repeat('N', 22)
  )
) from _commatch_push_subscriptions_it_config;
select pg_temp._commatch_push_subscriptions_expect_error(
  'direct authenticated subscription update',
  '42501',
  'update public.push_subscriptions set new_message_enabled = false'
);
select pg_temp._commatch_push_subscriptions_expect_error(
  'direct authenticated subscription delete',
  '42501',
  'delete from public.push_subscriptions'
);

reset role;

select 'PASS Web Push Phase 2-A subscription tests; all fixture changes rolled back'
  as test_result;

rollback;
