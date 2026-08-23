-- ComMatch Web Push Phase 2-A browser subscription registry.
--
-- This migration adds only subscription ownership and per-device preferences.
-- It does not add push events, deliveries, senders, webhooks, or scheduled jobs.
-- Apply after admin-member-restrictions.sql.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null then
    raise exception 'Required profiles or member service access dependency is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.is_member_service_allowed()'::pg_catalog.regprocedure
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'public.is_member_service_allowed() is incompatible';
  end if;
end
$preflight$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz null,
  new_message_enabled boolean not null default false,
  new_like_enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz null,
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_endpoint_check check (
    endpoint = pg_catalog.btrim(endpoint)
    and pg_catalog.char_length(endpoint) between 12 and 2048
    and endpoint ~ '^https://[^[:space:]]+$'
  ),
  constraint push_subscriptions_p256dh_check check (
    pg_catalog.char_length(p256dh) between 80 and 120
    and p256dh ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_auth_check check (
    pg_catalog.char_length(auth) between 16 and 64
    and auth ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint push_subscriptions_expiration_check check (
    expiration_time is null or expiration_time > created_at
  )
);

create index push_subscriptions_active_user_idx
  on public.push_subscriptions (user_id, updated_at desc, id)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;

-- No table policy is intentional. Authenticated clients can reach only the
-- narrowly scoped SECURITY DEFINER functions below.
revoke all on table public.push_subscriptions
  from public, anon, authenticated, service_role;

create or replace function public.register_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time timestamptz,
  p_new_message_enabled boolean,
  p_new_like_enabled boolean
)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
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
     or (p_expiration_time is not null and p_expiration_time <= v_now) then
    raise exception using errcode = '22023', message = 'Invalid push subscription';
  end if;

  insert into public.push_subscriptions as subscription_row (
    user_id,
    endpoint,
    p256dh,
    auth,
    expiration_time,
    new_message_enabled,
    new_like_enabled,
    created_at,
    updated_at,
    last_seen_at,
    revoked_at
  ) values (
    v_user_id,
    v_endpoint,
    p_p256dh,
    p_auth,
    p_expiration_time,
    p_new_message_enabled,
    p_new_like_enabled,
    v_now,
    v_now,
    v_now,
    null
  )
  on conflict on constraint push_subscriptions_endpoint_unique
  do update
  set user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      new_message_enabled = excluded.new_message_enabled,
      new_like_enabled = excluded.new_like_enabled,
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
  select
    v_result.id,
    v_result.new_message_enabled,
    v_result.new_like_enabled,
    v_result.created_at,
    v_result.updated_at,
    v_result.last_seen_at,
    v_result.revoked_at;
end
$function$;

comment on function public.register_my_push_subscription(
  text, text, text, timestamptz, boolean, boolean
) is 'Registers or refreshes one browser PushSubscription owned by auth.uid()';

create or replace function public.get_my_push_subscription_settings(p_endpoint text)
returns table (
  subscription_id uuid,
  new_message_enabled boolean,
  new_like_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid push subscription endpoint';
  end if;

  return query
  select
    subscription_row.id,
    subscription_row.new_message_enabled,
    subscription_row.new_like_enabled,
    subscription_row.created_at,
    subscription_row.updated_at,
    subscription_row.last_seen_at,
    subscription_row.revoked_at
  from public.push_subscriptions as subscription_row
  where subscription_row.user_id = v_user_id
    and subscription_row.endpoint = v_endpoint;
end
$function$;

comment on function public.get_my_push_subscription_settings(text)
  is 'Returns settings for one PushSubscription owned by auth.uid()';

create or replace function public.revoke_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := pg_catalog.btrim(p_endpoint);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if v_endpoint is null
     or pg_catalog.char_length(v_endpoint) not between 12 and 2048
     or v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = 'Invalid push subscription endpoint';
  end if;

  update public.push_subscriptions as subscription_row
  set revoked_at = coalesce(subscription_row.revoked_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      new_message_enabled = false,
      new_like_enabled = false
  where subscription_row.user_id = v_user_id
    and subscription_row.endpoint = v_endpoint;

  return found;
end
$function$;

comment on function public.revoke_my_push_subscription(text)
  is 'Idempotently revokes one PushSubscription owned by auth.uid()';

alter function public.register_my_push_subscription(
  text, text, text, timestamptz, boolean, boolean
) owner to postgres;
alter function public.get_my_push_subscription_settings(text) owner to postgres;
alter function public.revoke_my_push_subscription(text) owner to postgres;

revoke all on function public.register_my_push_subscription(
  text, text, text, timestamptz, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.get_my_push_subscription_settings(text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_my_push_subscription(text)
  from public, anon, authenticated, service_role;

grant execute on function public.register_my_push_subscription(
  text, text, text, timestamptz, boolean, boolean
) to authenticated;
grant execute on function public.get_my_push_subscription_settings(text)
  to authenticated;
grant execute on function public.revoke_my_push_subscription(text)
  to authenticated;

do $contract_validation$
declare
  v_authenticated_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'authenticated'
  );
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.push_subscriptions'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) or exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.push_subscriptions'::pg_catalog.regclass
  ) then
    raise exception 'push_subscriptions must use RLS with no direct client policies';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE') then
    raise exception 'authenticated retains a direct push_subscriptions table privilege';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.register_my_push_subscription(text,text,text,timestamp with time zone,boolean,boolean)'::pg_catalog.regprocedure
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.strpos(function_info.prosrc, 'public.is_member_service_allowed()') > 0
      and function_info.proargnames = array[
        'p_endpoint', 'p_p256dh', 'p_auth', 'p_expiration_time',
        'p_new_message_enabled', 'p_new_like_enabled', 'subscription_id',
        'new_message_enabled', 'new_like_enabled', 'created_at', 'updated_at',
        'last_seen_at', 'revoked_at'
      ]::text[]
  ) then
    raise exception 'register_my_push_subscription contract is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.get_my_push_subscription_settings(text)'::pg_catalog.regprocedure
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.revoke_my_push_subscription(text)'::pg_catalog.regprocedure
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'get/revoke push subscription contracts are incompatible';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.register_my_push_subscription(text,text,text,timestamp with time zone,boolean,boolean)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.get_my_push_subscription_settings(text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.revoke_my_push_subscription(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.register_my_push_subscription(text,text,text,timestamp with time zone,boolean,boolean)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.get_my_push_subscription_settings(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.revoke_my_push_subscription(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'public',
       'public.register_my_push_subscription(text,text,text,timestamp with time zone,boolean,boolean)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'public',
       'public.get_my_push_subscription_settings(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'public',
       'public.revoke_my_push_subscription(text)',
       'EXECUTE'
     ) then
    raise exception 'push subscription function grants are incompatible';
  end if;

  if v_authenticated_oid is null then
    raise exception 'authenticated role is missing';
  end if;
end
$contract_validation$;

commit;

select 'PASS Web Push Phase 2-A subscription migration' as migration_result;
