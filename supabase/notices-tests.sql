-- ComMatch public notices integration test (rollback-safe).
--
-- Run in the Supabase SQL Editor after supabase/notices.sql.
-- Replace PASTE_ACTIVE_SUPER_ADMIN_USER_ID with an existing active
-- super_admin Auth user UUID. All disposable fixtures are rolled back.

begin;

create temp table _commatch_notices_it_config (
  super_admin_id uuid,
  instance_id uuid,
  admin_id uuid default extensions.gen_random_uuid(),
  moderator_id uuid default extensions.gen_random_uuid(),
  suspended_admin_id uuid default extensions.gen_random_uuid(),
  revoked_admin_id uuid default extensions.gen_random_uuid(),
  member_id uuid default extensions.gen_random_uuid(),
  draft_notice_id uuid,
  published_notice_id uuid,
  archived_notice_id uuid
) on commit drop;

insert into _commatch_notices_it_config (super_admin_id, instance_id)
select
  nullif(
    'PASTE_ACTIVE_SUPER_ADMIN_USER_ID',
    'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID'
  )::uuid,
  auth_user.instance_id
from auth.users as auth_user
where auth_user.id = nullif(
  'PASTE_ACTIVE_SUPER_ADMIN_USER_ID',
  'PASTE_' || 'ACTIVE_SUPER_ADMIN_USER_ID'
)::uuid;

do $preflight$
declare
  v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if v_config.super_admin_id is null or v_config.instance_id is null then
    raise exception 'Replace PASTE_ACTIVE_SUPER_ADMIN_USER_ID with an existing Auth user UUID';
  end if;
  if not exists (
    select 1 from public.admin_accounts
    where user_id = v_config.super_admin_id
      and role = 'super_admin'
      and status = 'active'
  ) then
    raise exception 'The fixture user must be an active super_admin';
  end if;
end
$preflight$;

grant select, update on _commatch_notices_it_config to anon, authenticated;

create function pg_temp._commatch_notices_set_user(p_user_id uuid, p_role text default 'authenticated')
returns void
language plpgsql
as $function$
begin
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
      else pg_catalog.jsonb_build_object('sub', p_user_id::text, 'role', p_role)::text end,
    true
  );
end
$function$;

