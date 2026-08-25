-- ComMatch message moderation rollback integration tests.
--
-- Apply message-moderation.sql first. Replace the four PASTE_* UUIDs with one
-- active super administrator and three disposable, non-production ordinary Auth
-- users that already have profiles; the administrator does not need a profile.
-- Confirm the fixture guard. This script
-- changes roles, creates a match/report/message, deletes one profile, and rolls
-- every change back.

begin;

create temp table _commatch_message_moderation_it_config (
  admin_user_id uuid null,
  participant_a_id uuid null,
  participant_b_id uuid null,
  outsider_id uuid null,
  fixture_confirmation text null,
  match_id uuid not null default pg_catalog.gen_random_uuid(),
  message_id uuid null,
  report_id uuid null,
  profile_report_id uuid not null default pg_catalog.gen_random_uuid()
) on commit drop;

insert into _commatch_message_moderation_it_config (
  admin_user_id,
  participant_a_id,
  participant_b_id,
  outsider_id,
  fixture_confirmation
) values (
  nullif('PASTE_ACTIVE_SUPER_ADMIN_USER_ID', 'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID')::uuid,
  nullif('PASTE_PARTICIPANT_A_USER_ID', 'PASTE_' || 'PARTICIPANT_A_USER_ID')::uuid,
  nullif('PASTE_PARTICIPANT_B_USER_ID', 'PASTE_' || 'PARTICIPANT_B_USER_ID')::uuid,
  nullif('PASTE_OUTSIDER_USER_ID', 'PASTE_' || 'OUTSIDER_USER_ID')::uuid,
  nullif('PASTE_TEST_FIXTURE_CONFIRMATION', 'PASTE_' || 'TEST_FIXTURE_CONFIRMATION')
);

grant select, update on _commatch_message_moderation_it_config
  to authenticated, service_role;

create function pg_temp._commatch_message_moderation_set_user(p_user_id uuid)
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

create function pg_temp._commatch_message_moderation_expect_error(
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
  v_config _commatch_message_moderation_it_config%rowtype;
  v_ids uuid[];
begin
  select * into v_config from _commatch_message_moderation_it_config;
  v_ids := array[
    v_config.admin_user_id,
    v_config.participant_a_id,
    v_config.participant_b_id,
    v_config.outsider_id
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
    where id = any(array[
      v_config.participant_a_id,
      v_config.participant_b_id,
      v_config.outsider_id
    ])
  ) <> 3 then
    raise exception 'Participants and outsider must have profiles';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.admin_user_id and role = 'super_admin' and status = 'active'
  ) then
    raise exception 'Configured administrator must be an active super_admin';
  end if;
  if exists (
    select 1 from public.admin_accounts
    where user_id = any(array[v_config.participant_a_id, v_config.participant_b_id, v_config.outsider_id])
  ) then
    raise exception 'Participants and outsider must not be administrators';
  end if;
  if exists (
    select 1 from public.matches
    where user_1_id = least(v_config.participant_a_id, v_config.participant_b_id)
      and user_2_id = greatest(v_config.participant_a_id, v_config.participant_b_id)
  ) then
    raise exception 'Disposable participants must not already share a match';
  end if;
  if pg_catalog.to_regprocedure('public.get_match_messages(uuid)') is null
     or pg_catalog.to_regprocedure('public.set_admin_message_visibility(uuid,uuid,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.get_admin_message_moderation_actions(uuid)') is null then
    raise exception 'Apply message-moderation.sql before this test';
  end if;
end
$preflight$;

-- ACL contract: raw content and wildcard selection are impossible for members,
-- while safe Realtime metadata remains selectable.
do $acl_contract$
begin
  if pg_catalog.has_column_privilege('authenticated', 'public.messages', 'content', 'SELECT') then
    raise exception 'FAIL authenticated can select messages.content';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.messages', 'SELECT') then
    raise exception 'FAIL authenticated retains table-level messages SELECT';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'match_id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.messages', 'moderation_visibility', 'SELECT') then
    raise exception 'FAIL authenticated safe message metadata grants';
  end if;
  if pg_catalog.has_table_privilege('authenticated', 'public.message_moderation_actions', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.message_moderation_actions', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.message_moderation_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.message_moderation_actions', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.message_moderation_actions', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.message_moderation_actions', 'DELETE') then
    raise exception 'FAIL moderation audit append-only ACL contract';
  end if;
  raise notice 'PASS message column ACL contract';
end
$acl_contract$;

set local role postgres;
insert into public.matches (id, user_1_id, user_2_id, status)
select match_id, least(participant_a_id, participant_b_id), greatest(participant_a_id, participant_b_id), 'active'
from _commatch_message_moderation_it_config;

