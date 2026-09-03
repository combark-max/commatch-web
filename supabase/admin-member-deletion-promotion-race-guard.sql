-- ComMatch administrator deletion/promotion race guard.
-- Deployment/review artifact: apply manually after approval.

begin;

do $preflight$
declare
  v_request_oid oid := pg_catalog.to_regprocedure(
    'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
  );
  v_create_oid oid := pg_catalog.to_regprocedure(
    'public.create_admin_account(uuid,text,uuid,text)'
  );
  v_lock_oid oid := pg_catalog.to_regprocedure('public.lock_admin_account_write()');
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.admin_account_actions') is null
     or pg_catalog.to_regclass('public.admin_member_deletion_actions') is null then
    raise exception 'Required administrator account and deletion objects do not exist';
  end if;

  if v_request_oid is null
     or v_create_oid is null
     or v_lock_oid is null then
    raise exception 'Required administrator account and deletion functions do not exist';
  end if;

  if pg_catalog.pg_get_function_identity_arguments(v_request_oid) <>
       'p_request_id uuid, p_target_user_id uuid, p_reason text, p_related_report_id uuid'
     or pg_catalog.pg_get_function_result(v_request_oid) <>
       'TABLE(request_id uuid, target_user_id uuid, status text, is_duplicate boolean, created_at timestamp with time zone)'
     or pg_catalog.obj_description(v_request_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1' then
    raise exception 'request_admin_member_deletion contract differs from the approved HEAD definition';
  end if;

  if pg_catalog.pg_get_function_identity_arguments(v_create_oid) <>
       'p_target_user_id uuid, p_role text, p_request_id uuid, p_reason text'
     or pg_catalog.pg_get_function_result(v_create_oid) <>
       'TABLE(action_id uuid, target_user_id uuid, role text, status text, updated_at timestamp with time zone)'
     or pg_catalog.obj_description(v_create_oid, 'pg_proc') <>
       'commatch_admin_account_management_v1' then
    raise exception 'create_admin_account contract differs from the approved HEAD definition';
  end if;

  if pg_catalog.pg_get_function_identity_arguments(v_lock_oid) <> ''
     or pg_catalog.pg_get_function_result(v_lock_oid) <> 'void'
     or pg_catalog.obj_description(v_lock_oid, 'pg_proc') <>
       'commatch_admin_account_management_v1' then
    raise exception 'lock_admin_account_write contract differs from the approved HEAD definition';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid in (v_request_oid, v_create_oid)
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
  ) <> 2 then
    raise exception 'RPC owner, security-definer, or search_path differs from the approved HEAD definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid = v_lock_oid
      and owner_role.rolname = 'postgres'
      and not function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
  ) then
    raise exception 'Admin write lock owner, security, or search_path differs from the approved HEAD definition';
  end if;

  if pg_catalog.has_function_privilege('public', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_request_oid, 'EXECUTE') then
    raise exception 'request_admin_member_deletion ACL differs from the approved HEAD definition';
  end if;

  if not pg_catalog.has_function_privilege('public', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('anon', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_create_oid, 'EXECUTE') then
    raise exception 'create_admin_account ACL differs from the approved HEAD definition';
  end if;

  if pg_catalog.has_function_privilege('public', v_lock_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_lock_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_lock_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_lock_oid, 'EXECUTE') then
    raise exception 'lock_admin_account_write ACL differs from the approved HEAD definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_member_deletion_actions'
      and indexname = 'admin_member_deletion_actions_requested_target_unique'
      and indexdef ilike '%UNIQUE%'
      and indexdef ilike '%WHERE (status = ''requested''::text)%'
  ) then
    raise exception 'Requested deletion partial unique index differs from the approved definition';
  end if;
end
$preflight$;

