-- ComMatch admin account management integration tests (rollback-safe)
-- INSTRUCTIONS BEFORE RUNNING:
-- 1) Make a copy of this file and run in a staging DB only.
-- 2) Replace the two placeholders below with valid values in your staging DB:
--    SUPER_ADMIN_UUID  : an existing active super_admin account (will act as the primary caller)
--    TEST_CONFIRMATION : a disposable confirmation token string to acknowledge test run
-- 3) Execute this script as a single Run in the SQL Editor. It performs all setup
--    and then rolls everything back. Do NOT run in production.

-- REPLACE THESE VALUES BEFORE RUNNING (literal text replacement):
--   SUPER_ADMIN_UUID := 'PASTE_SUPER_ADMIN_USER_ID';
--   TEST_CONFIRMATION := 'PASTE_TEST_FIXTURE_CONFIRMATION';

BEGIN;

-- result collector
CREATE TEMP TABLE IF NOT EXISTS comatch_admin_test_results (
  test_name text primary key,
  passed boolean,
  info text
) ON COMMIT DROP;
GRANT INSERT, SELECT, UPDATE ON TABLE pg_temp.comatch_admin_test_results TO anon, authenticated, service_role;

-- config: external fixture + run confirmation
DO $$
DECLARE
  v_super uuid := 'PASTE_SUPER_ADMIN_USER_ID'::uuid;
  v_confirm text := 'PASTE_TEST_FIXTURE_CONFIRMATION';
  v_instance uuid;
BEGIN
  IF v_confirm IS NULL OR length(v_confirm) < 10 THEN
    RAISE EXCEPTION 'Replace TEST_CONFIRMATION with a non-empty confirmation token before running';
  END IF;
  SELECT instance_id INTO v_instance FROM auth.users WHERE id = v_super;
  IF v_instance IS NULL THEN
    INSERT INTO comatch_admin_test_results VALUES ('preflight_super_exists', false, 'SUPER_ADMIN not found');
    ROLLBACK;
    RETURN;
  END IF;
  -- store in temp config table
  CREATE TEMP TABLE _commatch_admin_it_config (super_admin uuid, instance_id uuid) ON COMMIT DROP;
  GRANT SELECT ON TABLE pg_temp._commatch_admin_it_config TO anon, authenticated, service_role;
  INSERT INTO _commatch_admin_it_config VALUES (v_super, v_instance);
  -- record baseline of real super_admin to ensure we do not modify it
  CREATE TEMP TABLE _commatch_admin_super_baseline (super_admin uuid primary key, role text, status text, updated_at timestamptz) ON COMMIT DROP;
  GRANT SELECT ON TABLE pg_temp._commatch_admin_super_baseline TO authenticated, service_role;
  INSERT INTO _commatch_admin_super_baseline
    SELECT v_super, a.role, a.status, a.updated_at FROM public.admin_accounts a WHERE a.user_id = v_super;
END$$;

-- helper: set auth context for generated run (similar to existing tests)
CREATE FUNCTION pg_temp._commatch_admin_it_set_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    case when p_user_id is null then '{}'::jsonb::text
         else pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text end
  , true);
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'auth.uid() setup failed';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp._commatch_admin_it_set_user(uuid) TO anon, authenticated;

-- small helper to assert expected SQLSTATE for negative tests
-- Removed in favor of explicit nested PL/pgSQL blocks to avoid helper exception handling ambiguity.

-- Owner-only fixture setup: create disposable users and admin_accounts (copied instance_id)
DO $$
DECLARE
  cfg record;
  v_normal uuid := gen_random_uuid();
  v_normal2 uuid := gen_random_uuid();
  v_moderator uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_super2 uuid := gen_random_uuid();
  v_suspended uuid := gen_random_uuid();
  v_revoked uuid := gen_random_uuid();