-- Exercise the unchanged send lifecycle rather than inserting the main message.
set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(participant_a_id)
from _commatch_message_moderation_it_config;
update _commatch_message_moderation_it_config
set message_id = public.send_match_message(match_id, 'message moderation rollback fixture');

select pg_temp._commatch_message_moderation_set_user(participant_b_id)
from _commatch_message_moderation_it_config;
update _commatch_message_moderation_it_config
set report_id = public.submit_message_report(message_id, 'harassment', 'moderation rollback fixture');

set local role postgres;
insert into public.reports (
  id,
  reporter_id,
  target_type,
  target_user_id,
  target_message_id,
  target_match_id,
  reason_code,
  reason_detail,
  target_snapshot,
  status
)
select
  profile_report_id,
  participant_b_id,
  'profile',
  participant_a_id,
  null,
  null,
  'other',
  'profile mismatch fixture',
  '{}'::jsonb,
  'pending'
from _commatch_message_moderation_it_config;

-- Direct member access checks simulate the PostgREST database role boundary.
set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(participant_a_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'authenticated direct content SELECT', '42501', null,
  'select content from public.messages limit 1'
);
select pg_temp._commatch_message_moderation_expect_error(
  'authenticated wildcard SELECT', '42501', null,
  'select * from public.messages limit 1'
);

do $safe_member_read$
declare
  v_config _commatch_message_moderation_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  perform id, match_id, moderation_visibility
  from public.messages
  where id = v_config.message_id;

  select * into v_row from public.get_match_messages(v_config.match_id)
  where id = v_config.message_id;
  if v_row.content <> 'message moderation rollback fixture'
     or v_row.moderation_visibility <> 'visible' then
    raise exception 'FAIL participant safe visible message read';
  end if;
  raise notice 'PASS safe metadata SELECT and visible member RPC';
end
$safe_member_read$;

select pg_temp._commatch_message_moderation_set_user(participant_b_id)
from _commatch_message_moderation_it_config;
do $receiver_visible_refresh$
declare
  v_config _commatch_message_moderation_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  select * into v_row from public.get_match_messages(v_config.match_id)
  where id = v_config.message_id;
  if v_row.content <> 'message moderation rollback fixture'
     or v_row.moderation_visibility <> 'visible' then
    raise exception 'FAIL receiver visible safe refresh';
  end if;
  raise notice 'PASS receiver visible safe refresh contract';
end
$receiver_visible_refresh$;

select pg_temp._commatch_message_moderation_set_user(outsider_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'non-participant safe RPC', '42501', 'Not a participant',
  format('select * from public.get_match_messages(%L)', (select match_id from _commatch_message_moderation_it_config))
);
select pg_temp._commatch_message_moderation_expect_error(
  'ordinary member administrator RPC', '42501', 'Insufficient admin permission',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden', 'unauthorized fixture'
  )
);

-- Every approved administrator role can hide and restore with reports_manage.
do $administrator_roles$
declare
  v_config _commatch_message_moderation_it_config%rowtype;
  v_role text;
  v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  foreach v_role in array array['super_admin', 'admin', 'moderator'] loop
    set local role postgres;
    update public.admin_accounts
    set role = v_role, status = 'active'
    where user_id = v_config.admin_user_id;

    set local role authenticated;
    perform pg_temp._commatch_message_moderation_set_user(v_config.admin_user_id);
    select * into v_row from public.set_admin_message_visibility(
      v_config.report_id, v_config.message_id, 'visible', 'hidden', v_role || ' hide fixture'
    );
    if v_row.previous_visibility <> 'visible' or v_row.new_visibility <> 'hidden' then
      raise exception 'FAIL % hide result', v_role;
    end if;
    select * into v_row from public.set_admin_message_visibility(
      v_config.report_id, v_config.message_id, 'hidden', 'visible', null
    );
    if v_row.previous_visibility <> 'hidden' or v_row.new_visibility <> 'visible' then
      raise exception 'FAIL % restore result', v_role;
    end if;
    raise notice 'PASS % hide/restore', v_role;
  end loop;
end
$administrator_roles$;

-- Leave the message hidden for member projection and preview assertions.
set local role postgres;
update public.admin_accounts
set role = 'super_admin', status = 'active'
where user_id = (select admin_user_id from _commatch_message_moderation_it_config);
set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(admin_user_id)
from _commatch_message_moderation_it_config;
select * from public.set_admin_message_visibility(
  (select report_id from _commatch_message_moderation_it_config),
  (select message_id from _commatch_message_moderation_it_config),
  'visible',
  'hidden',
  'final hidden fixture'
);

