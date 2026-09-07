-- Run only against a disposable/local database after STEP B
-- profile-images-private-access-restrict.sql.
begin;

do $contract$
begin
  if pg_catalog.to_regprocedure('public.can_access_profile_image(text)') is null then
    raise exception 'FAIL STEP A profile image authorization is missing';
  end if;

  if exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'FAIL profile_images bucket is public after STEP B';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) then
    raise exception 'FAIL direct profile image SELECT policy remains after STEP B';
  end if;

  raise notice 'PASS restrictive profile image bucket and policy contracts';
end
$contract$;

rollback;