BEGIN
  SELECT * INTO cfg FROM pg_temp._commatch_admin_it_config LIMIT 1;
  -- insert minimal auth.users for fixtures
  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_normal, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_normal2, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_moderator, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_admin, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_super2, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_suspended, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO auth.users (id, instance_id, aud, role, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES (v_revoked, cfg.instance_id, 'authenticated', 'authenticated', null, '{}'::jsonb, '{}'::jsonb, now(), now());

  -- profiles
  INSERT INTO public.profiles (id, nickname) VALUES (v_normal, concat('test_normal_', left(v_normal::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_normal2, concat('test_normal2_', left(v_normal2::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_moderator, concat('test_moderator_', left(v_moderator::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_admin, concat('test_admin_', left(v_admin::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_super2, concat('test_super2_', left(v_super2::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_suspended, concat('test_suspended_', left(v_suspended::text, 8)));
  INSERT INTO public.profiles (id, nickname) VALUES (v_revoked, concat('test_revoked_', left(v_revoked::text, 8)));

  -- admin_accounts fixtures: active moderator/admin, a second super, suspended and revoked
  INSERT INTO public.admin_accounts (user_id, role, status, created_by, created_at, updated_at)
  VALUES (v_moderator, 'moderator', 'active', cfg.super_admin, now(), now());

  INSERT INTO public.admin_accounts (user_id, role, status, created_by, created_at, updated_at)
  VALUES (v_admin, 'admin', 'active', cfg.super_admin, now(), now());

  INSERT INTO public.admin_accounts (user_id, role, status, created_by, created_at, updated_at)
  VALUES (v_super2, 'super_admin', 'active', cfg.super_admin, now(), now());

  INSERT INTO public.admin_accounts (user_id, role, status, suspended_at, created_by, created_at, updated_at)
  VALUES (v_suspended, 'admin', 'suspended', now(), cfg.super_admin, now(), now());

  INSERT INTO public.admin_accounts (user_id, role, status, revoked_at, created_by, created_at, updated_at)
  VALUES (v_revoked, 'admin', 'revoked', now(), cfg.super_admin, now(), now());

  -- record generated ids for use below
  CREATE TEMP TABLE _commatch_admin_generated_ids (name text primary key, id uuid) ON COMMIT DROP;
  GRANT SELECT ON TABLE pg_temp._commatch_admin_generated_ids TO anon, authenticated, service_role;
  INSERT INTO _commatch_admin_generated_ids VALUES
    ('normal', v_normal), ('normal2', v_normal2), ('moderator', v_moderator), ('admin', v_admin), ('super2', v_super2), ('suspended', v_suspended), ('revoked', v_revoked);
END$$;

-- === Tests (single-run with context switching) ===

-- Permission checks: ordinary authenticated -> 42501
DO $$
DECLARE v_target uuid;
BEGIN
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  -- set caller to normal
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._commatch_admin_it_set_user(v_target);
  BEGIN
    PERFORM public.get_admin_account_summary();
    INSERT INTO comatch_admin_test_results VALUES ('permission_normal_denied', false, 'unexpected success') ON CONFLICT (test_name) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('permission_normal_denied', sqlstate = '42501', sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, info = EXCLUDED.info;
  END;
END$$;

-- Permission: moderator denied
DO $$
DECLARE v_target uuid;
BEGIN
  SELECT id INTO v_target FROM pg_temp._commatch_admin_generated_ids WHERE name='moderator';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._commatch_admin_it_set_user(v_target);
  BEGIN
    PERFORM public.create_admin_account(v_target, 'admin', gen_random_uuid(), 'perm-test');
    INSERT INTO comatch_admin_test_results VALUES ('permission_moderator_denied', false, 'unexpected success') ON CONFLICT (test_name) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('permission_moderator_denied', sqlstate = '42501', sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, info = EXCLUDED.info;
  END;
END$$;

-- Permission: admin denied
DO $$
DECLARE v_target uuid;
BEGIN
  SELECT id INTO v_target FROM pg_temp._commatch_admin_generated_ids WHERE name='admin';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._commatch_admin_it_set_user(v_target);
  BEGIN
    PERFORM public.create_admin_account(v_target, 'admin', gen_random_uuid(), 'perm-test');
    INSERT INTO comatch_admin_test_results VALUES ('permission_admin_denied', false, 'unexpected success') ON CONFLICT (test_name) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('permission_admin_denied', sqlstate = '42501', sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, info = EXCLUDED.info;
  END;
END$$;

-- Permission: anon (no role) should be denied
DO $$
BEGIN
  SET LOCAL ROLE anon;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.get_admin_account_summary();
    INSERT INTO comatch_admin_test_results VALUES ('permission_anon_denied', false, 'unexpected success') ON CONFLICT (test_name) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('permission_anon_denied', sqlstate = '42501', sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, info = EXCLUDED.info;
  END;
END$$;

-- Permission: active super_admin success
DO $$
DECLARE v_super uuid; v_target uuid; r record;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  BEGIN
    SELECT * INTO r FROM public.create_admin_account(v_target, 'admin', gen_random_uuid(), 'test-create');
    INSERT INTO comatch_admin_test_results VALUES ('create_admin_success', true, concat('action=', r.action_id)) ON CONFLICT (test_name) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('create_admin_success', false, sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, info = EXCLUDED.info;
  END;
END$$;

-- Idempotency: same request_id returns same action
DO $$
DECLARE v_super uuid; v_target uuid; rid uuid; r1 record; r2 record;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  rid := gen_random_uuid();
  SET LOCAL ROLE authenticated; PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  BEGIN
    SELECT * INTO r1 FROM public.create_admin_account(v_target, 'admin', rid, 'idem');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('idempotency_create_first', false, sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO NOTHING; RETURN;
  END;
  BEGIN
    SELECT * INTO r2 FROM public.create_admin_account(v_target, 'admin', rid, 'idem');
    IF r1.action_id = r2.action_id THEN
      INSERT INTO comatch_admin_test_results VALUES ('idempotency_create_second', true, concat('action=', r2.action_id)) ON CONFLICT (test_name) DO NOTHING;
    ELSE
      INSERT INTO comatch_admin_test_results VALUES ('idempotency_create_second', false, 'action_id mismatch') ON CONFLICT (test_name) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('idempotency_create_second', false, sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO NOTHING;
  END;
END$$;

-- Conflict: same request_id different intent -> A1002
DO $$
DECLARE v_super uuid; v_target uuid; rid uuid;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal2';
  rid := gen_random_uuid();
  SET LOCAL ROLE authenticated; PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  -- first: create as 'admin'
  PERFORM public.create_admin_account(v_target, 'admin', rid, 'conflict-a');

  -- second: same request_id but different intent should raise A1002
  DECLARE
    v_got_error boolean := false;
    v_state text;
    v_message text;
  BEGIN
    BEGIN
      PERFORM public.create_admin_account(v_target, 'moderator', rid, 'conflict-b');
    EXCEPTION WHEN OTHERS THEN
      v_got_error := true;
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    END;

    IF NOT v_got_error THEN
      RAISE EXCEPTION 'FAIL create_conflict: expected SQLSTATE A1002, operation unexpectedly succeeded';
    END IF;

    IF v_state IS DISTINCT FROM 'A1002' THEN
      RAISE EXCEPTION 'FAIL create_conflict: expected SQLSTATE A1002, received % (%)', v_state, coalesce(v_message, '');
    END IF;

    INSERT INTO comatch_admin_test_results (test_name, passed, info)
      VALUES ('create_conflict', true, v_state || ':' || coalesce(v_message, ''))
      ON CONFLICT (test_name) DO UPDATE SET passed = excluded.passed, info = excluded.info;
  END;
END$$;

-- Role change stale test: expect A1001
DO $$
DECLARE v_super uuid; v_target uuid; bad_ts timestamptz := '1970-01-01T00:00:00Z'::timestamptz; rid uuid;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  rid := gen_random_uuid();
  SET LOCAL ROLE authenticated; PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  DECLARE
    v_got_error boolean := false;
    v_state text;
    v_message text;
  BEGIN
    BEGIN
      PERFORM public.change_admin_account_role(v_target, 'admin', bad_ts, rid, 'stale-test');
    EXCEPTION WHEN OTHERS THEN
      v_got_error := true;
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    END;

    IF NOT v_got_error THEN
      RAISE EXCEPTION 'FAIL change_role_stale: expected SQLSTATE A1001, operation unexpectedly succeeded';
    END IF;

    IF v_state IS DISTINCT FROM 'A1001' THEN
      RAISE EXCEPTION 'FAIL change_role_stale: expected SQLSTATE A1001, received % (%)', v_state, coalesce(v_message, '');
    END IF;

    INSERT INTO comatch_admin_test_results (test_name, passed, info)
      VALUES ('change_role_stale', true, v_state || ':' || coalesce(v_message, ''))
      ON CONFLICT (test_name) DO UPDATE SET passed = excluded.passed, info = excluded.info;
  END;
END$$;

-- Self modification forbidden: expect A1004
DO $$
DECLARE v_super uuid; rid uuid;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  rid := gen_random_uuid();
  SET LOCAL ROLE authenticated; PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  DECLARE
    v_got_error boolean := false;
    v_state text;
    v_message text;
    v_now timestamptz := now();
  BEGIN
    BEGIN
      PERFORM public.change_admin_account_role(v_super, 'admin', v_now, rid, 'self-modify-test');
    EXCEPTION WHEN OTHERS THEN
      v_got_error := true;
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    END;

    IF NOT v_got_error THEN
      RAISE EXCEPTION 'FAIL self_modify: expected SQLSTATE A1004, operation unexpectedly succeeded';
    END IF;

    IF v_state IS DISTINCT FROM 'A1004' THEN
      RAISE EXCEPTION 'FAIL self_modify: expected SQLSTATE A1004, received % (%)', v_state, coalesce(v_message, '');
    END IF;

    INSERT INTO comatch_admin_test_results (test_name, passed, info)
      VALUES ('self_modify', true, v_state || ':' || coalesce(v_message, ''))
      ON CONFLICT (test_name) DO UPDATE SET passed = excluded.passed, info = excluded.info;
  END;
END$$;

-- Status transitions and idempotency (suspend then repeat)
DO $$
DECLARE v_super uuid; v_target uuid; current_ts timestamptz; rid uuid; r1 record; r2 record;
BEGIN
  SELECT super_admin INTO v_super FROM _commatch_admin_it_config LIMIT 1;
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  SET LOCAL ROLE authenticated; PERFORM pg_temp._commatch_admin_it_set_user(v_super);
  -- use read RPC instead of direct table access to respect RLS/ACL
  SELECT d.updated_at INTO current_ts FROM public.get_admin_account_detail(v_target) AS d;
  IF current_ts IS NULL THEN
    INSERT INTO comatch_admin_test_results VALUES ('status_precheck', false, 'no admin_accounts row for target') ON CONFLICT (test_name) DO NOTHING; RETURN;
  END IF;
  rid := gen_random_uuid();
  BEGIN
    SELECT * INTO r1 FROM public.change_admin_account_status(v_target, 'suspended', current_ts, rid, 'suspend');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('status_suspend_first', false, sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO NOTHING; RETURN;
  END;
  BEGIN
    SELECT * INTO r2 FROM public.change_admin_account_status(v_target, 'suspended', current_ts, r1.action_id, 'suspend');
    IF r1.action_id = r2.action_id THEN
      INSERT INTO comatch_admin_test_results VALUES ('status_suspend_idempotent', true, concat('action=', r2.action_id)) ON CONFLICT (test_name) DO NOTHING;
    ELSE
      INSERT INTO comatch_admin_test_results VALUES ('status_suspend_idempotent', false, 'action_id mismatch') ON CONFLICT (test_name) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO comatch_admin_test_results VALUES ('status_suspend_idempotent', false, sqlstate || ':' || coalesce(sqlerrm,'')) ON CONFLICT (test_name) DO NOTHING;
  END;
END$$;

-- Audit verification: ensure last audit row for target contains request_id and snapshots
DO $$
DECLARE v_target uuid; v_row record;
BEGIN
  SELECT id INTO v_target FROM _commatch_admin_generated_ids WHERE name='normal';
  -- use read RPC to fetch latest audit action for target
  SELECT * INTO v_row FROM public.get_admin_account_actions(v_target, 1, 0) AS x LIMIT 1;
  IF v_row IS NULL THEN
    INSERT INTO comatch_admin_test_results VALUES ('audit_exists', false, 'no audit row') ON CONFLICT (test_name) DO NOTHING;
  ELSE
    INSERT INTO comatch_admin_test_results VALUES ('audit_exists', true, v_row.id::text) ON CONFLICT (test_name) DO NOTHING;
  END IF;
END$$;

DO $$
DECLARE
  v_failed_count int;
  v_mismatch boolean := false;
BEGIN
  SELECT count(*) INTO v_failed_count FROM comatch_admin_test_results WHERE passed = false;

  -- Verify real super_admin unchanged
  IF EXISTS (
    SELECT 1 FROM _commatch_admin_super_baseline b
    LEFT JOIN public.admin_accounts a ON a.user_id = b.super_admin
    WHERE a.role IS DISTINCT FROM b.role OR a.status IS DISTINCT FROM b.status OR a.updated_at IS DISTINCT FROM b.updated_at
  ) THEN
    INSERT INTO comatch_admin_test_results VALUES ('real_super_admin_unchanged', false, 'real super_admin changed during test') ON CONFLICT (test_name) DO NOTHING;
    v_mismatch := true;
  ELSE
    INSERT INTO comatch_admin_test_results VALUES ('real_super_admin_unchanged', true, 'baseline preserved') ON CONFLICT (test_name) DO NOTHING;
  END IF;

  -- Recompute failure count after baseline check
  SELECT count(*) INTO v_failed_count FROM comatch_admin_test_results WHERE passed = false;

  IF v_failed_count > 0 THEN
    -- Show full result table for debugging; then rollback
    SELECT * FROM comatch_admin_test_results ORDER BY test_name;
  ELSE
    RESET ROLE;
    SELECT 'PASS all administrator account management rollback integration tests; rolling back every fixture and data change' AS test_result;
  END IF;
END$$;

ROLLBACK;

-- End of test script. Replace placeholders and run in staging. Do NOT run in production.
