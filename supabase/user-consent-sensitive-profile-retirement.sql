-- ComMatch sensitive-profile consent retirement.
--
-- Keep the legacy event type readable and schema-valid, but reject every new
-- sensitive_profile event until an explicit sensitive-data feature is approved.

begin;

do $preflight$
declare
  v_record_oid oid := pg_catalog.to_regprocedure(
    'public.record_my_consent_event(text,text,text,text,uuid)'
  );
  v_status_oid oid := pg_catalog.to_regprocedure('public.get_my_consent_status()');
  v_record_definition text;
  v_status_definition text;
  v_consent_type_check text;
begin
  if pg_catalog.to_regclass('public.user_consent_events') is null then
    raise exception 'public.user_consent_events does not exist';
  end if;

  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_expr(
      constraint_info.conbin,
      constraint_info.conrelid,
      false
    )),
    '[[:space:]()]',
    '',
    'g'
  )
  into v_consent_type_check
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.user_consent_events'::pg_catalog.regclass
    and constraint_info.conname = 'user_consent_events_consent_type_check'
    and constraint_info.contype = 'c'
    and constraint_info.convalidated
    and not constraint_info.connoinherit;

  if v_consent_type_check is distinct from
    'consent_type=anyarray[''terms''::text,''privacy''::text,''sensitive_profile''::text,''adult_confirmation''::text]' then
    raise exception 'The consent type CHECK does not preserve all four event types';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_namespace as namespace_info
      on namespace_info.oid = function_info.pronamespace
    where namespace_info.nspname = 'public'
      and function_info.proname in ('record_my_consent_event', 'get_my_consent_status')
  ) <> 2 then
    raise exception 'A consent RPC is missing or overloaded';
  end if;

  if v_record_oid is null or v_status_oid is null then
    raise exception 'The approved consent RPC signatures are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_record_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prokind = 'f'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.pronargs = 5
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.proargtypes = '25 25 25 25 2950'::pg_catalog.oidvector
      and function_info.proargnames[1:5] = array[
        'p_consent_type',
        'p_action',
        'p_document_version',
        'p_source',
        'p_request_id'
      ]::text[]
      and function_info.proconfig <@ array['search_path=', 'search_path=""']::text[]
      and pg_catalog.cardinality(function_info.proconfig) = 1
  ) or pg_catalog.pg_get_function_result(v_record_oid) <>
    'TABLE(event_id uuid, user_id uuid, consent_type text, action text, document_version text, source text, request_id uuid, created_at timestamp with time zone)' then
    raise exception 'record_my_consent_event differs from the approved catalog contract';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_status_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prokind = 'f'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.proconfig <@ array['search_path=', 'search_path=""']::text[]
      and pg_catalog.cardinality(function_info.proconfig) = 1
  ) or pg_catalog.pg_get_function_result(v_status_oid) <>
    'TABLE(consent_type text, latest_action text, document_version text, created_at timestamp with time zone)' then
    raise exception 'get_my_consent_status differs from the approved catalog contract';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid in (v_record_oid, v_status_oid)
      and acl_info.grantee = 0::oid
      and acl_info.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_record_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_status_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_record_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_status_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_record_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_status_oid, 'EXECUTE') then
    raise exception 'Consent RPC ACL differs from the approved contract';
  end if;

  if pg_catalog.obj_description(v_record_oid, 'pg_proc') is distinct from
       'commatch_user_consents_v1: records one authenticated caller consent event with per-user request idempotency'
     or pg_catalog.obj_description(v_status_oid, 'pg_proc') is distinct from
       'commatch_user_consents_v1: returns the authenticated caller latest event for each consent type' then
    raise exception 'Consent RPC marker differs from the approved contract';
  end if;

  v_record_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_record_oid));
  v_status_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_status_oid));

  if v_record_definition !~ 'p_consent_type[[:space:]]+not[[:space:]]+in'
     or v_record_definition !~ '''sensitive_profile'''
     or v_record_definition !~ '''c1001'''
     or v_record_definition ~ 'sensitive_profile_consent_inactive' then
    raise exception 'record_my_consent_event is not the approved pre-retirement definition';
  end if;

  if v_status_definition !~ 'distinct[[:space:]]+on[[:space:]]*\(e\.consent_type\)'
     or v_status_definition !~ 'e\.created_at[[:space:]]+desc,[[:space:]]+e\.id[[:space:]]+desc' then
    raise exception 'get_my_consent_status latest-event semantics differ';
  end if;
end
$preflight$;

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
  IF p_consent_type = 'sensitive_profile' THEN
    RAISE USING
      ERRCODE = '0A000',
      MESSAGE = 'SENSITIVE_PROFILE_CONSENT_INACTIVE';
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

