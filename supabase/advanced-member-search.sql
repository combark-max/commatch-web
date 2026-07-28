-- ComMatch Premium advanced member search.
-- This file is not executed automatically. Review it before applying it to
-- Supabase. It preserves the existing profiles RLS and column permissions.

begin;

do $preflight$
declare
  v_install_marker constant text := 'commatch_advanced_member_search_v1';
  v_expected_signature constant text :=
    'public.search_members_advanced(integer,integer,text,text,text,text)';
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist';
  end if;

  if pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       where function_info.oid = pg_catalog.to_regprocedure(
           'public.has_premium_feature(text)'
         )
         and function_info.pronargs = 1
         and not function_info.proretset
         and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
     ) then
    raise exception 'public.has_premium_feature(text) is missing or incompatible';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname = 'search_members_advanced'
  ) and (
    pg_catalog.to_regprocedure(v_expected_signature) is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_proc as function_info
      join pg_catalog.pg_namespace as namespace_info
        on namespace_info.oid = function_info.pronamespace
      where namespace_info.nspname = 'public'
        and function_info.proname = 'search_members_advanced'
    ) <> 1
    or pg_catalog.obj_description(
      pg_catalog.to_regprocedure(v_expected_signature),
      'pg_proc'
    ) is distinct from v_install_marker
  ) then
    raise exception 'public.search_members_advanced exists with an unapproved definition or signature';
  end if;
end
$preflight$;

create or replace function public.search_members_advanced(
  p_height_min integer default null,
  p_height_max integer default null,
  p_education text default null,
  p_religion text default null,
  p_drinking text default null,
  p_hobby text default null
)
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  region text,
  job text,
  introduction text,
  profile_image text
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_gender text;
  v_education text := nullif(pg_catalog.btrim(p_education), '');
  v_religion text := nullif(pg_catalog.btrim(p_religion), '');
  v_drinking text := nullif(pg_catalog.btrim(p_drinking), '');
  v_hobby text := nullif(pg_catalog.btrim(p_hobby), '');
begin
  select auth.uid() into v_user_id;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication required';
  end if;

  if not coalesce(
    public.has_premium_feature('advanced_member_search'),
    false
  ) then
    raise exception using
      errcode = '42501',
      message = 'Premium feature access required';
  end if;

  if p_height_min is not null and p_height_min < 0
     or p_height_max is not null and p_height_max < 0
     or p_height_min is not null
       and p_height_max is not null
       and p_height_min > p_height_max
     or v_education is not null
       and v_education <> all (array['고졸', '전문대졸', '대졸', '석사', '박사']::text[])
     or v_religion is not null
       and v_religion <> all (array['무교', '기독교', '천주교', '불교', '기타']::text[])
     or v_drinking is not null
       and v_drinking <> all (array['전혀 안 함', '가끔 함', '자주 함']::text[]) then
    raise exception using
      errcode = '22023',
      message = 'Invalid advanced search filters';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  return query
  select
    member_profile.id,
    member_profile.nickname,
    member_profile.birth_date::text,
    member_profile.gender,
    member_profile.region,
    member_profile.job,
    member_profile.introduction,
    member_profile.profile_image
  from public.profiles as member_profile
  where member_profile.id <> v_user_id
    and member_profile.gender = case
      when v_gender = '남성' then '여성'
      else '남성'
    end
    and (p_height_min is null or member_profile.height >= p_height_min)
    and (p_height_max is null or member_profile.height <= p_height_max)
    and (v_education is null or member_profile.education = v_education)
    and (v_religion is null or member_profile.religion = v_religion)
    and (v_drinking is null or member_profile.drinking = v_drinking)
    and (
      v_hobby is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(member_profile.hobby, '')),
        pg_catalog.lower(v_hobby)
      ) > 0
    );
end
$function$;

comment on function public.search_members_advanced(integer, integer, text, text, text, text)
  is 'commatch_advanced_member_search_v1';

do $function_validation$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.search_members_advanced(integer,integer,text,text,text,text)'
  );
begin
  if v_function_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_language as language_info
         on language_info.oid = function_info.prolang
       where function_info.oid = v_function_oid
         and language_info.lanname = 'plpgsql'
         and function_info.pronargs = 6
         and function_info.pronargdefaults = 6
         and function_info.proretset
         and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
         and not function_info.prosecdef
         and function_info.provolatile = 's'
         and function_info.proargnames[1:6] = array[
           'p_height_min',
           'p_height_max',
           'p_education',
           'p_religion',
           'p_drinking',
           'p_hobby'
         ]::text[]
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
         ) = 'TABLE(iduuid,nicknametext,birth_datetext,gendertext,regiontext,jobtext,introductiontext,profile_imagetext)'
     ) then
    raise exception 'public.search_members_advanced has an incompatible definition';
  end if;
end
$function_validation$;

revoke all on function public.search_members_advanced(integer, integer, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text, text)
  to authenticated;

commit;
