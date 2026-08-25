-- ComMatch administrator member deletion rollback integration tests.
--
-- Apply admin-member-deletions.sql first. Replace the four PASTE_* UUIDs with
-- one active super administrator and three disposable, non-production ordinary
-- Auth users that have profiles. Every mutation is rolled back.

begin;

create temp table _commatch_admin_member_deletion_it_config (
  admin_user_id uuid null,
  target_user_id uuid null,
  role_test_user_id uuid null,
  other_user_id uuid null,
  fixture_confirmation text null,
  match_id uuid not null default pg_catalog.gen_random_uuid(),
  message_id uuid not null default pg_catalog.gen_random_uuid(),
  notification_id uuid not null default pg_catalog.gen_random_uuid(),
  push_subscription_id uuid not null default pg_catalog.gen_random_uuid(),
  push_event_id uuid not null default pg_catalog.gen_random_uuid(),
  push_delivery_id uuid not null default pg_catalog.gen_random_uuid(),
  support_inquiry_id uuid not null default pg_catalog.gen_random_uuid(),
  support_action_id uuid not null default pg_catalog.gen_random_uuid(),
  report_id uuid not null default pg_catalog.gen_random_uuid(),
  mismatched_report_id uuid not null default pg_catalog.gen_random_uuid(),
  report_action_id uuid not null default pg_catalog.gen_random_uuid(),
  moderation_action_id uuid not null default pg_catalog.gen_random_uuid(),
  restriction_action_id uuid not null default pg_catalog.gen_random_uuid(),
  premium_action_id uuid not null default pg_catalog.gen_random_uuid(),
  consent_event_id uuid not null default pg_catalog.gen_random_uuid(),
  failed_request_id uuid not null default pg_catalog.gen_random_uuid(),
  completed_request_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_admin_member_deletion_it_config (
  admin_user_id,
  target_user_id,
  role_test_user_id,
  other_user_id,
  fixture_confirmation
) values (
  nullif('PASTE_ACTIVE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_TARGET_USER_ID', 'PASTE_' || 'DISPOSABLE_TARGET_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_ROLE_TEST_USER_ID', 'PASTE_' || 'DISPOSABLE_ROLE_TEST_USER_ID')::uuid,
  nullif('PASTE_DISPOSABLE_OTHER_USER_ID', 'PASTE_' || 'DISPOSABLE_OTHER_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select on _commatch_admin_member_deletion_it_config
  to anon, authenticated, service_role;
grant update on _commatch_admin_member_deletion_it_config
  to authenticated, service_role;

create function pg_temp._commatch_admin_member_deletion_set_user(p_user_id uuid)
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end
$function$;

create function pg_temp._commatch_admin_member_deletion_expect_error(
  p_label text,
  p_state text,
  p_message_fragment text,
  p_sql text
)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL % unexpectedly succeeded', p_label;
  exception
    when others then
      if sqlstate is distinct from p_state
         or (p_message_fragment is not null and position(p_message_fragment in sqlerrm) = 0) then
        raise exception 'FAIL % expected % / %, received % / %',
          p_label, p_state, p_message_fragment, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS % (% / %)', p_label, sqlstate, sqlerrm;
  end;
end
$function$;

do $preflight$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  v_ids := array[
    v_config.admin_user_id,
    v_config.target_user_id,
    v_config.role_test_user_id,
    v_config.other_user_id
  ];

  if pg_catalog.array_position(v_ids, null) is not null then
    raise exception 'Replace every PASTE_* Auth UUID';
  end if;
  if v_config.fixture_confirmation <> 'CONFIRMED_DISPOSABLE_NON_PRODUCTION_USERS' then
    raise exception 'Replace the fixture confirmation placeholder';
  end if;
  if (select pg_catalog.count(distinct id) from pg_catalog.unnest(v_ids) as ids(id)) <> 4
     or (select pg_catalog.count(*) from auth.users where id = any(v_ids)) <> 4 then
    raise exception 'All configured Auth users must exist and be distinct';
  end if;
  if (
    select pg_catalog.count(*)
    from public.profiles
    where id = any(array[v_config.target_user_id, v_config.role_test_user_id, v_config.other_user_id])
  ) <> 3 then
    raise exception 'Disposable ordinary users must have profiles';
  end if;
  if not exists (
    select 1
    from public.admin_accounts
    where user_id = v_config.admin_user_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'Configured administrator must be an active super_admin';
  end if;
  if exists (
    select 1
    from public.admin_accounts
    where user_id = any(array[v_config.target_user_id, v_config.role_test_user_id, v_config.other_user_id])
  ) then
    raise exception 'Disposable ordinary users must not be administrators';
  end if;
  if exists (
    select 1
    from public.matches
    where user_1_id = least(v_config.target_user_id, v_config.other_user_id)
      and user_2_id = greatest(v_config.target_user_id, v_config.other_user_id)
  ) then
    raise exception 'Disposable target and other user must not already share a match';
  end if;
  if exists (
    select 1
    from public.admin_member_deletion_actions
    where target_user_id = v_config.target_user_id
      and status = 'requested'
  ) then
    raise exception 'Disposable target already has an in-progress deletion request';
  end if;
  if pg_catalog.to_regprocedure(
       'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.set_admin_member_deletion_result(uuid,text,text)'
     ) is null then
    raise exception 'Apply admin-member-deletions.sql before this test';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_constraint as constraint_info
    where constraint_info.conrelid = 'public.user_consent_events'::pg_catalog.regclass
      and constraint_info.contype = 'f'
  ) then
    raise exception 'Apply the approved consent subject-retention migration before this test';
  end if;
end
$preflight$;

do $schema_and_acl$
declare
  v_request_oid oid := pg_catalog.to_regprocedure(
    'public.request_admin_member_deletion(uuid,uuid,text,uuid)'
  );
  v_result_oid oid := pg_catalog.to_regprocedure(
    'public.set_admin_member_deletion_result(uuid,text,text)'
  );
begin
  if pg_catalog.obj_description(
       'public.admin_member_deletion_actions'::pg_catalog.regclass,
       'pg_class'
     ) <> 'commatch_admin_member_deletions_v1'
     or not (
       select relation_info.relrowsecurity
       from pg_catalog.pg_class as relation_info
       where relation_info.oid = 'public.admin_member_deletion_actions'::pg_catalog.regclass
     ) then
    raise exception 'FAIL deletion audit marker or RLS contract';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.admin_member_deletion_actions', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.admin_member_deletion_actions', 'DELETE') then
    raise exception 'FAIL deletion audit direct table ACL contract';
  end if;

  if pg_catalog.has_function_privilege('public', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_request_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_request_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('public', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_result_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_result_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_result_oid, 'EXECUTE') then
    raise exception 'FAIL deletion RPC ACL contract';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    where function_info.oid in (v_request_oid, v_result_oid)
      and owner_role.rolname = 'postgres'
      and function_info.prosecdef
      and 'search_path=""' = any(function_info.proconfig)
    group by owner_role.rolname
    having pg_catalog.count(*) = 2
  ) then
    raise exception 'FAIL deletion RPC owner/security/search_path contract';
  end if;
  raise notice 'PASS schema, RLS, table ACL, and RPC ACL contracts';
end
$schema_and_acl$;

set local role anon;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'anon request',
  '42501',
  null,
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'anon request'
  )
);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(target_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'ordinary authenticated request',
  '42501',
  'Active super administrator',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select other_user_id from _commatch_admin_member_deletion_it_config),
    'ordinary request'
  )
);

