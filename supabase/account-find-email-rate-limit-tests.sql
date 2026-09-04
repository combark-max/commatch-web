-- Rollback-safe integration tests for the shared account find-email rate limit.
-- Apply account-find-email-rate-limit.sql first, then run this file as one SQL
-- Editor invocation. All rate-limit rows created by this test are rolled back.

begin;

do $metadata_and_acl$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.consume_account_find_email_rate_limit(text)'
  );
begin
  if pg_catalog.to_regclass('public.account_find_email_rate_limits') is null
     or v_function_oid is null
     or pg_catalog.pg_get_function_identity_arguments(v_function_oid) <>
       'p_identifier_hash text'
     or pg_catalog.pg_get_function_result(v_function_oid) <>
       'TABLE(allowed boolean, retry_after_seconds integer)'
     or pg_catalog.obj_description(v_function_oid, 'pg_proc') <>
       'Consumes the shared account find-email rate limit for a pseudonymous identifier' then
    raise exception 'FAIL find-email rate-limit schema or function contract';
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
    raise exception 'FAIL function owner, volatility, security-definer, or search_path contract';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'FAIL function ACL contract';
  end if;

  if pg_catalog.has_table_privilege('public', 'public.account_find_email_rate_limits', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.account_find_email_rate_limits', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.account_find_email_rate_limits', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.account_find_email_rate_limits', 'SELECT')
     or not (
       select relation_info.relrowsecurity
       from pg_catalog.pg_class as relation_info
       where relation_info.oid = 'public.account_find_email_rate_limits'::pg_catalog.regclass
     ) then
    raise exception 'FAIL table ACL or RLS contract';
  end if;
end
$metadata_and_acl$;

set local role service_role;

do $shared_counter$
declare
  v_primary_hash constant text :=
    '1111111111111111111111111111111111111111111111111111111111111111';
  v_secondary_hash constant text :=
    '2222222222222222222222222222222222222222222222222222222222222222';
  v_row record;
  v_attempt integer;
begin
  for v_attempt in 1..5 loop
    select * into v_row
    from public.consume_account_find_email_rate_limit(v_primary_hash);
    if not v_row.allowed or v_row.retry_after_seconds <> 0 then
      raise exception 'FAIL request % should be allowed, got % / %',
        v_attempt, v_row.allowed, v_row.retry_after_seconds;
    end if;
  end loop;

  select * into v_row
  from public.consume_account_find_email_rate_limit(v_primary_hash);
  if v_row.allowed
     or v_row.retry_after_seconds < 1
     or v_row.retry_after_seconds > 600 then
    raise exception 'FAIL sixth request should be limited, got % / %',
      v_row.allowed, v_row.retry_after_seconds;
  end if;

  select * into v_row
  from public.consume_account_find_email_rate_limit(v_secondary_hash);
  if not v_row.allowed or v_row.retry_after_seconds <> 0 then
    raise exception 'FAIL independent identifier should have an independent counter';
  end if;

  raise notice 'PASS shared rate limit allows five requests, rejects six, and isolates identifiers';
end
$shared_counter$;

set local role postgres;

do $stored_minimum_information$
begin
  if not exists (
       select 1
       from public.account_find_email_rate_limits
       where identifier_hash =
         '1111111111111111111111111111111111111111111111111111111111111111'
         and request_count = 6
     )
     or exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'account_find_email_rate_limits'
         and column_name in ('ip', 'ip_address', 'user_agent')
     ) then
    raise exception 'FAIL atomic count or minimum-information storage contract';
  end if;
  raise notice 'PASS only pseudonymous identifiers and bounded counters are stored';
end
$stored_minimum_information$;

rollback;
