-- ComMatch member service write guards.
--
-- Run after admin-member-restrictions.sql, favorites.sql, and
-- matching-chat.sql. This migration narrows existing member write policies and
-- adds the same access check to the three matching/chat mutation RPCs. It does
-- not change table data, read policies, report RPCs, account deletion, or
-- Storage policies.

begin;

do $preflight$
declare
  v_relation_name text;
  v_function record;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if v_authenticated_oid is null
     or not exists (
       select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'anon'
     )
     or not exists (
       select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'service_role'
     ) then
    raise exception 'Required anon, authenticated, or service_role role is missing';
  end if;

  foreach v_relation_name in array array[
    'favorites',
    'profiles',
    'preferences',
    'matches',
    'messages'
  ]
  loop
    if pg_catalog.to_regclass('public.' || v_relation_name) is null then
      raise exception 'Required table public.% is missing', v_relation_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)') is null
     or pg_catalog.pg_get_function_result(
       pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)')
     ) <> 'void'
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       where function_info.oid =
         pg_catalog.to_regprocedure('public.lock_member_service_write(uuid)')
         and not function_info.prosecdef
         and function_info.provolatile = 'v'
         and not function_info.proretset
         and function_info.prorettype = 'pg_catalog.void'::pg_catalog.regtype
         and pg_catalog.strpos(
           function_info.prosrc,
           'pg_catalog.pg_advisory_xact_lock'
         ) > 0
         and pg_catalog.strpos(
           function_info.prosrc,
           'pg_catalog.hashtextextended(p_user_id::text, 731947)'
         ) > 0
         and exists (
           select 1
           from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
           where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
             and pg_catalog.replace(
               pg_catalog.substr(
                 function_config.setting,
                 pg_catalog.char_length('search_path=') + 1
               ),
               '"',
               ''
             ) = ''
         )
         and not exists (
           select 1
           from pg_catalog.aclexplode(
             coalesce(
               function_info.proacl,
               pg_catalog.acldefault('f', function_info.proowner)
             )
           ) as function_acl
           where function_acl.grantee = 0
             and function_acl.privilege_type = 'EXECUTE'
         )
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.lock_member_service_write(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.lock_member_service_write(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'public.lock_member_service_write(uuid)',
       'EXECUTE'
     ) then
    raise exception 'public.lock_member_service_write(uuid) is missing or incompatible';
  end if;

  if pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.pg_get_function_result(
       pg_catalog.to_regprocedure('public.is_member_service_allowed()')
     ) <> 'boolean'
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       where function_info.oid =
         pg_catalog.to_regprocedure('public.is_member_service_allowed()')
         and function_info.prosecdef
         and function_info.provolatile = 'v'
         and not function_info.proretset
         and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
         and pg_catalog.strpos(
           function_info.prosrc,
           'public.lock_member_service_write(v_user_id)'
         ) > 0
         and pg_catalog.strpos(
           function_info.prosrc,
           'public.get_my_member_access()'
         ) > pg_catalog.strpos(
           function_info.prosrc,
           'public.lock_member_service_write(v_user_id)'
         )
         and exists (
           select 1
           from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
           where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
             and pg_catalog.replace(
               pg_catalog.substr(
                 function_config.setting,
                 pg_catalog.char_length('search_path=') + 1
               ),
               '"',
               ''
             ) = ''
         )
     ) then
    raise exception 'public.is_member_service_allowed() is missing or incompatible';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.is_member_service_allowed()',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.is_member_service_allowed()',
    'EXECUTE'
  ) then
    raise exception 'public.is_member_service_allowed() execution privileges are incompatible';
  end if;

  for v_function in
    select *
    from (values
      ('public.send_match_message(uuid,text)', 'uuid'),
      ('public.mark_match_read(uuid)', 'bigint'),
      ('public.end_match(uuid)', 'text')
    ) as expected_function(identity, result_type)
  loop
    if pg_catalog.to_regprocedure(v_function.identity) is null
       or pg_catalog.pg_get_function_result(
         pg_catalog.to_regprocedure(v_function.identity)
       ) <> v_function.result_type
       or not exists (
         select 1
         from pg_catalog.pg_proc as function_info
         where function_info.oid = pg_catalog.to_regprocedure(v_function.identity)
           and function_info.prolang = (
             select language_info.oid
             from pg_catalog.pg_language as language_info
             where language_info.lanname = 'plpgsql'
           )
           and function_info.prosecdef
           and not function_info.proretset
           and not function_info.proisstrict
           and function_info.provolatile = 'v'
           and function_info.proparallel = 'u'
           and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
             'commatch_matching_chat_v1'
           and exists (
             select 1
             from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
             where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
               and pg_catalog.replace(
                 pg_catalog.substr(
                   function_config.setting,
                   pg_catalog.char_length('search_path=') + 1
                 ),
                 '"',
                 ''
               ) = ''
           )
       ) then
      raise exception '% is missing or incompatible', v_function.identity;
    end if;

    if not pg_catalog.has_function_privilege(
      'authenticated',
      v_function.identity,
      'EXECUTE'
    ) or pg_catalog.has_function_privilege('anon', v_function.identity, 'EXECUTE') then
      raise exception '% execution privileges are incompatible', v_function.identity;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid in (
      'public.favorites'::pg_catalog.regclass,
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass
    )
      and not relation_info.relrowsecurity
  ) then
    raise exception 'favorites, profiles, and preferences must have RLS enabled';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.favorites'::pg_catalog.regclass
      and column_info.attname = 'user_id'
      and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not column_info.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.profiles'::pg_catalog.regclass
      and column_info.attname = 'id'
      and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not column_info.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.preferences'::pg_catalog.regclass
      and column_info.attname = 'user_id'
      and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not column_info.attisdropped
  ) then
    raise exception 'Required member ownership columns are missing or incompatible';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.favorites'::pg_catalog.regclass,
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass
    )
      and policy_info.polcmd = '*'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
  ) then
    raise exception 'FOR ALL policies cannot be narrowed without affecting reads';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass
    )
      and policy_info.polcmd in ('d', '*')
  ) then
    raise exception 'profiles and preferences must not have DELETE or FOR ALL policies';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.profiles',
       'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.preferences',
       'DELETE'
     ) then
    raise exception 'service_role DELETE privileges must exist before installation';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polcmd = 'a'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polname = 'Users can insert own favorites'
      and policy_info.polcmd = 'a'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_authenticated_oid]
      and policy_info.polqual is null
      and policy_info.polwithcheck is not null
      and pg_catalog.strpos(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)
        ),
        'auth.uid'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)
        ),
        'user_id'
      ) > 0
  ) then
    raise exception 'favorites INSERT policy differs from the approved ownership policy';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polcmd = 'd'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polname = 'Users can delete own favorites'
      and policy_info.polcmd = 'd'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_authenticated_oid]
      and policy_info.polqual is not null
      and policy_info.polwithcheck is null
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        'auth.uid'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        'user_id'
      ) > 0
  ) then
    raise exception 'favorites DELETE policy differs from the approved ownership policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.favorites'::pg_catalog.regclass
      and trigger_info.tgname = 'favorites_create_mutual_match'
      and not trigger_info.tgisinternal
      and trigger_info.tgfoid =
        'public.handle_mutual_favorite_match()'::pg_catalog.regprocedure
      and trigger_info.tgtype = 5
      and trigger_info.tgenabled = 'O'
  ) then
    raise exception 'favorites mutual-match trigger is missing or incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd = 'a'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.profiles'::pg_catalog.regclass
      and policy_info.polcmd = 'w'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.preferences'::pg_catalog.regclass
      and policy_info.polcmd = 'a'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.preferences'::pg_catalog.regclass
      and policy_info.polcmd = 'w'
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
  ) then
    raise exception 'Required profile or preference INSERT/UPDATE policy is missing';
  end if;