set local role postgres;
insert into public.admin_accounts (
  user_id, role, status, created_by, suspended_at, revoked_at
)
select role_test_user_id, 'admin', 'active', admin_user_id, null, null
from _commatch_admin_member_deletion_it_config;

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(role_test_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'admin role request', '42501', 'Active super administrator',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'admin role request'
  )
);

set local role postgres;
update public.admin_accounts
set role = 'moderator', status = 'active', suspended_at = null, revoked_at = null
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(role_test_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'moderator role request', '42501', 'Active super administrator',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'moderator role request'
  )
);

set local role postgres;
update public.admin_accounts
set role = 'super_admin', status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(role_test_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'suspended super_admin request', '42501', 'Active super administrator',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'suspended request'
  )
);

set local role postgres;
update public.admin_accounts
set status = 'revoked', suspended_at = null, revoked_at = pg_catalog.now()
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(role_test_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'revoked super_admin request', '42501', 'Active super administrator',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'revoked request'
  )
);

set local role postgres;
update public.admin_accounts
set role = 'admin', status = 'active', suspended_at = null, revoked_at = null
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'active administrator target', '42501', 'Administrator accounts',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select role_test_user_id from _commatch_admin_member_deletion_it_config),
    'active administrator target'
  )
);

set local role postgres;
update public.admin_accounts
set status = 'suspended', suspended_at = pg_catalog.now(), revoked_at = null
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'suspended administrator target', '42501', 'Administrator accounts',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select role_test_user_id from _commatch_admin_member_deletion_it_config),
    'suspended administrator target'
  )
);

