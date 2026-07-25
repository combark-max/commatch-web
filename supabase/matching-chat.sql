-- ComMatch matching and chat database objects.
--
-- Included:
--   * Automatic matching when two users favorite each other
--   * Match list lookup
--   * One-to-one text messages (1-1,000 trimmed characters)
--   * Per-message read state
--   * Match ending
--   * One-time/idempotent backfill of existing mutual favorites
--
-- Realtime configuration is intentionally not included.
-- Back up the database and test this script in a non-production project before
-- running it manually in the Supabase SQL Editor.

begin;

-- Stop before creating anything when required source objects or columns are
-- missing, incompatible, or collide with objects not installed by this script.
do $preflight$
declare
  v_install_marker constant text := 'commatch_matching_chat_v1';
  v_function_name text;
  v_profiles_regclass pg_catalog.regclass;
  v_favorites_regclass pg_catalog.regclass;
  v_matches_regclass pg_catalog.regclass;
  v_messages_regclass pg_catalog.regclass;
begin
  v_profiles_regclass := pg_catalog.to_regclass('public.profiles');
  v_favorites_regclass := pg_catalog.to_regclass('public.favorites');
  v_matches_regclass := pg_catalog.to_regclass('public.matches');
  v_messages_regclass := pg_catalog.to_regclass('public.messages');

  if v_profiles_regclass is null then
    raise exception 'public.profiles does not exist';
  end if;

  if v_favorites_regclass is null then
    raise exception 'public.favorites does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'id'
      and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and a.attnotnull
      and not a.attisdropped
  ) then
    raise exception 'public.profiles.id must be a non-null uuid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_favorites_regclass
      and a.attname = 'user_id'
      and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not a.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_favorites_regclass
      and a.attname = 'favorite_user_id'
      and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'public.favorites.user_id and favorite_user_id must be uuid columns compatible with public.profiles.id';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as c
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = c.conrelid
     and source_column.attnum = c.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = c.confrelid
     and target_column.attnum = c.confkey[1]
    where c.conrelid = v_favorites_regclass
      and c.confrelid = v_profiles_regclass
      and c.contype = 'f'
      and pg_catalog.array_length(c.conkey, 1) = 1
      and pg_catalog.array_length(c.confkey, 1) = 1
      and source_column.attname = 'user_id'
      and target_column.attname = 'id'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as c
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = c.conrelid
     and source_column.attnum = c.conkey[1]
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = c.confrelid
     and target_column.attnum = c.confkey[1]
    where c.conrelid = v_favorites_regclass
      and c.confrelid = v_profiles_regclass
      and c.contype = 'f'
      and pg_catalog.array_length(c.conkey, 1) = 1
      and pg_catalog.array_length(c.confkey, 1) = 1
      and source_column.attname = 'favorite_user_id'
      and target_column.attname = 'id'
  ) then
    raise exception 'public.favorites.user_id and favorite_user_id must reference public.profiles(id)';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_favorites_regclass
      and a.attname = 'created_at'
      and a.atttypid = 'pg_catalog.timestamptz'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'public.favorites.created_at must be a timestamptz for match backfill';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'nickname'
      and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and not a.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'profile_image'
      and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and not a.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'profile_images'
      and a.atttypid = 'pg_catalog.text[]'::pg_catalog.regtype
      and not a.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'region'
      and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and not a.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_attribute as a
    where a.attrelid = v_profiles_regclass
      and a.attname = 'job'
      and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'public.profiles must contain text nickname/profile_image/region/job columns and a text[] profile_images column';
  end if;

  if exists (
    select 1
    from public.favorites as favorite_row
    left join public.profiles as owner_profile on owner_profile.id = favorite_row.user_id
    left join public.profiles as target_profile on target_profile.id = favorite_row.favorite_user_id
    where owner_profile.id is null or target_profile.id is null
  ) then
    raise exception 'Existing favorites contain a user without a corresponding public.profiles row';
  end if;

  if v_matches_regclass is not null then
    if pg_catalog.obj_description(v_matches_regclass, 'pg_class') is distinct from v_install_marker then
      raise exception 'public.matches already exists with an unapproved definition';
    end if;
  end if;

  if v_messages_regclass is not null then
    if pg_catalog.obj_description(v_messages_regclass, 'pg_class') is distinct from v_install_marker then
      raise exception 'public.messages already exists with an unapproved definition';
    end if;
  end if;

  foreach v_function_name in array array[
    'set_matching_chat_updated_at',
    'handle_mutual_favorite_match',
    'send_match_message',
    'mark_match_read',
    'end_match',
    'get_my_matches'
  ]
  loop
    if exists (
      select 1
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_function_name
        and (
          pg_catalog.obj_description(p.oid, 'pg_proc') is distinct from v_install_marker
          or p.prolang <> (select l.oid from pg_catalog.pg_language as l where l.lanname = 'plpgsql')
          or p.prosecdef <> (v_function_name <> 'set_matching_chat_updated_at')
          or p.proretset <> (v_function_name = 'get_my_matches')
          or p.prorettype <> case v_function_name
            when 'set_matching_chat_updated_at' then 'pg_catalog.trigger'::pg_catalog.regtype
            when 'handle_mutual_favorite_match' then 'pg_catalog.trigger'::pg_catalog.regtype
            when 'send_match_message' then 'pg_catalog.uuid'::pg_catalog.regtype
            when 'mark_match_read' then 'pg_catalog.int8'::pg_catalog.regtype
            when 'end_match' then 'pg_catalog.text'::pg_catalog.regtype
            when 'get_my_matches' then 'pg_catalog.record'::pg_catalog.regtype
          end
          or not exists (
            select 1
            from pg_catalog.unnest(p.proconfig) as function_config(setting)
            where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
              and pg_catalog.replace(
                pg_catalog.substr(function_config.setting, pg_catalog.char_length('search_path=') + 1),
                '"',
                ''
              ) = ''
          )
          or (
            pg_catalog.md5(
              pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')
            ) is distinct from case v_function_name
              when 'set_matching_chat_updated_at' then 'b25753681841752f1957406894e6fb56'
              when 'handle_mutual_favorite_match' then '66480c23c1656a656d5f035c4b157785'
              when 'send_match_message' then 'b5aae1246f5c93c776d7f4e21bc8b38b'
              when 'mark_match_read' then '1b63ddc3e76fc74811c951b2d3f92fb7'
              when 'end_match' then '081cb634975a573b117dae4ec84dcba2'
              when 'get_my_matches' then 'efd3e318d960957a79dab0be1855835e'
            end
            and not (
              v_function_name = 'get_my_matches'
              and pg_catalog.md5(
                pg_catalog.regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')
              ) = 'cc8078e24d925acb9e7b28fc34f34a38'
            )
          )
        )
    ) then
      raise exception 'public.% already exists with an unapproved definition', v_function_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_matching_chat_updated_at'
  ) and (
    to_regprocedure('public.set_matching_chat_updated_at()') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_matching_chat_updated_at'
    ) <> 1
  ) then
    raise exception 'public.set_matching_chat_updated_at has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_mutual_favorite_match'
  ) and (
    to_regprocedure('public.handle_mutual_favorite_match()') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_mutual_favorite_match'
    ) <> 1
  ) then
    raise exception 'public.handle_mutual_favorite_match has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'send_match_message'
  ) and (
    to_regprocedure('public.send_match_message(uuid,text)') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'send_match_message'
    ) <> 1
  ) then
    raise exception 'public.send_match_message has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'mark_match_read'
  ) and (
    to_regprocedure('public.mark_match_read(uuid)') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'mark_match_read'
    ) <> 1
  ) then
    raise exception 'public.mark_match_read has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'end_match'
  ) and (
    to_regprocedure('public.end_match(uuid)') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'end_match'
    ) <> 1
  ) then
    raise exception 'public.end_match has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_my_matches'
  ) and (
    to_regprocedure('public.get_my_matches()') is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_my_matches'
    ) <> 1
  ) then
    raise exception 'public.get_my_matches has an unapproved signature';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = v_favorites_regclass
      and t.tgname = 'favorites_create_mutual_match'
      and not t.tgisinternal
      and (
        to_regprocedure('public.handle_mutual_favorite_match()') is null
        or t.tgfoid <> to_regprocedure('public.handle_mutual_favorite_match()')
        or t.tgtype <> 5
      )
  ) then
    raise exception 'favorites_create_mutual_match already exists with an unapproved definition';
  end if;
