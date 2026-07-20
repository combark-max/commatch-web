-- Supabase SQL Editor에서 한 번 실행하세요.
begin;

alter table public.profiles
add column if not exists profile_images text[];

alter table public.profiles
alter column profile_images set default '{}'::text[];

update public.profiles
set profile_images = case
  when profile_image is not null and btrim(profile_image) <> '' then array[profile_image]
  else '{}'::text[]
end
where profile_images is null
   or cardinality(profile_images) = 0;

update public.profiles
set profile_images = '{}'::text[]
where profile_images is null;

alter table public.profiles
alter column profile_images set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_profile_images_max_five_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_profile_images_max_five_check
    check (cardinality(profile_images) <= 5);
  end if;
end
$$;

commit;

-- 실행 전 확인:
-- select id, profile_image, profile_images from public.profiles order by id;

-- 실행 후 확인:
-- select id, profile_image, profile_images, cardinality(profile_images) as photo_count
-- from public.profiles
-- order by id;

-- 롤백(애플리케이션을 단일 사진 코드로 되돌린 뒤 실행):
-- begin;
-- alter table public.profiles drop constraint if exists profiles_profile_images_max_five_check;
-- alter table public.profiles drop column if exists profile_images;
-- commit;