set local role postgres;
update public.admin_accounts
set status = 'revoked', suspended_at = null, revoked_at = pg_catalog.now()
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'revoked administrator target', '42501', 'Administrator accounts',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select role_test_user_id from _commatch_admin_member_deletion_it_config),
    'revoked administrator target'
  )
);

select pg_temp._commatch_admin_member_deletion_expect_error(
  'self target', '42501', 'themselves',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select admin_user_id from _commatch_admin_member_deletion_it_config),
    'self target'
  )
);
select pg_temp._commatch_admin_member_deletion_expect_error(
  'missing target', 'P0002', 'Target user not found',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(), pg_catalog.gen_random_uuid(), 'missing target'
  )
);
select pg_temp._commatch_admin_member_deletion_expect_error(
  'empty reason', '22023', 'reason',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    ''
  )
);
select pg_temp._commatch_admin_member_deletion_expect_error(
  'whitespace reason', '22023', 'reason',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    '   '
  )
);
select pg_temp._commatch_admin_member_deletion_expect_error(
  'oversized reason', '22023', 'reason',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,null)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    pg_catalog.repeat('x', 501)
  )
);

set local role postgres;
delete from public.admin_accounts
where user_id = (select role_test_user_id from _commatch_admin_member_deletion_it_config);

insert into public.matches (id, user_1_id, user_2_id, status)
select
  match_id,
  least(target_user_id, other_user_id),
  greatest(target_user_id, other_user_id),
  'active'
from _commatch_admin_member_deletion_it_config;

insert into public.messages (
  id, match_id, sender_id, content, message_type, moderation_visibility
)
select message_id, match_id, target_user_id, 'admin deletion evidence fixture', 'text', 'hidden'
from _commatch_admin_member_deletion_it_config;

insert into public.reports (
  id, reporter_id, target_type, target_user_id, target_message_id,
  target_match_id, reason_code, reason_detail, target_snapshot, status
)
select
  report_id,
  other_user_id,
  'message',
  target_user_id,
  message_id,
  match_id,
  'harassment',
  'admin deletion linked report',
  pg_catalog.jsonb_build_object(
    'content', 'admin deletion evidence fixture',
    'created_at', pg_catalog.now(),
    'sender_id', target_user_id,
    'match_id', match_id
  ),
  'reviewing'
from _commatch_admin_member_deletion_it_config;

insert into public.reports (
  id, reporter_id, target_type, target_user_id, target_message_id,
  target_match_id, reason_code, reason_detail, target_snapshot, status
)
select
  mismatched_report_id,
  pg_catalog.gen_random_uuid(),
  'profile',
  other_user_id,
  null,
  null,
  'spam',
  'mismatched report fixture',
  '{}'::jsonb,
  'pending'
from _commatch_admin_member_deletion_it_config;

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'mismatched related report', '22023', 'Related report',
  pg_catalog.format(
    'select * from public.request_admin_member_deletion(%L,%L,%L,%L)',
    pg_catalog.gen_random_uuid(),
    (select target_user_id from _commatch_admin_member_deletion_it_config),
    'mismatched report',
    (select mismatched_report_id from _commatch_admin_member_deletion_it_config)
  )
);

do $failed_lifecycle$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  select * into v_row
  from public.request_admin_member_deletion(
    v_config.failed_request_id,
    v_config.target_user_id,
    'failure lifecycle fixture',
    null
  );
  if v_row.status <> 'requested' or v_row.is_duplicate then
    raise exception 'FAIL requested lifecycle was not recorded before deletion';
  end if;

  select * into v_row
  from public.request_admin_member_deletion(
    v_config.failed_request_id,
    v_config.target_user_id,
    'failure lifecycle fixture',
    null
  );
  if v_row.status <> 'requested' or not v_row.is_duplicate then
    raise exception 'FAIL request-id idempotency contract';
  end if;

  select * into v_row
  from public.set_admin_member_deletion_result(v_config.failed_request_id, 'failed', 'storage');
  if v_row.status <> 'failed' or v_row.failure_stage <> 'storage' then
    raise exception 'FAIL failed lifecycle or failure stage';
  end if;
  raise notice 'PASS requested, duplicate, and failed lifecycle';