do $hidden_projection$
declare
  v_config _commatch_message_moderation_it_config%rowtype;
  v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  set local role authenticated;
  perform pg_temp._commatch_message_moderation_set_user(v_config.participant_b_id);

  select * into v_row from public.get_match_messages(v_config.match_id)
  where id = v_config.message_id;
  if v_row.content <> '관리자에 의해 비노출된 메시지입니다.'
     or v_row.moderation_visibility <> 'hidden' then
    raise exception 'FAIL hidden safe RPC placeholder';
  end if;

  select * into v_row from public.get_my_matches()
  where match_id = v_config.match_id;
  if v_row.latest_message_content <> '관리자에 의해 비노출된 메시지입니다.'
     or v_row.unread_count < 1 then
    raise exception 'FAIL hidden match preview or unread preservation';
  end if;

  perform public.mark_match_read(v_config.match_id);
  select * into v_row from public.get_match_messages(v_config.match_id)
  where id = v_config.message_id;
  if v_row.read_at is null then
    raise exception 'FAIL hidden message read receipt';
  end if;
  raise notice 'PASS hidden placeholder, preview, unread, and read receipt';
end
$hidden_projection$;

-- Validation, stale, duplicate, mismatch, and atomic audit behavior.
select pg_temp._commatch_message_moderation_set_user(admin_user_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'stale visibility', 'P0001', 'MESSAGE_VISIBILITY_STALE',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden', 'stale fixture'
  )
);
select pg_temp._commatch_message_moderation_expect_error(
  'unchanged visibility', 'P0001', 'MESSAGE_VISIBILITY_UNCHANGED',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'hidden', 'hidden', 'duplicate fixture'
  )
);
select pg_temp._commatch_message_moderation_expect_error(
  'profile report mismatch', '22023', 'Report and message do not match',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select profile_report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'hidden', 'visible', null
  )
);
select pg_temp._commatch_message_moderation_expect_error(
  'report/message UUID mismatch', '22023', 'Report and message do not match',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    pg_catalog.gen_random_uuid(),
    'hidden', 'visible', null
  )
);

-- Restore once, then validate missing/blank/oversized hide reasons without
-- changing either the message state or audit count.
select * from public.set_admin_message_visibility(
  (select report_id from _commatch_message_moderation_it_config),
  (select message_id from _commatch_message_moderation_it_config),
  'hidden', 'visible', null
);

set local role postgres;
create temp table _commatch_message_moderation_before_failure
on commit drop
as
select
  (select pg_catalog.count(*) from public.message_moderation_actions) as action_count;

set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(admin_user_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'missing hide reason', '22023', 'hide reason',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,null)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden'
  )
);
select pg_temp._commatch_message_moderation_expect_error(
  'blank hide reason', '22023', 'hide reason',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden', '   '
  )
);
select pg_temp._commatch_message_moderation_expect_error(
  'oversized hide reason', '22023', '500 characters',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden', repeat('가', 501)
  )
);

set local role postgres;
do $failure_atomicity$
declare
  v_config _commatch_message_moderation_it_config%rowtype;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  if (select moderation_visibility from public.messages where id = v_config.message_id) <> 'visible'
     or (select pg_catalog.count(*) from public.message_moderation_actions)
        <> (select action_count from _commatch_message_moderation_before_failure) then
    raise exception 'FAIL rejected moderation changed state or audit history';
  end if;
  raise notice 'PASS rejected moderation is atomic';
end
$failure_atomicity$;

-- Inactive administrators are rejected even when the account row remains.
set local role postgres;
update public.admin_accounts
set status = 'suspended',
    suspended_at = pg_catalog.now(),
    revoked_at = null
where user_id = (select admin_user_id from _commatch_message_moderation_it_config);
set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(admin_user_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'inactive administrator', '42501', 'Insufficient admin permission',
  format(
    'select * from public.set_admin_message_visibility(%L,%L,%L,%L,%L)',
    (select report_id from _commatch_message_moderation_it_config),
    (select message_id from _commatch_message_moderation_it_config),
    'visible', 'hidden', 'inactive fixture'
  )
);

-- Restore the administrator, hide once more, and verify live admin content.
set local role postgres;
update public.admin_accounts
set role = 'super_admin',
    status = 'active',
    suspended_at = null,
    revoked_at = null
where user_id = (select admin_user_id from _commatch_message_moderation_it_config);
set local role authenticated;
select pg_temp._commatch_message_moderation_set_user(admin_user_id)
from _commatch_message_moderation_it_config;
select * from public.set_admin_message_visibility(
  (select report_id from _commatch_message_moderation_it_config),
  (select message_id from _commatch_message_moderation_it_config),
  'visible', 'hidden', 'account deletion fixture'
);