do $postflight$
declare
  v_record_oid oid := pg_catalog.to_regprocedure(
    'public.record_my_consent_event(text,text,text,text,uuid)'
  );
  v_status_oid oid := pg_catalog.to_regprocedure('public.get_my_consent_status()');
  v_record_definition text;
  v_status_definition text;
  v_consent_type_check text;
  v_guard_position integer;
  v_insert_position integer;
begin
  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_expr(
      constraint_info.conbin,
      constraint_info.conrelid,
      false
    )),
    '[[:space:]()]',
    '',
    'g'
  )
  into v_consent_type_check
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.user_consent_events'::pg_catalog.regclass
    and constraint_info.conname = 'user_consent_events_consent_type_check'
    and constraint_info.contype = 'c'
    and constraint_info.convalidated
    and not constraint_info.connoinherit;

  if v_consent_type_check is distinct from
    'consent_type=anyarray[''terms''::text,''privacy''::text,''sensitive_profile''::text,''adult_confirmation''::text]' then
    raise exception 'The consent type CHECK changed during retirement';
  end if;

  if v_record_oid is null or v_status_oid is null then
    raise exception 'A consent RPC is missing after retirement';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_record_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prokind = 'f'
      and function_info.prosecdef
      and function_info.provolatile = 'v'
      and function_info.pronargs = 5
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.proargtypes = '25 25 25 25 2950'::pg_catalog.oidvector
      and function_info.proargnames[1:5] = array[
        'p_consent_type',
        'p_action',
        'p_document_version',
        'p_source',
        'p_request_id'
      ]::text[]
      and function_info.proconfig <@ array['search_path=', 'search_path=""']::text[]
      and pg_catalog.cardinality(function_info.proconfig) = 1
  ) or pg_catalog.pg_get_function_result(v_record_oid) <>
    'TABLE(event_id uuid, user_id uuid, consent_type text, action text, document_version text, source text, request_id uuid, created_at timestamp with time zone)' then
    raise exception 'record_my_consent_event catalog contract changed during retirement';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    join pg_catalog.pg_roles as owner_role on owner_role.oid = function_info.proowner
    join pg_catalog.pg_language as language_info on language_info.oid = function_info.prolang
    where function_info.oid = v_status_oid
      and owner_role.rolname = 'postgres'
      and language_info.lanname = 'plpgsql'
      and function_info.prokind = 'f'
      and function_info.prosecdef
      and function_info.provolatile = 's'
      and function_info.pronargs = 0
      and function_info.pronargdefaults = 0
      and function_info.proretset
      and function_info.prorettype = 'pg_catalog.record'::pg_catalog.regtype
      and function_info.proconfig <@ array['search_path=', 'search_path=""']::text[]
      and pg_catalog.cardinality(function_info.proconfig) = 1
  ) or pg_catalog.pg_get_function_result(v_status_oid) <>
    'TABLE(consent_type text, latest_action text, document_version text, created_at timestamp with time zone)' then
    raise exception 'get_my_consent_status catalog contract changed during retirement';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(function_info.proacl, pg_catalog.acldefault('f', function_info.proowner))
    ) as acl_info
    where function_info.oid in (v_record_oid, v_status_oid)
      and acl_info.grantee = 0::oid
      and acl_info.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege('anon', v_record_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_status_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_record_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_status_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_record_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_status_oid, 'EXECUTE') then
    raise exception 'Consent RPC ACL changed during retirement';
  end if;

  if pg_catalog.obj_description(v_record_oid, 'pg_proc') is distinct from
       'commatch_user_consents_v1: records one authenticated caller consent event with per-user request idempotency'
     or pg_catalog.obj_description(v_status_oid, 'pg_proc') is distinct from
       'commatch_user_consents_v1: returns the authenticated caller latest event for each consent type' then
    raise exception 'Consent RPC marker changed during retirement';
  end if;

  v_record_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_record_oid));
  v_status_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_status_oid));
  v_guard_position := pg_catalog.strpos(
    v_record_definition,
    'sensitive_profile_consent_inactive'
  );
  v_insert_position := pg_catalog.strpos(
    v_record_definition,
    'insert into public.user_consent_events'
  );

  if v_record_definition !~ 'p_consent_type[[:space:]]*=[[:space:]]*''sensitive_profile'''
     or v_record_definition !~ '''0a000'''
     or v_record_definition !~ 'sensitive_profile_consent_inactive'
     or v_record_definition !~ '''c1001'''
     or v_guard_position <= 0
     or v_insert_position <= 0
     or v_guard_position >= v_insert_position then
    raise exception 'The sensitive-profile recording guard was not installed safely';
  end if;

  if v_status_definition !~ 'distinct[[:space:]]+on[[:space:]]*\(e\.consent_type\)'
     or v_status_definition !~ 'e\.created_at[[:space:]]+desc,[[:space:]]+e\.id[[:space:]]+desc' then
    raise exception 'get_my_consent_status behavior changed during retirement';
  end if;
end
$postflight$;

commit;