end
$preflight$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_1_id uuid not null,
  user_2_id uuid not null,
  status text not null default 'active',
  matched_at timestamptz not null default now(),
  ended_at timestamptz null,
  ended_by uuid null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_user_1_id_fkey
    foreign key (user_1_id) references public.profiles(id) on delete cascade,
  constraint matches_user_2_id_fkey
    foreign key (user_2_id) references public.profiles(id) on delete cascade,
  constraint matches_ended_by_fkey
    foreign key (ended_by) references public.profiles(id) on delete set null,
  constraint matches_user_pair_unique unique (user_1_id, user_2_id),
  constraint matches_distinct_users_check check (user_1_id <> user_2_id),
  constraint matches_normalized_users_check check (user_1_id < user_2_id),
  constraint matches_status_check check (status in ('active', 'ended')),
  constraint matches_lifecycle_check check (
    (status = 'active' and ended_at is null and ended_by is null)
    or
    (status = 'ended' and ended_at is not null)
  ),
  constraint matches_ended_by_participant_check check (
    ended_by is null or ended_by = user_1_id or ended_by = user_2_id
  )
);

comment on table public.matches is 'commatch_matching_chat_v1';

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  sender_id uuid not null,
  content text not null,
  message_type text not null default 'text',
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint messages_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete cascade,
  constraint messages_sender_id_fkey
    foreign key (sender_id) references public.profiles(id) on delete cascade,
  constraint messages_type_check check (message_type = 'text'),
  constraint messages_content_length_check check (
    char_length(btrim(content)) between 1 and 1000
  )
);

