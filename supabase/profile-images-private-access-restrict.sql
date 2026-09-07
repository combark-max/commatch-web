-- STEP B: RESTRICTIVE. Apply only after profile-images-private-access.sql is live,
-- the signed-image app is deployed, and /api/profile-images is verified in Production.
-- This step changes only read exposure. Stored objects and owner-folder
-- INSERT/UPDATE/DELETE policies remain untouched.
--
-- ROLLBACK ORDER (before rolling the app back):
-- 1. Recreate both SELECT policies from definitions captured immediately before
--    this migration; do not substitute newly inferred policy expressions.
-- 2. Set storage.buckets.public = true for profile_images.
-- 3. Verify an existing /storage/v1/object/public/profile_images/... URL.
-- 4. Only then roll the app back to a public-URL build.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('storage.buckets') is null
     or pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regprocedure('public.can_access_profile_image(text)') is null then
    raise exception 'STEP A profile image authorization prerequisites are missing';
  end if;

  if not exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'profile_images bucket is not public before the restrictive deployment stage';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) <> 2 then
    raise exception 'Expected public profile image SELECT policies are missing before restriction';
  end if;
end
$preflight$;

update storage.buckets
set public = false
where id = 'profile_images';

drop policy if exists "Public can view profile images" on storage.objects;
drop policy if exists profile_images_select on storage.objects;

do $postflight$
begin
  if exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'profile_images bucket is still public';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) then
    raise exception 'A direct profile image SELECT policy still exists';
  end if;
end
$postflight$;

commit;
