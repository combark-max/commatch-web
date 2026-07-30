-- ComMatch administrator access-control foundation.
--
-- This file is not executed automatically. Review it before running it in the
-- Supabase SQL Editor. It creates no administrator accounts and changes no
-- existing member, Premium, or report data or policies.

begin;

do $preflight$
declare
  v_install_marker constant text := 'commatch_admin_accounts_v1';
  v_admin_table pg_catalog.regclass := pg_catalog.to_regclass('public.admin_accounts');
  v_function_name text;
  v_expected_signature text;
begin
  if pg_catalog.to_regclass('auth.users') is null then
    raise exception 'auth.users does not exist';
  end if;

  if v_admin_table is not null
     and not exists (
       select 1
       from pg_catalog.pg_class as table_info
       where table_info.oid = v_admin_table
         and table_info.relkind = 'r'
         and pg_catalog.obj_description(table_info.oid, 'pg_class') = v_install_marker
     ) then
    raise exception 'public.admin_accounts already exists with an unapproved definition';
  end if;

  if v_admin_table is null and exists (
    select 1
    from pg_catalog.pg_class as relation_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = relation_info.relnamespace
    where namespace_info.nspname = 'public'
      and relation_info.relname in (
        'admin_accounts_status_idx',
        'admin_accounts_role_idx',
        'admin_accounts_created_by_idx'
      )
  ) then
    raise exception 'An admin_accounts index name exists without an approved public.admin_accounts table';
  end if;

  for v_function_name, v_expected_signature in
    select *
    from (values
      ('set_admin_accounts_updated_at', 'public.set_admin_accounts_updated_at()'),
      ('get_my_admin_access', 'public.get_my_admin_access()'),
      ('is_active_admin', 'public.is_active_admin()'),
      ('has_admin_permission', 'public.has_admin_permission(text)')
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

create table if not exists public.admin_accounts (
  user_id uuid primary key,
  role text not null,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  suspended_at timestamptz,
  revoked_at timestamptz,
  constraint admin_accounts_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint admin_accounts_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  constraint admin_accounts_role_check
    check (role in ('super_admin', 'admin', 'moderator')),
  constraint admin_accounts_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint admin_accounts_status_dates_check
    check (
      (
        status = 'active'
        and suspended_at is null
        and revoked_at is null
      )
      or (
        status = 'suspended'
        and suspended_at is not null
        and revoked_at is null
      )
      or (
        status = 'revoked'
        and revoked_at is not null
      )
    )
);

comment on table public.admin_accounts is 'commatch_admin_accounts_v1';
comment on column public.admin_accounts.role is
  'Administrator role: super_admin, admin, or moderator';
comment on column public.admin_accounts.status is
  'Administrator state: active, suspended, or revoked';

do $table_validation$
declare
  v_actual_columns text[];
  v_actual_defaults text[];
  v_actual_constraints text[];
  v_expected_constraints text[] := array[
    'admin_accounts_created_by_fkey:f',
    'admin_accounts_pkey:p',
    'admin_accounts_role_check:c',
    'admin_accounts_status_check:c',
    'admin_accounts_status_dates_check:c',
    'admin_accounts_user_id_fkey:f'
  ];
begin
  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s:%s', column_name, udt_name, is_nullable)
    order by ordinal_position
  )
  into v_actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_accounts';

  if v_actual_columns is distinct from array[
    'user_id:uuid:NO',
    'role:text:NO',
    'status:text:NO',
    'created_by:uuid:YES',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO',
    'suspended_at:timestamptz:YES',
    'revoked_at:timestamptz:YES'
  ]::text[] then
    raise exception 'public.admin_accounts columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s',
      column_name,
      coalesce(
        pg_catalog.regexp_replace(
          pg_catalog.lower(column_default),
          '[[:space:]]+',
          '',
          'g'
        ),
        '<none>'
      )
    )
    order by ordinal_position
  )
  into v_actual_defaults
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'admin_accounts';

  if v_actual_defaults is distinct from array[
    'user_id:<none>',
    'role:<none>',
    'status:''active''::text',
    'created_by:<none>',
    'created_at:now()',
    'updated_at:now()',
    'suspended_at:<none>',
    'revoked_at:<none>'
  ]::text[] then
    raise exception 'public.admin_accounts defaults differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s', constraint_info.conname, constraint_info.contype)
    order by constraint_info.conname
  )
  into v_actual_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass;

  if v_actual_constraints is distinct from v_expected_constraints then
    raise exception 'public.admin_accounts constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_pkey'
      and constraint_info.contype = 'p'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_constraintdef(constraint_info.oid)),
        '[[:space:]]+',
        '',
        'g'
      ) = 'primarykey(user_id)'
  ) then
    raise exception 'admin_accounts_pkey differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_user_id_fkey'
      and constraint_info.contype = 'f'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'c'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_constraintdef(constraint_info.oid)),
        '[[:space:]]+',
        '',
        'g'
      ) = 'foreignkey(user_id)referencesauth.users(id)ondeletecascade'
  ) then
    raise exception 'admin_accounts_user_id_fkey differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_created_by_fkey'
      and constraint_info.contype = 'f'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_constraintdef(constraint_info.oid)),
        '[[:space:]]+',
        '',
        'g'
      ) = 'foreignkey(created_by)referencesauth.users(id)ondeletesetnull'
  ) then
    raise exception 'admin_accounts_created_by_fkey differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_role_check'
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
      and not constraint_info.connoinherit
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(
            constraint_info.conbin,
            constraint_info.conrelid,
            false
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = 'role=anyarray[''super_admin''::text,''admin''::text,''moderator''::text]'
  ) then
    raise exception 'admin_accounts_role_check differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_status_check'
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
      and not constraint_info.connoinherit
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(
            constraint_info.conbin,
            constraint_info.conrelid,
            false
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = 'status=anyarray[''active''::text,''suspended''::text,''revoked''::text]'
  ) then
    raise exception 'admin_accounts_status_check differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_accounts'::pg_catalog.regclass
      and constraint_info.conname = 'admin_accounts_status_dates_check'
      and constraint_info.contype = 'c'
      and constraint_info.convalidated
      and not constraint_info.connoinherit
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(
            constraint_info.conbin,
            constraint_info.conrelid,
            false
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ) = 'status=''active''::textandsuspended_atisnullandrevoked_atisnullorstatus=''suspended''::textandsuspended_atisnotnullandrevoked_atisnullorstatus=''revoked''::textandrevoked_atisnotnull'
  ) then
    raise exception 'admin_accounts_status_dates_check differs from the approved definition';
  end if;
