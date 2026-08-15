-- ComMatch priority recommendation formal Premium migration.
--
-- Apply after received-likes-premium-migration.sql,
-- admin-premium-memberships.sql, and profile-religion-retirement.sql.
-- Existing memberships and pilot rows are preserved without backfill.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.premium_memberships') is null
     or pg_catalog.to_regclass('public.premium_membership_actions') is null
     or pg_catalog.to_regclass('public.premium_membership_request_receipts') is null
     or pg_catalog.to_regclass('public.member_restrictions') is null
     or pg_catalog.to_regclass('public.premium_feature_access') is null
     or pg_catalog.to_regprocedure('public.has_premium_feature(text)') is null
     or pg_catalog.to_regprocedure('public.get_ai_match_candidates()') is null
     or pg_catalog.to_regprocedure('public.get_priority_recommendation_candidate_ids()') is null
     or pg_catalog.to_regprocedure(
       'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'
     ) is null then
    raise exception 'Required Premium or recommendation objects are missing';
  end if;
end
$preflight$;

create temporary table _commatch_priority_pilot_snapshot on commit drop as
select pilot.*
from public.premium_feature_access as pilot;

create temporary table _commatch_priority_membership_snapshot on commit drop as
select membership.user_id, membership.feature_keys
from public.premium_memberships as membership;

alter table public.premium_memberships
  drop constraint if exists premium_memberships_feature_keys_check;
alter table public.premium_memberships
  add constraint premium_memberships_feature_keys_check
  check (
    pg_catalog.cardinality(feature_keys) between 1 and 5
    and pg_catalog.array_position(feature_keys, null) is null
    and feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations',
      'priority_recommendation'
    ]::text[]
    and pg_catalog.cardinality(feature_keys) =
      (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
      + (case when 'priority_recommendation' = any(feature_keys) then 1 else 0 end)
  );

alter table public.premium_membership_actions
  drop constraint if exists premium_membership_actions_previous_feature_keys_check;
alter table public.premium_membership_actions
  add constraint premium_membership_actions_previous_feature_keys_check
  check (
    previous_feature_keys is null
    or (
      pg_catalog.cardinality(previous_feature_keys) between 1 and 5
      and pg_catalog.array_position(previous_feature_keys, null) is null
      and previous_feature_keys <@ array[
        'likes_received',
        'received_likes',
        'advanced_member_search',
        'expanded_recommendations',
        'priority_recommendation'
      ]::text[]
      and pg_catalog.cardinality(previous_feature_keys) =
        (case when 'likes_received' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'received_likes' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'advanced_member_search' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'expanded_recommendations' = any(previous_feature_keys) then 1 else 0 end)
        + (case when 'priority_recommendation' = any(previous_feature_keys) then 1 else 0 end)
    )
  );

alter table public.premium_membership_actions
  drop constraint if exists premium_membership_actions_new_feature_keys_check;
alter table public.premium_membership_actions
  add constraint premium_membership_actions_new_feature_keys_check
  check (
    pg_catalog.cardinality(new_feature_keys) between 1 and 5
    and pg_catalog.array_position(new_feature_keys, null) is null
    and new_feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations',
      'priority_recommendation'
    ]::text[]
    and pg_catalog.cardinality(new_feature_keys) =
      (case when 'likes_received' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(new_feature_keys) then 1 else 0 end)
      + (case when 'priority_recommendation' = any(new_feature_keys) then 1 else 0 end)
  );

alter table public.premium_membership_request_receipts
  drop constraint if exists premium_membership_request_receipts_feature_keys_check;
alter table public.premium_membership_request_receipts
  add constraint premium_membership_request_receipts_feature_keys_check
  check (
    pg_catalog.cardinality(feature_keys) between 1 and 5
    and pg_catalog.array_position(feature_keys, null) is null
    and feature_keys <@ array[
      'likes_received',
      'received_likes',
      'advanced_member_search',
      'expanded_recommendations',
      'priority_recommendation'
    ]::text[]
    and pg_catalog.cardinality(feature_keys) =
      (case when 'likes_received' = any(feature_keys) then 1 else 0 end)
      + (case when 'received_likes' = any(feature_keys) then 1 else 0 end)
      + (case when 'advanced_member_search' = any(feature_keys) then 1 else 0 end)
      + (case when 'expanded_recommendations' = any(feature_keys) then 1 else 0 end)
      + (case when 'priority_recommendation' = any(feature_keys) then 1 else 0 end)
  );

