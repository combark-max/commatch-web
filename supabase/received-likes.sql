-- ComMatch Premium received likes lookup.
-- Apply after received-likes-premium-migration.sql and the current
-- admin-premium-memberships.sql.

begin;

do $dependency_validation$
begin
  if pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.is_member_profile_visible(uuid)') is null
     or pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null then
    raise exception 'Required likes, member access, profile visibility, matching, or Premium dependency is missing';
  end if;
end
$dependency_validation$;

create index if not exists likes_liked_user_created_at_idx
  on public.likes (liked_user_id, created_at desc);

create or replace function public.get_received_likes()
returns table (
  like_id uuid,
  sender_user_id uuid,
  liked_at timestamptz,
  nickname text,
  birth_date text,
  region text,
  job text,
  profile_image text,
  profile_images text[],
  has_liked boolean,
  is_mutual_like boolean,
  match_id uuid,
  match_status text,
  matched_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if not coalesce(public.has_premium_feature('received_likes'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_like.id,
    sender_profile.id,
    received_like.created_at,
    sender_profile.nickname,
    sender_profile.birth_date::text,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    sent_like.has_liked,
    sent_like.has_liked,
    existing_match.id,
    existing_match.status,
    existing_match.matched_at
  from public.likes as received_like
  join public.profiles as sender_profile
    on sender_profile.id = received_like.user_id
  left join lateral (
    select exists (
      select 1
      from public.likes as my_like
      where my_like.user_id = v_user_id
        and my_like.liked_user_id = received_like.user_id
    ) as has_liked
  ) as sent_like on true
  left join public.matches as existing_match
    on existing_match.user_1_id = least(v_user_id, received_like.user_id)
   and existing_match.user_2_id = greatest(v_user_id, received_like.user_id)
  where received_like.liked_user_id = v_user_id
    and public.is_member_profile_visible(sender_profile.id)
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = sender_profile.id
        and restriction.account_status <> 'active'
        and (
          restriction.suspended_until is null
          or restriction.suspended_until > pg_catalog.now()
        )
    )
  order by received_like.created_at desc, received_like.id desc;
end
$function$;

comment on function public.get_received_likes()
  is 'Returns Premium received likes for auth.uid() while enforcing member access and sender availability';

alter function public.get_received_likes() owner to postgres;
revoke all on function public.get_received_likes()
  from public, anon, authenticated, service_role;
grant execute on function public.get_received_likes() to authenticated;

do $function_validation$
declare
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_received_likes()');
begin
  if v_function_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_roles as owner_role
         on owner_role.oid = function_info.proowner
       join pg_catalog.pg_language as language_info
         on language_info.oid = function_info.prolang
       where function_info.oid = v_function_oid
         and owner_role.rolname = 'postgres'
         and language_info.lanname = 'plpgsql'
         and function_info.pronargs = 0
         and function_info.pronargdefaults = 0
         and function_info.proretset
         and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
         and function_info.prosecdef
         and function_info.provolatile = 'v'
         and exists (
           select 1
           from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
           where function_config.setting = 'search_path=""'
         )
         and pg_catalog.regexp_replace(
           pg_catalog.pg_get_function_result(function_info.oid),
           '[[:space:]]+',
           '',
           'g'
         ) = 'TABLE(like_iduuid,sender_user_iduuid,liked_attimestampwithtimezone,nicknametext,birth_datetext,regiontext,jobtext,profile_imagetext,profile_imagestext[],has_likedboolean,is_mutual_likeboolean,match_iduuid,match_statustext,matched_attimestampwithtimezone)'
     ) then
    raise exception 'public.get_received_likes() has an incompatible definition';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_received_likes() privileges differ from the approved definition';
  end if;
end
$function_validation$;

commit;

select 'PASS get_received_likes installation and contract validation' as migration_result;
