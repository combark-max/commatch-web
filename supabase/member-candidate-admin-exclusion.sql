-- Exclude every account with administrator history from member-facing discovery.
--
-- Apply after member-profile-visibility.sql,
-- advanced-member-search-service-guard.sql,
-- priority-recommendation-premium-migration.sql, and
-- member-profile-premium-badge.sql.

begin;

do $preflight$
declare
  v_marker constant text := 'commatch_member_candidate_admin_exclusion_v1';
  v_required_function text;
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.premium_memberships') is null then
    raise exception 'Required member candidate tables are missing';
  end if;

  foreach v_required_function in array array[
    'public.get_visible_member_summaries()',
    'public.search_members_advanced(integer,integer,text,text,text)',
    'public.get_ai_match_candidates()',
    'public.get_visible_member_detail(uuid)',
    'public.is_member_profile_visible(uuid)',
    'public.is_member_service_allowed()',
    'public.has_premium_feature(text)',
    'public.lock_member_service_write(uuid)'
  ]::text[] loop
    if pg_catalog.to_regprocedure(v_required_function) is null then
      raise exception 'Required function % is missing', v_required_function;
    end if;
  end loop;

  if not coalesce(pg_catalog.obj_description(
       'public.get_visible_member_summaries()'::pg_catalog.regprocedure,
       'pg_proc'
     ) in ('commatch_member_profile_visibility_v1', v_marker), false)
     or not coalesce(pg_catalog.obj_description(
       'public.search_members_advanced(integer,integer,text,text,text)'::pg_catalog.regprocedure,
       'pg_proc'
     ) in ('commatch_advanced_member_search_v2', v_marker), false)
     or not coalesce(pg_catalog.obj_description(
       'public.get_ai_match_candidates()'::pg_catalog.regprocedure,
       'pg_proc'
     ) in ('commatch_priority_recommendation_membership_v1', v_marker), false)
     or not coalesce(pg_catalog.obj_description(
       'public.get_visible_member_detail(uuid)'::pg_catalog.regprocedure,
       'pg_proc'
     ) in ('commatch_member_profile_premium_badge_v1', v_marker), false) then
    raise exception 'Member candidate functions do not match the approved latest definitions';
  end if;
end
$preflight$;

create or replace function public.get_visible_member_summaries()
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
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

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
    and member_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and restriction.profile_visibility = 'hidden'
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
  order by member_profile.id;
end
$function$;

create or replace function public.search_members_advanced(
  p_height_min integer default null,
  p_height_max integer default null,
  p_education text default null,
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
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
  v_education text := nullif(pg_catalog.btrim(p_education), '');
  v_drinking text := nullif(pg_catalog.btrim(p_drinking), '');
  v_hobby text := nullif(pg_catalog.btrim(p_hobby), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if not coalesce(public.has_premium_feature('advanced_member_search'), false) then
    raise exception using errcode = '42501', message = 'Premium feature access required';
  end if;

  if p_height_min is not null and p_height_min < 0
     or p_height_max is not null and p_height_max < 0
     or p_height_min is not null and p_height_max is not null and p_height_min > p_height_max
     or v_education is not null
       and v_education <> all (array['고졸', '전문대졸', '대졸', '석사', '박사']::text[])
     or v_drinking is not null
       and v_drinking <> all (array['전혀 안 함', '가끔 함', '자주 함']::text[]) then
    raise exception using errcode = '22023', message = 'Invalid advanced search filters';
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
    and member_profile.gender = case when v_gender = '남성' then '여성' else '남성' end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = member_profile.id
        and restriction.profile_visibility = 'hidden'
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = member_profile.id
    )
    and (p_height_min is null or member_profile.height >= p_height_min)
    and (p_height_max is null or member_profile.height <= p_height_max)
    and (v_education is null or member_profile.education = v_education)
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

create or replace function public.get_ai_match_candidates()
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  height integer,
  region text,
  job text,
  education text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  introduction text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  is_priority_recommendation boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_gender text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select viewer_profile.gender
  into v_gender
  from public.profiles as viewer_profile
  where viewer_profile.id = v_user_id;

  if v_gender is null or v_gender not in ('남성', '여성') then
    return;
  end if;

  return query
  select
    candidate_profile.id,
    candidate_profile.nickname,
    candidate_profile.birth_date::text,
    candidate_profile.gender,
    candidate_profile.height,
    candidate_profile.region,
    candidate_profile.job,
    candidate_profile.education,
    candidate_profile.hobby,
    candidate_profile.drinking,
    candidate_profile.smoking,
    candidate_profile.marriage_history,
    candidate_profile.introduction,
    candidate_profile.marriage_values,
    candidate_profile.profile_image,
    candidate_profile.profile_images,
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = candidate_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
        and 'priority_recommendation' = any(membership.feature_keys)
    )
  from public.profiles as candidate_profile
  where candidate_profile.id <> v_user_id
    and candidate_profile.gender = case v_gender
      when '남성' then '여성'
      when '여성' then '남성'
    end
    and not exists (
      select 1
      from public.member_restrictions as restriction
      where restriction.user_id = candidate_profile.id
        and (
          restriction.profile_visibility = 'hidden'
          or (
            restriction.account_status = 'suspended'
            and (
              restriction.suspended_until is null
              or restriction.suspended_until > pg_catalog.now()
            )
          )
        )
    )
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = candidate_profile.id
    )
  order by candidate_profile.id;
