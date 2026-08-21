-- ComMatch launch Premium promotion automation.
--
-- Apply after priority-recommendation-premium-migration.sql. Run
-- launch-premium-promotion-dry-run.sql first and review its counts.
-- Existing Premium rows are preserved byte-for-byte apart from the new
-- grant_source column, which classifies every pre-migration row as legacy.

begin;

do $preflight$
declare
  v_feature_constraint text;
begin
  if pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.admin_accounts') is null
     or pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null
     or pg_catalog.to_regprocedure(
       'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'
     ) is null then
    raise exception 'Required Premium, profile, or administrator objects are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'auth'
      and column_info.table_name = 'users'
      and column_info.column_name = 'email_confirmed_at'
      and column_info.data_type = 'timestamp with time zone'
  ) or not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'profiles'
      and column_info.column_name = 'id'
      and column_info.udt_name = 'uuid'
  ) then
    raise exception 'Auth email confirmation or profile identity contract is incompatible';
  end if;

  select pg_catalog.pg_get_constraintdef(constraint_info.oid)
  into v_feature_constraint
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.premium_memberships'::pg_catalog.regclass
    and constraint_info.conname = 'premium_memberships_feature_keys_check';

  if v_feature_constraint is null
     or pg_catalog.strpos(v_feature_constraint, 'likes_received') = 0
     or pg_catalog.strpos(v_feature_constraint, 'received_likes') = 0
     or pg_catalog.strpos(v_feature_constraint, 'advanced_member_search') = 0
     or pg_catalog.strpos(v_feature_constraint, 'expanded_recommendations') = 0
     or pg_catalog.strpos(v_feature_constraint, 'priority_recommendation') = 0 then
    raise exception 'The final five-key Premium constraint is not installed';
  end if;
end
$preflight$;

create temporary table _commatch_launch_premium_existing_snapshot on commit drop as
select
  membership.id,
  pg_catalog.to_jsonb(membership) as row_data
from public.premium_memberships as membership;

alter table public.premium_memberships
  add column if not exists grant_source text not null default 'legacy';

alter table public.premium_memberships
  drop constraint if exists premium_memberships_grant_source_check;
alter table public.premium_memberships
  add constraint premium_memberships_grant_source_check
  check (grant_source in ('legacy', 'launch_promotion', 'admin', 'paid'));

comment on column public.premium_memberships.grant_source is
  'Current entitlement source: legacy, launch_promotion, admin, or paid';

create or replace function public.set_admin_premium_grant_source()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if tg_table_schema <> 'public'
     or tg_table_name <> 'premium_memberships'
     or tg_op not in ('INSERT', 'UPDATE') then
    raise exception 'Administrator Premium source trigger invoked from an invalid context';
  end if;

  if auth.uid() is not null
     and coalesce(public.has_admin_permission('premium_memberships_manage'), false)
     and (
       tg_op = 'UPDATE'
       or (tg_op = 'INSERT' and new.grant_source = 'legacy')
     ) then
    new.grant_source := 'admin';
  end if;

  return new;
end
$function$;

comment on function public.set_admin_premium_grant_source()
  is 'commatch_launch_premium_promotion_v1';
alter function public.set_admin_premium_grant_source() owner to postgres;
revoke all on function public.set_admin_premium_grant_source()
  from public, anon, authenticated, service_role;

drop trigger if exists premium_memberships_set_admin_grant_source
  on public.premium_memberships;
create trigger premium_memberships_set_admin_grant_source
before insert or update on public.premium_memberships
for each row
execute function public.set_admin_premium_grant_source();