do $admin_live_detail$
declare v_config _commatch_message_moderation_it_config%rowtype; v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  select * into v_row from public.get_admin_report_detail(v_config.report_id);
  if v_row.message_content <> 'message moderation rollback fixture'
     or v_row.message_source <> 'live'
     or v_row.message_moderation_visibility <> 'hidden' then
    raise exception 'FAIL administrator live hidden original detail';
  end if;
  raise notice 'PASS administrator live hidden original detail';
end
$admin_live_detail$;

-- Exercise the unchanged match-end lifecycle after all active-match assertions.
select pg_temp._commatch_message_moderation_set_user(participant_b_id)
from _commatch_message_moderation_it_config;
select public.end_match(match_id)
from _commatch_message_moderation_it_config;
do $match_end_regression$
declare v_config _commatch_message_moderation_it_config%rowtype;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  if not exists (
    select 1 from public.matches
    where id = v_config.match_id and status = 'ended' and ended_at is not null
  ) then
    raise exception 'FAIL unchanged match end lifecycle';
  end if;
  raise notice 'PASS unchanged match end lifecycle';
end
$match_end_regression$;

-- Existing deletion cascade must not be blocked; audit message UUID and report
-- snapshot survive, and administrator detail falls back to typed snapshot data.
set local role postgres;
delete from public.profiles
where id = (select participant_a_id from _commatch_message_moderation_it_config);

do $deletion_and_snapshot$
declare v_config _commatch_message_moderation_it_config%rowtype; v_row record;
begin
  select * into v_config from _commatch_message_moderation_it_config;
  if exists (select 1 from public.messages where id = v_config.message_id)
     or not exists (
       select 1 from public.message_moderation_actions where message_id = v_config.message_id
     )
     or not exists (
       select 1 from public.reports
       where id = v_config.report_id
         and target_snapshot ->> 'content' = 'message moderation rollback fixture'
     ) then
    raise exception 'FAIL deletion cascade, audit UUID, or report snapshot preservation';
  end if;

  set local role authenticated;
  perform pg_temp._commatch_message_moderation_set_user(v_config.admin_user_id);
  select * into v_row from public.get_admin_report_detail(v_config.report_id);
  if v_row.message_content <> 'message moderation rollback fixture'
     or v_row.message_source <> 'snapshot'
     or v_row.message_exists
     or v_row.message_moderation_visibility is not null then
    raise exception 'FAIL typed administrator snapshot fallback';
  end if;
  raise notice 'PASS account deletion cascade, audit preservation, and snapshot fallback';
end
$deletion_and_snapshot$;

-- Member report history must not expose raw snapshot/content fields, and raw
-- reports rows remain unavailable to authenticated clients.
select pg_temp._commatch_message_moderation_set_user(participant_b_id)
from _commatch_message_moderation_it_config;
select pg_temp._commatch_message_moderation_expect_error(
  'member raw report snapshot SELECT', '42501', null,
  'select target_snapshot from public.reports limit 1'
);

do $function_contracts$
declare
  v_function record;
begin
  for v_function in
    select
      procedure_info.oid,
      procedure_info.proname,
      procedure_info.prosecdef,
      procedure_info.proconfig,
      pg_catalog.pg_get_userbyid(procedure_info.proowner) as owner_name
    from pg_catalog.pg_proc as procedure_info
    join pg_catalog.pg_namespace as namespace_info on namespace_info.oid = procedure_info.pronamespace
    where namespace_info.nspname = 'public'
      and procedure_info.proname in (
        'get_match_messages',
        'set_admin_message_visibility',
        'get_admin_message_moderation_actions',
        'get_admin_report_detail'
      )
  loop
    if v_function.owner_name <> 'postgres'
       or not v_function.prosecdef
       or not ('search_path=""' = any(v_function.proconfig))
       or pg_catalog.has_function_privilege('public', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_function.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('service_role', v_function.oid, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', v_function.oid, 'EXECUTE') then
      raise exception 'FAIL % owner/security/search_path/ACL', v_function.proname;
    end if;
  end loop;

  if pg_catalog.pg_get_function_result('public.get_my_reports()'::pg_catalog.regprocedure)
     ~* '(content|snapshot)' then
    raise exception 'FAIL member report history exposes content or snapshot';
  end if;
  if pg_catalog.obj_description('public.send_match_message(uuid,text)'::pg_catalog.regprocedure, 'pg_proc')
     is distinct from 'commatch_matching_chat_v1' then
    raise exception 'FAIL send_match_message contract marker changed';
  end if;
  raise notice 'PASS security-definer ACL, member report projection, and unchanged send marker';
end
$function_contracts$;

select 'PASS all message moderation rollback integration tests' as test_result;
rollback;
