-- Migration: Admin account management (audit table + RPCs)
-- NOTE: This file is a deployment / review artifact. Do NOT execute automatically.
-- Marker: commatch_admin_account_management_v1

begin;

-- Preflight checks
DO $preflight$
DECLARE
  v_marker constant text := 'commatch_admin_account_management_v1';
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users does not exist';
  END IF;
  IF pg_catalog.to_regclass('public.admin_accounts') IS NULL THEN
    RAISE EXCEPTION 'public.admin_accounts must exist before installing admin account management objects';
  END IF;
END
$preflight$;

-- 1) Audit table: public.admin_account_actions
CREATE TABLE IF NOT EXISTS public.admin_account_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  request_fingerprint text NOT NULL,
  target_user_id uuid NULL,
  actor_user_id uuid NULL,
  action_type text NOT NULL,
  previous_role text NULL,
  new_role text NULL,
  previous_status text NULL,
  new_status text NULL,
  previous_updated_at timestamptz NULL,
  new_updated_at timestamptz NULL,
  reason text NULL,
  target_snapshot jsonb NOT NULL,
  actor_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_account_actions IS 'commatch_admin_account_actions_v1';
COMMENT ON COLUMN public.admin_account_actions.request_fingerprint IS 'md5 canonical fingerprint of intent';
COMMENT ON COLUMN public.admin_account_actions.target_snapshot IS 'Snapshot JSON: user_id,email,nickname,role,status,created_at,updated_at,suspended_at,revoked_at';
COMMENT ON COLUMN public.admin_account_actions.actor_snapshot IS 'Snapshot JSON: user_id,email,nickname,role,status';

