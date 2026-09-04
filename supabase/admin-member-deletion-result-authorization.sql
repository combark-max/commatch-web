-- Allow an authorized deletion requester to record that deletion's result after
-- their administrator role or status changes. This migration changes only
-- public.set_admin_member_deletion_result(uuid, text, text).

begin;

do $preflight$
declare
  v_result_oid oid := pg_catalog.to_regprocedure(
    'public.set_admin_member_deletion_result(uuid,text,text)'
  );
begin
  if pg_catalog.to_regclass('public.admin_member_deletion_actions') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or v_result_oid is null then
    raise exception 'Required administrator member deletion objects do not exist';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'set_admin_member_deletion_result'
  ) <> 1
     or pg_catalog.pg_get_function_identity_arguments(v_result_oid) <>
       'p_request_id uuid, p_status text, p_failure_stage text'
     or pg_catalog.pg_get_function_result(v_result_oid) <>
       'TABLE(request_id uuid, status text, failure_stage text, is_duplicate boolean, updated_at timestamp with time zone)'
     or pg_catalog.obj_description(v_result_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1' then
    raise exception 'set_admin_member_deletion_result contract differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    where function_info.oid = v_result_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'set_admin_member_deletion_result owner or security contract differs';
  end if;

  if pg_catalog.has_function_privilege('public', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_result_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_result_oid, 'EXECUTE') then
    raise exception 'set_admin_member_deletion_result ACL differs from the approved definition';
  end if;
end
$preflight$;

create or replace function public.set_admin_member_deletion_result(
  p_request_id uuid,
  p_status text,
  p_failure_stage text default null
)
returns table (
  request_id uuid,
  status text,
  failure_stage text,
  is_duplicate boolean,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_action public.admin_member_deletion_actions%rowtype;
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Active super administrator required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;
  if p_status is null or p_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid deletion result status';
  end if;
  if (p_status = 'completed' and p_failure_stage is not null)
     or (
       p_status = 'failed'
       and (p_failure_stage is null or p_failure_stage not in ('storage', 'database', 'auth'))
     ) then
    raise exception using errcode = '22023', message = 'Invalid deletion failure stage';
  end if;

  select action_row.*
  into v_action
  from public.admin_member_deletion_actions as action_row
  where action_row.request_id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Deletion request not found';
  end if;
  if v_action.admin_user_id is distinct from v_admin_user_id then
    raise exception using errcode = '42501', message = 'Only the requesting administrator can finish this deletion';
  end if;

  if v_action.status <> 'requested' then
    if v_action.status = p_status
       and v_action.failure_stage is not distinct from p_failure_stage then
      return query
      select
        v_action.request_id,
        v_action.status,
        v_action.failure_stage,
        true,
        v_action.updated_at;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'MEMBER_DELETION_RESULT_ALREADY_RECORDED';
  end if;

  update public.admin_member_deletion_actions as action_row
  set
    status = p_status,
    failure_stage = case when p_status = 'failed' then p_failure_stage else null end,
    updated_at = v_changed_at,
    completed_at = case when p_status = 'completed' then v_changed_at else null end
  where action_row.id = v_action.id;

  return query
  select p_request_id, p_status, p_failure_stage, false, v_changed_at;
end
$function$;

alter function public.set_admin_member_deletion_result(uuid, text, text)
  owner to postgres;
revoke all on function public.set_admin_member_deletion_result(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_admin_member_deletion_result(uuid, text, text)
  to authenticated;
comment on function public.set_admin_member_deletion_result(uuid, text, text)
  is 'commatch_admin_member_deletions_v1';

do $postflight$
declare
  v_result_oid oid := pg_catalog.to_regprocedure(
    'public.set_admin_member_deletion_result(uuid,text,text)'
  );
  v_definition text;
begin
  if v_result_oid is null
     or pg_catalog.pg_get_function_identity_arguments(v_result_oid) <>
       'p_request_id uuid, p_status text, p_failure_stage text'
     or pg_catalog.pg_get_function_result(v_result_oid) <>
       'TABLE(request_id uuid, status text, failure_stage text, is_duplicate boolean, updated_at timestamp with time zone)'
     or pg_catalog.obj_description(v_result_oid, 'pg_proc') <>
       'commatch_admin_member_deletions_v1' then
    raise exception 'set_admin_member_deletion_result contract changed during migration';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_info.proowner
    where function_info.oid = v_result_oid
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'set_admin_member_deletion_result owner or security contract changed during migration';
  end if;

  if pg_catalog.has_function_privilege('public', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_result_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_result_oid, 'EXECUTE') then
    raise exception 'set_admin_member_deletion_result ACL changed during migration';
  end if;

  v_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_result_oid));
  if pg_catalog.strpos(v_definition, 'if v_admin_user_id is null then') = 0
     or pg_catalog.strpos(v_definition, 'for update') = 0
     or pg_catalog.strpos(
       v_definition,
       'v_action.admin_user_id is distinct from v_admin_user_id'
     ) = 0
     or pg_catalog.strpos(v_definition, 'from public.admin_accounts') <> 0 then
    raise exception 'set_admin_member_deletion_result authorization or row-lock contract differs';
  end if;
end
$postflight$;

commit;
