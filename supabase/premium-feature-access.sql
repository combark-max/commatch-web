-- ComMatch Premium feature access for the priority recommendation internal pilot.
-- This file is not executed automatically. Review it before running it once in
-- the Supabase SQL Editor. Test members are managed manually after installation.

begin;

do $preflight$
declare
  v_install_marker constant text := 'commatch_priority_recommendation_pilot_v1';
  v_access_table regclass := pg_catalog.to_regclass('public.premium_feature_access');
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist';
  end if;

  if v_access_table is not null
     and not exists (
       select 1
       from pg_catalog.pg_class as table_info
       where table_info.oid = v_access_table
         and table_info.relkind = 'r'
         and pg_catalog.obj_description(table_info.oid, 'pg_class') = v_install_marker
     ) then
    raise exception 'public.premium_feature_access already exists with an unapproved definition';
  end if;

end
$preflight$;

create table if not exists public.premium_feature_access (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null,
  feature_key text not null,
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint premium_feature_access_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint premium_feature_access_user_feature_key_unique
    unique (user_id, feature_key),
  constraint premium_feature_access_valid_period_check
    check (ends_at > starts_at),
  constraint premium_feature_access_feature_key_check
    check (feature_key = pg_catalog.btrim(feature_key) and pg_catalog.btrim(feature_key) <> '')
);

comment on table public.premium_feature_access is 'commatch_priority_recommendation_pilot_v1';

create index if not exists premium_feature_access_active_lookup_idx
on public.premium_feature_access (feature_key, starts_at, ends_at, user_id)
where is_active;

do $table_validation$
declare
  v_actual_columns text[];
begin
  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s:%s', column_name, udt_name, is_nullable)
    order by ordinal_position
  )
  into v_actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'premium_feature_access';

  if v_actual_columns is distinct from array[
    'id:uuid:NO',
    'user_id:uuid:NO',
    'feature_key:text:NO',
    'starts_at:timestamptz:NO',
    'ends_at:timestamptz:NO',
    'is_active:bool:NO',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.premium_feature_access columns differ from the approved definition';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'premium_feature_access'
      and column_name = 'id'
      and pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g') in (
        'gen_random_uuid()',
        'pg_catalog.gen_random_uuid()'
      )
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'premium_feature_access'
      and column_name = 'starts_at'
      and pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g') in ('now()', 'pg_catalog.now()')
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'premium_feature_access'
      and column_name = 'is_active'
      and pg_catalog.lower(pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g')) = 'true'
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'premium_feature_access'
      and column_name in ('user_id', 'feature_key', 'ends_at')
      and column_default is not null
  ) or (
    select pg_catalog.count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'premium_feature_access'
      and column_name in ('created_at', 'updated_at')
      and pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g') in ('now()', 'pg_catalog.now()')
  ) <> 2 then
    raise exception 'public.premium_feature_access defaults differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname = 'premium_feature_access_pkey'
      and constraint_info.contype = 'p'
      and pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_info.oid), '[[:space:]]+', '', 'g') = 'PRIMARYKEY(id)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname = 'premium_feature_access_user_id_fkey'
      and constraint_info.contype = 'f'
      and constraint_info.confrelid = 'public.profiles'::pg_catalog.regclass
      and constraint_info.confdeltype = 'c'
      and pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_info.oid), '[[:space:]]+', '', 'g')
        in (
          'FOREIGNKEY(user_id)REFERENCESprofiles(id)ONDELETECASCADE',
          'FOREIGNKEY(user_id)REFERENCESpublic.profiles(id)ONDELETECASCADE'
        )
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname = 'premium_feature_access_user_feature_key_unique'
      and constraint_info.contype = 'u'
      and pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_info.oid), '[[:space:]]+', '', 'g')
        = 'UNIQUE(user_id,feature_key)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname = 'premium_feature_access_valid_period_check'
      and constraint_info.contype = 'c'
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_info.oid), 'ends_at') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_info.oid), 'starts_at') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_info.oid), '>') > 0
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname = 'premium_feature_access_feature_key_check'
      and constraint_info.contype = 'c'
      and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_constraintdef(constraint_info.oid)), 'btrim') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_constraintdef(constraint_info.oid), '<>') > 0
  ) or exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and constraint_info.conname not in (
        'premium_feature_access_pkey',
        'premium_feature_access_user_id_fkey',
        'premium_feature_access_user_feature_key_unique',
        'premium_feature_access_valid_period_check',
        'premium_feature_access_feature_key_check'
      )
  ) then
    raise exception 'public.premium_feature_access constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_info
    where index_info.indexrelid = 'public.premium_feature_access_active_lookup_idx'::pg_catalog.regclass
      and index_info.indrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and not index_info.indisunique
      and index_info.indnkeyatts = 4
      and pg_catalog.strpos(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_indexdef(index_info.indexrelid),
          '[[:space:]]+',
          '',
          'g'
        ),
        '(feature_key,starts_at,ends_at,user_id)'
      ) > 0
      and pg_catalog.regexp_replace(
        pg_catalog.pg_get_expr(index_info.indpred, index_info.indrelid),
        '[[:space:]]+',
        '',
        'g'
      ) = 'is_active'
  ) then
    raise exception 'premium_feature_access_active_lookup_idx differs from the approved definition';
  end if;
end
$table_validation$;

