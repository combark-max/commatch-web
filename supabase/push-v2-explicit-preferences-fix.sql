-- ComMatch Web Push v2 explicit preference preservation fix.
--
-- Apply after push-additional-events-v1.sql. The legacy six-argument v1 RPC
-- keeps its existing default-ON compatibility policy. This forward migration
-- changes only the v2 insert values so all four explicit preferences are
-- honored for new, active, and revoked endpoints.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.push_subscriptions') is null
     or pg_catalog.to_regprocedure(
       'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'
     ) is null then
    raise exception 'Apply the additional Push event migration first';
  end if;
end
$preflight$;

create or replace function public.register_my_push_subscription_v2(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz,
  p_new_message_enabled boolean,
  p_new_like_enabled boolean,
  p_new_match_enabled boolean,
  p_support_inquiry_answered_enabled boolean
)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  new_match_enabled boolean,
  support_inquiry_answered_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
  v_now timestamptz := pg_catalog.now();
  v_existing_active boolean;
  v_result public.push_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh is null
     or pg_catalog.char_length(p_p256dh) not between 80 and 120
     or p_p256dh !~ '^[A-Za-z0-9_-]+$'
     or p_auth is null
     or pg_catalog.char_length(p_auth) not between 16 and 64
     or p_auth !~ '^[A-Za-z0-9_-]+$'
     or p_new_message_enabled is null
     or p_new_like_enabled is null
     or p_new_match_enabled is null
     or p_support_inquiry_answered_enabled is null
     or (p_expiration_time is not null and p_expiration_time <= v_now) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  select exists (
    select 1
    from public.push_subscriptions as subscription_row
    where subscription_row.endpoint = v_endpoint
      and subscription_row.user_id = v_user_id
      and subscription_row.revoked_at is null
  ) into v_existing_active;

  insert into public.push_subscriptions as subscription_row (
    user_id, endpoint, p256dh, auth, expiration_time,
    new_message_enabled, new_like_enabled, new_match_enabled,
    support_inquiry_answered_enabled,
    created_at, updated_at, last_seen_at, revoked_at
  ) values (
    v_user_id, v_endpoint, p_p256dh, p_auth, p_expiration_time,
    p_new_message_enabled, p_new_like_enabled,
    p_new_match_enabled,
    p_support_inquiry_answered_enabled,
    v_now, v_now, v_now, null
  )
  on conflict on constraint push_subscriptions_endpoint_unique
  do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      new_message_enabled = excluded.new_message_enabled,
      new_like_enabled = excluded.new_like_enabled,
      new_match_enabled = excluded.new_match_enabled,
      support_inquiry_answered_enabled = excluded.support_inquiry_answered_enabled,
      created_at = case
        when subscription_row.user_id = excluded.user_id then subscription_row.created_at
        else excluded.created_at
      end,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at,
      revoked_at = null
  where subscription_row.user_id = excluded.user_id
     or subscription_row.revoked_at is not null
  returning subscription_row.* into v_result;

  if v_result.id is null then
    raise exception using
      errcode = '23505',
      message = 'Push subscription is active for another account';
  end if;

  return query
  select v_result.id, v_result.new_message_enabled, v_result.new_like_enabled,
    v_result.new_match_enabled, v_result.support_inquiry_answered_enabled,
    v_result.created_at, v_result.updated_at, v_result.last_seen_at,
    v_result.revoked_at;
end
$function$;

comment on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) is 'Registers or refreshes one browser PushSubscription with four event preferences';

alter function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) owner to postgres;

revoke all on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.register_my_push_subscription_v2(
  text, text, text, timestamptz, boolean, boolean, boolean, boolean
) to authenticated;

do $contract_validation$
declare
  v_function_oid oid :=
    'public.register_my_push_subscription_v2(text,text,text,timestamptz,boolean,boolean,boolean,boolean)'::pg_catalog.regprocedure::oid;
  v_postgres_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'postgres'
  );
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = v_function_oid
      and function_info.proowner = v_postgres_oid
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'The v2 Push registration function has an incompatible security contract';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       v_function_oid,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'The v2 Push registration function has incompatible privileges';
  end if;
end
$contract_validation$;

commit;

select 'PASS Web Push v2 explicit preference preservation migration' as migration_result;