end
$table_validation$;

create index if not exists admin_accounts_status_idx
on public.admin_accounts (status);

create index if not exists admin_accounts_role_idx
on public.admin_accounts (role);

create index if not exists admin_accounts_created_by_idx
on public.admin_accounts (created_by);

do $index_validation$
declare
  v_index_name text;
  v_column_name text;
  v_index_oid pg_catalog.regclass;
begin
  for v_index_name, v_column_name in
    select *
    from (values
      ('admin_accounts_status_idx', 'status'),
      ('admin_accounts_role_idx', 'role'),
      ('admin_accounts_created_by_idx', 'created_by')
    ) as expected(index_name, column_name)
  loop
    v_index_oid := pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_index_name)
    );

    if v_index_oid is null or not exists (
      select 1
      from pg_catalog.pg_index as index_info
      join pg_catalog.pg_class as index_relation
        on index_relation.oid = index_info.indexrelid
      join pg_catalog.pg_am as access_method
        on access_method.oid = index_relation.relam
      join pg_catalog.pg_attribute as column_info
        on column_info.attrelid = index_info.indrelid
        and column_info.attname = v_column_name
        and not column_info.attisdropped
      where index_info.indexrelid = v_index_oid
        and index_info.indrelid = 'public.admin_accounts'::pg_catalog.regclass
        and not index_info.indisunique
        and not index_info.indisprimary
        and index_info.indisvalid
        and index_info.indisready
        and access_method.amname = 'btree'
        and index_info.indnkeyatts = 1
        and index_info.indnatts = 1
        and index_info.indexprs is null
        and index_info.indpred is null
        and index_info.indkey[0] = column_info.attnum
        and index_info.indoption[0] = 0
    ) then
      raise exception 'public.% differs from the approved definition', v_index_name;
    end if;
  end loop;
