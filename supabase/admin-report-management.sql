begin;

do $preflight$
declare
  v_marker constant text := 'commatch_admin_report_management_v1';
  v_actions pg_catalog.regclass := pg_catalog.to_regclass('public.report_admin_actions');
  v_function record;
begin
  if pg_catalog.to_regclass('public.reports') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.messages') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null then
    raise exception 'Admin report management dependencies are missing';
  end if;

  if pg_catalog.to_regprocedure('public.has_admin_permission(text)') is null then
    raise exception 'public.has_admin_permission(text) is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.reports'::pg_catalog.regclass
      and column_info.attname = 'updated_at'
      and not column_info.attisdropped
  ) then
    raise exception 'public.reports.updated_at exists; review status timestamp handling before installation';
  end if;

  if v_actions is not null and not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = v_actions
      and table_info.relkind = 'r'
      and pg_catalog.obj_description(table_info.oid, 'pg_class') = v_marker
  ) then
    raise exception 'public.report_admin_actions already exists with an unapproved definition';
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
        'get_admin_reports',
        'get_admin_report_detail',
        'get_admin_report_actions',
        'update_admin_report_status'
      )
  loop
    if (
      v_function.proname = 'get_admin_reports'
      and v_function.identity_arguments <> 'status_filter text, target_type_filter text, page_number integer, page_size integer'
    ) or (
      v_function.proname in ('get_admin_report_detail', 'get_admin_report_actions')
      and v_function.identity_arguments <> 'p_report_id uuid'
    ) or (
      v_function.proname = 'update_admin_report_status'
      and v_function.identity_arguments <> 'p_report_id uuid, p_new_status text, p_note text'
    ) then
      raise exception 'public.% already exists with an incompatible signature', v_function.proname;
    end if;

    if pg_catalog.obj_description(v_function.oid, 'pg_proc') is distinct from v_marker then
      raise exception 'public.% already exists without the approved definition marker', v_function.proname;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.report_admin_actions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id uuid not null,
  admin_user_id uuid null,
  previous_status text not null,
  new_status text not null,
  note text null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint report_admin_actions_report_id_fkey
    foreign key (report_id) references public.reports(id) on delete cascade,
  constraint report_admin_actions_admin_user_id_fkey
    foreign key (admin_user_id) references auth.users(id) on delete set null,
  constraint report_admin_actions_previous_status_check
    check (previous_status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  constraint report_admin_actions_new_status_check
    check (new_status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  constraint report_admin_actions_status_change_check
    check (previous_status <> new_status),
  constraint report_admin_actions_note_check
    check (
      note is null
      or (
        note = pg_catalog.btrim(note)
        and pg_catalog.char_length(note) between 1 and 2000
      )
    )
);

comment on table public.report_admin_actions
  is 'commatch_admin_report_management_v1';

create index if not exists report_admin_actions_report_created_idx
on public.report_admin_actions (report_id, created_at desc, id desc);

create index if not exists report_admin_actions_admin_user_idx
on public.report_admin_actions (admin_user_id);

do $table_validation$
declare
  v_columns text[];
  v_constraints text[];
  v_definition text;
begin
  select pg_catalog.array_agg(
    column_info.attname || ':' || column_info.atttypid::pg_catalog.regtype::text || ':'
      || case when column_info.attnotnull then 'NO' else 'YES' end
    order by column_info.attnum
  )
  into v_columns
  from pg_catalog.pg_attribute as column_info
  where column_info.attrelid = 'public.report_admin_actions'::pg_catalog.regclass
    and column_info.attnum > 0
    and not column_info.attisdropped;

  if v_columns <> array[
    'id:uuid:NO',
    'report_id:uuid:NO',
    'admin_user_id:uuid:YES',
    'previous_status:text:NO',
    'new_status:text:NO',
    'note:text:YES',
    'created_at:timestamp with time zone:NO'
  ] then
    raise exception 'public.report_admin_actions columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(constraint_info.conname order by constraint_info.conname)
  into v_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass;

  if v_constraints <> array[
    'report_admin_actions_admin_user_id_fkey',
    'report_admin_actions_new_status_check',
    'report_admin_actions_note_check',
    'report_admin_actions_pkey',
    'report_admin_actions_previous_status_check',
    'report_admin_actions_report_id_fkey',
    'report_admin_actions_status_change_check'
  ] then
    raise exception 'public.report_admin_actions constraints differ from the approved definition';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
      and not constraint_info.convalidated
  ) then
    raise exception 'public.report_admin_actions contains an unvalidated constraint';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_info.oid, true)
  into v_definition
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
    and constraint_info.conname = 'report_admin_actions_previous_status_check';
  if v_definition not like '%pending%'
     or v_definition not like '%reviewing%'
     or v_definition not like '%resolved%'
     or v_definition not like '%dismissed%' then
    raise exception 'previous status CHECK differs from the approved definition';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_info.oid, true)
  into v_definition
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
    and constraint_info.conname = 'report_admin_actions_new_status_check';
  if v_definition not like '%pending%'
     or v_definition not like '%reviewing%'
     or v_definition not like '%resolved%'
     or v_definition not like '%dismissed%' then
    raise exception 'new status CHECK differs from the approved definition';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_info.oid, true)
  into v_definition
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
    and constraint_info.conname = 'report_admin_actions_status_change_check';
  if v_definition not like '%previous_status <> new_status%' then
    raise exception 'status change CHECK differs from the approved definition';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_info.oid, true)
  into v_definition
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
    and constraint_info.conname = 'report_admin_actions_note_check';
  if v_definition not like '%btrim(note)%'
     or v_definition not like '%char_length(note)%'
     or v_definition not like '%2000%' then
    raise exception 'note CHECK differs from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
      and constraint_info.conname = 'report_admin_actions_report_id_fkey'
      and constraint_info.confrelid = 'public.reports'::pg_catalog.regclass
      and constraint_info.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.report_admin_actions'::pg_catalog.regclass
      and constraint_info.conname = 'report_admin_actions_admin_user_id_fkey'
      and constraint_info.confrelid = 'auth.users'::pg_catalog.regclass
      and constraint_info.confdeltype = 'n'
  ) then
    raise exception 'public.report_admin_actions foreign keys differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index as index_info
    join pg_catalog.pg_class as index_class on index_class.oid = index_info.indexrelid
    where index_info.indrelid = 'public.report_admin_actions'::pg_catalog.regclass
      and index_class.relname = 'report_admin_actions_report_created_idx'
      and not index_info.indisunique
      and index_info.indisvalid
      and index_info.indnkeyatts = 3
      and index_info.indkey::text = '2 7 1'
      and index_info.indoption::text = '0 3 3'
  ) or not exists (
    select 1
    from pg_catalog.pg_index as index_info
    join pg_catalog.pg_class as index_class on index_class.oid = index_info.indexrelid
    where index_info.indrelid = 'public.report_admin_actions'::pg_catalog.regclass
      and index_class.relname = 'report_admin_actions_admin_user_idx'
      and not index_info.indisunique
      and index_info.indisvalid
      and index_info.indnkeyatts = 1
      and index_info.indkey::text = '3'
      and index_info.indoption::text = '0'
  ) then
    raise exception 'public.report_admin_actions indexes differ from the approved definition';
  end if;
