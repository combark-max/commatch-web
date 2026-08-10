-- ComMatch user consent integration tests (rollback-safe)
-- Run only after supabase/user-consents.sql has been installed in a disposable/staging DB.
-- Execute as a database owner capable of SET ROLE and inserting disposable auth.users rows.
-- This script does not require or modify an existing application user.

BEGIN;

CREATE TEMP TABLE comatch_consent_test_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  info text NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON TABLE pg_temp.comatch_consent_test_results
  TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp._consent_assert(p_name text, p_passed boolean, p_info text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
BEGIN
  INSERT INTO pg_temp.comatch_consent_test_results(test_name, passed, info)
  VALUES (p_name, coalesce(p_passed, false), coalesce(p_info, ''))
  ON CONFLICT (test_name) DO UPDATE
    SET passed = excluded.passed, info = excluded.info;
END
$func$;
GRANT EXECUTE ON FUNCTION pg_temp._consent_assert(text, boolean, text)
  TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp._consent_expect_error(
  p_name text,
  p_sql text,
  p_expected_state text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp._consent_assert(p_name, false, 'unexpected success');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    PERFORM pg_temp._consent_assert(
      p_name,
      v_state = p_expected_state,
      v_state || ':' || coalesce(v_message, '')
    );
  END;
END
$func$;
GRANT EXECUTE ON FUNCTION pg_temp._consent_expect_error(text, text, text)
  TO anon, authenticated, service_role;

CREATE FUNCTION pg_temp._consent_set_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $func$
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    CASE
      WHEN p_user_id IS NULL THEN '{}'::jsonb::text
      ELSE pg_catalog.jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text
    END,
    true
  );
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'auth.uid() setup failed';
  END IF;
END
$func$;
GRANT EXECUTE ON FUNCTION pg_temp._consent_set_user(uuid)
  TO anon, authenticated, service_role;

-- Preflight: fail before creating fixtures if the production contract is absent.
DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('public.user_consent_events') IS NULL THEN
    RAISE EXCEPTION 'Install supabase/user-consents.sql before running this test';
  END IF;
  IF pg_catalog.to_regprocedure(
    'public.record_my_consent_event(text,text,text,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'record_my_consent_event(text,text,text,text,uuid) is missing';
  END IF;
  IF pg_catalog.to_regprocedure('public.get_my_consent_status()') IS NULL THEN
    RAISE EXCEPTION 'get_my_consent_status() is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE instance_id IS NOT NULL) THEN
    RAISE EXCEPTION 'At least one auth.users instance_id is required for disposable fixtures';
  END IF;
END
$preflight$;

-- Schema / column contract.
DO $schema_tests$
DECLARE
  v_required_count integer;
BEGIN
  PERFORM pg_temp._consent_assert(
    'schema_table_exists',
    pg_catalog.to_regclass('public.user_consent_events') IS NOT NULL,
    'public.user_consent_events'
  );

  SELECT count(*) INTO v_required_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_consent_events'
    AND (
      (column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO') OR
      (column_name = 'user_id' AND data_type = 'uuid' AND is_nullable = 'NO') OR
      (column_name = 'consent_type' AND data_type = 'text' AND is_nullable = 'NO') OR
      (column_name = 'action' AND data_type = 'text' AND is_nullable = 'NO') OR
      (column_name = 'document_version' AND data_type = 'text' AND is_nullable = 'NO') OR
      (column_name = 'source' AND data_type = 'text' AND is_nullable = 'NO') OR
      (column_name = 'request_id' AND data_type = 'uuid' AND is_nullable = 'NO') OR
      (column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO')
    );
  PERFORM pg_temp._consent_assert('schema_required_columns', v_required_count = 8, v_required_count::text);

  PERFORM pg_temp._consent_assert(
    'schema_exact_column_count',
    (SELECT count(*) = 8 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_consent_events'),
    'exactly eight approved columns'
  );
  PERFORM pg_temp._consent_assert(
    'schema_primary_key',
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.user_consent_events'::regclass
        AND conname = 'user_consent_events_pkey' AND contype = 'p'
    ),
    'id primary key'
  );
  PERFORM pg_temp._consent_assert(
    'schema_auth_users_fk_restrict',
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.user_consent_events'::regclass
        AND conname = 'user_consent_events_user_id_fkey'
        AND contype = 'f'
        AND confrelid = 'auth.users'::regclass
        AND confdeltype = 'r'
    ),
    'auth.users ON DELETE RESTRICT'
  );
  PERFORM pg_temp._consent_assert(
    'schema_checks',
    (SELECT count(*) = 4 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.user_consent_events'::regclass AND contype = 'c'),
    'consent_type/action/document_version/source checks'
  );
  PERFORM pg_temp._consent_assert(
    'schema_unique_user_request',
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.user_consent_events'::regclass
        AND conname = 'user_consent_events_user_request_key' AND contype = 'u'
    ),
    '(user_id, request_id) unique'
  );
  PERFORM pg_temp._consent_assert(
    'schema_latest_index',
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_consent_events'
        AND indexname = 'user_consent_events_user_type_latest_idx'
        AND indexdef LIKE '%(user_id, consent_type, created_at DESC, id DESC)%'
    ),
    '(user_id, consent_type, created_at DESC, id DESC)'
  );
  PERFORM pg_temp._consent_assert(
    'schema_rls_enabled',
    (SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE oid = 'public.user_consent_events'::regclass),
    'RLS enabled'
  );
  PERFORM pg_temp._consent_assert(
    'schema_no_rls_policies',
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid = 'public.user_consent_events'::regclass
    ),
    'RPC-only boundary'
  );
END
$schema_tests$;

-- Function contract, SECURITY DEFINER/search_path, and spoofing surface.
DO $function_contract_tests$
DECLARE
  v_record_oid oid := 'public.record_my_consent_event(text,text,text,text,uuid)'::regprocedure;
  v_status_oid oid := 'public.get_my_consent_status()'::regprocedure;
  v_record_def text;
  v_status_def text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_record_oid) INTO v_record_def;
  SELECT pg_catalog.pg_get_functiondef(v_status_oid) INTO v_status_def;

  PERFORM pg_temp._consent_assert(
    'function_record_security_definer',
    (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = v_record_oid),
    'record RPC'
  );
  PERFORM pg_temp._consent_assert(
    'function_status_security_definer',
    (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid = v_status_oid),
    'status RPC'
  );
  PERFORM pg_temp._consent_assert(
    'function_record_empty_search_path',
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p,
           pg_catalog.unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting
      WHERE p.oid = v_record_oid
        AND setting IN ('search_path=', 'search_path=""')
    ),
    'record RPC search_path'
  );
  PERFORM pg_temp._consent_assert(
    'function_status_empty_search_path',
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p,
           pg_catalog.unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting
      WHERE p.oid = v_status_oid
        AND setting IN ('search_path=', 'search_path=""')
    ),
    'status RPC search_path'
  );
  PERFORM pg_temp._consent_assert(
    'spoof_no_user_id_argument',
    (SELECT p.pronargs = 5
            AND p.proargtypes = '25 25 25 25 2950'::oidvector
            AND p.proargnames[1:p.pronargs] = ARRAY[
              'p_consent_type', 'p_action', 'p_document_version', 'p_source', 'p_request_id'
            ]::text[]
       FROM pg_catalog.pg_proc AS p
      WHERE p.oid = v_record_oid),
    'user_id comes only from auth.uid()'
  );
  PERFORM pg_temp._consent_assert(
    'spoof_no_client_timestamp_argument',
    (SELECT p.pronargs = 5
            AND p.proargtypes = '25 25 25 25 2950'::oidvector
       FROM pg_catalog.pg_proc AS p
      WHERE p.oid = v_record_oid),
    'created_at is DB-generated'
  );
  PERFORM pg_temp._consent_assert(
    'status_deterministic_latest_order',
    v_status_def LIKE '%e.created_at DESC, e.id DESC%',
    'created_at DESC, id DESC'
  );
