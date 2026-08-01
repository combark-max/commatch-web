-- Supabase SQL Editor에서 한 번 실행하세요.
-- Run after admin-member-restrictions.sql so the canonical policies cannot be
-- installed without the shared member write guard.
begin;

do $preflight$
declare
  v_function_oid oid;
begin
  if not exists (
    select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'authenticated'
  ) then
    raise exception 'Required anon or authenticated role is missing';
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.is_member_service_allowed()'
  );

  if v_function_oid is null then
    raise exception 'public.is_member_service_allowed() is missing';
  end if;

  if pg_catalog.pg_get_function_result(v_function_oid) <> 'boolean'
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       where function_info.oid = v_function_oid
         and function_info.prokind = 'f'
         and function_info.prosecdef
         and function_info.provolatile = 'v'
         and function_info.proparallel = 'u'
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

  if pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'authenticated',
       v_function_oid,
       'EXECUTE'
     ) then
    raise exception 'public.is_member_service_allowed() ACL is incompatible';
  end if;
end
$preflight$;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  favorite_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_user_favorite_unique unique (user_id, favorite_user_id),
  constraint favorites_cannot_favorite_self check (user_id <> favorite_user_id)
);

alter table public.favorites enable row level security;

drop policy if exists "Users can read own favorites" on public.favorites;
create policy "Users can read own favorites"
on public.favorites for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own favorites" on public.favorites;
create policy "Users can insert own favorites"
on public.favorites for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
);

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites"
on public.favorites for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and (select public.is_member_service_allowed())
);

create index if not exists favorites_user_created_at_idx
on public.favorites (user_id, created_at desc);

create unique index if not exists favorites_user_favorite_uidx
on public.favorites (user_id, favorite_user_id);

commit;
