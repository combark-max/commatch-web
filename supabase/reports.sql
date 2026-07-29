-- ComMatch member report intake.
--
-- This file is not executed automatically. Review it before running it once in
-- the Supabase SQL Editor. It installs member-owned report lookup and RPC-only
-- profile/message report submission. Administrative access is not included.
-- Profile snapshots store only the profile_image path or URL string observed
-- at report time. They do not copy or preserve the underlying Storage object,
-- so the saved path can stop resolving after account deletion removes the file.

begin;

do $preflight$
declare
  v_install_marker constant text := 'commatch_reports_v1';
  v_reports_regclass pg_catalog.regclass := pg_catalog.to_regclass('public.reports');
  v_function_name text;
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist';
  end if;

  if pg_catalog.to_regclass('public.matches') is null then
    raise exception 'public.matches does not exist';
  end if;

  if pg_catalog.to_regclass('public.messages') is null then
    raise exception 'public.messages does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.profiles'::pg_catalog.regclass
      and column_info.attname = 'id'
      and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and column_info.attnotnull
      and not column_info.attisdropped
  ) then
    raise exception 'public.profiles.id must be a non-null uuid';
  end if;

  if exists (
    select required.column_name
    from (values
      ('nickname'),
      ('profile_image'),
      ('introduction'),
      ('marriage_values')
    ) as required(column_name)
    where not exists (
      select 1
      from pg_catalog.pg_attribute as column_info
      where column_info.attrelid = 'public.profiles'::pg_catalog.regclass
        and column_info.attname = required.column_name
        and column_info.atttypid = 'pg_catalog.text'::pg_catalog.regtype
        and not column_info.attisdropped
    )
  ) then
    raise exception 'public.profiles must contain text nickname, profile_image, introduction, and marriage_values columns';
  end if;

  if exists (
    select required.column_name
    from (values
      ('id'),
      ('user_1_id'),
      ('user_2_id')
    ) as required(column_name)
    where not exists (
      select 1
      from pg_catalog.pg_attribute as column_info
      where column_info.attrelid = 'public.matches'::pg_catalog.regclass
        and column_info.attname = required.column_name
        and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
        and column_info.attnotnull
        and not column_info.attisdropped
    )
  ) then
    raise exception 'public.matches must contain non-null uuid id, user_1_id, and user_2_id columns';
  end if;

  if exists (
    select required.column_name
    from (values
      ('id'),
      ('match_id'),
      ('sender_id')
    ) as required(column_name)
    where not exists (
      select 1
      from pg_catalog.pg_attribute as column_info
      where column_info.attrelid = 'public.messages'::pg_catalog.regclass
        and column_info.attname = required.column_name
        and column_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
        and column_info.attnotnull
        and not column_info.attisdropped
    )
  ) then
    raise exception 'public.messages must contain non-null uuid id, match_id, and sender_id columns';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.messages'::pg_catalog.regclass
      and column_info.attname = 'content'
      and column_info.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and column_info.attnotnull
      and not column_info.attisdropped
  ) then
    raise exception 'public.messages.content must be a non-null text column';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as column_info
    where column_info.attrelid = 'public.messages'::pg_catalog.regclass
      and column_info.attname = 'created_at'
      and column_info.atttypid = 'pg_catalog.timestamptz'::pg_catalog.regtype
      and column_info.attnotnull
      and not column_info.attisdropped
  ) then
    raise exception 'public.messages.created_at must be a non-null timestamptz column';
  end if;

  if v_reports_regclass is not null
     and not exists (
       select 1
       from pg_catalog.pg_class as table_info
       where table_info.oid = v_reports_regclass
         and table_info.relkind = 'r'
         and pg_catalog.obj_description(table_info.oid, 'pg_class') = v_install_marker
     ) then
    raise exception 'public.reports already exists with an unapproved definition';
  end if;

  if v_reports_regclass is null and exists (
    select 1
    from pg_catalog.pg_class as relation_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = relation_info.relnamespace
    where namespace_info.nspname = 'public'
      and relation_info.relname in (
        'reports_profile_unique_idx',
        'reports_message_unique_idx',
        'reports_reporter_created_at_idx',
        'reports_status_created_at_idx'
      )
  ) then
    raise exception 'A report index name already exists without an approved public.reports table';
  end if;

  foreach v_function_name in array array[
    'submit_profile_report',
    'submit_message_report'
  ]
  loop
    if exists (
      select 1
      from pg_catalog.pg_proc as function_info
      join pg_catalog.pg_namespace as namespace_info
        on namespace_info.oid = function_info.pronamespace
      where namespace_info.nspname = 'public'
        and function_info.proname = v_function_name
    ) and (
      (
        v_function_name = 'submit_profile_report'
        and pg_catalog.to_regprocedure('public.submit_profile_report(uuid,text,text)') is null
      )
      or (
        v_function_name = 'submit_message_report'
        and pg_catalog.to_regprocedure('public.submit_message_report(uuid,text,text)') is null
      )
      or (
        select pg_catalog.count(*)
        from pg_catalog.pg_proc as existing_function
        join pg_catalog.pg_namespace as existing_namespace
          on existing_namespace.oid = existing_function.pronamespace
        where existing_namespace.nspname = 'public'
          and existing_function.proname = v_function_name
      ) <> 1
      or exists (
        select 1
        from pg_catalog.pg_proc as existing_function
        where existing_function.oid = case v_function_name
          when 'submit_profile_report' then
            pg_catalog.to_regprocedure('public.submit_profile_report(uuid,text,text)')
          when 'submit_message_report' then
            pg_catalog.to_regprocedure('public.submit_message_report(uuid,text,text)')
        end
          and (
            pg_catalog.obj_description(existing_function.oid, 'pg_proc') is distinct from v_install_marker
            or existing_function.prolang <> (
              select language_info.oid
              from pg_catalog.pg_language as language_info
              where language_info.lanname = 'plpgsql'
            )
            or not existing_function.prosecdef
            or existing_function.proretset
            or existing_function.prorettype <> 'pg_catalog.uuid'::pg_catalog.regtype
            or existing_function.pronargdefaults <> 1
            or not exists (
              select 1
              from pg_catalog.unnest(existing_function.proconfig) as function_config(setting)
              where function_config.setting = 'search_path=""'
            )
            or pg_catalog.md5(
              pg_catalog.regexp_replace(existing_function.prosrc, '[[:space:]]+', ' ', 'g')
            ) is distinct from case v_function_name
              when 'submit_profile_report' then '15e12ed4a21cd1506666e26a19199e7a'
              when 'submit_message_report' then '5526e28ef0de267f8186caacc2cd66ea'
            end
          )
      )
    ) then
      raise exception 'public.% already exists with an unapproved definition or signature', v_function_name;
    end if;
  end loop;
