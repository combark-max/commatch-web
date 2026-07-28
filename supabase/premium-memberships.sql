-- ComMatch Premium membership access control.
--
-- This file is not executed automatically. Review it before running it once in
-- the Supabase SQL Editor. It creates no memberships and changes no existing
-- member data. The priority recommendation pilot in premium-feature-access.sql
-- is intentionally separate from this membership model.

begin;

do $preflight$
declare
  v_install_marker constant text := 'commatch_premium_memberships_v1';
  v_membership_table regclass := pg_catalog.to_regclass('public.premium_memberships');
  v_function_name text;
  v_expected_signature text;
begin
  if pg_catalog.to_regclass('auth.users') is null then
    raise exception 'auth.users does not exist';
  end if;

  if v_membership_table is not null
     and not exists (
       select 1
       from pg_catalog.pg_class as table_info
       where table_info.oid = v_membership_table
         and table_info.relkind = 'r'
         and pg_catalog.obj_description(table_info.oid, 'pg_class') = v_install_marker
     ) then
    raise exception 'public.premium_memberships already exists with an unapproved definition';
  end if;

  for v_function_name, v_expected_signature in
    select *
    from (values
      ('set_premium_memberships_updated_at', 'public.set_premium_memberships_updated_at()'),
      ('has_premium_feature', 'public.has_premium_feature(text)'),
      ('get_my_premium_access', 'public.get_my_premium_access()')
    ) as expected(function_name, function_signature)
  loop
    if exists (
      select 1
      from pg_catalog.pg_proc as function_info
      join pg_catalog.pg_namespace as namespace_info
        on namespace_info.oid = function_info.pronamespace
      where namespace_info.nspname = 'public'
        and function_info.proname = v_function_name
    ) and (
      pg_catalog.to_regprocedure(v_expected_signature) is null
      or (
        select pg_catalog.count(*)
        from pg_catalog.pg_proc as function_info
        join pg_catalog.pg_namespace as namespace_info
          on namespace_info.oid = function_info.pronamespace
        where namespace_info.nspname = 'public'
          and function_info.proname = v_function_name
      ) <> 1
      or pg_catalog.obj_description(
        pg_catalog.to_regprocedure(v_expected_signature),
        'pg_proc'
      ) is distinct from v_install_marker
    ) then
      raise exception 'public.% exists with an unapproved definition or signature', v_function_name;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.premium_memberships (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null,
  status text not null,
  started_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  feature_keys text[] not null,
  granted_at timestamptz not null default pg_catalog.now(),
  granted_by uuid,
  granted_reason text,
  status_changed_at timestamptz not null default pg_catalog.now(),
  status_changed_by uuid,
  status_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint premium_memberships_user_id_unique unique (user_id),
  constraint premium_memberships_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint premium_memberships_granted_by_fkey
    foreign key (granted_by) references auth.users(id) on delete set null,
  constraint premium_memberships_status_changed_by_fkey
    foreign key (status_changed_by) references auth.users(id) on delete set null,
  constraint premium_memberships_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint premium_memberships_valid_period_check
    check (expires_at is null or expires_at > started_at),
  constraint premium_memberships_feature_keys_check
    check (
      pg_catalog.cardinality(feature_keys) between 1 and 3
      and pg_catalog.array_position(feature_keys, null) is null
      and feature_keys <@ array[
        'likes_received',
        'advanced_member_search',
        'expanded_recommendations'
      ]::text[]
      and pg_catalog.cardinality(feature_keys) =
        (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
        + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
        + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
    )
);

comment on table public.premium_memberships is 'commatch_premium_memberships_v1';
comment on column public.premium_memberships.status is
  'Stored administrative state: active, suspended, or revoked';
comment on column public.premium_memberships.expires_at is
  'Null means a manually granted membership with no expiration';
comment on column public.premium_memberships.feature_keys is
  'Enabled Premium features for this membership';

create index if not exists premium_memberships_status_expires_at_idx
on public.premium_memberships (status, expires_at)
where expires_at is not null;

do $table_validation$
declare
  v_actual_columns text[];
  v_expected_constraints text[] := array[
    'premium_memberships_feature_keys_check:c',
    'premium_memberships_granted_by_fkey:f',
    'premium_memberships_pkey:p',
    'premium_memberships_status_changed_by_fkey:f',
    'premium_memberships_status_check:c',
    'premium_memberships_user_id_fkey:f',
    'premium_memberships_user_id_unique:u',
    'premium_memberships_valid_period_check:c'
  ];
  v_actual_constraints text[];
begin
  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s:%s', column_name, udt_name, is_nullable)
    order by ordinal_position
  )
  into v_actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'premium_memberships';

  if v_actual_columns is distinct from array[
    'id:uuid:NO',
    'user_id:uuid:NO',
    'status:text:NO',
    'started_at:timestamptz:NO',
    'expires_at:timestamptz:YES',
    'feature_keys:_text:NO',
    'granted_at:timestamptz:NO',
    'granted_by:uuid:YES',
    'granted_reason:text:YES',
    'status_changed_at:timestamptz:NO',
    'status_changed_by:uuid:YES',
    'status_reason:text:YES',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.premium_memberships columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s', constraint_info.conname, constraint_info.contype)
    order by constraint_info.conname
  )
  into v_actual_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.premium_memberships'::pg_catalog.regclass;

  if v_actual_constraints is distinct from v_expected_constraints then
    raise exception 'public.premium_memberships constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_memberships'::pg_catalog.regclass
      and constraint_info.conname = 'premium_memberships_user_id_fkey'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_memberships'::pg_catalog.regclass
      and constraint_info.conname = 'premium_memberships_granted_by_fkey'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_memberships'::pg_catalog.regclass
      and constraint_info.conname = 'premium_memberships_status_changed_by_fkey'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
  ) then
    raise exception 'public.premium_memberships foreign keys differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_info
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = index_info.indexrelid
    join pg_catalog.pg_am as access_method
      on access_method.oid = index_relation.relam
    join pg_catalog.pg_attribute as status_column
      on status_column.attrelid = index_info.indrelid
      and status_column.attname = 'status'
      and not status_column.attisdropped
    join pg_catalog.pg_attribute as expires_at_column
      on expires_at_column.attrelid = index_info.indrelid
      and expires_at_column.attname = 'expires_at'
      and not expires_at_column.attisdropped
    where index_info.indexrelid = 'public.premium_memberships_status_expires_at_idx'::pg_catalog.regclass
      and index_info.indrelid = 'public.premium_memberships'::pg_catalog.regclass
      and not index_info.indisunique
      and index_info.indisvalid
      and index_info.indisready
      and access_method.amname = 'btree'
      and index_info.indnkeyatts = 2
      and index_info.indnatts = 2
      and index_info.indexprs is null
      and index_info.indkey[0] = status_column.attnum
      and index_info.indkey[1] = expires_at_column.attnum
      and index_info.indoption[0] = 0
      and index_info.indoption[1] = 0
      and index_info.indclass[0] = (
        select operator_class.oid
        from pg_catalog.pg_opclass as operator_class
        where operator_class.opcmethod = access_method.oid
          and operator_class.opcdefault
          and operator_class.opcintype = status_column.atttypid
      )
      and index_info.indclass[1] = (
        select operator_class.oid
        from pg_catalog.pg_opclass as operator_class
        where operator_class.opcmethod = access_method.oid
          and operator_class.opcdefault
          and operator_class.opcintype = expires_at_column.atttypid
      )
      and index_info.indcollation[0] = status_column.attcollation
      and index_info.indcollation[1] = expires_at_column.attcollation
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(index_info.indpred, index_info.indrelid)
        ),
        '[[:space:]()]+',
        '',
        'g'
      ) = 'expires_atisnotnull'
  ) then
    raise exception 'premium_memberships_status_expires_at_idx differs from the approved definition';
  end if;