end
$failed_lifecycle$;

do $additional_failure_stage_contracts$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
  v_request_id uuid;
  v_stage text;
  v_row record;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  foreach v_stage in array array['database', 'auth']::text[] loop
    v_request_id := pg_catalog.gen_random_uuid();
    perform public.request_admin_member_deletion(
      v_request_id,
      v_config.target_user_id,
      v_stage || ' failure-stage fixture',
      null
    );
    select * into v_row
    from public.set_admin_member_deletion_result(v_request_id, 'failed', v_stage);
    if v_row.status <> 'failed' or v_row.failure_stage <> v_stage then
      raise exception 'FAIL % failure-stage audit contract', v_stage;
    end if;
  end loop;
  raise notice 'PASS database and Auth failure-stage audit contracts';
end
$additional_failure_stage_contracts$;

do $linked_request$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  select * into v_row
  from public.request_admin_member_deletion(
    v_config.completed_request_id,
    v_config.target_user_id,
    'confirmed force deletion reason',
    v_config.report_id
  );
  if v_row.status <> 'requested' or v_row.is_duplicate then
    raise exception 'FAIL linked requested lifecycle';
  end if;
end
$linked_request$;

select pg_temp._commatch_admin_member_deletion_expect_error(
  'authenticated direct audit select', '42501', null,
  'select 1 from public.admin_member_deletion_actions'
);

set local role postgres;
do $linked_request_audit$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  if not exists (
    select 1
    from public.admin_member_deletion_actions as action_row
    where action_row.request_id = v_config.completed_request_id
      and action_row.target_user_id = v_config.target_user_id
      and action_row.admin_user_id = v_config.admin_user_id
      and action_row.admin_role = 'super_admin'
      and action_row.reason = 'confirmed force deletion reason'
      and action_row.related_report_id = v_config.report_id
      and action_row.status = 'requested'
  ) then
    raise exception 'FAIL requested audit payload';
  end if;
  raise notice 'PASS active super_admin request with matching report';
end
$linked_request_audit$;

insert into public.member_restrictions (
  user_id, account_status, profile_visibility, created_by, updated_by
)
select fixture_user.user_id, 'active', 'visible', config.admin_user_id, config.admin_user_id
from _commatch_admin_member_deletion_it_config as config
cross join lateral pg_catalog.unnest(
  array[config.target_user_id, config.other_user_id]
) as fixture_user(user_id)
on conflict (user_id) do update
set account_status = 'active',
    profile_visibility = 'visible',
    suspended_at = null,
    suspended_until = null,
    reason = null,
    admin_note = null,
    updated_by = excluded.updated_by;

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(target_user_id)
from _commatch_admin_member_deletion_it_config;
insert into public.favorites (user_id, favorite_user_id)
select target_user_id, other_user_id from _commatch_admin_member_deletion_it_config
on conflict do nothing;

set local role postgres;
insert into public.likes (user_id, liked_user_id)
select target_user_id, other_user_id from _commatch_admin_member_deletion_it_config
on conflict do nothing;

insert into public.notifications (id, recipient_user_id, type, match_id)
select notification_id, target_user_id, 'new_message', match_id
from _commatch_admin_member_deletion_it_config;

insert into public.push_subscriptions (
  id, user_id, endpoint, p256dh, auth, new_message_enabled
)
select
  push_subscription_id,
  target_user_id,
  'https://push.example.invalid/' || push_subscription_id,
  pg_catalog.repeat('A', 80),
  pg_catalog.repeat('B', 16),
  true
from _commatch_admin_member_deletion_it_config;

insert into public.push_events (
  id, recipient_user_id, notification_id, event_type, source_id
)
select push_event_id, target_user_id, notification_id, 'new_message', message_id
from _commatch_admin_member_deletion_it_config;

insert into public.push_deliveries (
  id, push_event_id, push_subscription_id, subscription_updated_at
)
select push_delivery_id, push_event_id, push_subscription_id, pg_catalog.now()
from _commatch_admin_member_deletion_it_config;

insert into public.member_restriction_actions (
  id, user_id, subject_user_id, admin_user_id, report_id, action_type,
  previous_account_status, new_account_status,
  previous_profile_visibility, new_profile_visibility, reason
)
select
  restriction_action_id, target_user_id, target_user_id, admin_user_id, report_id,
  'account_suspended', 'active', 'suspended', 'visible', 'visible', 'fixture restriction'