create or replace function public.request_admin_member_deletion(
  p_request_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_related_report_id uuid default null
)
returns table (
  request_id uuid,
  target_user_id uuid,
  status text,
  is_duplicate boolean,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_admin_role text;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_existing public.admin_member_deletion_actions%rowtype;
  v_created_at timestamptz := pg_catalog.now();
begin
  select admin_account.role
  into v_admin_role
  from public.admin_accounts as admin_account
  where admin_account.user_id = v_admin_user_id
    and admin_account.role = 'super_admin'
    and admin_account.status = 'active';

  if v_admin_user_id is null or not found then
    raise exception using errcode = '42501', message = 'Active super administrator required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_target_user_id = v_admin_user_id then
    raise exception using errcode = '42501', message = 'Administrators cannot delete themselves';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Deletion reason must be between 1 and 500 characters';
  end if;

  select action_row.*
  into v_existing
  from public.admin_member_deletion_actions as action_row
  where action_row.request_id = p_request_id;

  if found then
    if v_existing.admin_user_id is distinct from v_admin_user_id
       or v_existing.target_user_id is distinct from p_target_user_id
       or v_existing.reason is distinct from v_reason
       or v_existing.related_report_id is distinct from p_related_report_id then
      raise exception using errcode = '22023', message = 'MEMBER_DELETION_REQUEST_ID_CONFLICT';
    end if;

    return query
    select
      v_existing.request_id,
      v_existing.target_user_id,
      v_existing.status,
      true,
      v_existing.created_at;
    return;
  end if;

  perform public.lock_admin_account_write();

  if not exists (
    select 1 from auth.users as auth_user where auth_user.id = p_target_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1
    from public.admin_accounts as target_admin
    where target_admin.user_id = p_target_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator accounts cannot be force-deleted';
  end if;
  if p_related_report_id is not null and not exists (
    select 1
    from public.reports as report
    where report.id = p_related_report_id
      and report.target_user_id = p_target_user_id
  ) then
    raise exception using errcode = '22023', message = 'Related report does not match the target user';
  end if;

  begin
    insert into public.admin_member_deletion_actions (
      request_id,
      target_user_id,
      admin_user_id,
      admin_role,
      reason,
      related_report_id,
      status,
      created_at,
      updated_at
    ) values (
      p_request_id,
      p_target_user_id,
      v_admin_user_id,
      v_admin_role,
      v_reason,
      p_related_report_id,
      'requested',
      v_created_at,
      v_created_at
    );
  exception
    when unique_violation then
      select action_row.*
      into v_existing
      from public.admin_member_deletion_actions as action_row
      where action_row.request_id = p_request_id;

      if found
         and v_existing.admin_user_id is not distinct from v_admin_user_id
         and v_existing.target_user_id is not distinct from p_target_user_id
         and v_existing.reason is not distinct from v_reason
         and v_existing.related_report_id is not distinct from p_related_report_id then
        return query
        select
          v_existing.request_id,
          v_existing.target_user_id,
          v_existing.status,
          true,
          v_existing.created_at;
        return;
      end if;

      raise exception using errcode = 'P0001', message = 'MEMBER_DELETION_ALREADY_REQUESTED';
  end;

  return query
  select p_request_id, p_target_user_id, 'requested'::text, false, v_created_at;
end
$function$;

create or replace function public.create_admin_account(
  p_target_user_id uuid,
  p_role text,
  p_request_id uuid,
  p_reason text default null
)
returns table (action_id uuid, target_user_id uuid, role text, status text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_existing_action public.admin_account_actions%rowtype;
  v_fingerprint text;
  v_now timestamptz := now();
  v_caller_role text;
  v_caller_status text;
begin
  if p_target_user_id is null then
    raise using errcode = '22023', message = 'p_target_user_id is required';
  end if;
  if p_request_id is null then
    raise using errcode = '22023', message = 'p_request_id is required';
  end if;
  if p_role is null then
    raise using errcode = '22023', message = 'p_role is required';
  end if;

  perform public.lock_admin_account_write();

  select a.role, a.status into v_caller_role, v_caller_status
  from public.admin_accounts a
  where a.user_id = v_actor;
  if not found or v_caller_role is null or v_caller_status is null then
    raise using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_caller_role <> 'super_admin' or v_caller_status <> 'active' then
    raise using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if not coalesce(public.has_admin_permission('admin_accounts_manage'), false) then
    raise using errcode = '42501', message = 'Insufficient admin permission';
  end if;

  v_fingerprint := public._admin_request_fingerprint(
    v_actor,
    'created',
    p_target_user_id,
    p_role,
    null::text,
    null::timestamptz,
    p_reason
  );
  select * into v_existing_action
  from public.admin_account_actions
  where request_id = p_request_id;
  if found then
    if v_existing_action.request_fingerprint = v_fingerprint then
      return query
      select
        aa.id,
        aa.target_user_id,
        (aa.target_snapshot->>'role')::text,
        (aa.target_snapshot->>'status')::text,
        case
          when aa.new_updated_at is not null then aa.new_updated_at
          else (aa.target_snapshot->>'updated_at')::timestamptz
        end
      from public.admin_account_actions aa
      where aa.request_id = p_request_id;
      return;
    else
      raise using errcode = 'A1002', message = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    end if;
  end if;

  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise using errcode = 'A1005', message = 'ADMIN_ACCOUNT_TARGET_NOT_FOUND';
  end if;

  if lower(coalesce(p_role, '')) not in ('super_admin', 'admin', 'moderator') then
    raise using errcode = '22023', message = 'Invalid role';
  end if;

  if exists (select 1 from public.admin_accounts where user_id = p_target_user_id) then
    raise using errcode = 'A1007', message = 'ADMIN_ACCOUNT_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.admin_member_deletion_actions as deletion_action
    where deletion_action.target_user_id = p_target_user_id
      and deletion_action.status = 'requested'
  ) then
    raise using errcode = 'P0001', message = 'ADMIN_ACCOUNT_TARGET_DELETION_REQUESTED';
  end if;

  insert into public.admin_accounts (user_id, role, status, created_by, created_at, updated_at)
  values (p_target_user_id, p_role, 'active', v_actor, v_now, v_now);

  perform 1;
  declare
    v_target_row record;
    v_actor_row record;
  begin
    select a.user_id, a.role, a.status, a.created_at, a.updated_at, a.suspended_at, a.revoked_at
    into v_target_row
    from public.admin_accounts a
    where a.user_id = p_target_user_id;
    select u.id, u.email into v_actor_row
    from auth.users u
    where u.id = v_actor;

    begin
      insert into public.admin_account_actions (
        request_id, request_fingerprint, target_user_id, actor_user_id,
        action_type, previous_role, new_role, previous_status, new_status,
        previous_updated_at, new_updated_at, reason, target_snapshot, actor_snapshot
      ) values (
        p_request_id,
        v_fingerprint,
        p_target_user_id,
        v_actor,
        'created',
        null,
        v_target_row.role,
        null,
        v_target_row.status,
        null,
        v_target_row.updated_at,
        public._admin_canonical_reason(p_reason),
        pg_catalog.jsonb_build_object(
          'user_id', v_target_row.user_id::text,
          'email', (select u.email from auth.users u where u.id = v_target_row.user_id),
          'nickname', (select p.nickname from public.profiles p where p.id = v_target_row.user_id),
          'role', v_target_row.role,
          'status', v_target_row.status,
          'created_at', v_target_row.created_at,
          'updated_at', v_target_row.updated_at,
          'suspended_at', v_target_row.suspended_at,
          'revoked_at', v_target_row.revoked_at
        ),
        pg_catalog.jsonb_build_object(
          'user_id', coalesce(v_actor_row.id::text, null),
          'email', coalesce(v_actor_row.email, null)
        )
      ) returning id into action_id;

      target_user_id := p_target_user_id;
      role := v_target_row.role;
      status := v_target_row.status;
      updated_at := v_target_row.updated_at;
      return next;
    exception
      when unique_violation then
        select * into v_existing_action
        from public.admin_account_actions
        where request_id = p_request_id;
        if v_existing_action.request_fingerprint = v_fingerprint then
          action_id := v_existing_action.id;
          target_user_id := v_existing_action.target_user_id::uuid;
          role := (v_existing_action.target_snapshot->>'role')::text;
          status := (v_existing_action.target_snapshot->>'status')::text;
          updated_at := coalesce(
            v_existing_action.new_updated_at,
            (v_existing_action.target_snapshot->>'updated_at')::timestamptz
          );
          return next;
        else
          raise using errcode = 'A1002', message = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
        end if;
    end;
  end;
end
$function$;

alter function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  owner to postgres;
alter function public.create_admin_account(uuid, text, uuid, text)
  owner to postgres;

comment on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  is 'commatch_admin_member_deletions_v1';
comment on function public.create_admin_account(uuid, text, uuid, text)
  is 'commatch_admin_account_management_v1';

revoke all on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  to authenticated;

revoke all on function public.create_admin_account(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_account(uuid, text, uuid, text)
  to public, authenticated;

do $postflight$
declare
  v_request_oid oid := pg_catalog.to_regprocedure(
    'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
  );
  v_create_oid oid := pg_catalog.to_regprocedure(
    'public.create_admin_account(uuid,text,uuid,text)'
  );
  v_request_definition text;
  v_create_definition text;
begin
  if v_request_oid is null or v_create_oid is null
     or pg_catalog.pg_get_function_identity_arguments(v_request_oid) <>
       'p_request_id uuid, p_target_user_id uuid, p_reason text, p_related_report_id uuid'
     or pg_catalog.pg_get_function_identity_arguments(v_create_oid) <>
       'p_target_user_id uuid, p_role text, p_request_id uuid, p_reason text'
     or pg_catalog.pg_get_function_result(v_request_oid) <>
       'TABLE(request_id uuid, target_user_id uuid, status text, is_duplicate boolean, created_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(v_create_oid) <>
       'TABLE(action_id uuid, target_user_id uuid, role text, status text, updated_at timestamp with time zone)' then
    raise exception 'Race-guard RPC signatures or return contracts changed';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid in (v_request_oid, v_create_oid)
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
  ) <> 2 then
    raise exception 'Race-guard RPC owner, security-definer, or search_path validation failed';
  end if;

  if pg_catalog.obj_description(v_request_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1'
     or pg_catalog.obj_description(v_create_oid, 'pg_proc') <>
       'commatch_admin_account_management_v1' then
    raise exception 'Race-guard RPC comment validation failed';
  end if;

  if pg_catalog.has_function_privilege('public', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('public', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('anon', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_create_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_create_oid, 'EXECUTE') then
    raise exception 'Race-guard RPC ACL validation failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'admin_member_deletion_actions'
      and indexname = 'admin_member_deletion_actions_requested_target_unique'
      and indexdef ilike '%UNIQUE%'
      and indexdef ilike '%WHERE (status = ''requested''::text)%'
  ) then
    raise exception 'Requested deletion partial unique index validation failed';
  end if;

  v_request_definition := pg_catalog.pg_get_functiondef(v_request_oid);
  v_create_definition := pg_catalog.pg_get_functiondef(v_create_oid);
  if pg_catalog.strpos(v_request_definition, 'lock_admin_account_write()') = 0
     or pg_catalog.strpos(v_create_definition, 'lock_admin_account_write()') = 0
     or pg_catalog.strpos(v_request_definition, 'lock_admin_account_write()') >
       pg_catalog.strpos(v_request_definition, 'Administrator accounts cannot be force-deleted')
     or pg_catalog.strpos(v_create_definition, 'lock_admin_account_write()') >
       pg_catalog.strpos(v_create_definition, 'ADMIN_ACCOUNT_TARGET_DELETION_REQUESTED') then
    raise exception 'Common lock or requested-deletion guard validation failed';
  end if;
end
$postflight$;

commit;