comment on table public.messages is 'commatch_matching_chat_v1';

-- Validate the complete script-owned table shape before proceeding on a repeat run.
do $table_validation$
declare
  v_matches_constraints text[];
  v_messages_constraints text[];
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.matches'::pg_catalog.regclass
      and a.attnum > 0
      and not a.attisdropped
  ) <> 10 or exists (
    with expected_columns(column_name, type_oid, is_not_null, column_position, default_kind) as (
      values
        ('id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 1, 'uuid'),
        ('user_1_id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 2, 'none'),
        ('user_2_id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 3, 'none'),
        ('status', 'pg_catalog.text'::pg_catalog.regtype, true, 4, 'active'),
        ('matched_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, true, 5, 'now'),
        ('ended_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, false, 6, 'none'),
        ('ended_by', 'pg_catalog.uuid'::pg_catalog.regtype, false, 7, 'none'),
        ('last_message_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, false, 8, 'none'),
        ('created_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, true, 9, 'now'),
        ('updated_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, true, 10, 'now')
    )
    select 1
    from expected_columns as expected
    left join pg_catalog.pg_attribute as actual
      on actual.attrelid = 'public.matches'::pg_catalog.regclass
     and actual.attname = expected.column_name
     and actual.attnum > 0
     and not actual.attisdropped
    left join pg_catalog.pg_attrdef as column_default
      on column_default.adrelid = actual.attrelid
     and column_default.adnum = actual.attnum
    left join lateral (
      select pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)),
              '[[:space:]()]',
              '',
              'g'
            ),
            'pg_catalog.',
            ''
          ),
          '::text',
          ''
        ),
        '::character varying',
        ''
      ) as normalized_expression
    ) as normalized_default on true
    where actual.attname is null
       or actual.atttypid <> expected.type_oid
       or actual.attnotnull <> expected.is_not_null
       or actual.attnum <> expected.column_position
       or case expected.default_kind
         when 'none' then column_default.oid is not null
         when 'uuid' then column_default.oid is null
           or normalized_default.normalized_expression not in (
             'gen_random_uuid',
             'extensions.gen_random_uuid'
           )
         when 'active' then column_default.oid is null
           or normalized_default.normalized_expression <> '''active'''
         when 'now' then column_default.oid is null
           or normalized_default.normalized_expression not in (
             'now',
             'current_timestamp',
             'transaction_timestamp'
           )
         else true
       end
  ) then
    raise exception 'public.matches columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(c.conname order by c.conname)
  into v_matches_constraints
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.matches'::pg_catalog.regclass;

  if v_matches_constraints is distinct from array[
    'matches_distinct_users_check',
    'matches_ended_by_fkey',
    'matches_ended_by_participant_check',
    'matches_lifecycle_check',
    'matches_normalized_users_check',
    'matches_pkey',
    'matches_status_check',
    'matches_user_1_id_fkey',
    'matches_user_2_id_fkey',
    'matches_user_pair_unique'
  ]::text[] then
    raise exception 'public.matches constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.matches'::pg_catalog.regclass
      and c.conname = 'matches_user_1_id_fkey'
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.matches'::pg_catalog.regclass
      and c.conname = 'matches_user_2_id_fkey'
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.matches'::pg_catalog.regclass
      and c.conname = 'matches_ended_by_fkey'
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confdeltype = 'n'
  ) then
    raise exception 'public.matches foreign-key delete actions differ from the approved definition';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.messages'::pg_catalog.regclass
      and a.attnum > 0
      and not a.attisdropped
  ) <> 7 or exists (
    with expected_columns(column_name, type_oid, is_not_null, column_position, default_kind) as (
      values
        ('id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 1, 'uuid'),
        ('match_id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 2, 'none'),
        ('sender_id', 'pg_catalog.uuid'::pg_catalog.regtype, true, 3, 'none'),
        ('content', 'pg_catalog.text'::pg_catalog.regtype, true, 4, 'none'),
        ('message_type', 'pg_catalog.text'::pg_catalog.regtype, true, 5, 'text'),
        ('read_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, false, 6, 'none'),
        ('created_at', 'pg_catalog.timestamptz'::pg_catalog.regtype, true, 7, 'now')
    )
    select 1
    from expected_columns as expected
    left join pg_catalog.pg_attribute as actual
      on actual.attrelid = 'public.messages'::pg_catalog.regclass
     and actual.attname = expected.column_name
     and actual.attnum > 0
     and not actual.attisdropped
    left join pg_catalog.pg_attrdef as column_default
      on column_default.adrelid = actual.attrelid
     and column_default.adnum = actual.attnum
    left join lateral (
      select pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid)),
              '[[:space:]()]',
              '',
              'g'
            ),
            'pg_catalog.',
            ''
          ),
          '::text',
          ''
        ),
        '::character varying',
        ''
      ) as normalized_expression
    ) as normalized_default on true
    where actual.attname is null
       or actual.atttypid <> expected.type_oid
       or actual.attnotnull <> expected.is_not_null
       or actual.attnum <> expected.column_position
       or case expected.default_kind
         when 'none' then column_default.oid is not null
         when 'uuid' then column_default.oid is null
           or normalized_default.normalized_expression not in (
             'gen_random_uuid',
             'extensions.gen_random_uuid'
           )
         when 'text' then column_default.oid is null
           or normalized_default.normalized_expression <> '''text'''
         when 'now' then column_default.oid is null
           or normalized_default.normalized_expression not in (
             'now',
             'current_timestamp',
             'transaction_timestamp'
           )
         else true
       end
  ) then
    raise exception 'public.messages columns differ from the approved definition';
  end if;

  select pg_catalog.array_agg(c.conname order by c.conname)
  into v_messages_constraints
  from pg_catalog.pg_constraint as c
  where c.conrelid = 'public.messages'::pg_catalog.regclass;

  if v_messages_constraints is distinct from array[
    'messages_content_length_check',
    'messages_match_id_fkey',
    'messages_pkey',
    'messages_sender_id_fkey',
    'messages_type_check'
  ]::text[] then
    raise exception 'public.messages constraints differ from the approved definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.messages'::pg_catalog.regclass
      and c.conname = 'messages_match_id_fkey'
      and c.confrelid = 'public.matches'::pg_catalog.regclass
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.messages'::pg_catalog.regclass
      and c.conname = 'messages_sender_id_fkey'
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confdeltype = 'c'
  ) then
    raise exception 'public.messages foreign-key delete actions differ from the approved definition';
  end if;