-- Constraints / checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_action_type_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_action_type_check CHECK (action_type IN ('created','role_changed','suspended','reactivated','revoked'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_role_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_role_check CHECK (
        previous_role IS NULL OR previous_role IN ('super_admin','admin','moderator')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_new_role_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_new_role_check CHECK (
        new_role IS NULL OR new_role IN ('super_admin','admin','moderator')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_status_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_status_check CHECK (
        previous_status IS NULL OR previous_status IN ('active','suspended','revoked')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_new_status_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_new_status_check CHECK (
        new_status IS NULL OR new_status IN ('active','suspended','revoked')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_reason_check'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_reason_check CHECK (
        reason IS NULL OR (reason = btrim(reason) AND char_length(reason) <= 500)
      );
  END IF;
END$$;

-- Foreign keys: ON DELETE SET NULL to preserve audit rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_target_user_fkey'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_target_user_fkey FOREIGN KEY (target_user_id)
        REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_account_actions_actor_user_fkey'
      AND conrelid = 'public.admin_account_actions'::regclass
  ) THEN
    ALTER TABLE public.admin_account_actions
      ADD CONSTRAINT admin_account_actions_actor_user_fkey FOREIGN KEY (actor_user_id)
        REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS admin_account_actions_request_id_unique
  ON public.admin_account_actions (request_id);

CREATE INDEX IF NOT EXISTS admin_account_actions_request_fingerprint_idx
  ON public.admin_account_actions (request_fingerprint);

CREATE INDEX IF NOT EXISTS admin_account_actions_target_created_idx
  ON public.admin_account_actions (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_account_actions_actor_idx
  ON public.admin_account_actions (actor_user_id);

CREATE INDEX IF NOT EXISTS admin_account_actions_created_idx
  ON public.admin_account_actions (created_at DESC);

-- RLS: Enable but do NOT create browser policies. Access only via SECURITY DEFINER functions.
ALTER TABLE public.admin_account_actions ENABLE ROW LEVEL SECURITY;

-- Revoke direct privileges from browser roles and public.
REVOKE ALL ON TABLE public.admin_account_actions FROM public, anon, authenticated;
-- Do not grant service_role direct privileges here; functions will mediate access.

-- Advisory lock helper (use project convention: hashtextextended on string + seed)
CREATE OR REPLACE FUNCTION public.lock_admin_account_write()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $func$
BEGIN
  -- Global transaction-scoped advisory lock for admin account write operations.
  -- Uses hashtextextended on a constant string with chosen seed to produce 64-bit key.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('commatch_admin_account_write_guard', 192837)
  );
END
$func$;

COMMENT ON FUNCTION public.lock_admin_account_write() IS 'commatch_admin_account_management_v1';

-- -------------------------
--  Read RPCs (PL/pgSQL, STABLE, SECURITY DEFINER)
--  All read functions enforce permission via has_admin_permission('admin_accounts_manage')
-- -------------------------

CREATE OR REPLACE FUNCTION public.get_admin_account_summary()
RETURNS TABLE (
  total_admin_count bigint,
  active_admin_count bigint,
  suspended_admin_count bigint,
  revoked_admin_count bigint,
  super_admin_count bigint,
  active_super_admin_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    sum((status = 'active')::int)::bigint,
    sum((status = 'suspended')::int)::bigint,
    sum((status = 'revoked')::int)::bigint,
    sum((role = 'super_admin')::int)::bigint,
    sum((role = 'super_admin' AND status = 'active')::int)::bigint
  FROM public.admin_accounts;
END
$func$;

COMMENT ON FUNCTION public.get_admin_account_summary() IS 'commatch_admin_account_management_v1';

GRANT EXECUTE ON FUNCTION public.get_admin_account_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_accounts(
  p_search text default null,
  p_role text default 'all',
  p_status text default 'all',
  p_limit integer default 20,
  p_offset integer default 0,
  p_sort_key text default 'created_at',
  p_sort_direction text default 'desc'
)
RETURNS TABLE (
  user_id uuid,
  role text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  email text,
  nickname text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
  v_sort_dir text := CASE WHEN lower(coalesce(p_sort_direction,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_sql text;
  v_search text;
  v_role text;
  v_status text;
  v_offset integer;
  v_sort_expr text;
BEGIN
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  -- normalize and validate inputs
  v_search := NULLIF(btrim(p_search), '');

  -- normalize role/status and validate against allowed set
  v_role := lower(coalesce(p_role, 'all'));
  IF v_role NOT IN ('all','super_admin','admin','moderator') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid role filter';
  END IF;
  v_status := lower(coalesce(p_status, 'all'));
  IF v_status NOT IN ('all','active','suspended','revoked') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid status filter';
  END IF;

  -- validate offset
  IF p_offset IS NULL THEN
    v_offset := 0;
  ELSIF p_offset < 0 THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid offset';
  ELSE
    v_offset := p_offset;
  END IF;

  -- map sort key to qualified expression to avoid ambiguity
  v_sort_expr := CASE WHEN p_sort_key = 'created_at' THEN 'a.created_at'
                      WHEN p_sort_key = 'updated_at' THEN 'a.updated_at'
                      WHEN p_sort_key = 'role' THEN 'a.role'
                      WHEN p_sort_key = 'status' THEN 'a.status'
                      ELSE 'a.created_at' END;

  v_sql := format($fmt$
    SELECT a.user_id, a.role, a.status, a.created_by, a.created_at, a.updated_at, a.suspended_at, a.revoked_at,
           u.email::text, p.nickname::text
    FROM public.admin_accounts a
    LEFT JOIN auth.users u ON u.id = a.user_id
    LEFT JOIN public.profiles p ON p.id = a.user_id
    WHERE ($1 IS NULL OR (left(a.user_id::text, char_length($1)) = lower($1) OR lower(u.email::text) LIKE '%%' || lower($1) || '%%' OR lower(p.nickname::text) LIKE '%%' || lower($1) || '%%'))
      AND ($2 = 'all' OR a.role = $2)
      AND ($3 = 'all' OR a.status = $3)
    ORDER BY %s %s
    LIMIT $4 OFFSET $5
  $fmt$, v_sort_expr, v_sort_dir);
  RETURN QUERY EXECUTE v_sql USING v_search, v_role, v_status, v_limit, v_offset;
END
$func$;

COMMENT ON FUNCTION public.get_admin_accounts(text,text,text,integer,integer,text,text) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.get_admin_accounts(text,text,text,integer,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_account_detail(p_target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  email text,
  nickname text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  RETURN QUERY
  SELECT a.user_id, a.role, a.status, a.created_by, a.created_at, a.updated_at, a.suspended_at, a.revoked_at, u.email::text, p.nickname::text
  FROM public.admin_accounts a
  LEFT JOIN auth.users u ON u.id = a.user_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.user_id = p_target_user_id;
END
$func$;

COMMENT ON FUNCTION public.get_admin_account_detail(uuid) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.get_admin_account_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_account_actions(p_target_user_id uuid, p_limit integer default 20, p_offset integer default 0)
RETURNS TABLE (
  id uuid,
  request_id uuid,
  request_fingerprint text,
  action_type text,
  actor_user_id uuid,
  actor_snapshot jsonb,
  previous_role text,
  new_role text,
  previous_status text,
  new_status text,
  reason text,
  created_at timestamptz,
  target_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  RETURN QUERY
  SELECT aa.id, aa.request_id, aa.request_fingerprint, aa.action_type, aa.actor_user_id, aa.actor_snapshot, aa.previous_role, aa.new_role, aa.previous_status, aa.new_status, aa.reason, aa.created_at, aa.target_snapshot
  FROM public.admin_account_actions aa
  WHERE aa.target_user_id = p_target_user_id
  ORDER BY aa.created_at DESC, aa.id DESC
  LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET GREATEST(p_offset,0);
END
$func$;

COMMENT ON FUNCTION public.get_admin_account_actions(uuid,integer,integer) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.get_admin_account_actions(uuid,integer,integer) TO authenticated;

-- -------------------------
--  Write RPCs (PL/pgSQL, SECURITY DEFINER)
--  All write RPCs MUST follow the sequence described in function comments
-- -------------------------

-- Helper: canonicalize reason
CREATE OR REPLACE FUNCTION public._admin_canonical_reason(p_reason text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT NULLIF(btrim(p_reason), '')::text;
$func$;

-- Helper: compute request fingerprint
CREATE OR REPLACE FUNCTION public._admin_request_fingerprint(
  p_actor_user_id uuid,
  p_action_type text,
  p_target_user_id uuid,
  p_new_role text,
  p_new_status text,
  p_expected_updated_at timestamptz,
  p_reason text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT md5(concat_ws('|',
    coalesce(p_actor_user_id::text,''),
    p_action_type,
    coalesce(p_target_user_id::text,''),
    coalesce(p_new_role,''),
    coalesce(p_new_status,''),
    -- stable canonicalization of timestamptz: epoch seconds (text)
    coalesce(CASE WHEN p_expected_updated_at IS NULL THEN '' ELSE (extract(epoch from p_expected_updated_at))::text END,''),
    coalesce(btrim(p_reason),'')));
$func$;

-- 1) create_admin_account
CREATE OR REPLACE FUNCTION public.create_admin_account(
  p_target_user_id uuid,
  p_role text,
  p_request_id uuid,
  p_reason text default null
)
RETURNS TABLE (action_id uuid, target_user_id uuid, role text, status text, updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_actor uuid := (select auth.uid());
  v_existing_action public.admin_account_actions%rowtype;
  v_fingerprint text;
  v_now timestamptz := now();
  v_caller_role text;
  v_caller_status text;
BEGIN
  -- NULL / required param checks
  IF p_target_user_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_target_user_id is required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_request_id is required';
  END IF;
  IF p_role IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_role is required';
  END IF;

  -- 1. lightweight pre-checks are above (auth.uid()/params). Acquire global advisory lock next.
  PERFORM public.lock_admin_account_write();

  -- After acquiring lock, re-validate caller's admin row and permissions from authoritative state.
  SELECT a.role, a.status INTO v_caller_role, v_caller_status FROM public.admin_accounts a WHERE a.user_id = v_actor;
  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_status IS NULL THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF v_caller_role <> 'super_admin' OR v_caller_status <> 'active' THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  -- 3. request_id existing check (idempotency)
  v_fingerprint := public._admin_request_fingerprint(v_actor, 'created', p_target_user_id, p_role, NULL::text, NULL::timestamptz, p_reason);
  SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_action.request_fingerprint = v_fingerprint THEN
      RETURN QUERY
      SELECT
        aa.id,
        aa.target_user_id,
        (aa.target_snapshot->>'role')::text,
        (aa.target_snapshot->>'status')::text,
        CASE WHEN aa.new_updated_at IS NOT NULL THEN aa.new_updated_at ELSE (aa.target_snapshot->>'updated_at')::timestamptz END
      FROM public.admin_account_actions aa
      WHERE aa.request_id = p_request_id;
      RETURN;
    ELSE
      RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    END IF;
  END IF;

  -- 4. target existence
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE USING ERRCODE = 'A1005', MESSAGE = 'ADMIN_ACCOUNT_TARGET_NOT_FOUND';
  END IF;

  -- 5. input validation
  IF lower(coalesce(p_role,'')) NOT IN ('super_admin','admin','moderator') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid role';
  END IF;

  -- 6. check existing admin_accounts
  IF EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = p_target_user_id) THEN
    -- already admin: per policy, new request_id required to change; treat as ADMIN_ACCOUNT_NO_CHANGE
    RAISE USING ERRCODE = 'A1007', MESSAGE = 'ADMIN_ACCOUNT_ALREADY_EXISTS';
  END IF;

  -- 7. create
  INSERT INTO public.admin_accounts (user_id, role, status, created_by, created_at, updated_at)
  VALUES (p_target_user_id, p_role, 'active', v_actor, v_now, v_now);

  -- snapshot
  PERFORM 1;
  DECLARE
    v_target_row record;
    v_actor_row record;
  BEGIN
    SELECT a.user_id, a.role, a.status, a.created_at, a.updated_at, a.suspended_at, a.revoked_at INTO v_target_row
    FROM public.admin_accounts a WHERE a.user_id = p_target_user_id;
    SELECT u.id, u.email INTO v_actor_row FROM auth.users u WHERE u.id = v_actor;

    BEGIN
      INSERT INTO public.admin_account_actions (request_id, request_fingerprint, target_user_id, actor_user_id, action_type, previous_role, new_role, previous_status, new_status, previous_updated_at, new_updated_at, reason, target_snapshot, actor_snapshot)
      VALUES (
        p_request_id,
        v_fingerprint,
        p_target_user_id,
        v_actor,
        'created',
        NULL,
        v_target_row.role,
        NULL,
        v_target_row.status,
        NULL,
        v_target_row.updated_at,
        public._admin_canonical_reason(p_reason),
        jsonb_build_object('user_id', v_target_row.user_id::text, 'email', (SELECT u.email FROM auth.users u WHERE u.id = v_target_row.user_id), 'nickname', (SELECT p.nickname FROM public.profiles p WHERE p.id = v_target_row.user_id), 'role', v_target_row.role, 'status', v_target_row.status, 'created_at', v_target_row.created_at, 'updated_at', v_target_row.updated_at, 'suspended_at', v_target_row.suspended_at, 'revoked_at', v_target_row.revoked_at),
        jsonb_build_object('user_id', coalesce(v_actor_row.id::text, NULL), 'email', coalesce(v_actor_row.email, NULL))
      ) RETURNING id INTO action_id;

      target_user_id := p_target_user_id;
      role := v_target_row.role;
      status := v_target_row.status;
      updated_at := v_target_row.updated_at;
      RETURN NEXT;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
      IF v_existing_action.request_fingerprint = v_fingerprint THEN
        action_id := v_existing_action.id;
        target_user_id := v_existing_action.target_user_id::uuid;
        role := (v_existing_action.target_snapshot->>'role')::text;
        status := (v_existing_action.target_snapshot->>'status')::text;
        updated_at := COALESCE(v_existing_action.new_updated_at, (v_existing_action.target_snapshot->>'updated_at')::timestamptz);
        RETURN NEXT;
      ELSE
        RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
      END IF;
    END;
  END;
END
$func$;

COMMENT ON FUNCTION public.create_admin_account(uuid,text,uuid,text) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.create_admin_account(uuid,text,uuid,text) TO authenticated;

-- 2) change_admin_account_role
CREATE OR REPLACE FUNCTION public.change_admin_account_role(
  p_target_user_id uuid,
  p_new_role text,
  p_expected_updated_at timestamptz,
  p_request_id uuid,
  p_reason text default null
)
RETURNS TABLE (action_id uuid, target_user_id uuid, role text, status text, updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_actor uuid := (select auth.uid());
  v_row record;
  v_fingerprint text;
  v_existing_action public.admin_account_actions%rowtype;
  v_caller_role text;
  v_caller_status text;
BEGIN
  -- NULL / required param checks
  IF p_target_user_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_target_user_id is required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_request_id is required';
  END IF;
  IF p_new_role IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_new_role is required';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_expected_updated_at is required';
  END IF;
  -- Acquire advisory lock, then perform authoritative caller re-validation and idempotency check.
  PERFORM public.lock_admin_account_write();

  -- Re-validate caller admin_accounts row after acquiring lock
  SELECT a.role, a.status INTO v_caller_role, v_caller_status FROM public.admin_accounts a WHERE a.user_id = v_actor;
  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_status IS NULL THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF v_caller_role <> 'super_admin' OR v_caller_status <> 'active' THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  -- 3. request_id existing action
  v_fingerprint := public._admin_request_fingerprint(v_actor, 'role_changed', p_target_user_id, p_new_role, NULL, p_expected_updated_at, p_reason);
  SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_action.request_fingerprint = v_fingerprint THEN
      RETURN QUERY
      SELECT
        aa.id,
        aa.target_user_id,
        (aa.target_snapshot->>'role')::text,
        (aa.target_snapshot->>'status')::text,
        CASE WHEN aa.new_updated_at IS NOT NULL THEN aa.new_updated_at ELSE (aa.target_snapshot->>'updated_at')::timestamptz END
      FROM public.admin_account_actions aa
      WHERE aa.request_id = p_request_id;
      RETURN;
    ELSE
      RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    END IF;
  END IF;

  -- 4. target existence & lock
  SELECT * INTO v_row FROM public.admin_accounts WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE USING ERRCODE = 'A1005', MESSAGE = 'ADMIN_ACCOUNT_NOT_FOUND';
  END IF;

  -- 5. input & business rules
  IF v_actor = p_target_user_id THEN
    RAISE USING ERRCODE = 'A1004', MESSAGE = 'ADMIN_ACCOUNT_SELF_MODIFICATION_FORBIDDEN';
  END IF;
  IF lower(coalesce(p_new_role,'')) NOT IN ('super_admin','admin','moderator') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid role';
  END IF;
  IF v_row.status = 'revoked' THEN
    RAISE USING ERRCODE = 'A1003', MESSAGE = 'ADMIN_ACCOUNT_TARGET_REVOKED';
  END IF;

  -- 6. stale check
  IF p_expected_updated_at IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'expected_updated_at required';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE USING ERRCODE = 'A1001', MESSAGE = 'ADMIN_ACCOUNT_STALE_VERSION';
  END IF;

  -- 7. identical value check (policy 9)
  IF v_row.role = p_new_role THEN
    RAISE USING ERRCODE = 'A1007', MESSAGE = 'ADMIN_ACCOUNT_NO_CHANGE';
  END IF;

  -- 8. last active super_admin check
  IF v_row.role = 'super_admin' THEN
    PERFORM 1 FROM public.admin_accounts a WHERE a.role = 'super_admin' AND a.status = 'active';
    -- count
    IF (SELECT count(*) FROM public.admin_accounts a WHERE a.role = 'super_admin' AND a.status = 'active') < 2 THEN
      RAISE USING ERRCODE = 'A1006', MESSAGE = 'ADMIN_ACCOUNT_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- 8. apply update (leave updated_at to trigger)
  UPDATE public.admin_accounts SET role = p_new_role WHERE user_id = p_target_user_id RETURNING updated_at INTO v_row.updated_at;

  -- 9. audit insert (handle race on UNIQUE(request_id))
  BEGIN
    INSERT INTO public.admin_account_actions (request_id, request_fingerprint, target_user_id, actor_user_id, action_type, previous_role, new_role, previous_status, new_status, previous_updated_at, new_updated_at, reason, target_snapshot, actor_snapshot)
    VALUES (
      p_request_id,
      v_fingerprint,
      p_target_user_id,
      v_actor,
      'role_changed',
      v_row.role, p_new_role,
      v_row.status, v_row.status,
      p_expected_updated_at, v_row.updated_at,
      public._admin_canonical_reason(p_reason),
      jsonb_build_object('user_id', v_row.user_id::text, 'email', (SELECT u.email FROM auth.users u WHERE u.id = v_row.user_id), 'nickname', (SELECT p.nickname FROM public.profiles p WHERE p.id = v_row.user_id), 'role', p_new_role, 'status', v_row.status, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'suspended_at', v_row.suspended_at, 'revoked_at', v_row.revoked_at),
      jsonb_build_object('user_id', coalesce((SELECT u.id FROM auth.users u WHERE u.id = v_actor)::text, NULL), 'email', (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'nickname', (SELECT p.nickname FROM public.profiles p WHERE p.id = v_actor), 'role', (SELECT a.role FROM public.admin_accounts a WHERE a.user_id = v_actor), 'status', (SELECT a.status FROM public.admin_accounts a WHERE a.user_id = v_actor))
    ) RETURNING id INTO action_id;

    target_user_id := p_target_user_id;
    role := p_new_role;
    status := v_row.status;
    updated_at := v_row.updated_at;
    RETURN NEXT;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
    IF v_existing_action.request_fingerprint = v_fingerprint THEN
      action_id := v_existing_action.id;
      target_user_id := v_existing_action.target_user_id::uuid;
      role := (v_existing_action.target_snapshot->>'role')::text;
      status := (v_existing_action.target_snapshot->>'status')::text;
      updated_at := COALESCE(v_existing_action.new_updated_at, (v_existing_action.target_snapshot->>'updated_at')::timestamptz);
      RETURN NEXT;
    ELSE
      RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    END IF;
  END;
END
$func$;

COMMENT ON FUNCTION public.change_admin_account_role(uuid,text,timestamptz,uuid,text) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.change_admin_account_role(uuid,text,timestamptz,uuid,text) TO authenticated;

-- 3) change_admin_account_status
CREATE OR REPLACE FUNCTION public.change_admin_account_status(
  p_target_user_id uuid,
  p_new_status text,
  p_expected_updated_at timestamptz,
  p_request_id uuid,
  p_reason text default null
)
RETURNS TABLE (action_id uuid, target_user_id uuid, role text, status text, updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_actor uuid := (select auth.uid());
  v_row record;
  v_fingerprint text;
  v_new_updated_at timestamptz;
  v_existing_action public.admin_account_actions%rowtype;
  v_caller_role text;
  v_caller_status text;
BEGIN
  -- NULL / required param checks
  IF p_target_user_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_target_user_id is required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_request_id is required';
  END IF;
  IF p_new_status IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_new_status is required';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_expected_updated_at is required';
  END IF;
  -- Acquire advisory lock, then perform authoritative caller re-validation and idempotency check.
  PERFORM public.lock_admin_account_write();

  -- Re-validate caller admin_accounts row after acquiring lock
  SELECT a.role, a.status INTO v_caller_role, v_caller_status FROM public.admin_accounts a WHERE a.user_id = v_actor;
  IF NOT FOUND OR v_caller_role IS NULL OR v_caller_status IS NULL THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF v_caller_role <> 'super_admin' OR v_caller_status <> 'active' THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;
  IF NOT coalesce(public.has_admin_permission('admin_accounts_manage'), false) THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Insufficient admin permission';
  END IF;

  -- 3. request_id check
  v_fingerprint := public._admin_request_fingerprint(v_actor, p_new_status, p_target_user_id, NULL, p_new_status, p_expected_updated_at, p_reason);
  SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing_action.request_fingerprint = v_fingerprint THEN
      RETURN QUERY
      SELECT
        aa.id,
        aa.target_user_id,
        (aa.target_snapshot->>'role')::text,
        (aa.target_snapshot->>'status')::text,
        CASE WHEN aa.new_updated_at IS NOT NULL THEN aa.new_updated_at ELSE (aa.target_snapshot->>'updated_at')::timestamptz END
      FROM public.admin_account_actions aa
      WHERE aa.request_id = p_request_id;
      RETURN;
    ELSE
      RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    END IF;
  END IF;

  -- 4. target existence and lock
  SELECT * INTO v_row FROM public.admin_accounts WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE USING ERRCODE = 'A1005', MESSAGE = 'ADMIN_ACCOUNT_NOT_FOUND';
  END IF;

  -- 5. input & rules
  IF v_actor = p_target_user_id THEN
    RAISE USING ERRCODE = 'A1004', MESSAGE = 'ADMIN_ACCOUNT_SELF_MODIFICATION_FORBIDDEN';
  END IF;
  IF lower(coalesce(p_new_status,'')) NOT IN ('active','suspended','revoked') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid status';
  END IF;
  IF v_row.status = 'revoked' THEN
    RAISE USING ERRCODE = 'A1003', MESSAGE = 'ADMIN_ACCOUNT_TARGET_REVOKED';
  END IF;

  -- 6. stale
  IF p_expected_updated_at IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'expected_updated_at required';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE USING ERRCODE = 'A1001', MESSAGE = 'ADMIN_ACCOUNT_STALE_VERSION';
  END IF;

  -- 7. identical value check (policy 9)
  IF v_row.status = p_new_status THEN
    RAISE USING ERRCODE = 'A1007', MESSAGE = 'ADMIN_ACCOUNT_NO_CHANGE';
  END IF;

  -- 7. last active super_admin check
  IF v_row.role = 'super_admin' AND v_row.status = 'active' AND p_new_status <> 'active' THEN
    IF (SELECT count(*) FROM public.admin_accounts a WHERE a.role = 'super_admin' AND a.status = 'active') < 2 THEN
      RAISE USING ERRCODE = 'A1006', MESSAGE = 'ADMIN_ACCOUNT_LAST_SUPER_ADMIN';
    END IF;
  END IF;

  -- 8. apply update and manage timestamps
  IF p_new_status = 'active' THEN
    UPDATE public.admin_accounts SET status = 'active', suspended_at = NULL, revoked_at = NULL WHERE user_id = p_target_user_id RETURNING updated_at INTO v_new_updated_at;
  ELSIF p_new_status = 'suspended' THEN
    UPDATE public.admin_accounts SET status = 'suspended', suspended_at = now(), revoked_at = NULL WHERE user_id = p_target_user_id RETURNING updated_at INTO v_new_updated_at;
  ELSIF p_new_status = 'revoked' THEN
    UPDATE public.admin_accounts SET status = 'revoked', revoked_at = now(), suspended_at = NULL WHERE user_id = p_target_user_id RETURNING updated_at INTO v_new_updated_at;
  END IF;

  -- 9. audit insert (handle UNIQUE(request_id) race)
  BEGIN
    INSERT INTO public.admin_account_actions (request_id, request_fingerprint, target_user_id, actor_user_id, action_type, previous_role, new_role, previous_status, new_status, previous_updated_at, new_updated_at, reason, target_snapshot, actor_snapshot)
    VALUES (
      p_request_id,
      v_fingerprint,
      p_target_user_id,
      v_actor,
      CASE WHEN p_new_status = 'suspended' THEN 'suspended' WHEN p_new_status = 'active' THEN 'reactivated' ELSE 'revoked' END,
      v_row.role, v_row.role,
      v_row.status, p_new_status,
      p_expected_updated_at, v_new_updated_at,
      public._admin_canonical_reason(p_reason),
      jsonb_build_object('user_id', v_row.user_id::text, 'email', (SELECT u.email FROM auth.users u WHERE u.id = v_row.user_id), 'nickname', (SELECT p.nickname FROM public.profiles p WHERE p.id = v_row.user_id), 'role', v_row.role, 'status', v_row.status, 'created_at', v_row.created_at, 'updated_at', v_row.updated_at, 'suspended_at', v_row.suspended_at, 'revoked_at', v_row.revoked_at),
      jsonb_build_object('user_id', coalesce((SELECT u.id FROM auth.users u WHERE u.id = v_actor)::text, NULL), 'email', (SELECT u.email FROM auth.users u WHERE u.id = v_actor), 'nickname', (SELECT p.nickname FROM public.profiles p WHERE p.id = v_actor), 'role', (SELECT a.role FROM public.admin_accounts a WHERE a.user_id = v_actor), 'status', (SELECT a.status FROM public.admin_accounts a WHERE a.user_id = v_actor))
    ) RETURNING id INTO action_id;

    target_user_id := p_target_user_id;
    role := v_row.role;
    status := p_new_status;
    updated_at := v_new_updated_at;
    RETURN NEXT;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing_action FROM public.admin_account_actions WHERE request_id = p_request_id;
    IF v_existing_action.request_fingerprint = v_fingerprint THEN
      action_id := v_existing_action.id;
      target_user_id := v_existing_action.target_user_id::uuid;
      role := (v_existing_action.target_snapshot->>'role')::text;
      status := (v_existing_action.target_snapshot->>'status')::text;
      updated_at := COALESCE(v_existing_action.new_updated_at, (v_existing_action.target_snapshot->>'updated_at')::timestamptz);
      RETURN NEXT;
    ELSE
      RAISE USING ERRCODE = 'A1002', MESSAGE = 'ADMIN_ACCOUNT_REQUEST_ID_CONFLICT';
    END IF;
  END;
  RETURN;
END
$func$;

COMMENT ON FUNCTION public.change_admin_account_status(uuid,text,timestamptz,uuid,text) IS 'commatch_admin_account_management_v1';
GRANT EXECUTE ON FUNCTION public.change_admin_account_status(uuid,text,timestamptz,uuid,text) TO authenticated;

-- Final validation: ensure no direct grants to browser roles remain
REVOKE ALL ON FUNCTION public.lock_admin_account_write() FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._admin_canonical_reason(text) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._admin_request_fingerprint(uuid,text,uuid,text,text,timestamptz,text) FROM public, anon, authenticated, service_role;

commit;

-- End of migration file (do not execute in this workspace). Review and test in staging before applying to production.