end
$index_validation$;

do $updated_at_function$
begin
  if pg_catalog.to_regprocedure('public.set_admin_accounts_updated_at()') is null then
    execute $create_function$
      create function public.set_admin_accounts_updated_at()
      returns trigger
      language plpgsql
      security invoker
      set search_path = ''
      as $body$
      begin
        new.updated_at := pg_catalog.now();
        return new;
      end;
      $body$
    $create_function$;

    comment on function public.set_admin_accounts_updated_at()
      is 'commatch_admin_accounts_v1';
  end if;
end
$updated_at_function$;

do $updated_at_trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.admin_accounts'::pg_catalog.regclass
      and trigger_info.tgname = 'admin_accounts_set_updated_at'
      and not trigger_info.tgisinternal
  ) then
    create trigger admin_accounts_set_updated_at
      before update on public.admin_accounts
      for each row
      execute function public.set_admin_accounts_updated_at();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.admin_accounts'::pg_catalog.regclass
      and trigger_info.tgname = 'admin_accounts_set_updated_at'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.set_admin_accounts_updated_at()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 19
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgnargs = 0
  ) then
    raise exception 'admin_accounts_set_updated_at exists with an unapproved definition';
  end if;
end
$updated_at_trigger$;

do $get_access_function$
begin
  if pg_catalog.to_regprocedure('public.get_my_admin_access()') is null then
    execute $create_function$
      create function public.get_my_admin_access()
      returns table (
        is_admin boolean,
        role text,
        status text,
        permissions text[]
      )
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select
          coalesce(admin_account.status = 'active', false) as is_admin,
          admin_account.role,
          admin_account.status,
          case
            when admin_account.status is distinct from 'active'
              then array[]::text[]
            when admin_account.role = 'super_admin'
              then array[
                'admin_dashboard_view',
                'reports_view',
                'reports_manage',
                'admin_accounts_manage'
              ]::text[]
            when admin_account.role in ('admin', 'moderator')
              then array[
                'admin_dashboard_view',
                'reports_view',
                'reports_manage'
              ]::text[]
            else array[]::text[]
          end as permissions
        from (select auth.uid() as user_id) as auth_context
        left join public.admin_accounts as admin_account
          on admin_account.user_id = auth_context.user_id
      $body$
    $create_function$;

    comment on function public.get_my_admin_access()
      is 'commatch_admin_accounts_v1';
  end if;
end
$get_access_function$;

do $is_active_admin_function$
begin
  if pg_catalog.to_regprocedure('public.is_active_admin()') is null then
    execute $create_function$
      create function public.is_active_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select coalesce(
          (
            select admin_access.is_admin
            from public.get_my_admin_access() as admin_access
          ),
          false
        )
      $body$
    $create_function$;

    comment on function public.is_active_admin()
      is 'commatch_admin_accounts_v1';
  end if;
end
$is_active_admin_function$;

do $has_admin_permission_function$
begin
  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    execute $create_function$
      create function public.has_admin_permission(p_permission_key text)
      returns boolean
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select case
          when p_permission_key is null
            or p_permission_key = ''
            or p_permission_key not in (
              'admin_dashboard_view',
              'reports_view',
              'reports_manage',
              'admin_accounts_manage'
            )
          then false
          else coalesce(
            (
              select p_permission_key = any(admin_access.permissions)
              from public.get_my_admin_access() as admin_access
            ),
            false
          )
        end
      $body$
    $create_function$;

    comment on function public.has_admin_permission(text)
      is 'commatch_admin_accounts_v1';
  end if;
end
$has_admin_permission_function$;