do $updated_at_function$
begin
  if pg_catalog.to_regprocedure('public.set_premium_feature_access_updated_at()') is null then
    execute $create_function$
      create function public.set_premium_feature_access_updated_at()
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
    comment on function public.set_premium_feature_access_updated_at()
      is 'commatch_priority_recommendation_pilot_v1';
  elsif not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure(
        'public.set_premium_feature_access_updated_at()'
      )
      and namespace_info.nspname = 'public'
      and function_info.proname = 'set_premium_feature_access_updated_at'
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
      and language_info.lanname = 'plpgsql'
      and not function_info.prosecdef
      and function_info.provolatile = 'v'
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
          and pg_catalog.replace(
            pg_catalog.substr(function_config.setting, pg_catalog.char_length('search_path=') + 1),
            '"',
            ''
          ) = ''
      )
  ) then
    raise exception 'public.set_premium_feature_access_updated_at() exists with incompatible catalog attributes';
  end if;
end
$updated_at_function$;

do $updated_at_trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and trigger_info.tgname = 'premium_feature_access_set_updated_at'
      and not trigger_info.tgisinternal
  ) then
    create trigger premium_feature_access_set_updated_at
      before update on public.premium_feature_access
      for each row
      execute function public.set_premium_feature_access_updated_at();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.premium_feature_access'::pg_catalog.regclass
      and trigger_info.tgname = 'premium_feature_access_set_updated_at'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid = 'public.set_premium_feature_access_updated_at()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 19
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgnargs = 0
  ) then
    raise exception 'premium_feature_access_set_updated_at already exists with an unapproved definition';
  end if;
end
$updated_at_trigger$;

do $candidate_function$
begin
  if pg_catalog.to_regprocedure('public.get_priority_recommendation_candidate_ids()') is null then
    execute $create_function$
      create function public.get_priority_recommendation_candidate_ids()
      returns table (user_id uuid)
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        v_user_id uuid;
        v_gender text;
      begin
        select auth.uid() into v_user_id;

        if v_user_id is null then
          raise exception using
            errcode = '42501',
            message = 'Authentication required';
        end if;

        select viewer_profile.gender
        into v_gender
        from public.profiles as viewer_profile
        where viewer_profile.id = v_user_id;

        if v_gender is null or v_gender not in ('남성', '여성') then
          return;
        end if;

        return query
        select access_row.user_id
        from public.premium_feature_access as access_row
        join public.profiles as candidate_profile
          on candidate_profile.id = access_row.user_id
        where access_row.feature_key = 'priority_recommendation'
          and access_row.is_active
          and access_row.starts_at <= pg_catalog.now()
          and access_row.ends_at > pg_catalog.now()
          and access_row.user_id <> v_user_id
          and candidate_profile.gender = case v_gender
            when '남성' then '여성'
            when '여성' then '남성'
          end
        order by access_row.user_id;
      end
      $body$
    $create_function$;
    comment on function public.get_priority_recommendation_candidate_ids()
      is 'commatch_priority_recommendation_pilot_v1';
  elsif not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = pg_catalog.to_regprocedure(
        'public.get_priority_recommendation_candidate_ids()'
      )
      and namespace_info.nspname = 'public'
      and function_info.proname = 'get_priority_recommendation_candidate_ids'
      and function_info.pronargs = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and language_info.lanname = 'plpgsql'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
          and pg_catalog.replace(
            pg_catalog.substr(function_config.setting, pg_catalog.char_length('search_path=') + 1),
            '"',
            ''
          ) = ''
      )
  ) then
    raise exception 'public.get_priority_recommendation_candidate_ids() exists with incompatible catalog attributes';
  end if;
end
$candidate_function$;

alter table public.premium_feature_access enable row level security;

do $rls_validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.premium_feature_access'::pg_catalog.regclass
      and table_info.relkind = 'r'
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.premium_feature_access';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.premium_feature_access'::pg_catalog.regclass
  ) then
    raise exception 'public.premium_feature_access contains an unapproved RLS policy';
  end if;
end
$rls_validation$;

revoke all on table public.premium_feature_access from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.premium_feature_access to service_role;

revoke all on function public.set_premium_feature_access_updated_at() from public, anon, authenticated;
revoke all on function public.get_priority_recommendation_candidate_ids() from public, anon, authenticated;
grant execute on function public.get_priority_recommendation_candidate_ids() to authenticated;

commit;

-- Manual pilot management examples. These comments do not run with this file.
--
-- Register a test member for 14 days:
-- insert into public.premium_feature_access (
--   user_id, feature_key, starts_at, ends_at, is_active
-- ) values (
--   '00000000-0000-0000-0000-000000000000',
--   'priority_recommendation',
--   pg_catalog.now(),
--   pg_catalog.now() + interval '14 days',
--   true
-- );
--
-- Extend the test period:
-- update public.premium_feature_access
-- set ends_at = ends_at + interval '7 days'
-- where user_id = '00000000-0000-0000-0000-000000000000'
--   and feature_key = 'priority_recommendation';
--
-- Deactivate the test member:
-- update public.premium_feature_access
-- set is_active = false
-- where user_id = '00000000-0000-0000-0000-000000000000'
--   and feature_key = 'priority_recommendation';
--
-- End the test period now:
-- update public.premium_feature_access
-- set ends_at = pg_catalog.now()
-- where user_id = '00000000-0000-0000-0000-000000000000'
--   and feature_key = 'priority_recommendation'
--   and starts_at < pg_catalog.now();
--
-- Post-install RPC catalog diagnostic. Run separately after installation if needed:
-- select
--   pg_catalog.pg_get_function_result(
--     'public.get_priority_recommendation_candidate_ids()'::pg_catalog.regprocedure
--   ),
--   function_info.proretset,
--   function_info.prorettype::pg_catalog.regtype,
--   function_info.prosecdef,
--   function_info.proconfig,
--   function_info.proallargtypes,
--   function_info.proargmodes,
--   function_info.proargnames
-- from pg_catalog.pg_proc as function_info
-- where function_info.oid =
--   'public.get_priority_recommendation_candidate_ids()'::pg_catalog.regprocedure;
