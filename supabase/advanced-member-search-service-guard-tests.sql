-- Rollback-safe integration tests for the guarded Premium advanced search RPC.
-- Apply advanced-member-search-service-guard.sql first, then replace the four
-- placeholders with distinct disposable Auth users that already have profiles.

begin;

create temp table _commatch_advanced_search_it_config (
  premium_user_id uuid,
  standard_user_id uuid,
  expired_user_id uuid,
  inactive_user_id uuid
) on commit drop;

insert into _commatch_advanced_search_it_config values (
  nullif('PASTE_PREMIUM_USER_ID', 'PASTE_' || 'PREMIUM_USER_ID')::uuid,
  nullif('PASTE_STANDARD_USER_ID', 'PASTE_' || 'STANDARD_USER_ID')::uuid,
  nullif('PASTE_EXPIRED_USER_ID', 'PASTE_' || 'EXPIRED_USER_ID')::uuid,
  nullif('PASTE_INACTIVE_USER_ID', 'PASTE_' || 'INACTIVE_USER_ID')::uuid
);

grant select on _commatch_advanced_search_it_config to authenticated;

create function pg_temp._commatch_advanced_search_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text end,
    true
  );
end
$function$;

create function pg_temp._commatch_advanced_search_expect_42501(
  p_label text,
  p_sql text,
  p_expected_message text default 'Premium feature access required'
)
returns void
language plpgsql
as $function$
declare
  v_message text;
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_message = message_text;
      if v_message <> p_expected_message then
        raise exception 'FAIL %: expected message %, got %', p_label, p_expected_message, v_message;
      end if;
  end;
end
$function$;

grant execute on function pg_temp._commatch_advanced_search_set_user(uuid) to authenticated;
grant execute on function pg_temp._commatch_advanced_search_expect_42501(text, text, text)
  to authenticated;

do $preflight$
declare
  v_ids uuid[];
begin
  select array[premium_user_id, standard_user_id, expired_user_id, inactive_user_id]
  into v_ids
  from _commatch_advanced_search_it_config;

  if pg_catalog.array_position(v_ids, null) is not null
     or pg_catalog.cardinality(v_ids) <> (
       select pg_catalog.count(distinct fixture.user_id)
       from pg_catalog.unnest(v_ids) as fixture(user_id)
     ) then
    raise exception 'Replace all PASTE_* values with four distinct disposable member IDs';
  end if;

  if (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 4
     or (select pg_catalog.count(*) from public.profiles where id = any(v_ids)) <> 4 then
    raise exception 'All fixture IDs must identify Auth users with profiles';
  end if;

  if pg_catalog.obj_description(
       'public.search_members_advanced(integer,integer,text,text,text)'::pg_catalog.regprocedure,
       'pg_proc'
     ) <> 'commatch_advanced_member_search_v2' then
    raise exception 'Apply advanced-member-search-service-guard.sql first';
  end if;
end
$preflight$;

delete from public.member_restrictions as restriction
where restriction.user_id in (
  select premium_user_id from _commatch_advanced_search_it_config
  union all select standard_user_id from _commatch_advanced_search_it_config
  union all select expired_user_id from _commatch_advanced_search_it_config
  union all select inactive_user_id from _commatch_advanced_search_it_config
);

delete from public.premium_memberships as membership
where membership.user_id in (
  select premium_user_id from _commatch_advanced_search_it_config
  union all select standard_user_id from _commatch_advanced_search_it_config
  union all select expired_user_id from _commatch_advanced_search_it_config
  union all select inactive_user_id from _commatch_advanced_search_it_config
);

update public.profiles as profile
set gender = case when profile.id = config.standard_user_id then '여성' else '남성' end,
    height = case when profile.id = config.standard_user_id then 170 else profile.height end,
    education = case when profile.id = config.standard_user_id then '대졸' else profile.education end,
    drinking = case when profile.id = config.standard_user_id then '가끔 함' else profile.drinking end,
    hobby = case when profile.id = config.standard_user_id then '등산, 독서' else profile.hobby end
from _commatch_advanced_search_it_config as config
where profile.id in (
  config.premium_user_id,
  config.standard_user_id,
  config.expired_user_id,
  config.inactive_user_id
);

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys, granted_reason, status_reason
)
select premium_user_id, 'active', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day', array['advanced_member_search']::text[],
  'advanced search integration test', 'advanced search integration test'