end
$table_validation$;

create or replace function public.get_admin_reports(
  status_filter text default null,
  target_type_filter text default null,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  report_id uuid,
  target_type text,
  reason text,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reported_user_id uuid,
  message_id uuid,
  reporter_nickname text,
  reported_nickname text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_status text := nullif(pg_catalog.btrim(status_filter), '');
  v_target_type text := nullif(pg_catalog.btrim(target_type_filter), '');
  v_page integer := greatest(coalesce(page_number, 1), 1);
  v_size integer := greatest(1, least(coalesce(page_size, 20), 50));
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if v_status is not null and v_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'Invalid report status filter';
  end if;
  if v_target_type is not null and v_target_type not in ('profile', 'message') then
    raise exception using errcode = '22023', message = 'Invalid report target type filter';
  end if;

  return query
  select
    report.id,
    report.target_type,
    report.reason_code,
    report.status,
    report.created_at,
    report.reporter_id,
    report.target_user_id,
    report.target_message_id,
    reporter_profile.nickname,
    reported_profile.nickname,
    pg_catalog.count(*) over ()
  from public.reports as report
  left join public.profiles as reporter_profile on reporter_profile.id = report.reporter_id
  left join public.profiles as reported_profile on reported_profile.id = report.target_user_id
  where (v_status is null or report.status = v_status)
    and (v_target_type is null or report.target_type = v_target_type)
  order by report.created_at desc, report.id desc
  limit v_size
  offset (v_page::bigint - 1) * v_size;
end
$function$;

comment on function public.get_admin_reports(text, text, integer, integer)
  is 'commatch_admin_report_management_v1';

-- PostgreSQL cannot change a function's TABLE return shape with CREATE OR
-- REPLACE. The preflight above has already verified that any function at this
-- exact signature belongs to this script, so only that function is replaced.
drop function if exists public.get_admin_report_detail(uuid);

create function public.get_admin_report_detail(p_report_id uuid)
returns table (
  report_id uuid,
  target_type text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_user_id uuid,
  reported_user_id uuid,
  message_id uuid,
  reporter_nickname text,
  reporter_gender text,
  reporter_birth_date date,
  reporter_region text,
  reporter_job text,
  reporter_profile_image text,
  reporter_profile_exists boolean,
  reported_nickname text,
  reported_gender text,
  reported_birth_date date,
  reported_region text,
  reported_job text,
  reported_profile_image text,
  reported_marriage_history text,
  reported_profile_exists boolean,
  message_content text,
  message_sender_id uuid,
  message_sender_nickname text,
  message_created_at timestamptz,
  match_id uuid,
  match_user_1_id uuid,
  match_user_1_nickname text,
  match_user_2_id uuid,
  match_user_2_nickname text,
  message_exists boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'Report ID is required';
  end if;

  return query
  select
    report.id,
    report.target_type,
    report.reason_code,
    report.reason_detail,
    report.status,
    report.created_at,
    report.reporter_id,
    report.target_user_id,
    report.target_message_id,
    reporter_profile.nickname,
    reporter_profile.gender,
    reporter_profile.birth_date,
    reporter_profile.region,
    reporter_profile.job,
    reporter_profile.profile_image,
    reporter_profile.id is not null,
    reported_profile.nickname,
    reported_profile.gender,
    reported_profile.birth_date,
    reported_profile.region,
    reported_profile.job,
    reported_profile.profile_image,
    reported_profile.marriage_history,
    reported_profile.id is not null,
    case when report.target_type = 'message' then reported_message.content else null end,
    case when report.target_type = 'message' then reported_message.sender_id else null end,
    case when report.target_type = 'message' then message_sender_profile.nickname else null end,
    case when report.target_type = 'message' then reported_message.created_at else null end,
    case when report.target_type = 'message' then reported_message.match_id else null end,
    case when report.target_type = 'message' then reported_match.user_1_id else null end,
    case when report.target_type = 'message' then match_user_1_profile.nickname else null end,
    case when report.target_type = 'message' then reported_match.user_2_id else null end,
    case when report.target_type = 'message' then match_user_2_profile.nickname else null end,
    case when report.target_type = 'message' then reported_message.id is not null else false end
  from public.reports as report
  left join public.profiles as reporter_profile on reporter_profile.id = report.reporter_id
  left join public.profiles as reported_profile on reported_profile.id = report.target_user_id
  left join public.messages as reported_message
    on report.target_type = 'message' and reported_message.id = report.target_message_id
  left join public.profiles as message_sender_profile
    on report.target_type = 'message' and message_sender_profile.id = reported_message.sender_id
  left join public.matches as reported_match
    on report.target_type = 'message' and reported_match.id = reported_message.match_id
  left join public.profiles as match_user_1_profile
    on report.target_type = 'message' and match_user_1_profile.id = reported_match.user_1_id
  left join public.profiles as match_user_2_profile
    on report.target_type = 'message' and match_user_2_profile.id = reported_match.user_2_id
  where report.id = p_report_id;
end
$function$;

comment on function public.get_admin_report_detail(uuid)
  is 'commatch_admin_report_management_v1';

create or replace function public.get_admin_report_actions(p_report_id uuid)
returns table (
  action_id uuid,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz,
  admin_user_id uuid,
  admin_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.has_admin_permission('reports_view'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'Report ID is required';
  end if;

  return query
  select
    action.id,
    action.previous_status,
    action.new_status,
    action.note,
    action.created_at,
    action.admin_user_id,
    admin_account.role
  from public.report_admin_actions as action
  left join public.admin_accounts as admin_account on admin_account.user_id = action.admin_user_id
  where action.report_id = p_report_id
  order by action.created_at desc, action.id desc;
end
$function$;

comment on function public.get_admin_report_actions(uuid)
  is 'commatch_admin_report_management_v1';

create or replace function public.update_admin_report_status(
  p_report_id uuid,
  p_new_status text,
  p_note text default null
)
returns table (
  report_id uuid,
  previous_status text,
  new_status text,
  note text,
  changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_previous_status text;
  v_new_status text := nullif(pg_catalog.btrim(p_new_status), '');
  v_note text := nullif(pg_catalog.btrim(p_note), '');
  v_changed_at timestamptz := pg_catalog.now();
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.has_admin_permission('reports_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_report_id is null then
    raise exception using errcode = '22023', message = 'Report ID is required';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'Admin note must be 2000 characters or fewer';
  end if;

  select report.status
  into v_previous_status
  from public.reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found';
  end if;
  if v_new_status is null or v_new_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'Invalid report status';
  end if;
  if v_previous_status = v_new_status then
    raise exception using errcode = '22023', message = 'Report status is unchanged';
  end if;
  if not (
    (v_previous_status = 'pending' and v_new_status in ('reviewing', 'resolved', 'dismissed'))
    or (v_previous_status = 'reviewing' and v_new_status in ('resolved', 'dismissed'))
    or (v_previous_status in ('resolved', 'dismissed') and v_new_status = 'reviewing')
  ) then
    raise exception using errcode = '22023', message = 'Report status transition is not allowed';
  end if;

  update public.reports as report
  set status = v_new_status
  where report.id = p_report_id;

  insert into public.report_admin_actions (
    report_id,
    admin_user_id,
    previous_status,
    new_status,
    note,
    created_at
  ) values (
    p_report_id,
    v_admin_user_id,
    v_previous_status,
    v_new_status,
    v_note,
    v_changed_at
  );

  return query
  select p_report_id, v_previous_status, v_new_status, v_note, v_changed_at;
end
$function$;

comment on function public.update_admin_report_status(uuid, text, text)
  is 'commatch_admin_report_management_v1';

alter table public.report_admin_actions enable row level security;

do $security_validation$
begin
  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.report_admin_actions'::pg_catalog.regclass
  ) then
    raise exception 'public.report_admin_actions must not contain direct-access RLS policies';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.report_admin_actions'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.report_admin_actions';
  end if;
end
$security_validation$;

revoke all on table public.report_admin_actions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.report_admin_actions to service_role;

revoke all on function public.get_admin_reports(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_report_detail(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_report_actions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.update_admin_report_status(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_admin_reports(text, text, integer, integer)
  to authenticated, service_role;
grant execute on function public.get_admin_report_detail(uuid)
  to authenticated, service_role;
grant execute on function public.get_admin_report_actions(uuid)
  to authenticated, service_role;
grant execute on function public.update_admin_report_status(uuid, text, text)
  to authenticated, service_role;

do $table_privilege_validation$
begin
  if pg_catalog.has_table_privilege('anon', 'public.report_admin_actions', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.report_admin_actions', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.report_admin_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.report_admin_actions', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.report_admin_actions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.report_admin_actions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.report_admin_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.report_admin_actions', 'DELETE') then
    raise exception 'Direct access to public.report_admin_actions is not blocked';
  end if;
  if not pg_catalog.has_table_privilege('service_role', 'public.report_admin_actions', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.report_admin_actions', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.report_admin_actions', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.report_admin_actions', 'DELETE') then
    raise exception 'service_role privileges on public.report_admin_actions differ from the approved definition';
  end if;
end
$table_privilege_validation$;

do $function_validation$
declare
  v_function record;
  v_count integer := 0;
begin
  for v_function in
    select function_info.oid, function_info.proname, function_info.prosecdef,
      function_info.provolatile, function_info.proconfig
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in (
        'get_admin_reports',
        'get_admin_report_detail',
        'get_admin_report_actions',
        'update_admin_report_status'
      )
  loop
    v_count := v_count + 1;
    if not v_function.prosecdef
       or (v_function.proname = 'update_admin_report_status' and v_function.provolatile <> 'v')
       or (v_function.proname <> 'update_admin_report_status' and v_function.provolatile <> 's')
       or not exists (
         select 1
         from pg_catalog.unnest(v_function.proconfig) as function_config(setting)
         where function_config.setting = 'search_path=""'
       )
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE') then
      raise exception 'public.% security or privileges differ from the approved definition', v_function.proname;
    end if;
  end loop;
  if v_count <> 4 then
    raise exception 'Admin report management function count differs from the approved definition';
  end if;
end
$function_validation$;

commit;
