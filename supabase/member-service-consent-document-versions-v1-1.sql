-- Migration: require the v1.1 terms and privacy consent documents.
-- Run after supabase/member-adult-age-enforcement.sql.
-- Marker: commatch_member_service_consent_document_versions_v1_1

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.user_consent_events') is null then
    raise exception 'public.user_consent_events does not exist';
  end if;

  if pg_catalog.to_regprocedure(
       'public.has_completed_required_member_consents()'
     ) is null then
    raise exception 'public.has_completed_required_member_consents() does not exist';
  end if;
end
$preflight$;

create or replace function public.has_completed_required_member_consents()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with latest_required_consent as (
    select distinct on (consent_event.consent_type)
      consent_event.consent_type,
      consent_event.action,
      consent_event.document_version
    from public.user_consent_events as consent_event
    where consent_event.user_id = auth.uid()
      and consent_event.consent_type in (
        'terms', 'privacy', 'adult_confirmation'
      )
    order by
      consent_event.consent_type,
      consent_event.created_at desc,
      consent_event.id desc
  )
  select auth.uid() is not null
    and pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      latest_consent.action = 'accepted'
      and case latest_consent.consent_type
        when 'terms' then latest_consent.document_version = 'terms-v1.1'
        when 'privacy' then latest_consent.document_version = 'privacy-v1.1'
        when 'adult_confirmation' then
          latest_consent.document_version = 'adult-confirmation-v1.0'
        else false
      end
    )
  from latest_required_consent as latest_consent
$function$;

comment on function public.has_completed_required_member_consents()
  is 'Returns whether auth.uid() has accepted every current required consent document version';

alter function public.has_completed_required_member_consents() owner to postgres;
revoke all on function public.has_completed_required_member_consents()
  from public, anon, authenticated, service_role;
grant execute on function public.has_completed_required_member_consents()
  to authenticated, service_role;

do $postflight$
declare
  v_function_oid oid := 'public.has_completed_required_member_consents()'::pg_catalog.regprocedure;
  v_definition text;
begin
  select pg_catalog.lower(pg_catalog.pg_get_functiondef(v_function_oid))
  into v_definition;

  if not exists (
    select 1
    from pg_catalog.pg_proc as function_info
    where function_info.oid = v_function_oid
      and function_info.provolatile = 's'
      and function_info.prosecdef
      and function_info.proconfig = array['search_path=""']::text[]
      and pg_catalog.pg_get_userbyid(function_info.proowner) = 'postgres'
      and pg_catalog.pg_get_function_result(function_info.oid) = 'boolean'
  ) then
    raise exception 'Consent completion helper contract changed during migration';
  end if;

  if pg_catalog.strpos(v_definition, 'terms-v1.1') = 0
     or pg_catalog.strpos(v_definition, 'privacy-v1.1') = 0
     or pg_catalog.strpos(v_definition, 'adult-confirmation-v1.0') = 0
     or pg_catalog.strpos(v_definition, 'created_at desc') = 0
     or pg_catalog.strpos(v_definition, 'id desc') = 0 then
    raise exception 'Consent completion helper version or latest-event contract is incompatible';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated', v_function_oid, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_function_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', v_function_oid, 'EXECUTE'
     ) then
    raise exception 'Consent completion helper ACL is incompatible';
  end if;
end
$postflight$;

commit;
