-- ComMatch chat Realtime publication configuration.
--
-- This script enables Supabase Postgres Changes INSERT subscriptions for chat
-- messages by adding only public.messages to the supabase_realtime publication.
-- It does not change the matching/chat schema, RPCs, RLS policies, privileges,
-- indexes, triggers, or replica identity. The script is safe to run repeatedly
-- and must be applied separately to the operational database in the Supabase
-- SQL Editor.

begin;

do $matching_chat_realtime$
declare
  v_messages_regclass pg_catalog.regclass;
begin
  v_messages_regclass := pg_catalog.to_regclass('public.messages');

  if v_messages_regclass is null then
    raise exception 'public.messages does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    where relation.oid = v_messages_regclass
      and relation.relkind in ('r', 'p')
  ) then
    raise exception 'public.messages is not a table';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'messages'
  ) then
    raise exception 'public.messages was not added to the supabase_realtime publication';
  end if;
end
$matching_chat_realtime$;

commit;

-- Read-only post-application verification. Exactly one row should be returned.
select
  pubname,
  schemaname,
  tablename
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'messages';
