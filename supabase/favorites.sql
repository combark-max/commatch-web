-- Supabase SQL Editor에서 한 번 실행하세요.
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
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites"
on public.favorites for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists favorites_user_created_at_idx
on public.favorites (user_id, created_at desc);

create unique index if not exists favorites_user_favorite_uidx
on public.favorites (user_id, favorite_user_id);
