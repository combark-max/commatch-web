-- Run only against a disposable/local database after STEP A
-- profile-images-private-access.sql and before the restrictive migration.
begin;

do $contract$
declare
  v_definition text;
begin
  if pg_catalog.to_regprocedure('public.can_access_profile_image(text)') is null then
    raise exception 'FAIL can_access_profile_image(text) is missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.can_access_profile_image(text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition !~ 'SECURITY DEFINER'
     or v_definition !~ 'SET search_path TO '''''
     or v_definition !~ 'is_member_service_allowed'
     or v_definition !~ 'admin_account.status = ''active'''
     or v_definition !~ 'is_non_admin_member_account'
     or v_definition !~ 'is_member_profile_visible'
     or v_definition !~ 'restriction.account_status = ''suspended'''
     or v_definition !~ 'viewer_profile.gender'
     or v_definition !~ 'owner_profile.gender'
     or v_definition !~ 'public.matches'
     or v_definition !~ 'public.favorites'
     or v_definition !~ 'public.likes' then
    raise exception 'FAIL profile image authorization definition is incomplete';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated', 'public.can_access_profile_image(text)', 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon', 'public.can_access_profile_image(text)', 'EXECUTE'
  ) then
    raise exception 'FAIL profile image authorization ACL differs';
  end if;

  if not exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'FAIL additive migration changed the public profile_images bucket';
  end if;

  if (
    select pg_catalog.count(*) from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) <> 2 then
    raise exception 'FAIL additive migration changed public profile image SELECT policies';
  end if;

  raise notice 'PASS additive profile image authorization, public compatibility, and ACL contracts';
end
$contract$;

rollback;