from _commatch_advanced_search_it_config
union all
select expired_user_id, 'active', pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '1 day', array['advanced_member_search']::text[],
  'advanced search integration test', 'advanced search integration test'
from _commatch_advanced_search_it_config
union all
select inactive_user_id, 'suspended', pg_catalog.now() - interval '1 hour',
  pg_catalog.now() + interval '1 day', array['advanced_member_search']::text[],
  'advanced search integration test', 'advanced search integration test'
from _commatch_advanced_search_it_config;

set local role authenticated;

-- Active Premium access succeeds and preserves every existing advanced filter.
select pg_temp._commatch_advanced_search_set_user(premium_user_id)
from _commatch_advanced_search_it_config;
do $active_premium_filter_test$
declare
  v_candidate_id uuid := (
    select standard_user_id from _commatch_advanced_search_it_config
  );
begin
  if not exists (
    select 1
    from public.search_members_advanced(165, 175, '대졸', '가끔 함', '등산') as member
    where member.id = v_candidate_id
  ) then
    raise exception 'FAIL active Premium advanced filters did not return the matching fixture';
  end if;

  if exists (
    select 1
    from public.search_members_advanced(165, 175, '대졸', '가끔 함', '등산') as member
    join public.profiles as profile on profile.id = member.id
    where profile.height < 165
       or profile.height > 175
       or profile.education <> '대졸'
       or profile.drinking <> '가끔 함'
       or pg_catalog.strpos(pg_catalog.lower(coalesce(profile.hobby, '')), '등산') = 0
  ) then
    raise exception 'FAIL active Premium advanced filters returned a non-matching row';
  end if;
end
$active_premium_filter_test$;

-- A standard member has no entitlement.
select pg_temp._commatch_advanced_search_set_user(standard_user_id)
from _commatch_advanced_search_it_config;
select pg_temp._commatch_advanced_search_expect_42501(
  'standard member', 'select * from public.search_members_advanced()'
);

-- An expired Premium membership has no entitlement.
select pg_temp._commatch_advanced_search_set_user(expired_user_id)
from _commatch_advanced_search_it_config;
select pg_temp._commatch_advanced_search_expect_42501(
  'expired Premium member', 'select * from public.search_members_advanced()'
);

-- Suspended and revoked Premium membership states both have no entitlement.
select pg_temp._commatch_advanced_search_set_user(inactive_user_id)
from _commatch_advanced_search_it_config;
select pg_temp._commatch_advanced_search_expect_42501(
  'suspended Premium membership', 'select * from public.search_members_advanced()'
);

reset role;
update public.premium_memberships as membership
set status = 'revoked', status_changed_at = pg_catalog.now()
from _commatch_advanced_search_it_config as config
where membership.user_id = config.inactive_user_id;
set local role authenticated;
select pg_temp._commatch_advanced_search_set_user(inactive_user_id)
from _commatch_advanced_search_it_config;
select pg_temp._commatch_advanced_search_expect_42501(
  'revoked Premium membership', 'select * from public.search_members_advanced()'
);

-- A valid entitlement never bypasses a member-service suspension.
reset role;
insert into public.member_restrictions (
  user_id, account_status, profile_visibility, suspended_at, suspended_until, reason
)
select premium_user_id, 'suspended', 'visible', pg_catalog.now(), null,
  'advanced search service guard integration test'
from _commatch_advanced_search_it_config;
set local role authenticated;
select pg_temp._commatch_advanced_search_set_user(premium_user_id)
from _commatch_advanced_search_it_config;
select pg_temp._commatch_advanced_search_expect_42501(
  'service-suspended Premium member',
  'select * from public.search_members_advanced()',
  'Member service access is not allowed'
);

reset role;
rollback;

select 'PASS advanced member search service guard integration tests' as test_result;