create function pg_temp._commatch_notices_expect_42501(p_label text, p_sql text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
    raise exception 'FAIL %: operation unexpectedly succeeded', p_label;
  exception
    when sqlstate '42501' then null;
  end;
end
$function$;

grant execute on function pg_temp._commatch_notices_set_user(uuid, text) to anon, authenticated;
grant execute on function pg_temp._commatch_notices_expect_42501(text, text) to anon, authenticated;

do $fixtures$
declare
  v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;

  insert into auth.users (
    id, instance_id, aud, role, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select fixture.user_id, v_config.instance_id, 'authenticated', 'authenticated', null,
         '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  from (values
    (v_config.admin_id),
    (v_config.moderator_id),
    (v_config.suspended_admin_id),
    (v_config.revoked_admin_id),
    (v_config.member_id)
  ) as fixture(user_id);

  insert into public.admin_accounts (
    user_id,
    role,
    status,
    suspended_at,
    revoked_at,
    created_by
  )
  values
    (v_config.admin_id, 'admin', 'active', null, null, v_config.super_admin_id),
    (v_config.moderator_id, 'moderator', 'active', null, null, v_config.super_admin_id),
    (v_config.suspended_admin_id, 'admin', 'suspended', pg_catalog.now(), null, v_config.super_admin_id),
    (v_config.revoked_admin_id, 'admin', 'revoked', null, pg_catalog.now(), v_config.super_admin_id);
end
$fixtures$;

-- Active super_admin creates the initial draft.
set local role authenticated;
select pg_temp._commatch_notices_set_user(super_admin_id) from _commatch_notices_it_config;

do $super_admin_create$
declare
  v_config _commatch_notices_it_config%rowtype;
  v_notice_id uuid;
begin
  select * into v_config from _commatch_notices_it_config;
  if not public.has_admin_permission('notices_manage') then
    raise exception 'FAIL active super_admin lacks notices_manage';
  end if;

  select result.notice_id into v_notice_id
  from public.create_admin_notice('  첫 번째 공지  ', '  공지 본문입니다.  ') as result;

  update _commatch_notices_it_config set draft_notice_id = v_notice_id;
end
$super_admin_create$;

reset role;

do $draft_assertions$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if not exists (
    select 1 from public.notices
    where id = v_config.draft_notice_id
      and title = '첫 번째 공지'
      and body = '공지 본문입니다.'
      and status = 'draft'
      and published_at is null
      and created_by_admin_user_id = v_config.super_admin_id
  ) then
    raise exception 'FAIL draft creation or normalization';
  end if;
end
$draft_assertions$;

-- Anonymous users see no drafts and cannot address a draft directly.
set local role anon;
select pg_temp._commatch_notices_set_user(null, 'anon');

do $anon_draft_hidden$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if exists (select 1 from public.get_public_notices())
     or exists (select 1 from public.get_public_notice(v_config.draft_notice_id)) then
    raise exception 'FAIL anonymous caller can see a draft';
  end if;
end
$anon_draft_hidden$;

select pg_temp._commatch_notices_expect_42501(
  'anonymous direct INSERT',
  $$insert into public.notices (title, body, status) values ('x', 'x', 'draft')$$
);

select pg_temp._commatch_notices_expect_42501(
  'anonymous admin RPC',
  $$select * from public.create_admin_notice('x', 'x')$$
);

reset role;

-- Active admin edits and publishes the draft.
set local role authenticated;
select pg_temp._commatch_notices_set_user(admin_id) from _commatch_notices_it_config;

do $admin_edit_publish$
declare
  v_config _commatch_notices_it_config%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_notices_it_config;
  if not public.has_admin_permission('notices_manage') then
    raise exception 'FAIL active admin lacks notices_manage';
  end if;

  select result.updated_at into v_updated_at
  from public.update_admin_notice(
    v_config.draft_notice_id,
    (select updated_at from public.get_admin_notice(v_config.draft_notice_id)),
    '첫 번째 공지 수정',
    '수정된 공지 본문입니다.'
  ) as result;

  perform * from public.change_admin_notice_status(
    v_config.draft_notice_id,
    v_updated_at,
    'published'
  );
  update _commatch_notices_it_config
  set published_notice_id = v_config.draft_notice_id,
      draft_notice_id = null;
end
$admin_edit_publish$;

do $stale_update_rejected$
declare
  v_config _commatch_notices_it_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_notices_it_config;
  begin
    perform * from public.update_admin_notice(
      v_config.published_notice_id,
      (select created_at from public.get_admin_notice(v_config.published_notice_id)),
      '뒤늦은 수정',
      '오래된 화면에서 보낸 수정입니다.'
    );
  exception
    when sqlstate 'P0001' then
      v_failed := sqlerrm = 'NOTICE_STALE_VERSION';
  end;
  if not v_failed then
    raise exception 'FAIL stale administrator update was not rejected';
  end if;
end
$stale_update_rejected$;

reset role;

do $published_assertions$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if not exists (
    select 1 from public.notices
    where id = v_config.published_notice_id
      and title = '첫 번째 공지 수정'
      and status = 'published'
      and published_at is not null
      and updated_by_admin_user_id = v_config.admin_id
  ) then
    raise exception 'FAIL notice edit or publication';
  end if;
end
$published_assertions$;

-- Anonymous and authenticated members can read only the public projection.
set local role anon;
select pg_temp._commatch_notices_set_user(null, 'anon');

do $anon_published_visible$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if (select count(*) from public.get_public_notices()) <> 1
     or (select count(*) from public.get_public_notice(v_config.published_notice_id)) <> 1 then
    raise exception 'FAIL anonymous public notice read';
  end if;
end
$anon_published_visible$;

reset role;
set local role authenticated;
select pg_temp._commatch_notices_set_user(member_id) from _commatch_notices_it_config;

do $member_published_visible$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if (select count(*) from public.get_public_notices()) <> 1
     or (select count(*) from public.get_public_notice(v_config.published_notice_id)) <> 1 then
    raise exception 'FAIL authenticated public notice read';
  end if;
end
$member_published_visible$;

select pg_temp._commatch_notices_expect_42501(
  'member direct UPDATE',
  format(
    'update public.notices set title=%L where id=%L',
    'unauthorized',
    (select published_notice_id from _commatch_notices_it_config)
  )
);
select pg_temp._commatch_notices_expect_42501(
  'member create RPC',
  $$select * from public.create_admin_notice('x', 'x')$$
);

reset role;

-- Moderator, suspended admin, and revoked admin have no notice permission.
set local role authenticated;
select pg_temp._commatch_notices_set_user(moderator_id) from _commatch_notices_it_config;
select pg_temp._commatch_notices_expect_42501(
  'moderator create RPC',
  $$select * from public.create_admin_notice('x', 'x')$$
);

select pg_temp._commatch_notices_set_user(suspended_admin_id) from _commatch_notices_it_config;
select pg_temp._commatch_notices_expect_42501(
  'suspended admin create RPC',
  $$select * from public.create_admin_notice('x', 'x')$$
);

select pg_temp._commatch_notices_set_user(revoked_admin_id) from _commatch_notices_it_config;
select pg_temp._commatch_notices_expect_42501(
  'revoked admin create RPC',
  $$select * from public.create_admin_notice('x', 'x')$$
);

-- Archive is terminal and removes both list and direct public access.
select pg_temp._commatch_notices_set_user(super_admin_id) from _commatch_notices_it_config;

do $archive_notice$
declare
  v_config _commatch_notices_it_config%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_config from _commatch_notices_it_config;
  select updated_at into v_updated_at
  from public.get_admin_notice(v_config.published_notice_id);

  perform * from public.change_admin_notice_status(
    v_config.published_notice_id,
    v_updated_at,
    'archived'
  );
  update _commatch_notices_it_config
  set archived_notice_id = v_config.published_notice_id,
      published_notice_id = null;
end
$archive_notice$;

do $invalid_lifecycle$
declare
  v_config _commatch_notices_it_config%rowtype;
  v_failed boolean := false;
begin
  select * into v_config from _commatch_notices_it_config;
  begin
    perform * from public.change_admin_notice_status(
      v_config.archived_notice_id,
      (select updated_at from public.get_admin_notice(v_config.archived_notice_id)),
      'draft'
    );
  exception when sqlstate '22023' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL archived notice returned to draft';
  end if;
end
$invalid_lifecycle$;

reset role;
set local role anon;
select pg_temp._commatch_notices_set_user(null, 'anon');

do $archived_hidden$
declare v_config _commatch_notices_it_config%rowtype;
begin
  select * into v_config from _commatch_notices_it_config;
  if exists (select 1 from public.get_public_notices())
     or exists (select 1 from public.get_public_notice(v_config.archived_notice_id)) then
    raise exception 'FAIL archived notice remains public';
  end if;
end
$archived_hidden$;

reset role;

do $acl_assertions$
begin
  if pg_catalog.has_table_privilege('anon', 'public.notices', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.notices', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.notices', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.notices', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.notices', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.notices', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.notices', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.notices', 'DELETE') then
    raise exception 'FAIL direct notices table privilege is broader than approved';
  end if;
  if pg_catalog.pg_get_function_result(
       'public.get_public_notices()'::pg_catalog.regprocedure
     ) <> 'TABLE(notice_id uuid, title text, published_at timestamp with time zone)'
     or pg_catalog.pg_get_function_result(
       'public.get_public_notice(uuid)'::pg_catalog.regprocedure
     ) <> 'TABLE(notice_id uuid, title text, body text, published_at timestamp with time zone)' then
    raise exception 'FAIL public RPC exposes an unexpected projection';
  end if;
  if not pg_catalog.has_function_privilege('anon', 'public.get_public_notices()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'public.get_public_notices()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.create_admin_notice(text,text)', 'EXECUTE') then
    raise exception 'FAIL notice function execution privileges differ from the approved definition';
  end if;
end
$acl_assertions$;

select 'PASS public notices integration test; rolling back fixture writes' as test_result;
rollback;
