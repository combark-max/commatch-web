-- ComMatch administrator member deletion audit and lifecycle RPCs.
-- Deployment/review artifact: apply manually after approval.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_member_deletions_v1';
  v_table_oid oid;
  v_function record;
begin
  if pg_catalog.to_regclass('auth.users') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.reports') is null then
    raise exception 'Required account and report tables must exist before installing administrator member deletions';
  end if;

  v_table_oid := pg_catalog.to_regclass('public.admin_member_deletion_actions');
  if v_table_oid is not null then
    if pg_catalog.obj_description(v_table_oid, 'pg_class') is distinct from v_marker then
      raise exception 'public.admin_member_deletion_actions already exists without the approved definition marker';
    end if;
  end if;

  for v_function in
    select
      function_info.oid,
      function_info.proname,
      pg_catalog.pg_get_function_identity_arguments(function_info.oid) as identity_arguments
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'request_admin_member_deletion',
        'set_admin_member_deletion_result'
      )
  loop
    if (
      v_function.proname = 'request_admin_member_deletion'
      and v_function.identity_arguments <>
        'p_request_id uuid, p_target_user_id uuid, p_reason text, p_related_report_id uuid'
    ) or (
      v_function.proname = 'set_admin_member_deletion_result'
      and v_function.identity_arguments <>
        'p_request_id uuid, p_status text, p_failure_stage text'
    ) or pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.% already exists with an incompatible definition', v_function.proname;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.admin_member_deletion_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_id uuid not null,
  target_user_id uuid not null,
  admin_user_id uuid not null,
  admin_role text not null,
  reason text not null,
  related_report_id uuid null,
  status text not null default 'requested',
  failure_stage text null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz null,
  constraint admin_member_deletion_actions_request_id_key unique (request_id),
  constraint admin_member_deletion_actions_related_report_id_fkey
    foreign key (related_report_id) references public.reports(id) on delete set null,
  constraint admin_member_deletion_actions_admin_role_check
    check (admin_role = 'super_admin'),
  constraint admin_member_deletion_actions_reason_check
    check (
      reason = pg_catalog.btrim(reason)
      and pg_catalog.char_length(reason) between 1 and 500
    ),
  constraint admin_member_deletion_actions_status_check
    check (status in ('requested', 'completed', 'failed')),
  constraint admin_member_deletion_actions_failure_stage_check
    check (failure_stage is null or failure_stage in ('storage', 'database', 'auth')),
  constraint admin_member_deletion_actions_lifecycle_check
    check (
      (status = 'requested' and failure_stage is null and completed_at is null)
      or (status = 'completed' and failure_stage is null and completed_at is not null)
      or (status = 'failed' and failure_stage is not null and completed_at is null)
    )
);

comment on table public.admin_member_deletion_actions
  is 'commatch_admin_member_deletions_v1';
comment on column public.admin_member_deletion_actions.target_user_id
  is 'Immutable deleted-member UUID snapshot; intentionally has no foreign key';
comment on column public.admin_member_deletion_actions.admin_user_id
  is 'Immutable acting-administrator UUID snapshot; intentionally has no foreign key';

create unique index if not exists admin_member_deletion_actions_requested_target_unique
  on public.admin_member_deletion_actions (target_user_id)
  where status = 'requested';
create index if not exists admin_member_deletion_actions_target_created_idx
  on public.admin_member_deletion_actions (target_user_id, created_at desc, id desc);
create index if not exists admin_member_deletion_actions_admin_created_idx
  on public.admin_member_deletion_actions (admin_user_id, created_at desc, id desc);
create index if not exists admin_member_deletion_actions_report_created_idx
  on public.admin_member_deletion_actions (related_report_id, created_at desc, id desc);

alter table public.admin_member_deletion_actions enable row level security;
revoke all on table public.admin_member_deletion_actions
  from public, anon, authenticated, service_role;

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

comment on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  is 'commatch_admin_member_deletions_v1';

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
  if not exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_admin_user_id
      and admin_account.role = 'super_admin'
      and admin_account.status = 'active'
  ) then
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

comment on function public.set_admin_member_deletion_result(uuid, text, text)
  is 'commatch_admin_member_deletions_v1';

alter function public.request_admin_member_deletion(uuid, uuid, text, uuid) owner to postgres;
alter function public.set_admin_member_deletion_result(uuid, text, text) owner to postgres;

revoke all on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_admin_member_deletion_result(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_admin_member_deletion(uuid, uuid, text, uuid)
  to authenticated;
grant execute on function public.set_admin_member_deletion_result(uuid, text, text)
  to authenticated;

do $installation_validation$
declare
  v_marker constant text := 'commatch_admin_member_deletions_v1';
  v_request_oid oid := pg_catalog.to_regprocedure(
    'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
  );
  v_result_oid oid := pg_catalog.to_regprocedure(
    'public.set_admin_member_deletion_result(uuid,text,text)'
  );
  v_columns text[];
begin
  select pg_catalog.array_agg(
    pg_catalog.format(
      '%s:%s:%s',
      column_info.column_name,
      column_info.udt_name,
      column_info.is_nullable
    )
    order by column_info.ordinal_position
  )
  into v_columns
  from information_schema.columns as column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'admin_member_deletion_actions';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'request_id:uuid:NO',
    'target_user_id:uuid:NO',
    'admin_user_id:uuid:NO',
    'admin_role:text:NO',
    'reason:text:NO',
    'related_report_id:uuid:YES',
    'status:text:NO',
    'failure_stage:text:YES',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO',
    'completed_at:timestamptz:YES'
  ]::text[] then
    raise exception 'public.admin_member_deletion_actions columns differ from the approved definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_member_deletion_actions'::pg_catalog.regclass
      and constraint_info.contype = 'f'
      and constraint_info.conname <> 'admin_member_deletion_actions_related_report_id_fkey'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.admin_member_deletion_actions'::pg_catalog.regclass
      and constraint_info.conname = 'admin_member_deletion_actions_related_report_id_fkey'
      and constraint_info.confrelid = 'public.reports'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
  ) then
    raise exception 'Deletion audit foreign keys differ from the approved retention contract';
  end if;

  if v_request_oid is null
     or v_result_oid is null
     or pg_catalog.obj_description(v_request_oid, 'pg_proc') <> v_marker
     or pg_catalog.obj_description(v_result_oid, 'pg_proc') <> v_marker
     or pg_catalog.pg_get_function_result(v_request_oid) <>
       'TABLE(request_id uuid, target_user_id uuid, status text, is_duplicate boolean, created_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(v_result_oid) <>
       'TABLE(request_id uuid, status text, failure_stage text, is_duplicate boolean, updated_at timestamp with time zone)' then
    raise exception 'Administrator member deletion RPC contracts differ from the approved definition';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid in (v_request_oid, v_result_oid)
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
  ) <> 2 then
    raise exception 'Administrator member deletion RPC owner or security settings differ';
  end if;

  if not (
       select relation_info.relrowsecurity
       from pg_catalog.pg_class as relation_info
       where relation_info.oid = 'public.admin_member_deletion_actions'::pg_catalog.regclass
     )
     or exists (
       select 1
       from pg_catalog.pg_policy as policy_info
       where policy_info.polrelid = 'public.admin_member_deletion_actions'::pg_catalog.regclass
     )
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'DELETE') then
    raise exception 'Deletion audit RLS or direct table privileges differ from the approved contract';
  end if;

  if pg_catalog.has_function_privilege('public', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('public', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_result_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_result_oid, 'EXECUTE') then
    raise exception 'Deletion RPC privileges differ from the approved contract';
  end if;
end
$installation_validation$;

commit;