END
$function_contract_tests$;

-- ACL catalog checks.
DO $acl_catalog_tests$
BEGIN
  PERFORM pg_temp._consent_assert(
    'acl_public_no_table_access',
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS c
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
      ) AS acl
      WHERE c.oid = 'public.user_consent_events'::regclass
        AND acl.grantee = 0
        AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ),
    'PUBLIC'
  );
  PERFORM pg_temp._consent_assert(
    'acl_anon_no_table_access',
    NOT pg_catalog.has_table_privilege('anon', 'public.user_consent_events', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.user_consent_events', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.user_consent_events', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.user_consent_events', 'DELETE'),
    'anon'
  );
  PERFORM pg_temp._consent_assert(
    'acl_authenticated_no_table_access',
    NOT pg_catalog.has_table_privilege('authenticated', 'public.user_consent_events', 'SELECT')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.user_consent_events', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.user_consent_events', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('authenticated', 'public.user_consent_events', 'DELETE'),
    'authenticated'
  );
  PERFORM pg_temp._consent_assert(
    'acl_authenticated_record_execute',
    pg_catalog.has_function_privilege('authenticated', 'public.record_my_consent_event(text,text,text,text,uuid)', 'EXECUTE'),
    'authenticated only'
  );
  PERFORM pg_temp._consent_assert(
    'acl_authenticated_status_execute',
    pg_catalog.has_function_privilege('authenticated', 'public.get_my_consent_status()', 'EXECUTE'),
    'authenticated only'
  );
  PERFORM pg_temp._consent_assert(
    'acl_no_public_execute',
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) AS acl
      WHERE p.oid IN (
        'public.record_my_consent_event(text,text,text,text,uuid)'::regprocedure,
        'public.get_my_consent_status()'::regprocedure
      )
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC'
  );
  PERFORM pg_temp._consent_assert(
    'acl_no_anon_execute',
    NOT pg_catalog.has_function_privilege('anon', 'public.record_my_consent_event(text,text,text,text,uuid)', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', 'public.get_my_consent_status()', 'EXECUTE'),
    'anon'
  );
  PERFORM pg_temp._consent_assert(
    'acl_no_service_role_execute',
    NOT pg_catalog.has_function_privilege('service_role', 'public.record_my_consent_event(text,text,text,text,uuid)', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', 'public.get_my_consent_status()', 'EXECUTE'),
    'service_role has no browser RPC grant'
  );
END
$acl_catalog_tests$;

-- Disposable auth users. Copy only the project instance_id from an existing row.
CREATE TEMP TABLE comatch_consent_test_users (
  name text PRIMARY KEY,
  id uuid NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON TABLE pg_temp.comatch_consent_test_users TO anon, authenticated, service_role;

DO $fixtures$
DECLARE
  v_instance_id uuid;
  v_user_1 uuid := gen_random_uuid();
  v_user_2 uuid := gen_random_uuid();
BEGIN
  SELECT instance_id INTO v_instance_id
  FROM auth.users
  WHERE instance_id IS NOT NULL
  ORDER BY created_at, id
  LIMIT 1;

  INSERT INTO auth.users (
    id, instance_id, aud, role, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_user_1, v_instance_id, 'authenticated', 'authenticated', NULL, '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_2, v_instance_id, 'authenticated', 'authenticated', NULL, '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO pg_temp.comatch_consent_test_users(name, id)
  VALUES ('user_1', v_user_1), ('user_2', v_user_2);
END
$fixtures$;

-- Runtime direct-access rejection for anon and authenticated.
DO $direct_acl_tests$
DECLARE
  v_user uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_1');
  v_insert text;
BEGIN
  v_insert := pg_catalog.format(
    'INSERT INTO public.user_consent_events(user_id,consent_type,action,document_version,source,request_id) VALUES (%L::uuid,''terms'',''accepted'',''test-v1'',''settings'',%L::uuid)',
    v_user, gen_random_uuid()
  );

  SET LOCAL ROLE anon;
  PERFORM pg_temp._consent_expect_error('acl_anon_select_rejected', 'SELECT * FROM public.user_consent_events', '42501');
  PERFORM pg_temp._consent_expect_error('acl_anon_insert_rejected', v_insert, '42501');
  PERFORM pg_temp._consent_expect_error('acl_anon_update_rejected', 'UPDATE public.user_consent_events SET action = ''withdrawn''', '42501');
  PERFORM pg_temp._consent_expect_error('acl_anon_delete_rejected', 'DELETE FROM public.user_consent_events', '42501');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_expect_error('acl_authenticated_select_rejected', 'SELECT * FROM public.user_consent_events', '42501');
  PERFORM pg_temp._consent_expect_error('acl_authenticated_insert_rejected', v_insert, '42501');
  PERFORM pg_temp._consent_expect_error('acl_authenticated_update_rejected', 'UPDATE public.user_consent_events SET action = ''withdrawn''', '42501');
  PERFORM pg_temp._consent_expect_error('acl_authenticated_delete_rejected', 'DELETE FROM public.user_consent_events', '42501');
  RESET ROLE;
END
$direct_acl_tests$;

-- Authentication failures: authenticated with no auth.uid(), and anon without EXECUTE.
DO $authentication_tests$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(NULL);
  PERFORM pg_temp._consent_expect_error(
    'auth_missing_uid_record_rejected',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'',''test-v1'',''settings'',gen_random_uuid())',
    '42501'
  );
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM pg_temp._consent_set_user(NULL);
  PERFORM pg_temp._consent_expect_error(
    'auth_anon_record_rejected',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'',''test-v1'',''settings'',gen_random_uuid())',
    '42501'
  );
  PERFORM pg_temp._consent_expect_error(
    'auth_anon_status_rejected',
    'SELECT * FROM public.get_my_consent_status()',
    '42501'
  );
  RESET ROLE;
END
$authentication_tests$;

-- Input validation under an authenticated caller.
DO $validation_tests$
DECLARE
  v_user uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_1');
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user);
  PERFORM pg_temp._consent_expect_error(
    'validation_consent_type',
    'SELECT * FROM public.record_my_consent_event(''marketing'',''accepted'',''test-v1'',''settings'',gen_random_uuid())',
    '22023'
  );
  PERFORM pg_temp._consent_expect_error(
    'validation_action',
    'SELECT * FROM public.record_my_consent_event(''terms'',''confirmed'',''test-v1'',''settings'',gen_random_uuid())',
    '22023'
  );
  PERFORM pg_temp._consent_expect_error(
    'validation_source',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'',''test-v1'',''free_text'',gen_random_uuid())',
    '22023'
  );
  PERFORM pg_temp._consent_expect_error(
    'validation_document_version_empty',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'','''',''settings'',gen_random_uuid())',
    '22023'
  );
  PERFORM pg_temp._consent_expect_error(
    'validation_document_version_format',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'','' version with spaces '',''settings'',gen_random_uuid())',
    '22023'
  );
  PERFORM pg_temp._consent_expect_error(
    'validation_request_id_null',
    'SELECT * FROM public.record_my_consent_event(''terms'',''accepted'',''test-v1'',''settings'',NULL)',
    '22023'
  );
  RESET ROLE;
END
$validation_tests$;

-- Success, idempotency, conflict, append-only, and current status for user 1.
DO $user_1_behavior_tests$
DECLARE
  v_user uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_1');
  v_request uuid := gen_random_uuid();
  v_first record;
  v_retry record;
  v_withdrawn record;
  v_terms_status record;
  v_privacy_status record;
  v_before_count bigint;
  v_after_count bigint;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user);

  SELECT * INTO v_first
  FROM public.record_my_consent_event('terms', 'accepted', 'test-v1', 'email_verification', v_request);
  PERFORM pg_temp._consent_assert(
    'auth_authenticated_own_success',
    v_first.user_id = v_user AND v_first.event_id IS NOT NULL AND v_first.created_at IS NOT NULL,
    v_first.event_id::text
  );

  SELECT * INTO v_retry
  FROM public.record_my_consent_event('terms', 'accepted', 'test-v1', 'email_verification', v_request);
  PERFORM pg_temp._consent_assert(
    'idempotency_same_payload_same_result',
    v_retry.event_id = v_first.event_id AND v_retry.created_at = v_first.created_at,
    v_retry.event_id::text
  );

  RESET ROLE;
  SELECT count(*) INTO v_before_count
  FROM public.user_consent_events
  WHERE user_id = v_user AND request_id = v_request;
  PERFORM pg_temp._consent_assert('idempotency_same_payload_one_row', v_before_count = 1, v_before_count::text);

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user);
  PERFORM pg_temp._consent_expect_error(
    'idempotency_different_payload_conflict',
    pg_catalog.format(
      'SELECT * FROM public.record_my_consent_event(''terms'',''withdrawn'',''test-v1'',''email_verification'',%L::uuid)',
      v_request
    ),
    'C1001'
  );
  RESET ROLE;

  SELECT count(*) INTO v_after_count
  FROM public.user_consent_events
  WHERE user_id = v_user AND request_id = v_request;
  PERFORM pg_temp._consent_assert('idempotency_conflict_no_row', v_after_count = 1, v_after_count::text);

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user);
  SELECT * INTO v_withdrawn
  FROM public.record_my_consent_event('terms', 'withdrawn', 'test-v2', 'settings', gen_random_uuid());
  PERFORM public.record_my_consent_event('privacy', 'accepted', 'privacy-v1', 'profile_create', gen_random_uuid());

  RESET ROLE;
  PERFORM pg_temp._consent_assert(
    'append_only_second_event_new_row',
    v_withdrawn.event_id <> v_first.event_id
    AND (SELECT count(*) = 2 FROM public.user_consent_events WHERE user_id = v_user AND consent_type = 'terms'),
    'two terms events'
  );
  PERFORM pg_temp._consent_assert(
    'append_only_first_event_preserved',
    EXISTS (
      SELECT 1 FROM public.user_consent_events
      WHERE id = v_first.event_id AND action = 'accepted' AND document_version = 'test-v1'
    ),
    v_first.event_id::text
  );

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user);
  SELECT * INTO v_terms_status FROM public.get_my_consent_status() WHERE consent_type = 'terms';
  SELECT * INTO v_privacy_status FROM public.get_my_consent_status() WHERE consent_type = 'privacy';
  PERFORM pg_temp._consent_assert(
    'status_latest_terms_event',
    v_terms_status.latest_action = 'withdrawn' AND v_terms_status.document_version = 'test-v2',
    coalesce(v_terms_status.latest_action, 'NULL')
  );
  PERFORM pg_temp._consent_assert(
    'status_types_not_mixed',
    v_privacy_status.latest_action = 'accepted' AND v_privacy_status.document_version = 'privacy-v1'
    AND (SELECT count(*) = 2 FROM public.get_my_consent_status()),
    'terms and privacy only'
  );
  RESET ROLE;
END
$user_1_behavior_tests$;

-- A second user may reuse the same request UUID and cannot see user 1 events.
DO $multiple_user_tests$
DECLARE
  v_user_1 uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_1');
  v_user_2 uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_2');
  v_shared_request uuid;
  v_event_2 record;
BEGIN
  SELECT request_id INTO v_shared_request
  FROM public.user_consent_events
  WHERE user_id = v_user_1 AND consent_type = 'terms' AND action = 'accepted'
  ORDER BY created_at, id
  LIMIT 1;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp._consent_set_user(v_user_2);
  SELECT * INTO v_event_2
  FROM public.record_my_consent_event('adult_confirmation', 'accepted', 'adult-v1', 'email_verification', v_shared_request);
  PERFORM pg_temp._consent_assert(
    'multiple_users_same_request_allowed',
    v_event_2.user_id = v_user_2,
    v_shared_request::text
  );
  PERFORM pg_temp._consent_assert(
    'status_other_user_not_exposed',
    (SELECT count(*) = 1 FROM public.get_my_consent_status())
    AND NOT EXISTS (SELECT 1 FROM public.get_my_consent_status() WHERE consent_type = 'terms'),
    'user 2 sees only adult_confirmation'
  );
  RESET ROLE;

  PERFORM pg_temp._consent_assert(
    'multiple_users_unique_scope',
    (SELECT count(*) = 2 FROM public.user_consent_events WHERE request_id = v_shared_request),
    '(user_id, request_id) scope'
  );
END
$multiple_user_tests$;

-- FK RESTRICT preserves the event instead of silently deleting it with auth.users.
DO $fk_delete_test$
DECLARE
  v_user uuid := (SELECT id FROM pg_temp.comatch_consent_test_users WHERE name = 'user_2');
BEGIN
  PERFORM pg_temp._consent_expect_error(
    'fk_auth_user_delete_restricted',
    pg_catalog.format('DELETE FROM auth.users WHERE id = %L::uuid', v_user),
    '23503'
  );
END
$fk_delete_test$;

-- Emit the complete summary once, then fail the run if any assertion failed.
SELECT test_name, passed, info
FROM pg_temp.comatch_consent_test_results
ORDER BY test_name;

DO $summary$
DECLARE
  v_total integer;
  v_failed integer;
  v_failed_names text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT passed)
    INTO v_total, v_failed
  FROM pg_temp.comatch_consent_test_results;

  IF v_failed > 0 THEN
    SELECT pg_catalog.string_agg(test_name, ', ' ORDER BY test_name)
      INTO v_failed_names
    FROM pg_temp.comatch_consent_test_results
    WHERE NOT passed;
    RAISE EXCEPTION 'FAIL user consent integration tests: %/% failed: %',
      v_failed, v_total, v_failed_names;
  END IF;

  RAISE NOTICE 'PASS all % user consent integration tests; rolling back every fixture and data change', v_total;
END
$summary$;

ROLLBACK;

-- End of rollback-safe test script. No fixture or consent event persists.