do $function_validation$
declare
  v_install_marker constant text := 'commatch_admin_accounts_v1';
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure(
        'public.set_admin_accounts_updated_at()'
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
      and pg_catalog.regexp_replace(
        pg_catalog.lower(function_info.prosrc),
        '[[:space:]]+',
        '',
        'g'
      ) = 'beginnew.updated_at:=pg_catalog.now();returnnew;end;'
  ) then
    raise exception 'public.set_admin_accounts_updated_at() has an incompatible definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure('public.get_my_admin_access()')
      and language_info.lanname = 'sql'
      and function_info.pronargs = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and pg_catalog.pg_get_function_result(function_info.oid)
        = 'TABLE(is_admin boolean, role text, status text, permissions text[])'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.get_my_admin_access() has an incompatible definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure('public.is_active_admin()')
      and language_info.lanname = 'sql'
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.is_active_admin() has an incompatible definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure(
        'public.has_admin_permission(text)'
      )
      and language_info.lanname = 'sql'
      and function_info.pronargs = 1
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_install_marker
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where function_config.setting = 'search_path=""'
      )
  ) then
    raise exception 'public.has_admin_permission(text) has an incompatible definition';
  end if;
end
$function_validation$;

alter table public.admin_accounts enable row level security;

do $rls_validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.admin_accounts'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.admin_accounts';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.admin_accounts'::pg_catalog.regclass
  ) then
    raise exception 'public.admin_accounts must not contain direct-access RLS policies';
  end if;
end
$rls_validation$;

revoke all on table public.admin_accounts
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.admin_accounts
  to service_role;

revoke all on function public.set_admin_accounts_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_admin_access()
  from public, anon, authenticated, service_role;
revoke all on function public.is_active_admin()
  from public, anon, authenticated, service_role;
revoke all on function public.has_admin_permission(text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.has_admin_permission(text) to authenticated;

do $privilege_validation$
begin
  if pg_catalog.has_table_privilege('anon', 'public.admin_accounts', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.admin_accounts', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.admin_accounts', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.admin_accounts', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_accounts', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_accounts', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_accounts', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_accounts', 'DELETE') then
    raise exception 'anon or authenticated has an unapproved admin_accounts table privilege';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.admin_accounts', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.admin_accounts', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.admin_accounts', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.admin_accounts', 'DELETE') then
    raise exception 'service_role admin_accounts table privileges differ from the approved definition';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.get_my_admin_access()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.is_active_admin()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.has_admin_permission(text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.get_my_admin_access()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.is_active_admin()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.has_admin_permission(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.set_admin_accounts_updated_at()',
       'EXECUTE'
     ) then
    raise exception 'administrator function execution privileges differ from the approved definition';
  end if;
end
$privilege_validation$;

commit;

-- Manual bootstrap example only. Run separately in the SQL Editor after
-- replacing the placeholder with an exact Auth user UUID. Never use an email
-- address, URL parameter, or client-provided role as the administrator key.
--
-- insert into public.admin_accounts (
--   user_id,
--   role,
--   status,
--   created_by
-- ) values (
--   '<AUTH_USER_UUID>',
--   'super_admin',
--   'active',
--   null
-- );

-- Read-only post-install verification:
--
-- select user_id, role, status, created_by, created_at, updated_at,
--   suspended_at, revoked_at
-- from public.admin_accounts
-- order by created_at;
--
-- select public.is_active_admin();
-- select public.has_admin_permission('admin_dashboard_view');
-- select public.has_admin_permission('reports_view');
-- select public.has_admin_permission('reports_manage');
-- select public.has_admin_permission('admin_accounts_manage');
-- select public.has_admin_permission('unknown_permission');
-- select public.has_admin_permission(null);
-- select public.has_admin_permission('');
-- select * from public.get_my_admin_access();

-- Status transitions must update the status timestamps atomically:
--
-- update public.admin_accounts
-- set status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
-- where user_id = '<AUTH_USER_UUID>';
--
-- update public.admin_accounts
-- set status = 'active', suspended_at = null, revoked_at = null
-- where user_id = '<AUTH_USER_UUID>';
--
-- update public.admin_accounts
-- set status = 'revoked', revoked_at = pg_catalog.now()
-- where user_id = '<AUTH_USER_UUID>';

-- Use only disposable Auth test users for destructive constraint, write-denial,
-- and ON DELETE tests. Wrap test data changes in a transaction and ROLLBACK.
-- Do not delete or expose an operational user, UUID, email, or password.