end
$preflight$;

create table if not exists public.reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  reporter_id uuid not null,
  target_type text not null,
  target_user_id uuid not null,
  target_message_id uuid null,
  target_match_id uuid null,
  reason_code text not null,
  reason_detail text null,
  target_snapshot jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  constraint reports_target_type_check
    check (target_type in ('profile', 'message')),
  constraint reports_target_shape_check
    check (
      (
        target_type = 'profile'
        and target_user_id is not null
        and target_message_id is null
        and target_match_id is null
      )
      or
      (
        target_type = 'message'
        and target_user_id is not null
        and target_message_id is not null
        and target_match_id is not null
      )
    ),
  constraint reports_reason_code_check
    check (reason_code in (
      'inappropriate_content',
      'harassment',
      'fake_profile',
      'spam',
      'privacy_violation',
      'other'
    )),
  constraint reports_reason_detail_check
    check (
      reason_detail is null
      or (
        reason_detail = pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            reason_detail,
            '^[[:space:]]+',
            '',
            'g'
          ),
          '[[:space:]]+$',
          '',
          'g'
        )
        and pg_catalog.char_length(reason_detail) >= 1
        and pg_catalog.char_length(reason_detail) <= 1000
      )
    ),
  constraint reports_other_reason_detail_check
    check (reason_code <> 'other' or reason_detail is not null),
  constraint reports_status_check
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  constraint reports_target_snapshot_object_check
    check (pg_catalog.jsonb_typeof(target_snapshot) = 'object')
);