create or replace function public.has_premium_feature(p_feature_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when p_feature_key is null
      or p_feature_key not in (
        'likes_received',
        'received_likes',
        'advanced_member_search',
        'expanded_recommendations',
        'priority_recommendation'
      )
    then false
    else exists (
      select 1
      from public.premium_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.started_at <= pg_catalog.now()
        and (
          membership.expires_at is null
          or membership.expires_at > pg_catalog.now()
        )
        and p_feature_key = any(membership.feature_keys)
    )
  end
$function$;

comment on function public.has_premium_feature(text)
  is 'commatch_premium_memberships_v1';
alter function public.has_premium_feature(text) owner to postgres;
revoke all on function public.has_premium_feature(text)
  from public, anon, authenticated, service_role;
grant execute on function public.has_premium_feature(text) to authenticated;

create or replace function public.update_admin_premium_membership(
  p_subject_user_id uuid,
  p_expected_updated_at timestamptz,
  p_new_status text,
  p_started_at timestamptz,
  p_expires_at timestamptz,
  p_feature_keys text[],
  p_reason text,
  p_request_id uuid
)
returns table (
  is_success boolean,
  is_noop boolean,
  is_duplicate_request boolean,
  membership_id uuid,
  subject_user_id uuid,
  stored_status text,
  is_available boolean,
  started_at timestamptz,
  expires_at timestamptz,
  feature_keys text[],
  membership_updated_at timestamptz,
  action_id uuid,
  action_type text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_status text := nullif(pg_catalog.btrim(p_new_status), '');
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_feature_keys text[];
  v_existing public.premium_memberships%rowtype;
  v_membership public.premium_memberships%rowtype;
  v_receipt public.premium_membership_request_receipts%rowtype;
  v_action_id uuid := pg_catalog.gen_random_uuid();
  v_action_type text;
  v_changed_at timestamptz := pg_catalog.now();
  v_existing_canonical_keys text[];
begin
  if v_admin_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not coalesce(public.has_admin_permission('premium_memberships_manage'), false) then
    raise exception using errcode = '42501', message = 'Insufficient admin permission';
  end if;
  if p_subject_user_id is null then
    raise exception using errcode = '22023', message = 'Target user ID is required';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  -- Serialize each idempotency key before checking it. The target lock below is
  -- always acquired second, giving all callers a consistent lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 982452)
  );

  select receipt.* into v_receipt
  from public.premium_membership_request_receipts as receipt
  where receipt.request_id = p_request_id;

  if found then
    if v_receipt.subject_user_id is distinct from p_subject_user_id
       or v_receipt.performed_by is distinct from v_admin_user_id then
      raise exception using
        errcode = '22023',
        message = 'PREMIUM_REQUEST_ID_CONFLICT';
    end if;

    return query
    select
      true,
      v_receipt.is_noop,
      true,
      v_receipt.membership_id,
      v_receipt.subject_user_id,
      v_receipt.stored_status,
      v_receipt.result_is_available,
      v_receipt.started_at,
      v_receipt.expires_at,
      v_receipt.feature_keys,
      v_receipt.membership_updated_at,
      v_receipt.action_id,
      v_receipt.action_type;
    return;
  end if;

  if not exists (select 1 from auth.users as auth_user where auth_user.id = p_subject_user_id) then
    raise exception using errcode = 'P0002', message = 'Target user not found';
  end if;
  if exists (
    select 1 from public.admin_accounts as target_admin
    where target_admin.user_id = p_subject_user_id
  ) then
    raise exception using errcode = '22023', message = 'Administrator accounts cannot receive member Premium access';
  end if;
  if v_status is null or v_status not in ('active', 'suspended', 'revoked') then
    raise exception using errcode = '22023', message = 'Invalid Premium status';
  end if;
  if p_started_at is null then
    raise exception using errcode = '22023', message = 'Premium start time is required';
  end if;
  if p_expires_at is not null and p_expires_at <= p_started_at then
    raise exception using errcode = '22023', message = 'Premium end time must follow the start time';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'Administrator reason is required';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'Administrator reason must be 500 characters or fewer';
  end if;
  if p_feature_keys is null
     or pg_catalog.cardinality(p_feature_keys) < 1
     or pg_catalog.cardinality(p_feature_keys) > 5
     or pg_catalog.array_position(p_feature_keys, null) is not null
     or not p_feature_keys <@ array[
       'likes_received',
       'received_likes',
       'advanced_member_search',
       'expanded_recommendations',
       'priority_recommendation'
     ]::text[] then
    raise exception using errcode = '22023', message = 'Invalid Premium feature keys';
  end if;

  select pg_catalog.array_agg(feature.feature_key order by feature.feature_key)
  into v_feature_keys
  from pg_catalog.unnest(p_feature_keys) as feature(feature_key);

  if pg_catalog.cardinality(v_feature_keys) <> (
    select pg_catalog.count(distinct feature.feature_key)
    from pg_catalog.unnest(p_feature_keys) as feature(feature_key)
  ) then
    raise exception using errcode = '22023', message = 'Duplicate Premium feature keys are not allowed';
  end if;

  perform public.lock_premium_membership_write(p_subject_user_id);

  select membership.* into v_existing
  from public.premium_memberships as membership
  where membership.user_id = p_subject_user_id
  for update;

  if found then
    if p_expected_updated_at is null
       or v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception using errcode = 'P0001', message = 'PREMIUM_STALE_VERSION';
    end if;
    if v_existing.status = 'revoked' and v_status not in ('revoked', 'active') then
      raise exception using errcode = '22023', message = 'Revoked Premium can only remain revoked or be regranted as active';
    end if;

    select pg_catalog.array_agg(feature.feature_key order by feature.feature_key)
    into v_existing_canonical_keys
    from pg_catalog.unnest(v_existing.feature_keys) as feature(feature_key);

    if v_existing.status = v_status
       and v_existing.started_at = p_started_at
       and v_existing.expires_at is not distinct from p_expires_at
       and v_existing_canonical_keys = v_feature_keys then
      insert into public.premium_membership_request_receipts (
        request_id,
        subject_user_id,
        is_noop,
        membership_id,
        stored_status,
        result_is_available,
        started_at,
        expires_at,
        feature_keys,
        membership_updated_at,
        action_id,
        action_type,
        performed_by,
        created_at
      ) values (
        p_request_id,
        v_existing.user_id,
        true,
        v_existing.id,
        v_existing.status,
        v_existing.status = 'active'
          and v_existing.started_at <= v_changed_at
          and (v_existing.expires_at is null or v_existing.expires_at > v_changed_at),
        v_existing.started_at,
        v_existing.expires_at,
        v_existing_canonical_keys,
        v_existing.updated_at,
        null,
        null,
        v_admin_user_id,
        v_changed_at
      );

      return query
      select
        true,
        true,
        false,
        v_existing.id,
        v_existing.user_id,
        v_existing.status,
        v_existing.status = 'active'
          and v_existing.started_at <= pg_catalog.now()
          and (v_existing.expires_at is null or v_existing.expires_at > pg_catalog.now()),
        v_existing.started_at,
        v_existing.expires_at,
        v_existing_canonical_keys,
        v_existing.updated_at,
        null::uuid,
        null::text;
      return;
    end if;

    v_action_type := case
      when v_existing.status = 'revoked' and v_status = 'active' then 'regranted'
      when v_existing.status = 'active' and v_status = 'suspended' then 'suspended'
      when v_existing.status = 'suspended' and v_status = 'active' then 'reactivated'
      when v_existing.status in ('active', 'suspended') and v_status = 'revoked' then 'revoked'
      else 'updated'
    end;

    update public.premium_memberships as membership
    set status = v_status,
        started_at = p_started_at,
        expires_at = p_expires_at,
        feature_keys = v_feature_keys,
        granted_at = case
          when v_action_type = 'regranted' then v_changed_at
          else membership.granted_at
        end,
        granted_by = case
          when v_action_type = 'regranted' then v_admin_user_id
          else membership.granted_by
        end,
        granted_reason = case
          when v_action_type = 'regranted' then v_reason
          else membership.granted_reason
        end,
        status_changed_at = v_changed_at,
        status_changed_by = v_admin_user_id,
        status_reason = v_reason,
        updated_at = v_changed_at
    where membership.id = v_existing.id
    returning membership.* into v_membership;
  else
    if p_expected_updated_at is not null then
      raise exception using errcode = 'P0001', message = 'PREMIUM_STALE_VERSION';
    end if;
    if v_status <> 'active' then
      raise exception using errcode = '22023', message = 'A new Premium membership must be granted as active';
    end if;

    v_action_type := 'granted';

    insert into public.premium_memberships (
      user_id,
      status,
      started_at,
      expires_at,
      feature_keys,
      granted_at,
      granted_by,
      granted_reason,
      status_changed_at,
      status_changed_by,
      status_reason,
      created_at,
      updated_at
    ) values (
      p_subject_user_id,
      v_status,
      p_started_at,
      p_expires_at,
      v_feature_keys,
      v_changed_at,
      v_admin_user_id,
      v_reason,
      v_changed_at,
      v_admin_user_id,
      v_reason,
      v_changed_at,
      v_changed_at
    )
    returning * into v_membership;
  end if;

  insert into public.premium_membership_actions (
    id,
    request_id,
    membership_id,
    subject_user_id,
    action_type,
    previous_status,
    new_status,
    previous_started_at,
    new_started_at,
    previous_expires_at,
    new_expires_at,
    previous_feature_keys,
    new_feature_keys,
    reason,
    performed_by,
    membership_updated_at,
    created_at
  ) values (
    v_action_id,
    p_request_id,
    v_membership.id,
    p_subject_user_id,
    v_action_type,
    v_existing.status,
    v_membership.status,
    v_existing.started_at,
    v_membership.started_at,
    v_existing.expires_at,
    v_membership.expires_at,
    case when v_existing.id is null then null else v_existing.feature_keys end,
    v_membership.feature_keys,
    v_reason,
    v_admin_user_id,
    v_membership.updated_at,
    v_changed_at
  );

  insert into public.premium_membership_request_receipts (
    request_id,
    subject_user_id,
    is_noop,
    membership_id,
    stored_status,
    result_is_available,
    started_at,
    expires_at,
    feature_keys,
    membership_updated_at,
    action_id,
    action_type,
    performed_by,
    created_at
  ) values (
    p_request_id,
    v_membership.user_id,
    false,
    v_membership.id,
    v_membership.status,
    v_membership.status = 'active'
      and v_membership.started_at <= v_changed_at
      and (v_membership.expires_at is null or v_membership.expires_at > v_changed_at),
    v_membership.started_at,
    v_membership.expires_at,
    v_membership.feature_keys,
    v_membership.updated_at,
    v_action_id,
    v_action_type,
    v_admin_user_id,
    v_changed_at
  );

  return query
  select
    true,
    false,
    false,
    v_membership.id,
    v_membership.user_id,
    v_membership.status,
    v_membership.status = 'active'
      and v_membership.started_at <= pg_catalog.now()
      and (v_membership.expires_at is null or v_membership.expires_at > pg_catalog.now()),
    v_membership.started_at,
    v_membership.expires_at,
    v_membership.feature_keys,
    v_membership.updated_at,
    v_action_id,
    v_action_type;
