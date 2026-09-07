-- STEP A: ADDITIVE. Apply after admin-history-member-separation.sql and
-- member-storage-onboarding-guard.sql, and before deploying the signed-image app.
-- This step adds the authorization RPC only. The profile_images bucket and both
-- public SELECT policies intentionally remain public for the previously deployed app.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('storage.buckets') is null
     or pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regprocedure('public.is_non_admin_member_account(uuid)') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null then
    raise exception 'Profile image private-access prerequisites are missing';
  end if;

  if not exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'profile_images bucket must remain public during the additive deployment stage';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) <> 2 then
    raise exception 'Both public profile image SELECT policies must remain during the additive deployment stage';
  end if;
end
$preflight$;

create or replace function public.can_access_profile_image(p_object_path text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_viewer_gender text;
  v_owner_gender text;
begin
  if v_user_id is null
     or p_object_path is null
     or p_object_path <> pg_catalog.btrim(p_object_path)
     or p_object_path !~ '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}/[^/]+(?:/[^/]+)*$'
     or p_object_path ~ '(^|/)\.\.?(?:/|$)'
     or pg_catalog.strpos(p_object_path, E'\\') > 0 then
    return false;
  end if;

  v_owner_id := pg_catalog.split_part(p_object_path, '/', 1)::uuid;

  if not exists (
    select 1
    from public.profiles as owner_profile
    where owner_profile.id = v_owner_id
      and (
        nullif(pg_catalog.btrim(owner_profile.profile_image), '') = p_object_path
        or pg_catalog.right(
          pg_catalog.btrim(owner_profile.profile_image),
          pg_catalog.char_length('/storage/v1/object/public/profile_images/' || p_object_path)
        ) = '/storage/v1/object/public/profile_images/' || p_object_path
        or exists (
          select 1
          from pg_catalog.unnest(coalesce(owner_profile.profile_images, array[]::text[]))
            as stored_image(value)
          where nullif(pg_catalog.btrim(stored_image.value), '') = p_object_path
             or pg_catalog.right(
               pg_catalog.btrim(stored_image.value),
               pg_catalog.char_length('/storage/v1/object/public/profile_images/' || p_object_path)
             ) = '/storage/v1/object/public/profile_images/' || p_object_path
        )
      )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.admin_accounts as admin_account
    where admin_account.user_id = v_user_id
      and admin_account.status = 'active'
      and admin_account.role in ('super_admin', 'admin', 'moderator')
  ) then
    return true;
  end if;

  if not coalesce(public.is_member_service_allowed(), false)
     or not public.is_non_admin_member_account(v_owner_id) then
    return false;
  end if;

  if v_owner_id = v_user_id then
    return true;
  end if;

  if exists (
    select 1
    from public.matches as match_row
    where (match_row.user_1_id = v_user_id and match_row.user_2_id = v_owner_id)
       or (match_row.user_1_id = v_owner_id and match_row.user_2_id = v_user_id)
  ) or exists (
    select 1
    from public.favorites as favorite_row
    where (favorite_row.user_id = v_user_id and favorite_row.favorite_user_id = v_owner_id)
       or (favorite_row.user_id = v_owner_id and favorite_row.favorite_user_id = v_user_id)
  ) or exists (
    select 1
    from public.likes as like_row
    where (like_row.user_id = v_user_id and like_row.liked_user_id = v_owner_id)
       or (like_row.user_id = v_owner_id and like_row.liked_user_id = v_user_id)
  ) then
    return true;
  end if;

  select viewer_profile.gender, owner_profile.gender
  into v_viewer_gender, v_owner_gender
  from public.profiles as viewer_profile
  cross join public.profiles as owner_profile
  where viewer_profile.id = v_user_id
    and owner_profile.id = v_owner_id;

  if v_viewer_gender is null
     or v_viewer_gender not in ('남성', '여성')
     or v_owner_gender is null
     or v_owner_gender <> case v_viewer_gender
       when '남성' then '여성'
       when '여성' then '남성'
     end
     or not public.is_member_profile_visible(v_owner_id)
     or exists (
       select 1
       from public.member_restrictions as restriction
       where restriction.user_id = v_owner_id
         and restriction.account_status = 'suspended'
         and (
           restriction.suspended_until is null
           or restriction.suspended_until > pg_catalog.now()
         )
     ) then
    return false;
  end if;

  return true;
end
$function$;

comment on function public.can_access_profile_image(text)
  is 'Authorizes one stored profile image for its owner, a reachable member, or an active administrator';
alter function public.can_access_profile_image(text) owner to postgres;
revoke all on function public.can_access_profile_image(text)
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_profile_image(text)
  to authenticated, service_role;

do $postflight$
begin
  if not exists (
    select 1 from storage.buckets as bucket_info
    where bucket_info.id = 'profile_images' and bucket_info.public
  ) then
    raise exception 'profile_images bucket must remain public during the additive deployment stage';
  end if;

  if (
    select pg_catalog.count(*) from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in ('Public can view profile images', 'profile_images_select')
  ) <> 2 then
    raise exception 'Both public profile image SELECT policies must remain during the additive deployment stage';
  end if;
end
$postflight$;

commit;
