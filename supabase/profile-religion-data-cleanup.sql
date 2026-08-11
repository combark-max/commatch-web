-- ComMatch profile religion data cleanup, phase 2.
--
-- This migration clears stored values from the nullable legacy column. It does
-- not drop the column or modify any other profile column.

begin;

do $cleanup$
declare
  v_identity text;
  v_function_identities constant text[] := array[
    'public.get_admin_dashboard_operational_summary(integer)',
    'public.get_admin_member_detail(uuid)',
    'public.get_admin_members(text,text,text,text,integer,integer,text,text)',
    'public.get_ai_match_candidates()',
    'public.get_visible_member_detail(uuid)',
    'public.search_members_advanced(integer,integer,text,text,text)'
  ];
  v_total_rows_before bigint;
  v_non_null_rows_before bigint;
  v_non_blank_rows_before bigint;
  v_total_rows_after bigint;
  v_non_null_rows_after bigint;
  v_non_blank_rows_after bigint;
  v_updated_rows bigint;
begin
  -- Preflight: require the retained legacy column and the phase-1 RPC contract.
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'religion'
      and column_info.data_type = 'text'
      and column_info.udt_name = 'text'
      and column_info.is_nullable = 'YES'
      and column_info.column_default is null
  ) then
    raise exception 'public.profiles.religion must be a nullable text column with no default';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_dashboard_operational_summary',
        'get_admin_member_detail',
        'get_admin_members',
        'get_ai_match_candidates',
        'get_visible_member_detail',
        'search_members_advanced'
      )
  ) <> 6 then
    raise exception 'A phase-1 RPC is missing or overloaded';
  end if;

  if pg_catalog.to_regprocedure(
       'public.search_members_advanced(integer,integer,text,text,text,text)'
     ) is not null then
    raise exception 'The legacy six-argument advanced search signature still exists';
  end if;

  foreach v_identity in array v_function_identities
  loop
    if pg_catalog.to_regprocedure(v_identity) is null
       or pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure(v_identity)
          ) ~* '\mreligion\M' then
      raise exception '% is missing or still references religion', v_identity;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result(
       'public.get_admin_dashboard_operational_summary(integer)'::pg_catalog.regprocedure
     ) <> 'TABLE(total_member_count bigint, active_member_count bigint, suspended_member_count bigint, hidden_profile_count bigint, missing_profile_count bigint, completed_profile_count bigint, premium_available_count bigint, premium_not_started_count bigint, premium_expired_count bigint, premium_suspended_count bigint, premium_revoked_count bigint, premium_expiring_soon_count bigint, expiration_window_days integer)'
     or pg_catalog.pg_get_function_result(
       'public.get_admin_member_detail(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(member_user_id uuid, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, nickname text, gender text, birth_date date, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, premium_started_at timestamp with time zone, premium_expires_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(
       'public.get_admin_members(text,text,text,text,integer,integer,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(member_user_id uuid, nickname text, joined_at timestamp with time zone, profile_exists boolean, profile_status text, profile_visibility text, stored_account_status text, current_account_status text, suspended_at timestamp with time zone, suspended_until timestamp with time zone, premium_membership_exists boolean, premium_stored_status text, premium_is_available boolean, premium_period_state text, total_count bigint)'
     or pg_catalog.pg_get_function_result(
       'public.get_ai_match_candidates()'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)'
     or pg_catalog.pg_get_function_result(
       'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[])'
     or pg_catalog.pg_get_function_result(
       'public.search_members_advanced(integer,integer,text,text,text)'::pg_catalog.regprocedure
     ) <> 'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)' then
    raise exception 'A phase-1 RPC return contract differs from the approved definition';
  end if;

  -- Keep the before/update/after audit stable against concurrent profile writes.
  lock table public.profiles in share row exclusive mode;

  select
    pg_catalog.count(*),
    pg_catalog.count(profile.religion),
    pg_catalog.count(*) filter (
      where nullif(pg_catalog.btrim(profile.religion), '') is not null
    )
  into
    v_total_rows_before,
    v_non_null_rows_before,
    v_non_blank_rows_before
  from public.profiles as profile;

  raise notice 'Before cleanup: total_rows=%, non_null_rows=%, non_blank_rows=%',
    v_total_rows_before,
    v_non_null_rows_before,
    v_non_blank_rows_before;

  update public.profiles
  set religion = null
  where religion is not null;

  get diagnostics v_updated_rows = row_count;

  -- Postflight: verify data, column shape, and the active RPC contract again.
  select
    pg_catalog.count(*),
    pg_catalog.count(profile.religion),
    pg_catalog.count(*) filter (
      where nullif(pg_catalog.btrim(profile.religion), '') is not null
    )
  into
    v_total_rows_after,
    v_non_null_rows_after,
    v_non_blank_rows_after
  from public.profiles as profile;

  if v_total_rows_after <> v_total_rows_before then
    raise exception 'Profile row count changed during religion cleanup: before %, after %',
      v_total_rows_before,
      v_total_rows_after;
  end if;

  if v_updated_rows <> v_non_null_rows_before then
    raise exception 'Religion cleanup updated % rows; expected %',
      v_updated_rows,
      v_non_null_rows_before;
  end if;

  if v_non_null_rows_after <> 0 or v_non_blank_rows_after <> 0 then
    raise exception 'Religion cleanup is incomplete: non-null %, non-blank %',
      v_non_null_rows_after,
      v_non_blank_rows_after;
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'religion'
      and column_info.data_type = 'text'
      and column_info.udt_name = 'text'
      and column_info.is_nullable = 'YES'
      and column_info.column_default is null
  ) then
    raise exception 'public.profiles.religion changed during cleanup';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_dashboard_operational_summary',
        'get_admin_member_detail',
        'get_admin_members',
        'get_ai_match_candidates',
        'get_visible_member_detail',
        'search_members_advanced'
      )
  ) <> 6
     or pg_catalog.to_regprocedure(
       'public.search_members_advanced(integer,integer,text,text,text,text)'
     ) is not null then
    raise exception 'The phase-1 RPC signature set changed during cleanup';
  end if;

  foreach v_identity in array v_function_identities
  loop
    if pg_catalog.to_regprocedure(v_identity) is null
       or pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure(v_identity)
          ) ~* '\mreligion\M' then
      raise exception '% changed or references religion after cleanup', v_identity;
    end if;
  end loop;

  raise notice 'After cleanup: total_rows=%, non_null_rows=%, non_blank_rows=%, updated_rows=%',
    v_total_rows_after,
    v_non_null_rows_after,
    v_non_blank_rows_after,
    v_updated_rows;
end
$cleanup$;

select
  pg_catalog.count(*) as total_rows,
  pg_catalog.count(profile.religion) as non_null_rows,
  pg_catalog.count(*) filter (
    where nullif(pg_catalog.btrim(profile.religion), '') is not null
  ) as non_blank_rows
from public.profiles as profile;

commit;