comment on table public.reports is 'commatch_reports_v1';

create unique index if not exists reports_profile_unique_idx
on public.reports (reporter_id, target_user_id)
where target_type = 'profile';

create unique index if not exists reports_message_unique_idx
on public.reports (reporter_id, target_message_id)
where target_type = 'message';

create index if not exists reports_reporter_created_at_idx
on public.reports (reporter_id, created_at desc, id desc);

create index if not exists reports_status_created_at_idx
on public.reports (status, created_at, id);

do $table_validation$
declare
  v_actual_columns text[];
  v_actual_constraints text[];
  v_constraint_name text;
  v_expected_expression text;
  v_actual_expression text;
  v_expected_constraints constant text[] := array[
    'reports_other_reason_detail_check:c',
    'reports_pkey:p',
    'reports_reason_code_check:c',
    'reports_reason_detail_check:c',
    'reports_status_check:c',
    'reports_target_shape_check:c',
    'reports_target_snapshot_object_check:c',
    'reports_target_type_check:c'
  ];
  v_index_definition text;
begin
  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s:%s', column_name, udt_name, is_nullable)
    order by ordinal_position
  )
  into v_actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'reports';

  if v_actual_columns is distinct from array[
    'id:uuid:NO',
    'reporter_id:uuid:NO',
    'target_type:text:NO',
    'target_user_id:uuid:NO',
    'target_message_id:uuid:YES',
    'target_match_id:uuid:YES',
    'reason_code:text:NO',
    'reason_detail:text:YES',
    'target_snapshot:jsonb:NO',
    'status:text:NO',
    'created_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.reports columns differ from the approved definition';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reports'
      and column_name = 'id'
      and pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g') in (
        'gen_random_uuid()',
        'pg_catalog.gen_random_uuid()'
      )
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reports'
      and column_name = 'status'
      and column_default = '''pending''::text'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reports'
      and column_name = 'created_at'
      and pg_catalog.regexp_replace(column_default, '[[:space:]]+', '', 'g') in (
        'now()',
        'pg_catalog.now()'
      )
  ) then
    raise exception 'public.reports defaults differ from the approved definition';
  end if;

  select pg_catalog.array_agg(
    pg_catalog.format('%s:%s', constraint_info.conname, constraint_info.contype)
    order by constraint_info.conname
  )
  into v_actual_constraints
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.reports'::pg_catalog.regclass;

  if v_actual_constraints is distinct from v_expected_constraints then
    raise exception 'public.reports constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_attribute as id_column
      on id_column.attrelid = constraint_info.conrelid
     and id_column.attname = 'id'
     and not id_column.attisdropped
    where constraint_info.conrelid = 'public.reports'::pg_catalog.regclass
      and constraint_info.conname = 'reports_pkey'
      and constraint_info.contype = 'p'
      and constraint_info.convalidated
      and pg_catalog.array_length(constraint_info.conkey, 1) = 1
      and constraint_info.conkey[1] = id_column.attnum
  ) then
    raise exception 'reports_pkey differs from the approved definition';
  end if;

  for v_constraint_name, v_expected_expression in
    select expected.constraint_name, expected.constraint_expression
    from (values
      (
        'reports_target_type_check',
        $expression$(target_type=any(array['profile','message']))$expression$
      ),
      (
        'reports_target_shape_check',
        $expression$(((target_type='profile')and(target_user_idisnotnull)and(target_message_idisnull)and(target_match_idisnull))or((target_type='message')and(target_user_idisnotnull)and(target_message_idisnotnull)and(target_match_idisnotnull)))$expression$
      ),
      (
        'reports_reason_code_check',
        $expression$(reason_code=any(array['inappropriate_content','harassment','fake_profile','spam','privacy_violation','other']))$expression$
      ),
      (
        'reports_reason_detail_check',
        $expression$((reason_detailisnull)or((reason_detail=regexp_replace(regexp_replace(reason_detail,'^[[:space:]]+','','g'),'[[:space:]]+$','','g'))and(char_length(reason_detail)>=1)and(char_length(reason_detail)<=1000)))$expression$
      ),
      (
        'reports_other_reason_detail_check',
        $expression$((reason_code<>'other')or(reason_detailisnotnull))$expression$
      ),
      (
        'reports_status_check',
        $expression$(status=any(array['pending','reviewing','resolved','dismissed']))$expression$
      ),
      (
        'reports_target_snapshot_object_check',
        $expression$(jsonb_typeof(target_snapshot)='object')$expression$
      )
    ) as expected(constraint_name, constraint_expression)
  loop
    select pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              constraint_info.conbin,
              constraint_info.conrelid
            )
          ),
          '[[:space:]]+',
          '',
          'g'
        ),
        'pg_catalog.',
        ''
      ),
      '::text',
      ''
    )
    into v_actual_expression
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.reports'::pg_catalog.regclass
      and constraint_info.conname = v_constraint_name
      and constraint_info.contype = 'c'
      and constraint_info.convalidated;

    if v_actual_expression is distinct from v_expected_expression then
      raise exception 'public.reports constraint % differs from the approved definition', v_constraint_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.reports'::pg_catalog.regclass
      and constraint_info.contype = 'f'
  ) then
    raise exception 'public.reports must not contain foreign keys to deletable source objects';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_indexdef(index_info.indexrelid))
  into v_index_definition
  from pg_catalog.pg_index as index_info
  where index_info.indexrelid = pg_catalog.to_regclass('public.reports_profile_unique_idx');

  if v_index_definition is distinct from
    'create unique index reports_profile_unique_idx on public.reports using btree (reporter_id, target_user_id) where (target_type = ''profile''::text)' then
    raise exception 'reports_profile_unique_idx differs from the approved definition';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_indexdef(index_info.indexrelid))
  into v_index_definition
  from pg_catalog.pg_index as index_info
  where index_info.indexrelid = pg_catalog.to_regclass('public.reports_message_unique_idx');

  if v_index_definition is distinct from
    'create unique index reports_message_unique_idx on public.reports using btree (reporter_id, target_message_id) where (target_type = ''message''::text)' then
    raise exception 'reports_message_unique_idx differs from the approved definition';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_indexdef(index_info.indexrelid))
  into v_index_definition
  from pg_catalog.pg_index as index_info
  where index_info.indexrelid = pg_catalog.to_regclass('public.reports_reporter_created_at_idx');

  if v_index_definition is distinct from
    'create index reports_reporter_created_at_idx on public.reports using btree (reporter_id, created_at desc, id desc)' then
    raise exception 'reports_reporter_created_at_idx differs from the approved definition';
  end if;

  select pg_catalog.lower(pg_catalog.pg_get_indexdef(index_info.indexrelid))
  into v_index_definition
  from pg_catalog.pg_index as index_info
  where index_info.indexrelid = pg_catalog.to_regclass('public.reports_status_created_at_idx');

  if v_index_definition is distinct from
    'create index reports_status_created_at_idx on public.reports using btree (status, created_at, id)' then
    raise exception 'reports_status_created_at_idx differs from the approved definition';
  end if;
end
$table_validation$;

create or replace function public.submit_profile_report(
  p_target_user_id uuid,
  p_reason_code text,
  p_reason_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reporter_id uuid;
  v_reason_code text;
  v_reason_detail text;
  v_target_snapshot jsonb;
  v_report_id uuid;
  v_constraint_name text;
begin
  -- commatch_reports_v1
  select auth.uid() into v_reporter_id;

  if v_reporter_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_target_user_id is null then
    raise exception using errcode = '22023', message = 'Target profile is required';
  end if;

  if p_target_user_id = v_reporter_id then
    raise exception using errcode = '22023', message = 'You cannot report your own profile';
  end if;

  v_reason_code := nullif(pg_catalog.btrim(p_reason_code), '');
  if v_reason_code is null or v_reason_code not in (
    'inappropriate_content',
    'harassment',
    'fake_profile',
    'spam',
    'privacy_violation',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid report reason';
  end if;

  v_reason_detail := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        p_reason_detail,
        '^[[:space:]]+',
        '',
        'g'
      ),
      '[[:space:]]+$',
      '',
      'g'
    ),
    ''
  );
  if v_reason_detail is not null
     and pg_catalog.char_length(v_reason_detail) > 1000 then
    raise exception using errcode = '22023', message = 'Reason detail must be 1000 characters or fewer';
  end if;

  if v_reason_code = 'other' and v_reason_detail is null then
    raise exception using errcode = '22023', message = 'Reason detail is required when reason is other';
  end if;

  select pg_catalog.jsonb_build_object(
    'nickname', target_profile.nickname,
    'profile_image', target_profile.profile_image,
    'introduction', target_profile.introduction,
    'marriage_values', target_profile.marriage_values
  )
  into v_target_snapshot
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  if exists (
    select 1
    from public.reports as existing_report
    where existing_report.reporter_id = v_reporter_id
      and existing_report.target_type = 'profile'
      and existing_report.target_user_id = p_target_user_id
  ) then
    raise exception using errcode = '23505', message = 'Profile has already been reported by this user';
  end if;

  begin
    insert into public.reports (
      reporter_id,
      target_type,
      target_user_id,
      target_message_id,
      target_match_id,
      reason_code,
      reason_detail,
      target_snapshot,
      status
    ) values (
      v_reporter_id,
      'profile',
      p_target_user_id,
      null,
      null,
      v_reason_code,
      v_reason_detail,
      v_target_snapshot,
      'pending'
    )
    returning id into v_report_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'reports_profile_unique_idx' then
        raise exception using errcode = '23505', message = 'Profile has already been reported by this user';
      end if;
      raise;
  end;

  return v_report_id;
end
$function$;

comment on function public.submit_profile_report(uuid, text, text)
  is 'commatch_reports_v1';

create or replace function public.submit_message_report(
  p_target_message_id uuid,
  p_reason_code text,
  p_reason_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reporter_id uuid;
  v_reason_code text;
  v_reason_detail text;
  v_target_user_id uuid;
  v_target_match_id uuid;
  v_message_content text;
  v_message_created_at timestamptz;
  v_match public.matches%rowtype;
  v_target_snapshot jsonb;
  v_report_id uuid;
  v_constraint_name text;
begin
  -- commatch_reports_v1
  select auth.uid() into v_reporter_id;

  if v_reporter_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_target_message_id is null then
    raise exception using errcode = '22023', message = 'Target message is required';
  end if;

  v_reason_code := nullif(pg_catalog.btrim(p_reason_code), '');
  if v_reason_code is null or v_reason_code not in (
    'inappropriate_content',
    'harassment',
    'fake_profile',
    'spam',
    'privacy_violation',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid report reason';
  end if;

  v_reason_detail := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        p_reason_detail,
        '^[[:space:]]+',
        '',
        'g'
      ),
      '[[:space:]]+$',
      '',
      'g'
    ),
    ''
  );
  if v_reason_detail is not null
     and pg_catalog.char_length(v_reason_detail) > 1000 then
    raise exception using errcode = '22023', message = 'Reason detail must be 1000 characters or fewer';
  end if;

  if v_reason_code = 'other' and v_reason_detail is null then
    raise exception using errcode = '22023', message = 'Reason detail is required when reason is other';
  end if;

  select
    target_message.sender_id,
    target_message.match_id,
    target_message.content,
    target_message.created_at
  into
    v_target_user_id,
    v_target_match_id,
    v_message_content,
    v_message_created_at
  from public.messages as target_message
  where target_message.id = p_target_message_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Message not found';
  end if;

  select match_row.*
  into v_match
  from public.matches as match_row
  where match_row.id = v_target_match_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Match not found';
  end if;

  if v_reporter_id <> v_match.user_1_id
     and v_reporter_id <> v_match.user_2_id then
    raise exception using errcode = '42501', message = 'Not a participant in this match';
  end if;

  if v_target_user_id <> v_match.user_1_id
     and v_target_user_id <> v_match.user_2_id then
    raise exception using errcode = '55000', message = 'Message sender is not a participant in this match';
  end if;

  if v_target_user_id = v_reporter_id then
    raise exception using errcode = '22023', message = 'You cannot report your own message';
  end if;

  v_target_snapshot := pg_catalog.jsonb_build_object(
    'content', v_message_content,
    'created_at', v_message_created_at,
    'sender_id', v_target_user_id,
    'match_id', v_target_match_id
  );

  if exists (
    select 1
    from public.reports as existing_report
    where existing_report.reporter_id = v_reporter_id
      and existing_report.target_type = 'message'
      and existing_report.target_message_id = p_target_message_id
  ) then
    raise exception using errcode = '23505', message = 'Message has already been reported by this user';
  end if;

  begin
    insert into public.reports (
      reporter_id,
      target_type,
      target_user_id,
      target_message_id,
      target_match_id,
      reason_code,
      reason_detail,
      target_snapshot,
      status
    ) values (
      v_reporter_id,
      'message',
      v_target_user_id,
      p_target_message_id,
      v_target_match_id,
      v_reason_code,
      v_reason_detail,
      v_target_snapshot,
      'pending'
    )
    returning id into v_report_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'reports_message_unique_idx' then
        raise exception using errcode = '23505', message = 'Message has already been reported by this user';
      end if;
      raise;
  end;

  return v_report_id;
end
$function$;

comment on function public.submit_message_report(uuid, text, text)
  is 'commatch_reports_v1';

do $function_validation$
declare
  v_function_oid oid;
begin
  foreach v_function_oid in array array[
    pg_catalog.to_regprocedure('public.submit_profile_report(uuid,text,text)')::oid,
    pg_catalog.to_regprocedure('public.submit_message_report(uuid,text,text)')::oid
  ]
  loop
    if v_function_oid is null or not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      join pg_catalog.pg_language as language_info
        on language_info.oid = function_info.prolang
      where function_info.oid = v_function_oid
        and language_info.lanname = 'plpgsql'
        and function_info.pronargs = 3
        and function_info.pronargdefaults = 1
        and not function_info.proretset
        and function_info.prorettype = 'pg_catalog.uuid'::pg_catalog.regtype
        and function_info.prosecdef
        and function_info.provolatile = 'v'
        and pg_catalog.obj_description(function_info.oid, 'pg_proc') = 'commatch_reports_v1'
        and exists (
          select 1
          from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
          where function_config.setting = 'search_path=""'
        )
    ) then
      raise exception 'A report submission function has an incompatible definition';
    end if;
  end loop;
end
$function_validation$;

alter table public.reports enable row level security;

do $policy$
declare
  v_normalized_qualifier text;
begin
  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.reports'::pg_catalog.regclass
      and policy_info.polname <> 'reports_select_own'
  ) then
    raise exception 'public.reports contains an unapproved RLS policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.reports'::pg_catalog.regclass
      and policy_info.polname = 'reports_select_own'
  ) then
    create policy reports_select_own
      on public.reports
      for select
      to authenticated
      using (reporter_id = (select auth.uid()));
  end if;

  select pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
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
      ),
      'asuid',
      ''
    ),
    '::uuid',
    ''
  )
  into v_normalized_qualifier
  from pg_catalog.pg_policy as policy_info
  where policy_info.polrelid = 'public.reports'::pg_catalog.regclass
    and policy_info.polname = 'reports_select_own';

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.reports'::pg_catalog.regclass
      and policy_info.polname = 'reports_select_own'
      and policy_info.polcmd = 'r'
      and policy_info.polpermissive
      and policy_info.polroles = array[(
        select role_info.oid
        from pg_catalog.pg_roles as role_info
        where role_info.rolname = 'authenticated'
      )]
      and policy_info.polqual is not null
      and policy_info.polwithcheck is null
  ) or v_normalized_qualifier <> 'reporter_id=selectauth.uid' then
    raise exception 'reports_select_own differs from the approved definition';
  end if;
end
$policy$;

revoke all on table public.reports from public, anon, authenticated;
grant select on table public.reports to authenticated;

revoke all on function public.submit_profile_report(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_message_report(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.submit_profile_report(uuid, text, text)
  to authenticated;
grant execute on function public.submit_message_report(uuid, text, text)
  to authenticated;

commit;