end
$table_validation$;

do $updated_at_function$
declare
  v_install_marker constant text := 'commatch_premium_memberships_v1';
begin
  if pg_catalog.to_regprocedure('public.set_premium_memberships_updated_at()') is null then
    execute $create_function$
      create function public.set_premium_memberships_updated_at()
      returns trigger
      language plpgsql
      security invoker
      set search_path = ''
      as $body$
      begin
        new.updated_at := pg_catalog.now();
        return new;
      end
      $body$
    $create_function$;

    comment on function public.set_premium_memberships_updated_at()
      is 'commatch_premium_memberships_v1';
  elsif not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure(
        'public.set_premium_memberships_updated_at()'
      )
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
      and not function_info.prosecdef
      and function_info.provolatile = 'v'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.set_premium_memberships_updated_at() exists with an incompatible definition';
  end if;
end
$updated_at_function$;

do $updated_at_trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.premium_memberships'::pg_catalog.regclass
      and trigger_info.tgname = 'premium_memberships_set_updated_at'
      and not trigger_info.tgisinternal
  ) then
    create trigger premium_memberships_set_updated_at
      before update on public.premium_memberships
      for each row
      execute function public.set_premium_memberships_updated_at();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.premium_memberships'::pg_catalog.regclass
      and trigger_info.tgname = 'premium_memberships_set_updated_at'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.set_premium_memberships_updated_at()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 19
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgnargs = 0
  ) then
    raise exception 'premium_memberships_set_updated_at already exists with an unapproved definition';
  end if;
