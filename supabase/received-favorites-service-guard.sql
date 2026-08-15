-- Fail-closed member-service guard for the current Premium received favorites RPC.
-- Apply after member-profile-visibility.sql, admin-member-restrictions.sql,
-- and premium-memberships.sql.

begin;

do $dependency_validation$
declare
  v_function_oid oid := pg_catalog.to_regprocedure('public.get_received_favorites()');
begin
  if pg_catalog.to_regclass('public.favorites') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null
     or v_function_oid is null then
    raise exception 'Required favorites, profiles, matches, member access, Premium, or received favorites dependency is missing';
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
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)'
      and pg_catalog.obj_description(function_info.oid, 'pg_proc') in (
        'Returns received favorites for auth.uid() with Premium feature access',
        'Returns received favorites for auth.uid() with member service and Premium feature access'
      )
  ) then
    raise exception 'public.get_received_favorites() has an incompatible current definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.is_member_service_allowed()'::pg_catalog.regprocedure
      and function_info.pronargs = 0
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'public.is_member_service_allowed() is missing or incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.has_premium_feature(text)'::pg_catalog.regprocedure
      and function_info.pronargs = 1
      and not function_info.proretset
      and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
      and not function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
  ) then
    raise exception 'public.has_premium_feature(text) is missing or incompatible';
  end if;
end
$dependency_validation$;

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
comment on function public.get_received_favorites()
  is 'Returns received favorites for auth.uid() with member service and Premium feature access';
revoke all on function public.get_received_favorites()
  from public, anon, authenticated, service_role;
grant execute on function public.get_received_favorites()
  to authenticated, service_role;

do $function_validation$
declare
  v_function_oid oid := 'public.get_received_favorites()'::pg_catalog.regprocedure;
  v_definition text := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_function_oid));
  v_auth_position integer := pg_catalog.strpos(v_definition, 'v_user_id is null');
  v_service_position integer := pg_catalog.strpos(v_definition, 'is_member_service_allowed()');
  v_premium_position integer := pg_catalog.strpos(
    v_definition,
    'has_premium_feature(''likes_received'')'
  );
  v_authenticated_oid oid := (
    select role_info.oid from pg_catalog.pg_roles as role_info
    where role_info.rolname = 'authenticated'
  );
begin
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
      and function_info.proconfig is not distinct from array['search_path=""']::text[]
      and pg_catalog.pg_get_function_result(function_info.oid) =
        'TABLE(favorite_id uuid, sender_user_id uuid, created_at timestamp with time zone, nickname text, birth_date text, region text, job text, profile_image text, profile_images text[], is_mutual boolean, match_id uuid, match_status text)'
  )
     or v_auth_position = 0
     or v_service_position <= v_auth_position
     or v_premium_position <= v_service_position
     or pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.get_received_favorites() security contract validation failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as table_info
    where table_info.oid = 'public.favorites'::pg_catalog.regclass
      and table_info.relrowsecurity
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polcmd = 'r'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.favorites'::pg_catalog.regclass
      and policy_info.polname = 'Users can read own favorites'
      and policy_info.polcmd = 'r'
      and policy_info.polpermissive
      and policy_info.polroles = array[v_authenticated_oid]
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        'auth.uid'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        'user_id'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(policy_info.polqual, policy_info.polrelid)),
        'favorite_user_id'
      ) = 0
  ) then
    raise exception 'public.favorites SELECT RLS differs from the preserved outgoing-only contract';
  end if;
end
$function_validation$;

commit;

select 'PASS received favorites service guard migration' as migration_result;
