-- Additive profile image batch authorization RPC.
-- Apply before deploying an app that calls can_access_profile_images(text[]).
-- The existing scalar authorization function, Storage bucket, policies, and data
-- remain unchanged.

begin;

do $preflight$
begin
  if pg_catalog.to_regprocedure('public.can_access_profile_image(text)') is null then
    raise exception 'Scalar profile image authorization prerequisite is missing';
  end if;
end
$preflight$;

create or replace function public.can_access_profile_images(p_object_paths text[])
returns text[]
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_allowed_paths text[];
begin
  if p_object_paths is null then
    return array[]::text[];
  end if;

  if pg_catalog.cardinality(p_object_paths) > 50 then
    raise exception using
      errcode = '22023',
      message = 'At most 50 profile image paths are allowed';
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.object_path order by candidate.first_ordinality),
    array[]::text[]
  )
  into v_allowed_paths
  from (
    select
      input_path.object_path,
      pg_catalog.min(input_path.ordinality) as first_ordinality
    from pg_catalog.unnest(p_object_paths) with ordinality
      as input_path(object_path, ordinality)
    where input_path.object_path is not null
    group by input_path.object_path
  ) as candidate
  where public.can_access_profile_image(candidate.object_path);

  return coalesce(v_allowed_paths, array[]::text[]);
end
$function$;

comment on function public.can_access_profile_images(text[])
  is 'Returns only authorized input profile image paths by reusing scalar authorization';
alter function public.can_access_profile_images(text[]) owner to postgres;
revoke all on function public.can_access_profile_images(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.can_access_profile_images(text[])
  to authenticated, service_role;

do $postflight$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.can_access_profile_images(text[])'
  );
begin
  if v_function_oid is null then
    raise exception 'Batch profile image authorization function is missing';
  end if;

  if (
    select function_info.prosecdef
      or function_info.provolatile <> 'v'
      or function_info.proowner <> 'postgres'::pg_catalog.regrole
      or function_info.proconfig is distinct from array['search_path=""']::text[]
    from pg_catalog.pg_proc as function_info
    where function_info.oid = v_function_oid
  ) then
    raise exception 'Batch profile image authorization metadata differs';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'Batch profile image authorization ACL differs';
  end if;
end
$postflight$;

commit;