from _commatch_admin_member_deletion_it_config;

insert into public.premium_memberships (
  user_id, status, started_at, expires_at, feature_keys,
  granted_by, granted_reason, status_changed_by, status_reason
)
select
  target_user_id, 'active', pg_catalog.now(), null,
  array['likes_received']::text[], admin_user_id, 'fixture premium', admin_user_id, 'fixture premium'
from _commatch_admin_member_deletion_it_config
on conflict (user_id) do update
set status = 'active',
    started_at = excluded.started_at,
    expires_at = null,
    feature_keys = excluded.feature_keys,
    granted_by = excluded.granted_by,
    granted_reason = excluded.granted_reason,
    status_changed_by = excluded.status_changed_by,
    status_reason = excluded.status_reason,
    updated_at = pg_catalog.now();

insert into public.premium_membership_actions (
  id, request_id, membership_id, subject_user_id, action_type,
  previous_status, new_status, previous_started_at, new_started_at,
  previous_expires_at, new_expires_at, previous_feature_keys, new_feature_keys,
  reason, performed_by, membership_updated_at
)
select
  config.premium_action_id,
  pg_catalog.gen_random_uuid(),
  membership.id,
  config.target_user_id,
  'updated',
  'active',
  'active',
  membership.started_at,
  membership.started_at,
  null,
  null,
  array['likes_received']::text[],
  array['likes_received']::text[],
  'fixture premium action',
  config.admin_user_id,
  membership.updated_at
from _commatch_admin_member_deletion_it_config as config
join public.premium_memberships as membership on membership.user_id = config.target_user_id;

insert into public.report_admin_actions (
  id, report_id, admin_user_id, previous_status, new_status, note
)
select report_action_id, report_id, admin_user_id, 'pending', 'reviewing', 'fixture report action'
from _commatch_admin_member_deletion_it_config;

insert into public.message_moderation_actions (
  id, message_id, report_id, admin_user_id, admin_role, action, reason,
  previous_visibility, new_visibility
)
select
  moderation_action_id, message_id, report_id, admin_user_id, 'super_admin',
  'hide', 'fixture moderation', 'visible', 'hidden'
from _commatch_admin_member_deletion_it_config;

insert into public.support_inquiries (
  id, user_id, category, subject, body, status, answer_body,
  answered_by_admin_user_id, answered_at, answer_updated_at
)
select
  support_inquiry_id, target_user_id, 'account', 'fixture inquiry', 'fixture inquiry body',
  'answered', 'fixture answer', admin_user_id, pg_catalog.now(), pg_catalog.now()
from _commatch_admin_member_deletion_it_config;

insert into public.support_inquiry_admin_actions (
  id, inquiry_id, admin_user_id, action, previous_status, new_status
)
select support_action_id, support_inquiry_id, admin_user_id, 'answer', 'pending', 'answered'
from _commatch_admin_member_deletion_it_config;

insert into public.user_consent_events (
  id, user_id, consent_type, action, document_version, source, request_id
)
select
  consent_event_id, target_user_id, 'privacy', 'accepted',
  'admin-deletion-test-v1', 'settings', pg_catalog.gen_random_uuid()
from _commatch_admin_member_deletion_it_config;

-- Mirror the approved synchronous service's database phase. Storage and the
-- Auth Admin API itself are covered outside SQL; this transaction uses the
-- equivalent Auth row deletion only to verify current FK lifecycle behavior.
delete from public.favorites
where user_id = (select target_user_id from _commatch_admin_member_deletion_it_config)
   or favorite_user_id = (select target_user_id from _commatch_admin_member_deletion_it_config);
delete from public.preferences
where user_id = (select target_user_id from _commatch_admin_member_deletion_it_config);
delete from public.profiles
where id = (select target_user_id from _commatch_admin_member_deletion_it_config);