end;
$function$;

comment on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) is 'commatch_admin_premium_memberships_v1';
alter function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) owner to postgres;
revoke all on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_admin_premium_membership(
  uuid, timestamptz, text, timestamptz, timestamptz, text[], text, uuid
) to authenticated;

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
  order by candidate_profile.id;
end
$function$;

alter function public.get_ai_match_candidates() owner to postgres;
comment on function public.get_ai_match_candidates()
  is 'commatch_priority_recommendation_membership_v1';
revoke all on function public.get_ai_match_candidates()
  from public, anon, authenticated, service_role;
grant execute on function public.get_ai_match_candidates()
  to authenticated, service_role;

-- Retain pilot data for policy review, but remove its member-facing helper as
-- an entitlement path. service_role keeps diagnostic access only.
comment on table public.premium_feature_access
  is 'commatch_priority_recommendation_legacy_pilot_v1';
comment on function public.get_priority_recommendation_candidate_ids()
  is 'commatch_priority_recommendation_legacy_pilot_v1';
revoke all on function public.get_priority_recommendation_candidate_ids()
  from public, anon, authenticated, service_role;
grant execute on function public.get_priority_recommendation_candidate_ids()
  to service_role;

do $post_migration_validation$
declare
  v_candidate_definition text;
  v_admin_definition text;