end
$updated_at_trigger$;

do $has_feature_function$
declare
  v_install_marker constant text := 'commatch_premium_memberships_v1';
begin
  if pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null then
    execute $create_function$
      create function public.has_premium_feature(p_feature_key text)
      returns boolean
      language sql
      stable
      security invoker
      set search_path = ''
      as $body$
        select case
          when p_feature_key is null
            or p_feature_key not in (
              'likes_received',
              'advanced_member_search',
              'expanded_recommendations'
            )
          then false
          else exists (
            select 1
            from public.premium_memberships as membership
            where membership.user_id = (select auth.uid())
              and membership.status = 'active'
              and membership.started_at <= pg_catalog.now()
              and (
                membership.expires_at is null
                or membership.expires_at > pg_catalog.now()
              )
              and p_feature_key = any(membership.feature_keys)
          )
        end
      $body$
    $create_function$;

    comment on function public.has_premium_feature(text)
      is 'commatch_premium_memberships_v1';
  elsif not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure('public.has_premium_feature(text)')
      and language_info.lanname = 'sql'
      and function_info.pronargs = 1
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and not function_info.prosecdef
      and function_info.provolatile = 's'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.has_premium_feature(text) exists with an incompatible definition';
  end if;
end
$has_feature_function$;

do $get_access_function$
declare
  v_install_marker constant text := 'commatch_premium_memberships_v1';
begin
  if pg_catalog.to_regprocedure('public.get_my_premium_access()') is null then
    execute $create_function$
      create function public.get_my_premium_access()
      returns table (
        membership_exists boolean,
        status text,
        is_available boolean,
        started_at timestamptz,
        expires_at timestamptz,
        feature_keys text[]
      )
      language sql
      stable
      security invoker
      set search_path = ''
      as $body$
        select
          membership.user_id is not null as membership_exists,
          membership.status,
          coalesce(
            membership.status = 'active'
              and membership.started_at <= pg_catalog.now()
              and (
                membership.expires_at is null
                or membership.expires_at > pg_catalog.now()
              ),
            false
          ) as is_available,
          membership.started_at,
          membership.expires_at,
          coalesce(membership.feature_keys, array[]::text[]) as feature_keys
        from (select auth.uid() as user_id) as auth_context
        left join public.premium_memberships as membership
          on membership.user_id = auth_context.user_id
      $body$
    $create_function$;

    comment on function public.get_my_premium_access()
      is 'commatch_premium_memberships_v1';
  elsif not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure('public.get_my_premium_access()')
      and language_info.lanname = 'sql'
      and function_info.pronargs = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and not function_info.prosecdef
      and function_info.provolatile = 's'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.get_my_premium_access() exists with an incompatible definition';
  end if;
end
$get_access_function$;

alter table public.premium_memberships enable row level security;

do $rls_policy$
declare
  v_normalized_qualifier text;