do $profile_cascade$
declare v_config _commatch_admin_member_deletion_it_config%rowtype;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  if exists (select 1 from public.profiles where id = v_config.target_user_id)
     or exists (select 1 from public.preferences where user_id = v_config.target_user_id)
     or exists (select 1 from public.favorites where user_id = v_config.target_user_id or favorite_user_id = v_config.target_user_id)
     or exists (select 1 from public.likes where user_id = v_config.target_user_id or liked_user_id = v_config.target_user_id)
     or exists (select 1 from public.matches where id = v_config.match_id)
     or exists (select 1 from public.messages where id = v_config.message_id)
     or exists (select 1 from public.notifications where id = v_config.notification_id)
     or exists (select 1 from public.push_subscriptions where id = v_config.push_subscription_id)
     or exists (select 1 from public.push_events where id = v_config.push_event_id)
     or exists (select 1 from public.push_deliveries where id = v_config.push_delivery_id) then
    raise exception 'FAIL profile deletion did not preserve the approved profile-linked cascade';
  end if;
  if not exists (select 1 from public.premium_memberships where user_id = v_config.target_user_id)
     or not exists (select 1 from public.member_restrictions where user_id = v_config.target_user_id) then
    raise exception 'FAIL profile deletion removed Auth-linked state before Auth deletion';
  end if;
  raise notice 'PASS profile, preference, favorite, like, match, message, notification, and push lifecycle';
end
$profile_cascade$;

delete from auth.users
where id = (select target_user_id from _commatch_admin_member_deletion_it_config);

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;

do $complete_and_preserve$
declare
  v_config _commatch_admin_member_deletion_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  select * into v_row
  from public.set_admin_member_deletion_result(v_config.completed_request_id, 'completed', null);
  if v_row.status <> 'completed' or v_row.failure_stage is not null then
    raise exception 'FAIL completed lifecycle';
  end if;

  set local role postgres;
  if exists (select 1 from auth.users where id = v_config.target_user_id)
     or exists (select 1 from public.accounts where user_id = v_config.target_user_id)
     or exists (select 1 from public.premium_memberships where user_id = v_config.target_user_id)
     or exists (select 1 from public.member_restrictions where user_id = v_config.target_user_id)
     or exists (select 1 from public.support_inquiries where id = v_config.support_inquiry_id)
     or exists (select 1 from public.support_inquiry_admin_actions where id = v_config.support_action_id) then
    raise exception 'FAIL Auth-linked current state or support lifecycle';
  end if;
  if not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.completed_request_id
         and target_user_id = v_config.target_user_id
         and admin_user_id = v_config.admin_user_id
         and admin_role = 'super_admin'
         and reason = 'confirmed force deletion reason'
         and related_report_id = v_config.report_id
         and status = 'completed'
         and failure_stage is null
         and completed_at is not null
     )
     or not exists (select 1 from public.reports where id = v_config.report_id)
     or not exists (select 1 from public.report_admin_actions where id = v_config.report_action_id)
     or not exists (select 1 from public.message_moderation_actions where id = v_config.moderation_action_id and message_id = v_config.message_id)
     or not exists (select 1 from public.member_restriction_actions where id = v_config.restriction_action_id and subject_user_id = v_config.target_user_id and user_id is null)
     or not exists (select 1 from public.premium_membership_actions where id = v_config.premium_action_id and subject_user_id = v_config.target_user_id and membership_id is null)
     or not exists (select 1 from public.user_consent_events where id = v_config.consent_event_id and user_id = v_config.target_user_id) then
    raise exception 'FAIL deletion audit, report, moderation, restriction, Premium, or consent preservation';
  end if;
  raise notice 'PASS Auth cascade and durable audit/report/legal preservation';
end
$complete_and_preserve$;

set local role authenticated;
select pg_temp._commatch_admin_member_deletion_set_user(admin_user_id)
from _commatch_admin_member_deletion_it_config;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'authenticated direct audit update', '42501', null,
  'update public.admin_member_deletion_actions set reason = ''tampered'''
);
select pg_temp._commatch_admin_member_deletion_expect_error(
  'authenticated direct audit delete', '42501', null,
  'delete from public.admin_member_deletion_actions'
);

set local role service_role;
select pg_temp._commatch_admin_member_deletion_expect_error(
  'service role direct audit update', '42501', null,
  'update public.admin_member_deletion_actions set reason = ''tampered'''
);

set local role postgres;
do $final_assertion$
declare v_config _commatch_admin_member_deletion_it_config%rowtype;
begin
  select * into v_config from _commatch_admin_member_deletion_it_config;
  if not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.failed_request_id
         and status = 'failed'
         and failure_stage = 'storage'
     )
     or not exists (
       select 1
       from public.admin_member_deletion_actions
       where request_id = v_config.completed_request_id
         and status = 'completed'
         and completed_at is not null
     ) then
    raise exception 'FAIL final requested/completed/failed audit counts';
  end if;
  raise notice 'PASS all administrator member deletion rollback integration tests';
end
$final_assertion$;

rollback;
