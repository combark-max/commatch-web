-- Restore the current HEAD contract for the Premium received-favorites RPC.
-- This corrective migration changes only public.get_received_favorites().

begin;

do $preflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_received_favorites()'
  );
begin
  if pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regprocedure(
       'public.is_member_service_allowed()'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.has_premium_feature(text)'
     ) is null
     or v_function_oid is null then
    raise exception 'Required received-favorites dependencies are missing';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_received_favorites'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)'
  ) then
    raise exception 'public.get_received_favorites() has an incompatible current contract';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid =
      'public.is_member_service_allowed()'::pg_catalog.regprocedure
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'public.is_member_service_allowed() is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid =
      'public.has_premium_feature(text)'::pg_catalog.regprocedure
      and function_info.pronargs = 1
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and not function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
  ) then
    raise exception 'public.has_premium_feature(text) is incompatible';
  end if;
end
$preflight$;

create or replace function public.get_received_favorites()
returns table (
  favorite_id uuid,
  sender_user_id uuid,
  created_at timestamptz,
  nickname text,
  birth_date text,
  region text,
  job text,
  profile_image text,
  profile_images text[],
  is_mutual boolean,
  match_id uuid,
  match_status text
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

  if not coalesce(public.has_premium_feature('likes_received'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  return query
  select
    received_favorite.id,
    received_favorite.user_id,
    received_favorite.created_at,
    sender_profile.nickname,
    sender_profile.birth_date::text,
    sender_profile.region,
    sender_profile.job,
    sender_profile.profile_image,
    sender_profile.profile_images,
    exists (
      select 1
      from public.favorites as reciprocal_favorite
      where reciprocal_favorite.user_id = v_user_id
        and reciprocal_favorite.favorite_user_id = received_favorite.user_id
    ),
    existing_match.id,
    existing_match.status
  from public.favorites as received_favorite
  join public.profiles as sender_profile on sender_profile.id = received_favorite.user_id
  left join lateral (
    select match_row.id, match_row.status, match_row.matched_at
    from public.matches as match_row
    where (
      match_row.user_1_id = received_favorite.user_id
      and match_row.user_2_id = v_user_id
    ) or (
      match_row.user_1_id = v_user_id
      and match_row.user_2_id = received_favorite.user_id
    )
    order by
      (match_row.status = 'active') desc,
      match_row.matched_at desc,
      match_row.id
    limit 1
  ) as existing_match on true
  where received_favorite.favorite_user_id = v_user_id
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = received_favorite.user_id
        and restriction.profile_visibility = 'hidden'
    )
  order by received_favorite.created_at desc, received_favorite.id;
end
$function$;

alter function public.get_received_favorites() owner to postgres;
revoke all on function public.get_received_favorites()
  from public, anon, authenticated, service_role;
grant execute on function public.get_received_favorites()
  to authenticated, service_role;
comment on function public.get_received_favorites()
  is 'Returns received favorites for auth.uid() with member service and Premium feature access';

do $postflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.get_received_favorites()'
  );
  v_definition text;
  v_auth_position integer;
  v_service_position integer;
  v_premium_position integer;
  v_authenticated_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'authenticated'
  );
  v_service_role_oid oid := (
    select role_info.oid
    from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'service_role'
  );
begin
  if v_function_oid is null then
    raise exception 'public.get_received_favorites() is missing after correction';
  end if;

  v_definition := pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_function_oid)
  );
  v_auth_position := pg_catalog.strpos(
    v_definition,
    'v_user_id is null'
  );
  v_service_position := pg_catalog.strpos(
    v_definition,
    'public.is_member_service_allowed()'
  );
  v_premium_position := pg_catalog.strpos(
    v_definition,
    'public.has_premium_feature(''likes_received'')'
  );

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'get_received_favorites'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_language as language_info
      on language_info.oid = function_info.prolang
    where function_info.oid = v_function_oid
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from
        array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') =
        'Returns received favorites for auth.uid() with member service and Premium feature access'
  ) then
    raise exception 'public.get_received_favorites() contract correction failed';
  end if;

  if v_auth_position = 0
     or v_service_position <= v_auth_position
     or v_premium_position <= v_service_position then
    raise exception 'public.get_received_favorites() guard order is incompatible';
  end if;

  if pg_catalog.has_function_privilege(
       'public', v_function_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     ) then
    raise exception 'public.get_received_favorites() EXECUTE ACL correction failed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_info.proacl,
        pg_catalog.acldefault('f', function_info.proowner)
      )
    ) as acl_entry
    where function_info.oid = v_function_oid
      and (
        acl_entry.privilege_type <> 'EXECUTE'
        or acl_entry.grantee not in (
          function_info.proowner,
          v_authenticated_oid,
          v_service_role_oid
        )
        or (
          acl_entry.grantee in (v_authenticated_oid, v_service_role_oid)
          and acl_entry.is_grantable
        )
      )
  ) or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(function_info.proacl) as acl_entry
    where function_info.oid = v_function_oid
      and acl_entry.grantee = v_authenticated_oid
      and acl_entry.privilege_type = 'EXECUTE'
  ) or not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(function_info.proacl) as acl_entry
    where function_info.oid = v_function_oid
      and acl_entry.grantee = v_service_role_oid
      and acl_entry.privilege_type = 'EXECUTE'
  ) then
    raise exception 'public.get_received_favorites() direct ACL correction failed';
  end if;
end
$postflight$;

commit;