begin
  if exists (
    (select membership.user_id, membership.feature_keys
     from public.premium_memberships as membership
     except
     select snapshot.user_id, snapshot.feature_keys
     from _commatch_priority_membership_snapshot as snapshot)
    union all
    (select snapshot.user_id, snapshot.feature_keys
     from _commatch_priority_membership_snapshot as snapshot
     except
     select membership.user_id, membership.feature_keys
     from public.premium_memberships as membership)
  ) then
    raise exception 'Existing Premium membership keys changed during migration';
  end if;

  if exists (
    (select * from public.premium_feature_access
     except select * from _commatch_priority_pilot_snapshot)
    union all
    (select * from _commatch_priority_pilot_snapshot
     except select * from public.premium_feature_access)
  ) then
    raise exception 'Priority pilot data changed during migration';
  end if;

  if public.has_premium_feature('not_a_feature') then
    raise exception 'Unknown Premium feature key was unexpectedly allowed';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conname in (
      'premium_memberships_feature_keys_check',
      'premium_membership_actions_previous_feature_keys_check',
      'premium_membership_actions_new_feature_keys_check',
      'premium_membership_request_receipts_feature_keys_check'
    )
      and constraint_info.conrelid in (
        'public.premium_memberships'::pg_catalog.regclass,
        'public.premium_membership_actions'::pg_catalog.regclass,
        'public.premium_membership_request_receipts'::pg_catalog.regclass
      )
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(constraint_info.oid),
        'priority_recommendation'
      ) > 0
  ) <> 4 then
    raise exception 'A Premium feature-key constraint is missing the formal priority key';
  end if;

  v_candidate_definition := pg_catalog.pg_get_functiondef(
    'public.get_ai_match_candidates()'::pg_catalog.regprocedure
  );
  v_admin_definition := pg_catalog.pg_get_functiondef(
    'public.update_admin_premium_membership(uuid,timestamp with time zone,text,timestamp with time zone,timestamp with time zone,text[],text,uuid)'::pg_catalog.regprocedure
  );

  if pg_catalog.strpos(v_candidate_definition, 'public.premium_memberships') = 0
     or pg_catalog.strpos(v_candidate_definition, 'priority_recommendation') = 0
     or pg_catalog.strpos(v_candidate_definition, 'public.premium_feature_access') > 0
     or pg_catalog.strpos(v_admin_definition, 'priority_recommendation') = 0
     or pg_catalog.strpos(v_admin_definition, 'cardinality(p_feature_keys) > 5') = 0 then
    raise exception 'Premium priority function definitions are incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = 'public.get_ai_match_candidates()'::pg_catalog.regprocedure
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and exists (
        select 1
        from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
        where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
          and pg_catalog.replace(
            pg_catalog.substr(function_config.setting, pg_catalog.char_length('search_path=') + 1),
            '"',
            ''
          ) = ''
      )
  )
     or pg_catalog.has_function_privilege('anon', 'public.get_ai_match_candidates()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_ai_match_candidates()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', 'public.get_ai_match_candidates()', 'EXECUTE') then
    raise exception 'AI Match candidate RPC catalog or ACL contract is incompatible';
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.get_priority_recommendation_candidate_ids()',
       'EXECUTE'
     ) then
    raise exception 'Legacy pilot helper remains executable by authenticated';
  end if;
end
$post_migration_validation$;

commit;

select 'PASS priority recommendation formal Premium migration' as migration_result;
