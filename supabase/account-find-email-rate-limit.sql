-- Shared, atomic rate limit for the public account find-email route.
-- The application stores only an HMAC-SHA-256 client identifier, never a raw IP.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_account_find_email_rate_limit_v1';
  v_table_oid oid := pg_catalog.to_regclass('public.account_find_email_rate_limits');
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.consume_account_find_email_rate_limit(text)'
  );
begin
  if v_table_oid is not null
     and pg_catalog.obj_description(v_table_oid, 'pg_class') is distinct from v_marker then
    raise exception 'public.account_find_email_rate_limits exists without the approved marker';
  end if;

  if v_function_oid is not null
     and (
       pg_catalog.pg_get_function_identity_arguments(v_function_oid) <>
         'p_identifier_hash text'
       or pg_catalog.pg_get_function_result(v_function_oid) <>
         'TABLE(allowed boolean, retry_after_seconds integer)'
       or pg_catalog.obj_description(v_function_oid, 'pg_proc') is distinct from
         'Consumes the shared account find-email rate limit for a pseudonymous identifier'
     ) then
    raise exception 'public.consume_account_find_email_rate_limit exists with an incompatible contract';
  end if;
end
$preflight$;

create table if not exists public.account_find_email_rate_limits (
  identifier_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null,
  constraint account_find_email_rate_limits_identifier_hash_check
    check (identifier_hash ~ '^[0-9a-f]{64}$'),
  constraint account_find_email_rate_limits_request_count_check
    check (request_count between 1 and 6)
);

comment on table public.account_find_email_rate_limits
  is 'commatch_account_find_email_rate_limit_v1';
comment on column public.account_find_email_rate_limits.identifier_hash
  is 'HMAC-SHA-256 pseudonymous client identifier; raw IP addresses are not stored';

create index if not exists account_find_email_rate_limits_updated_at_idx
  on public.account_find_email_rate_limits (updated_at);

alter table public.account_find_email_rate_limits enable row level security;
revoke all on table public.account_find_email_rate_limits
  from public, anon, authenticated, service_role;

create or replace function public.consume_account_find_email_rate_limit(
  p_identifier_hash text
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window interval := interval '10 minutes';
  v_request_count integer;
  v_window_started_at timestamptz;
begin
  if p_identifier_hash is null
     or p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid rate-limit identifier';
  end if;

  with stale_limits as (
    select stale_limit.identifier_hash
    from public.account_find_email_rate_limits as stale_limit
    where stale_limit.updated_at < v_now - interval '1 day'
    order by stale_limit.updated_at
    limit 100
    for update skip locked
  )
  delete from public.account_find_email_rate_limits as stale_limit
  using stale_limits
  where stale_limit.identifier_hash = stale_limits.identifier_hash;

  insert into public.account_find_email_rate_limits as rate_limit (
    identifier_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_identifier_hash,
    v_now,
    1,
    v_now
  )
  on conflict (identifier_hash) do update
  set
    window_started_at = case
      when rate_limit.window_started_at <= v_now - v_window then v_now
      else rate_limit.window_started_at
    end,
    request_count = case
      when rate_limit.window_started_at <= v_now - v_window then 1
      when rate_limit.request_count >= 5 then 6
      else rate_limit.request_count + 1
    end,
    updated_at = v_now
  returning rate_limit.request_count, rate_limit.window_started_at
  into v_request_count, v_window_started_at;

  return query
  select
    v_request_count <= 5,
    case
      when v_request_count <= 5 then 0
      else pg_catalog.ceil(
        pg_catalog.date_part(
          'epoch',
          v_window_started_at + v_window - v_now
        )
      )::integer
    end;
end
$function$;

alter function public.consume_account_find_email_rate_limit(text)
  owner to postgres;
revoke all on function public.consume_account_find_email_rate_limit(text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_account_find_email_rate_limit(text)
  to service_role;
comment on function public.consume_account_find_email_rate_limit(text)
  is 'Consumes the shared account find-email rate limit for a pseudonymous identifier';

do $postflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.consume_account_find_email_rate_limit(text)'
  );
begin
  if v_function_oid is null
     or pg_catalog.pg_get_function_identity_arguments(v_function_oid) <>
       'p_identifier_hash text'
     or pg_catalog.pg_get_function_result(v_function_oid) <>
       'TABLE(allowed boolean, retry_after_seconds integer)'
     or pg_catalog.obj_description(v_function_oid, 'pg_proc') <>
       'Consumes the shared account find-email rate limit for a pseudonymous identifier' then
    raise exception 'Account find-email rate-limit function contract changed during migration';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    where function_info.oid = v_function_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'Account find-email rate-limit function security contract changed';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE')
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.account_find_email_rate_limits',
       'SELECT'
     ) then
    raise exception 'Account find-email rate-limit ACL changed during migration';
  end if;
end
$postflight$;

commit;
