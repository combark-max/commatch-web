-- Migration: append-only user consent events and self-service RPCs
-- NOTE: This file is a deployment / review artifact. Do NOT execute automatically.
-- Marker: commatch_user_consents_v1

begin;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users does not exist';
  END IF;
END
$preflight$;

CREATE TABLE public.user_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent_type text NOT NULL,
  action text NOT NULL,
  document_version text NOT NULL,
  source text NOT NULL,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT user_consent_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT user_consent_events_consent_type_check
    CHECK (consent_type IN ('terms', 'privacy', 'sensitive_profile', 'adult_confirmation')),
  CONSTRAINT user_consent_events_action_check
    CHECK (action IN ('accepted', 'withdrawn')),
  CONSTRAINT user_consent_events_document_version_check
    CHECK (
      document_version = pg_catalog.btrim(document_version)
      AND pg_catalog.char_length(document_version) BETWEEN 1 AND 100
      AND document_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'
    ),
  CONSTRAINT user_consent_events_source_check
    CHECK (source IN ('email_verification', 'profile_create', 'profile_edit', 'settings')),
  CONSTRAINT user_consent_events_user_request_key
    UNIQUE (user_id, request_id)
);

COMMENT ON TABLE public.user_consent_events IS
  'commatch_user_consents_v1: append-only consent audit events; current status is derived from the latest event';
COMMENT ON COLUMN public.user_consent_events.document_version IS
  'Caller-supplied legal document version identifier; no legal version is fixed by this migration';

CREATE INDEX user_consent_events_user_type_latest_idx
  ON public.user_consent_events (user_id, consent_type, created_at DESC, id DESC);

ALTER TABLE public.user_consent_events ENABLE ROW LEVEL SECURITY;

-- No browser policy is intentional. The SECURITY DEFINER RPCs below are the boundary.
REVOKE ALL ON TABLE public.user_consent_events FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_my_consent_event(
  p_consent_type text,
  p_action text,
  p_document_version text,
  p_source text,
  p_request_id uuid
)
RETURNS TABLE (
  event_id uuid,
  user_id uuid,
  consent_type text,
  action text,
  document_version text,
  source text,
  request_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_event public.user_consent_events%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'p_request_id is required';
  END IF;
  IF p_consent_type IS NULL OR p_consent_type NOT IN (
    'terms', 'privacy', 'sensitive_profile', 'adult_confirmation'
  ) THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid consent_type';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('accepted', 'withdrawn') THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid action';
  END IF;
  IF p_source IS NULL OR p_source NOT IN (
    'email_verification', 'profile_create', 'profile_edit', 'settings'
  ) THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid source';
  END IF;
  IF p_document_version IS NULL
     OR p_document_version <> pg_catalog.btrim(p_document_version)
     OR pg_catalog.char_length(p_document_version) NOT BETWEEN 1 AND 100
     OR p_document_version !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$' THEN
    RAISE USING ERRCODE = '22023', MESSAGE = 'Invalid document_version';
  END IF;

  -- ON CONFLICT is race-safe: concurrent retries wait for the winning row.
  INSERT INTO public.user_consent_events (
    user_id, consent_type, action, document_version, source, request_id, created_at
  )
  VALUES (
    v_user_id, p_consent_type, p_action, p_document_version, p_source, p_request_id,
    pg_catalog.clock_timestamp()
  )
  ON CONFLICT ON CONSTRAINT user_consent_events_user_request_key DO NOTHING
  RETURNING * INTO v_event;

  IF NOT FOUND THEN
    SELECT e.*
      INTO STRICT v_event
      FROM public.user_consent_events AS e
     WHERE e.user_id = v_user_id
       AND e.request_id = p_request_id;

    IF v_event.consent_type IS DISTINCT FROM p_consent_type
       OR v_event.action IS DISTINCT FROM p_action
       OR v_event.document_version IS DISTINCT FROM p_document_version
       OR v_event.source IS DISTINCT FROM p_source THEN
      RAISE USING ERRCODE = 'C1001', MESSAGE = 'CONSENT_REQUEST_ID_CONFLICT';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_event.id,
    v_event.user_id,
    v_event.consent_type,
    v_event.action,
    v_event.document_version,
    v_event.source,
    v_event.request_id,
    v_event.created_at;
END
$func$;

COMMENT ON FUNCTION public.record_my_consent_event(text, text, text, text, uuid) IS
  'commatch_user_consents_v1: records one authenticated caller consent event with per-user request idempotency';

CREATE OR REPLACE FUNCTION public.get_my_consent_status()
RETURNS TABLE (
  consent_type text,
  latest_action text,
  document_version text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (e.consent_type)
    e.consent_type,
    e.action,
    e.document_version,
    e.created_at
  FROM public.user_consent_events AS e
  WHERE e.user_id = v_user_id
  ORDER BY e.consent_type, e.created_at DESC, e.id DESC;
END
$func$;

COMMENT ON FUNCTION public.get_my_consent_status() IS
  'commatch_user_consents_v1: returns the authenticated caller latest event for each consent type';

-- Function EXECUTE defaults to PUBLIC, so establish the complete ACL explicitly.
REVOKE ALL ON FUNCTION public.record_my_consent_event(text, text, text, text, uuid)
  FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_consent_status()
  FROM public, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.record_my_consent_event(text, text, text, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_consent_status()
  TO authenticated;

commit;