end
$table_validation$;

create index if not exists matches_user_1_list_idx
  on public.matches (user_1_id, status, last_message_at desc, matched_at desc);

create index if not exists matches_user_2_list_idx
  on public.matches (user_2_id, status, last_message_at desc, matched_at desc);

create index if not exists messages_match_created_idx
  on public.messages (match_id, created_at desc, id desc);

create index if not exists messages_unread_idx
  on public.messages (match_id, sender_id, created_at)
  where read_at is null;

do $index_validation$
declare
  v_index_definition text;
begin
  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)), '[[:space:]]+', ' ', 'g')
  into v_index_definition
  from pg_catalog.pg_index as i
  where i.indexrelid = to_regclass('public.matches_user_1_list_idx');

  if v_index_definition is distinct from
    'create index matches_user_1_list_idx on public.matches using btree (user_1_id, status, last_message_at desc, matched_at desc)' then
    raise exception 'matches_user_1_list_idx exists with an unapproved definition';
  end if;

  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)), '[[:space:]]+', ' ', 'g')
  into v_index_definition
  from pg_catalog.pg_index as i
  where i.indexrelid = to_regclass('public.matches_user_2_list_idx');

  if v_index_definition is distinct from
    'create index matches_user_2_list_idx on public.matches using btree (user_2_id, status, last_message_at desc, matched_at desc)' then
    raise exception 'matches_user_2_list_idx exists with an unapproved definition';
  end if;

  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)), '[[:space:]]+', ' ', 'g')
  into v_index_definition
  from pg_catalog.pg_index as i
  where i.indexrelid = to_regclass('public.messages_match_created_idx');

  if v_index_definition is distinct from
    'create index messages_match_created_idx on public.messages using btree (match_id, created_at desc, id desc)' then
    raise exception 'messages_match_created_idx exists with an unapproved definition';
  end if;

  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)), '[[:space:]]+', ' ', 'g')
  into v_index_definition
  from pg_catalog.pg_index as i
  where i.indexrelid = to_regclass('public.messages_unread_idx');

  if v_index_definition is distinct from
    'create index messages_unread_idx on public.messages using btree (match_id, sender_id, created_at) where (read_at is null)' then
    raise exception 'messages_unread_idx exists with an unapproved definition';
  end if;
