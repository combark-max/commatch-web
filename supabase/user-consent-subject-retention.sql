-- Migration: retain consent subject UUIDs after Auth user deletion.
-- Run after supabase/user-consents.sql.
-- Marker: commatch_user_consent_subject_retention_v1

begin;

do $preflight$
declare
  v_table_oid oid := pg_catalog.to_regclass('public.user_consent_events');
  v_auth_users_oid oid := pg_catalog.to_regclass('auth.users');
  v_columns text[];
  v_user_attnum smallint;
  v_request_attnum smallint;
  v_auth_id_attnum smallint;
  v_fk_count integer;
  v_record_rpc_oid oid := pg_catalog.to_regprocedure(
    'public.record_my_consent_event(text,text,text,text,uuid)'
  );
  v_status_rpc_oid oid := pg_catalog.to_regprocedure('public.get_my_consent_status()');
begin
  if v_table_oid is null then
    raise exception 'public.user_consent_events does not exist';
  end if;
  if v_auth_users_oid is null then
    raise exception 'auth.users does not exist';
  end if;

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
    and column_info.table_name = 'user_consent_events';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'user_id:uuid:NO',
    'consent_type:text:NO',
    'action:text:NO',
    'document_version:text:NO',
    'source:text:NO',
    'request_id:uuid:NO',
    'created_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.user_consent_events must retain the approved eight-column contract';
  end if;

  select attribute_info.attnum
  into v_user_attnum
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = v_table_oid
    and attribute_info.attname = 'user_id'
    and not attribute_info.attisdropped;

  select attribute_info.attnum
  into v_request_attnum
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = v_table_oid
    and attribute_info.attname = 'request_id'
    and not attribute_info.attisdropped;

  select attribute_info.attnum
  into v_auth_id_attnum
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = v_auth_users_oid
    and attribute_info.attname = 'id'
    and not attribute_info.attisdropped;

  if v_user_attnum is null or v_request_attnum is null or v_auth_id_attnum is null then
    raise exception 'Required consent or Auth key columns are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = v_table_oid
      and constraint_info.conname = 'user_consent_events_user_request_key'
      and constraint_info.contype = 'u'
      and constraint_info.conkey = array[v_user_attnum, v_request_attnum]
      and constraint_info.convalidated
  ) then
    raise exception 'public.user_consent_events (user_id, request_id) UNIQUE contract differs';
  end if;

  select pg_catalog.count(*)
  into v_fk_count
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = v_table_oid
    and constraint_info.contype = 'f';

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = v_table_oid
      and constraint_info.conname = 'user_consent_events_user_id_fkey'
  ) then
    if not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_info
      where constraint_info.conrelid = v_table_oid
        and constraint_info.conname = 'user_consent_events_user_id_fkey'
        and constraint_info.contype = 'f'
        and constraint_info.conkey = array[v_user_attnum]
        and constraint_info.confrelid = v_auth_users_oid
        and constraint_info.confkey = array[v_auth_id_attnum]
        and constraint_info.confdeltype in ('r', 'a')
        and constraint_info.convalidated
    ) then
      raise exception 'user_consent_events_user_id_fkey differs from the approved RESTRICT/NO ACTION Auth FK';
    end if;

    if v_fk_count <> 1 then
      raise exception 'public.user_consent_events contains an unexpected additional foreign key';
    end if;
  elsif v_fk_count <> 0 then
    raise exception 'public.user_consent_events contains an unexpected foreign key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = v_table_oid
      and relation_info.relrowsecurity
  ) then
    raise exception 'public.user_consent_events RLS must remain enabled';
  end if;

  if v_record_rpc_oid is null
     or v_status_rpc_oid is null
     or pg_catalog.pg_get_function_result(v_record_rpc_oid) <>
       'TABLE(event_id uuid, user_id uuid, consent_type text, action text, document_version text, source text, request_id uuid, created_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(v_status_rpc_oid) <>
       'TABLE(consent_type text, latest_action text, document_version text, created_at timestamp with time zone)' then
    raise exception 'Required user consent RPC signatures differ from the approved contract';
  end if;
end
$preflight$;

alter table public.user_consent_events
  drop constraint if exists user_consent_events_user_id_fkey;

do $validation$
declare
  v_table_oid oid := 'public.user_consent_events'::pg_catalog.regclass;
  v_columns text[];
  v_user_attnum smallint;
  v_request_attnum smallint;
  v_record_rpc_oid oid := pg_catalog.to_regprocedure(
    'public.record_my_consent_event(text,text,text,text,uuid)'
  );
  v_status_rpc_oid oid := pg_catalog.to_regprocedure('public.get_my_consent_status()');
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
    and column_info.table_name = 'user_consent_events';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'user_id:uuid:NO',
    'consent_type:text:NO',
    'action:text:NO',
    'document_version:text:NO',
    'source:text:NO',
    'request_id:uuid:NO',
    'created_at:timestamptz:NO'
  ]::text[] then
    raise exception 'public.user_consent_events column contract changed during migration';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = v_table_oid
      and constraint_info.contype = 'f'
  ) then
    raise exception 'public.user_consent_events must not retain an Auth or other foreign key';
  end if;

  select attribute_info.attnum
  into v_user_attnum
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = v_table_oid
    and attribute_info.attname = 'user_id'
    and not attribute_info.attisdropped
    and attribute_info.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
    and attribute_info.attnotnull;

  select attribute_info.attnum
  into v_request_attnum
  from pg_catalog.pg_attribute as attribute_info
  where attribute_info.attrelid = v_table_oid
    and attribute_info.attname = 'request_id'
    and not attribute_info.attisdropped;

  if v_user_attnum is null then
    raise exception 'public.user_consent_events.user_id must remain uuid NOT NULL';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = v_table_oid
      and constraint_info.conname = 'user_consent_events_user_request_key'
      and constraint_info.contype = 'u'
      and constraint_info.conkey = array[v_user_attnum, v_request_attnum]
      and constraint_info.convalidated
  ) then
    raise exception 'public.user_consent_events (user_id, request_id) UNIQUE contract changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = v_table_oid
      and relation_info.relrowsecurity
  ) then
    raise exception 'public.user_consent_events RLS changed during migration';
  end if;

  if v_record_rpc_oid is null
     or v_status_rpc_oid is null
     or pg_catalog.pg_get_function_result(v_record_rpc_oid) <>
       'TABLE(event_id uuid, user_id uuid, consent_type text, action text, document_version text, source text, request_id uuid, created_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(v_status_rpc_oid) <>
       'TABLE(consent_type text, latest_action text, document_version text, created_at timestamp with time zone)' then
    raise exception 'User consent RPC signatures changed during migration';
  end if;
end
$validation$;

commit;