end
$preflight$;

-- Capture the exact SELECT policy metadata before changing write-only grants
-- and predicates. The postflight comparison prevents accidental read-policy
-- drift without assuming policy names or expressions that are not owned here.
create temporary table _commatch_member_write_guard_select_policies
on commit drop
as
select
  policy_info.polrelid,
  policy_info.polname,
  policy_info.polpermissive,
  policy_info.polroles,
  pg_catalog.pg_get_expr(
    policy_info.polqual,
    policy_info.polrelid
  ) as using_expression,
  case
    when policy_info.polwithcheck is null then null
    else pg_catalog.pg_get_expr(
      policy_info.polwithcheck,
      policy_info.polrelid
    )
  end as check_expression
from pg_catalog.pg_policy as policy_info
where policy_info.polrelid in (
    'public.profiles'::pg_catalog.regclass,
    'public.preferences'::pg_catalog.regclass
  )
  and policy_info.polcmd = 'r';

-- Preserve every existing policy name, role list, permissive/restrictive mode,
-- and ownership expression. Only append the common member access predicate.
do $write_policies$
declare
  v_policy record;
  v_using_expression text;
  v_check_expression text;
  v_effective_check_expression text;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  for v_policy in
    select
      namespace_info.nspname as schema_name,
      relation_info.relname as table_name,
      policy_info.polname as policy_name,
      policy_info.polcmd,
      policy_info.polqual,
      policy_info.polwithcheck,
      policy_info.polrelid
    from pg_catalog.pg_policy as policy_info
    join pg_catalog.pg_class as relation_info
      on relation_info.oid = policy_info.polrelid
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = relation_info.relnamespace
    where (
      (
        policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
        and policy_info.polcmd in ('a', 'd')
      ) or (
        policy_info.polrelid in (
          'public.profiles'::pg_catalog.regclass,
          'public.preferences'::pg_catalog.regclass
        )
        and policy_info.polcmd in ('a', 'w')
      )
    )
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
    order by namespace_info.nspname, relation_info.relname, policy_info.polname
  loop
    v_using_expression := case
      when v_policy.polqual is null then null
      else pg_catalog.pg_get_expr(v_policy.polqual, v_policy.polrelid)
    end;
    v_check_expression := case
      when v_policy.polwithcheck is null then null
      else pg_catalog.pg_get_expr(v_policy.polwithcheck, v_policy.polrelid)
    end;

    if v_policy.polcmd = 'a' then
      if v_check_expression is null then
        raise exception 'INSERT policy %.%/% has no WITH CHECK expression',
          v_policy.schema_name, v_policy.table_name, v_policy.policy_name;
      end if;

      if pg_catalog.strpos(
        pg_catalog.lower(v_check_expression),
        'is_member_service_allowed'
      ) = 0 then
        execute pg_catalog.format(
          'alter policy %I on %I.%I with check ((%s) and (select public.is_member_service_allowed()))',
          v_policy.policy_name,
          v_policy.schema_name,
          v_policy.table_name,
          v_check_expression
        );
      end if;
    elsif v_policy.polcmd = 'd' then
      if v_using_expression is null then
        raise exception 'DELETE policy %.%/% has no USING expression',
          v_policy.schema_name, v_policy.table_name, v_policy.policy_name;
      end if;

      if pg_catalog.strpos(
        pg_catalog.lower(v_using_expression),
        'is_member_service_allowed'
      ) = 0 then
        execute pg_catalog.format(
          'alter policy %I on %I.%I using ((%s) and (select public.is_member_service_allowed()))',
          v_policy.policy_name,
          v_policy.schema_name,
          v_policy.table_name,
          v_using_expression
        );
      end if;
    elsif v_policy.polcmd = 'w' then
      v_using_expression := coalesce(v_using_expression, 'true');
      v_effective_check_expression := coalesce(
        v_check_expression,
        v_using_expression,
        'true'
      );

      if v_check_expression is null or pg_catalog.strpos(
        pg_catalog.lower(v_using_expression),
        'is_member_service_allowed'
      ) = 0 or pg_catalog.strpos(
        pg_catalog.lower(v_effective_check_expression),
        'is_member_service_allowed'
      ) = 0 then
        execute pg_catalog.format(
          'alter policy %I on %I.%I using ((%s) and (select public.is_member_service_allowed())) with check ((%s) and (select public.is_member_service_allowed()))',
          v_policy.policy_name,
          v_policy.schema_name,
          v_policy.table_name,
          v_using_expression,
          v_effective_check_expression
        );
      end if;
    end if;
  end loop;