end
$index_validation$;

-- A dedicated trigger avoids changing the existing accounts updated_at function.
create or replace function public.set_matching_chat_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  -- commatch_matching_chat_v1
  new.updated_at := pg_catalog.now();
  return new;
end
$function$;

comment on function public.set_matching_chat_updated_at() is 'commatch_matching_chat_v1';

do $trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.matches'::pg_catalog.regclass
      and t.tgname = 'matches_set_updated_at'
      and not t.tgisinternal
  ) then
    create trigger matches_set_updated_at
      before update on public.matches
      for each row
      execute function public.set_matching_chat_updated_at();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.matches'::pg_catalog.regclass
      and t.tgname = 'matches_set_updated_at'
      and not t.tgisinternal
      and t.tgfoid = 'public.set_matching_chat_updated_at()'::pg_catalog.regprocedure
      and t.tgtype = 19
      and t.tgenabled = 'O'
  ) then
    raise exception 'matches_set_updated_at already exists with an unapproved definition';
  end if;
end
$trigger$;

create or replace function public.handle_mutual_favorite_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_1_id uuid;
  v_user_2_id uuid;
begin
  -- commatch_matching_chat_v1
  if new.user_id is null
     or new.favorite_user_id is null
     or new.user_id = new.favorite_user_id then
    return new;
  end if;

  v_user_1_id := least(new.user_id, new.favorite_user_id);
  v_user_2_id := greatest(new.user_id, new.favorite_user_id);

  -- Serialize the same normalized pair. The subsequent SPI query receives a
  -- current READ COMMITTED snapshot after a concurrent favorite transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_1_id::text || ':' || v_user_2_id::text, 0)
  );

  if exists (
    select 1
    from public.favorites as reciprocal
    where reciprocal.user_id = new.favorite_user_id
      and reciprocal.favorite_user_id = new.user_id
  ) then
    insert into public.matches (user_1_id, user_2_id, status, matched_at)
    values (v_user_1_id, v_user_2_id, 'active', pg_catalog.now())
    on conflict (user_1_id, user_2_id) do nothing;
  end if;

  return new;