begin
  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.premium_memberships'::pg_catalog.regclass
      and policy_info.polname <> 'premium_memberships_select_own'
  ) then
    raise exception 'public.premium_memberships contains an unapproved RLS policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.premium_memberships'::pg_catalog.regclass
      and policy_info.polname = 'premium_memberships_select_own'
  ) then
    create policy premium_memberships_select_own
      on public.premium_memberships
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  else
    select pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
          '[[:space:]]+',
          '',
          'g'
        ),
        '(',
        ''
      ),
      ')',
      ''
    )
    into v_normalized_qualifier
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.premium_memberships'::pg_catalog.regclass
      and policy_info.polname = 'premium_memberships_select_own';

    if not exists (
      select 1
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid = 'public.premium_memberships'::pg_catalog.regclass
        and policy_info.polname = 'premium_memberships_select_own'
        and policy_info.polpermissive
        and policy_info.polcmd = 'r'
        and policy_info.polroles = array[
          (select role_info.oid from pg_catalog.pg_roles as role_info where role_info.rolname = 'authenticated')
        ]
        and policy_info.polwithcheck is null
    ) or v_normalized_qualifier not in (
      'selectauth.uid=user_id',
      'selectauth.uidasuid=user_id'
    ) then
      raise exception 'premium_memberships_select_own exists with an unapproved definition';
    end if;
  end if;
end
$rls_policy$;

do $rls_validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.premium_memberships'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.premium_memberships';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.premium_memberships'::pg_catalog.regclass
  ) <> 1 then
    raise exception 'public.premium_memberships must contain only the approved own-select policy';
  end if;
end
$rls_validation$;

revoke all on table public.premium_memberships from public, anon, authenticated, service_role;
grant select on table public.premium_memberships to authenticated;
grant select, insert, update, delete on table public.premium_memberships to service_role;

revoke all on function public.set_premium_memberships_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.has_premium_feature(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_premium_access()
  from public, anon, authenticated, service_role;

grant execute on function public.has_premium_feature(text) to authenticated;
grant execute on function public.get_my_premium_access() to authenticated;

commit;

-- Manual operations below are examples only and are not executed with this file.
-- Use a transaction, verify the exact target user, period, feature keys, and
-- reason before committing. Do not substitute an email address for user_id.
--
-- Grant a new membership:
-- begin;
-- insert into public.premium_memberships (
--   user_id, status, started_at, expires_at, feature_keys,
--   granted_by, granted_reason, status_changed_by, status_reason
-- ) values (
--   :target_user_id, 'active', :started_at, :expires_at,
--   array['likes_received', 'advanced_member_search', 'expanded_recommendations'],
--   null, :grant_reason, null, :status_reason
-- );
-- -- Verify exactly one target row, then commit. Otherwise rollback.
-- commit;
--
-- Re-grant an existing membership by updating its single current row:
-- begin;
-- update public.premium_memberships
-- set status = 'active',
--     started_at = :started_at,
--     expires_at = :expires_at,
--     feature_keys = :feature_keys,
--     granted_at = pg_catalog.now(),
--     granted_by = null,
--     granted_reason = :grant_reason,
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :status_reason
-- where user_id = :target_user_id;
-- -- Verify exactly one updated row, then commit. Otherwise rollback.
-- commit;
--
-- Suspend a membership:
-- begin;
-- update public.premium_memberships
-- set status = 'suspended',
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :suspension_reason
-- where user_id = :target_user_id;
-- -- Verify exactly one updated row, then commit. Otherwise rollback.
-- commit;
--
-- Reactivate a suspended membership:
-- begin;
-- update public.premium_memberships
-- set status = 'active',
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :reactivation_reason
-- where user_id = :target_user_id;
-- -- Verify exactly one updated row, then commit. Otherwise rollback.
-- commit;
--
-- Revoke a membership:
-- begin;
-- update public.premium_memberships
-- set status = 'revoked',
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :revocation_reason
-- where user_id = :target_user_id;
-- -- Verify exactly one updated row, then commit. Otherwise rollback.
-- commit;
--
-- Change the expiration date:
-- begin;
-- update public.premium_memberships
-- set expires_at = :expires_at,
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :period_change_reason
-- where user_id = :target_user_id;
-- -- Verify the date constraint and exactly one updated row, then commit.
-- commit;
--
-- Change enabled feature keys:
-- begin;
-- update public.premium_memberships
-- set feature_keys = :feature_keys,
--     status_changed_at = pg_catalog.now(),
--     status_changed_by = null,
--     status_reason = :feature_change_reason
-- where user_id = :target_user_id;
-- -- Verify the allowed keys and exactly one updated row, then commit.
-- commit;