end
$write_policies$;

-- Direct profile/preference row deletion is not a browser feature. Account
-- deletion remains available through the service-role server route.
revoke delete on table public.profiles from anon, authenticated;
revoke delete on table public.preferences from anon, authenticated;

create or replace function public.send_match_message(p_match_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_content text;
  v_match public.matches%rowtype;
  v_message_id uuid;
  v_created_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  v_content := pg_catalog.btrim(p_content);
  if v_content is null or pg_catalog.char_length(v_content) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'Message content must be between 1 and 1000 characters';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;

  if v_user_id <> v_match.user_1_id and v_user_id <> v_match.user_2_id then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  if v_match.status <> 'active' then
    raise exception using errcode = '55000', message = 'Messages cannot be sent to an ended match';
  end if;

  insert into public.messages (
    match_id,
    sender_id,
    content,
    message_type,
    read_at,
    created_at
  ) values (
    p_match_id,
    v_user_id,
    v_content,
    'text',
    null,
    v_created_at
  )
  returning id into v_message_id;

  update public.matches as match_row
  set last_message_at = v_created_at,
      updated_at = v_created_at
  where match_row.id = p_match_id;

  return v_message_id;
end
$function$;

create or replace function public.mark_match_read(p_match_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_is_participant boolean;
  v_updated_count bigint;
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  select exists (
    select 1
    from public.matches as match_row
    where match_row.id = p_match_id
      and (match_row.user_1_id = v_user_id or match_row.user_2_id = v_user_id)
  ) into v_is_participant;

  if not v_is_participant then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  update public.messages as message_row
  set read_at = pg_catalog.now()
  where message_row.match_id = p_match_id
    and message_row.sender_id <> v_user_id
    and message_row.read_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end
$function$;

create or replace function public.end_match(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_match public.matches%rowtype;
  v_ended_at timestamptz := pg_catalog.now();
begin
  -- commatch_matching_chat_v1
  -- commatch_member_service_write_guards_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using
      errcode = '42501',
      message = '회원 이용이 제한되어 현재 작업을 수행할 수 없습니다.';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = p_match_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;

  if v_user_id <> v_match.user_1_id and v_user_id <> v_match.user_2_id then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  if v_match.status = 'ended' then
    return 'ended';
  end if;

  update public.matches as match_row
  set status = 'ended',
      ended_at = v_ended_at,
      ended_by = v_user_id,
      updated_at = v_ended_at
  where match_row.id = p_match_id;

  return 'ended';
end
$function$;

-- CREATE OR REPLACE preserves owners, comments, and existing ACLs. Validate
-- both the preserved interface and the new guard marker before committing.
do $post_installation_validation$
declare
  v_function record;
  v_authenticated_oid oid;
begin
  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where (
      (
        policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
        and policy_info.polcmd in ('a', 'd')
      ) or (
        policy_info.polrelid in (
          'public.profiles'::pg_catalog.regclass,
          'public.preferences'::pg_catalog.regclass
        )
        and policy_info.polcmd in ('a', 'w')
      )
    )
      and (
        policy_info.polroles = array[0::oid]
        or v_authenticated_oid = any(policy_info.polroles)
      )
      and case policy_info.polcmd
        when 'a' then policy_info.polwithcheck is null or pg_catalog.strpos(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)
          ),
          'is_member_service_allowed'
        ) = 0
        when 'd' then policy_info.polqual is null or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
          'is_member_service_allowed'
        ) = 0
        when 'w' then policy_info.polqual is null
          or policy_info.polwithcheck is null
          or pg_catalog.strpos(
            pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
            'is_member_service_allowed'
          ) = 0
          or pg_catalog.strpos(
            pg_catalog.lower(
              pg_catalog.pg_get_expr(policy_info.polwithcheck, policy_info.polrelid)
            ),
            'is_member_service_allowed'
          ) = 0
        else true
      end
  ) then
    raise exception 'A protected member write policy is missing the access guard';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass
    )
      and not relation_info.relrowsecurity
  ) then
    raise exception 'profiles and preferences must keep RLS enabled';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid in (
      'public.profiles'::pg_catalog.regclass,
      'public.preferences'::pg_catalog.regclass
    )
      and policy_info.polcmd in ('d', '*')
  ) then
    raise exception 'profiles or preferences gained a DELETE or FOR ALL policy';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.profiles', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.preferences', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.preferences', 'DELETE') then
    raise exception 'Browser DELETE privileges on profiles or preferences remain enabled';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.profiles', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.preferences', 'DELETE') then
    raise exception 'service_role DELETE privileges changed unexpectedly';
  end if;

  if exists (
    (
      select
        policy_info.polrelid,
        policy_info.polname,
        policy_info.polpermissive,
        policy_info.polroles,
        pg_catalog.pg_get_expr(
          policy_info.polqual,
          policy_info.polrelid
        ) as using_expression,
        case
          when policy_info.polwithcheck is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polwithcheck,
            policy_info.polrelid
          )
        end as check_expression
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid in (
          'public.profiles'::pg_catalog.regclass,
          'public.preferences'::pg_catalog.regclass
        )
        and policy_info.polcmd = 'r'
      except
      select *
      from pg_temp._commatch_member_write_guard_select_policies
    )
  ) or exists (
    (
      select *
      from pg_temp._commatch_member_write_guard_select_policies
      except
      select
        policy_info.polrelid,
        policy_info.polname,
        policy_info.polpermissive,
        policy_info.polroles,
        pg_catalog.pg_get_expr(
          policy_info.polqual,
          policy_info.polrelid
        ) as using_expression,
        case
          when policy_info.polwithcheck is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polwithcheck,
            policy_info.polrelid
          )
        end as check_expression
      from pg_catalog.pg_policy as policy_info
      where policy_info.polrelid in (
          'public.profiles'::pg_catalog.regclass,
          'public.preferences'::pg_catalog.regclass
        )
        and policy_info.polcmd = 'r'
    )
  ) then
    raise exception 'profiles or preferences SELECT policies changed unexpectedly';
  end if;

  for v_function in
    select *
    from (values
      ('public.send_match_message(uuid,text)', 'uuid'),
      ('public.mark_match_read(uuid)', 'bigint'),
      ('public.end_match(uuid)', 'text')
    ) as expected_function(identity, result_type)
  loop
    if pg_catalog.pg_get_function_result(
      pg_catalog.to_regprocedure(v_function.identity)
    ) <> v_function.result_type or not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      where function_info.oid = pg_catalog.to_regprocedure(v_function.identity)
        and function_info.prosecdef
        and not function_info.proretset
        and not function_info.proisstrict
        and function_info.provolatile = 'v'
        and function_info.proparallel = 'u'
        and pg_catalog.strpos(
          function_info.prosrc,
          'commatch_member_service_write_guards_v1'
        ) > 0
        and pg_catalog.strpos(
          function_info.prosrc,
          'public.is_member_service_allowed()'
        ) > 0
        and exists (
          select 1
          from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
          where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
            and pg_catalog.replace(
              pg_catalog.substr(
                function_config.setting,
                pg_catalog.char_length('search_path=') + 1
              ),
              '"',
              ''
            ) = ''
        )
    ) then
      raise exception '% was not guarded with its approved interface', v_function.identity;
    end if;

    if not pg_catalog.has_function_privilege(
      'authenticated',
      v_function.identity,
      'EXECUTE'
    ) or pg_catalog.has_function_privilege('anon', v_function.identity, 'EXECUTE') then
      raise exception '% execution privileges changed unexpectedly', v_function.identity;
    end if;
  end loop;
end
$post_installation_validation$;

commit;

-- Storage note:
-- The repository does not contain the profile_images bucket policy definitions.
-- This migration intentionally does not alter storage.objects policies. Add a
-- separately reviewed migration after capturing their exact current commands,
-- roles, bucket predicates, and owner-folder checks.