end
$function$;

comment on function public.handle_mutual_favorite_match() is 'commatch_matching_chat_v1';

do $trigger$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.favorites'::pg_catalog.regclass
      and t.tgname = 'favorites_create_mutual_match'
      and not t.tgisinternal
  ) then
    create trigger favorites_create_mutual_match
      after insert on public.favorites
      for each row
      execute function public.handle_mutual_favorite_match();
  elsif not exists (
    select 1
    from pg_catalog.pg_trigger as t
    where t.tgrelid = 'public.favorites'::pg_catalog.regclass
      and t.tgname = 'favorites_create_mutual_match'
      and not t.tgisinternal
      and t.tgfoid = 'public.handle_mutual_favorite_match()'::pg_catalog.regprocedure
      and t.tgtype = 5
      and t.tgenabled = 'O'
  ) then
    raise exception 'favorites_create_mutual_match already exists with an unapproved definition';
  end if;
end
$trigger$;

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
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

comment on function public.send_match_message(uuid, text) is 'commatch_matching_chat_v1';

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
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

comment on function public.mark_match_read(uuid) is 'commatch_matching_chat_v1';

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
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
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

comment on function public.end_match(uuid) is 'commatch_matching_chat_v1';

drop function if exists public.get_my_matches();

create function public.get_my_matches()
returns table (
  match_id uuid,
  match_status text,
  matched_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  other_user_id uuid,
  other_nickname text,
  other_birth_date date,
  other_profile_image text,
  other_region text,
  other_job text,
  latest_message_content text,
  latest_message_at timestamptz,
  latest_message_sender_id uuid,
  unread_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  -- commatch_matching_chat_v1
  select auth.uid() into v_user_id;
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  return query
  select
    match_row.id,
    match_row.status,
    match_row.matched_at,
    match_row.ended_at,
    match_row.last_message_at,
    other_profile.id,
    other_profile.nickname,
    other_profile.birth_date,
    coalesce(
      nullif(pg_catalog.btrim(other_profile.profile_image), ''),
      fallback_image.path
    ),
    other_profile.region,
    other_profile.job,
    latest_message.content,
    latest_message.created_at,
    latest_message.sender_id,
    coalesce(unread_messages.unread_count, 0::bigint)
  from public.matches as match_row
  join public.profiles as other_profile
    on other_profile.id = case
      when match_row.user_1_id = v_user_id then match_row.user_2_id
      else match_row.user_1_id
    end
  left join lateral (
    select nullif(pg_catalog.btrim(image_value.path), '') as path
    from pg_catalog.unnest(other_profile.profile_images) with ordinality as image_value(path, position)
    where nullif(pg_catalog.btrim(image_value.path), '') is not null
    order by image_value.position
    limit 1
  ) as fallback_image on true
  left join lateral (
    select message_row.content, message_row.created_at, message_row.sender_id
    from public.messages as message_row
    where message_row.match_id = match_row.id
    order by message_row.created_at desc, message_row.id desc
    limit 1
  ) as latest_message on true
  left join lateral (
    select pg_catalog.count(*)::bigint as unread_count
    from public.messages as unread_message
    where unread_message.match_id = match_row.id
      and unread_message.sender_id <> v_user_id
      and unread_message.read_at is null
  ) as unread_messages on true
  where match_row.user_1_id = v_user_id
     or match_row.user_2_id = v_user_id
  order by
    (match_row.status = 'active') desc,
    coalesce(match_row.last_message_at, match_row.matched_at) desc,
    match_row.id;
end
$function$;

comment on function public.get_my_matches() is 'commatch_matching_chat_v1';

-- Only participants may read rows. All mutations are performed by the narrowly
-- scoped trigger/RPC functions below, never through direct client table writes.
alter table public.matches enable row level security;
alter table public.messages enable row level security;

do $policies$
declare
  v_matches_qualifier text;
  v_messages_qualifier text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.matches'::pg_catalog.regclass
      and p.polname = 'matches_select_participant'
  ) then
    create policy matches_select_participant
      on public.matches
      for select
      to authenticated
      using (
        (select auth.uid()) = user_1_id
        or (select auth.uid()) = user_2_id
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.messages'::pg_catalog.regclass
      and p.polname = 'messages_select_participant'
  ) then
    create policy messages_select_participant
      on public.messages
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.matches as participant_match
          where participant_match.id = messages.match_id
            and (
              (select auth.uid()) = participant_match.user_1_id
              or (select auth.uid()) = participant_match.user_2_id
            )
        )
      );
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid in (
      'public.matches'::pg_catalog.regclass,
      'public.messages'::pg_catalog.regclass
    )
      and p.polname not in (
        'matches_select_participant',
        'messages_select_participant'
      )
  ) then
    raise exception 'matches or messages contains an unapproved RLS policy';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.matches'::pg_catalog.regclass
      and p.polname = 'matches_select_participant'
      and p.polcmd = 'r'
      and p.polpermissive
      and p.polroles = array[(select r.oid from pg_catalog.pg_roles as r where r.rolname = 'authenticated')]
      and p.polqual is not null
      and p.polwithcheck is null
  ) or not exists (
    select 1
    from pg_catalog.pg_policy as p
    where p.polrelid = 'public.messages'::pg_catalog.regclass
      and p.polname = 'messages_select_participant'
      and p.polcmd = 'r'
      and p.polpermissive
      and p.polroles = array[(select r.oid from pg_catalog.pg_roles as r where r.rolname = 'authenticated')]
      and p.polqual is not null
      and p.polwithcheck is null
  ) then
    raise exception 'matching/chat RLS policies differ from the approved command or role configuration';
  end if;

  select pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)),
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
    ),
    'public.',
    ''
  )
  into v_matches_qualifier
  from pg_catalog.pg_policy as p
  where p.polrelid = 'public.matches'::pg_catalog.regclass
    and p.polname = 'matches_select_participant';

  if v_matches_qualifier is distinct from
    'selectauth.uid=user_1_idorselectauth.uid=user_2_id' then
    raise exception 'matches_select_participant has an unapproved USING expression';
  end if;

  select pg_catalog.replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.regexp_replace(
              pg_catalog.lower(pg_catalog.pg_get_expr(p.polqual, p.polrelid)),
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
    ),
    'public.',
    ''
  )
  into v_messages_qualifier
  from pg_catalog.pg_policy as p
  where p.polrelid = 'public.messages'::pg_catalog.regclass
    and p.polname = 'messages_select_participant';

  if v_messages_qualifier is distinct from
    'existsselect1frommatchesparticipant_matchwhereparticipant_match.id=messages.match_idandselectauth.uid=participant_match.user_1_idorselectauth.uid=participant_match.user_2_id' then
    raise exception 'messages_select_participant has an unapproved USING expression';
  end if;