end
$function$;

create or replace function public.get_visible_member_detail(p_target_user_id uuid)
returns table (
  id uuid,
  nickname text,
  birth_date text,
  gender text,
  height integer,
  job text,
  region text,
  introduction text,
  education text,
  hobby text,
  drinking text,
  smoking text,
  marriage_history text,
  marriage_values text,
  profile_image text,
  profile_images text[],
  is_premium_available boolean
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

  if p_target_user_id is null or p_target_user_id = v_user_id then
    return;
  end if;

  perform public.lock_member_service_write(p_target_user_id);

  return query
  select
    target_profile.id,
    target_profile.nickname,
    target_profile.birth_date::text,
    target_profile.gender,
    target_profile.height,
    target_profile.job,
    target_profile.region,
    target_profile.introduction,
    target_profile.education,
    target_profile.hobby,
    target_profile.drinking,
    target_profile.smoking,
    target_profile.marriage_history,
    target_profile.marriage_values,
    target_profile.profile_image,
    target_profile.profile_images,
    exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = target_profile.id
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
    ) as is_premium_available
  from public.profiles as target_profile
  where target_profile.id = p_target_user_id
    and public.is_member_profile_visible(target_profile.id)
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = target_profile.id
    );
end
$function$;

alter function public.get_visible_member_summaries() owner to postgres;
alter function public.search_members_advanced(integer, integer, text, text, text) owner to postgres;
alter function public.get_ai_match_candidates() owner to postgres;
alter function public.get_visible_member_detail(uuid) owner to postgres;

comment on function public.get_visible_member_summaries()
  is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.search_members_advanced(integer, integer, text, text, text)
  is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.get_ai_match_candidates()
  is 'commatch_member_candidate_admin_exclusion_v1';
comment on function public.get_visible_member_detail(uuid)
  is 'commatch_member_candidate_admin_exclusion_v1';

revoke all on function public.get_visible_member_summaries()
  from public, anon, authenticated, service_role;
revoke all on function public.search_members_advanced(integer, integer, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_ai_match_candidates()
  from public, anon, authenticated, service_role;
revoke all on function public.get_visible_member_detail(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_visible_member_summaries()
  to authenticated, service_role;
grant execute on function public.search_members_advanced(integer, integer, text, text, text)
  to authenticated, service_role;
grant execute on function public.get_ai_match_candidates()
  to authenticated, service_role;
grant execute on function public.get_visible_member_detail(uuid)
  to authenticated, service_role;

do $validation$
declare
  v_marker constant text := 'commatch_member_candidate_admin_exclusion_v1';
  v_function record;
begin
  for v_function in
    select *
    from (values
      (
        'public.get_visible_member_summaries()',
        's'::"char",
        'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)',
        'admin_account.user_id = member_profile.id'
      ),
      (
        'public.search_members_advanced(integer,integer,text,text,text)',
        'v'::"char",
        'TABLE(id uuid, nickname text, birth_date text, gender text, region text, job text, introduction text, profile_image text)',
        'admin_account.user_id = member_profile.id'
      ),
      (
        'public.get_ai_match_candidates()',
        's'::"char",
        'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, region text, job text, education text, hobby text, drinking text, smoking text, marriage_history text, introduction text, marriage_values text, profile_image text, profile_images text[], is_priority_recommendation boolean)',
        'admin_account.user_id = candidate_profile.id'
      ),
      (
        'public.get_visible_member_detail(uuid)',
        'v'::"char",
        'TABLE(id uuid, nickname text, birth_date text, gender text, height integer, job text, region text, introduction text, education text, hobby text, drinking text, smoking text, marriage_history text, marriage_values text, profile_image text, profile_images text[], is_premium_available boolean)',
        'admin_account.user_id = target_profile.id'
      )
    ) as expected(function_signature, volatility, result_type, target_predicate)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_proc as function_info
      join pg_catalog.pg_language as language_info
        on language_info.oid = function_info.prolang
      where function_info.oid = pg_catalog.to_regprocedure(v_function.function_signature)
        and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
        and language_info.lanname = 'plpgsql'
        and function_info.prosecdef
        and function_info.provolatile = v_function.volatility
        and function_info.proconfig is not distinct from array['search_path=""']::text[]
        and pg_catalog.obj_description(function_info.oid, 'pg_proc') = v_marker
        and pg_catalog.pg_get_function_result(function_info.oid) = v_function.result_type
    ) then
      raise exception 'Function contract validation failed for %', v_function.function_signature;
    end if;

    if pg_catalog.strpos(
         pg_catalog.lower(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure(v_function.function_signature)
         )),
         'from public.admin_accounts as admin_account'
       ) = 0
       or pg_catalog.strpos(
         pg_catalog.lower(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure(v_function.function_signature)
         )),
         v_function.target_predicate
       ) = 0 then
      raise exception 'Administrator exclusion validation failed for %', v_function.function_signature;
    end if;

    if pg_catalog.has_function_privilege('public', v_function.function_signature, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function.function_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function.function_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_function.function_signature, 'EXECUTE') then
      raise exception 'Function privilege validation failed for %', v_function.function_signature;
    end if;
  end loop;
end
$validation$;

commit;

select 'PASS member candidate administrator exclusion migration' as migration_result;