create or replace function public.grant_launch_premium_membership(
  p_user_id uuid,
  p_granted_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_inserted_count integer := 0;
  v_campaign_expires_at constant timestamptz :=
    '2027-01-01 00:00:00+09'::timestamptz;
begin
  if p_user_id is null
     or p_granted_at is null
     or p_granted_at >= v_campaign_expires_at then
    return false;
  end if;

  insert into public.premium_memberships (
    user_id,
    status,
    started_at,
    expires_at,
    feature_keys,
    grant_source,
    granted_at,
    granted_by,
    granted_reason,
    status_changed_at,
    status_changed_by,
    status_reason,
    created_at,
    updated_at
  )
  select
    auth_user.id,
    'active',
    p_granted_at,
    v_campaign_expires_at,
    array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations',
      'priority_recommendation'
    ]::text[],
    'launch_promotion',
    p_granted_at,
    null,
    'Launch Premium promotion through 2026-12-31 KST',
    p_granted_at,
    null,
    'Launch Premium promotion grant',
    p_granted_at,
    p_granted_at
  from auth.users as auth_user
  join public.profiles as profile
    on profile.id = auth_user.id
  where auth_user.id = p_user_id
    and auth_user.email_confirmed_at is not null
    and not exists (
      select 1
      from public.admin_accounts as admin_account
      where admin_account.user_id = auth_user.id
    )
    and not exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = auth_user.id
    )
  on conflict (user_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count = 1;
end
$function$;

comment on function public.grant_launch_premium_membership(uuid,timestamptz)
  is 'commatch_launch_premium_promotion_v1';
alter function public.grant_launch_premium_membership(uuid,timestamptz)
  owner to postgres;
revoke all on function public.grant_launch_premium_membership(uuid,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.grant_launch_premium_after_profile_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or tg_table_schema <> 'public'
     or tg_table_name <> 'profiles' then
    raise exception 'Launch Premium profile trigger invoked from an invalid context';
  end if;

  begin
    perform public.grant_launch_premium_membership(
      new.id,
      pg_catalog.now()
    );
  exception
    when others then
      -- Premium is an auxiliary entitlement. Preserve the profile insert while
      -- emitting a server-side warning for unexpected failures. Expected
      -- duplicate races are handled by ON CONFLICT and never reach this block.
      raise warning
        'Launch Premium grant failed for profile % (SQLSTATE %)',
        new.id,
        sqlstate;
  end;

  return new;
end
$function$;

comment on function public.grant_launch_premium_after_profile_insert()
  is 'commatch_launch_premium_promotion_v1';
alter function public.grant_launch_premium_after_profile_insert()
  owner to postgres;
revoke all on function public.grant_launch_premium_after_profile_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists profiles_grant_launch_premium_after_insert
  on public.profiles;
create trigger profiles_grant_launch_premium_after_insert
after insert on public.profiles
for each row
execute function public.grant_launch_premium_after_profile_insert();

do $backfill$
declare
  v_granted_at timestamptz := pg_catalog.now();
  v_campaign_expires_at constant timestamptz :=
    '2027-01-01 00:00:00+09'::timestamptz;
  v_user_id uuid;
  v_eligible_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_granted_at >= v_campaign_expires_at then
    raise notice 'Launch Premium backfill skipped because the campaign has ended';
    return;
  end if;

  for v_user_id in
    select auth_user.id
    from auth.users as auth_user
    join public.profiles as profile
      on profile.id = auth_user.id
    where auth_user.email_confirmed_at is not null
      and not exists (
        select 1
        from public.admin_accounts as admin_account
        where admin_account.user_id = auth_user.id
      )
      and not exists (
        select 1
        from public.premium_memberships as membership
        where membership.user_id = auth_user.id
      )
  loop
    v_eligible_count := v_eligible_count + 1;
    if public.grant_launch_premium_membership(v_user_id, v_granted_at) then
      v_inserted_count := v_inserted_count + 1;
    end if;
  end loop;

  raise notice
    'Launch Premium backfill eligible %, inserted %',
    v_eligible_count,
    v_inserted_count;
end
$backfill$;

do $postflight$
declare
  v_system_function oid := pg_catalog.to_regprocedure(
    'public.grant_launch_premium_membership(uuid,timestamp with time zone)'
  );
  v_profile_trigger_function oid := pg_catalog.to_regprocedure(
    'public.grant_launch_premium_after_profile_insert()'
  );
  v_admin_source_function oid := pg_catalog.to_regprocedure(
    'public.set_admin_premium_grant_source()'
  );
begin
  if not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'premium_memberships'
      and column_info.column_name = 'grant_source'
      and column_info.data_type = 'text'
      and column_info.is_nullable = 'NO'
      and column_info.column_default = '''legacy''::text'
  ) then
    raise exception 'premium_memberships.grant_source differs from the approved contract';
  end if;

  if exists (
    select 1
    from _commatch_launch_premium_existing_snapshot as snapshot
    left join public.premium_memberships as membership
      on membership.id = snapshot.id
    where membership.id is null
       or membership.grant_source is distinct from 'legacy'
       or (pg_catalog.to_jsonb(membership) - 'grant_source')
          is distinct from snapshot.row_data
  ) then
    raise exception 'A pre-existing Premium membership was modified';
  end if;

  if v_system_function is null
     or v_profile_trigger_function is null
     or v_admin_source_function is null then
    raise exception 'A launch Premium function is missing';
  end if;

  if pg_catalog.pg_get_userbyid(
       (select function_info.proowner from pg_catalog.pg_proc as function_info
        where function_info.oid = v_system_function)
     ) <> 'postgres'
     or not (
       select function_info.prosecdef
       from pg_catalog.pg_proc as function_info
       where function_info.oid = v_system_function
     )
     or (
       select function_info.proconfig
       from pg_catalog.pg_proc as function_info
       where function_info.oid = v_system_function
     ) is distinct from array['search_path=""']::text[] then
    raise exception 'Launch Premium system function security differs from the approved contract';
  end if;

  if pg_catalog.has_function_privilege('anon', v_system_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_system_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_system_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_profile_trigger_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_profile_trigger_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_profile_trigger_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_admin_source_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_admin_source_function, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_admin_source_function, 'EXECUTE') then
    raise exception 'Launch Premium internal functions expose an unapproved execute privilege';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.profiles'::pg_catalog.regclass
      and trigger_info.tgname = 'profiles_grant_launch_premium_after_insert'
      and not trigger_info.tgisinternal
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgfoid = v_profile_trigger_function
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgrelid = 'public.premium_memberships'::pg_catalog.regclass
      and trigger_info.tgname = 'premium_memberships_set_admin_grant_source'
      and not trigger_info.tgisinternal
      and trigger_info.tgenabled = 'O'
      and trigger_info.tgfoid = v_admin_source_function
  ) then
    raise exception 'A launch Premium trigger differs from the approved contract';
  end if;
end
$postflight$;

commit;