end
$policies$;

revoke all on table public.matches from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
grant select on table public.matches to authenticated;
grant select on table public.messages to authenticated;

revoke all on function public.set_matching_chat_updated_at() from public, anon, authenticated;
revoke all on function public.handle_mutual_favorite_match() from public, anon, authenticated;
revoke all on function public.send_match_message(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_match_read(uuid) from public, anon, authenticated;
revoke all on function public.end_match(uuid) from public, anon, authenticated;
revoke all on function public.get_my_matches() from public, anon, authenticated;

grant execute on function public.send_match_message(uuid, text) to authenticated;
grant execute on function public.mark_match_read(uuid) to authenticated;
grant execute on function public.end_match(uuid) to authenticated;
grant execute on function public.get_my_matches() to authenticated;

-- Backfill one match per existing reciprocal favorite pair. The later favorite
-- timestamp is the moment at which the mutual relationship became complete.
insert into public.matches (
  user_1_id,
  user_2_id,
  status,
  matched_at,
  created_at,
  updated_at
)
select
  first_favorite.user_id,
  first_favorite.favorite_user_id,
  'active',
  coalesce(
    greatest(first_favorite.created_at, reciprocal_favorite.created_at),
    first_favorite.created_at,
    reciprocal_favorite.created_at,
    pg_catalog.now()
  ),
  pg_catalog.now(),
  pg_catalog.now()
from public.favorites as first_favorite
join public.favorites as reciprocal_favorite
  on reciprocal_favorite.user_id = first_favorite.favorite_user_id
 and reciprocal_favorite.favorite_user_id = first_favorite.user_id
where first_favorite.user_id < first_favorite.favorite_user_id
  and first_favorite.user_id <> first_favorite.favorite_user_id
on conflict (user_1_id, user_2_id) do nothing;

commit;

-- Read-only verification queries to run manually after this script succeeds.
-- These queries expose object metadata and aggregate counts only, not full user
-- records or message contents.
--
-- Tables:
-- select to_regclass('public.matches') as matches_table,
--        to_regclass('public.messages') as messages_table;
--
-- Trigger:
-- select tgname, tgenabled
-- from pg_catalog.pg_trigger
-- where tgrelid = 'public.favorites'::regclass
--   and tgname = 'favorites_create_mutual_match'
--   and not tgisinternal;
--
-- RLS:
-- select relname, relrowsecurity
-- from pg_catalog.pg_class
-- where oid in ('public.matches'::regclass, 'public.messages'::regclass);
--
-- Policies:
-- select schemaname, tablename, policyname, roles, cmd
-- from pg_catalog.pg_policies
-- where schemaname = 'public'
--   and tablename in ('matches', 'messages')
-- order by tablename, policyname;
--
-- Function execution privileges (expected: authenticated only for the four RPCs):
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where specific_schema = 'public'
--   and routine_name in (
--     'handle_mutual_favorite_match',
--     'send_match_message',
--     'mark_match_read',
--     'end_match',
--     'get_my_matches'
--   )
-- order by routine_name, grantee;
--
-- Backfill coverage (aggregate only; unmatched_pair_count should be 0):
-- with reciprocal_pairs as (
--   select first_favorite.user_id as user_1_id,
--          first_favorite.favorite_user_id as user_2_id
--   from public.favorites as first_favorite
--   join public.favorites as reciprocal_favorite
--     on reciprocal_favorite.user_id = first_favorite.favorite_user_id
--    and reciprocal_favorite.favorite_user_id = first_favorite.user_id
--   where first_favorite.user_id < first_favorite.favorite_user_id
-- )
-- select count(*) filter (where match_row.id is null) as unmatched_pair_count
-- from reciprocal_pairs as pair_row
-- left join public.matches as match_row
--   on match_row.user_1_id = pair_row.user_1_id
--  and match_row.user_2_id = pair_row.user_2_id;
