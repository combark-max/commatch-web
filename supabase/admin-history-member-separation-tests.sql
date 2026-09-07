-- Run only against a disposable/local database after admin-history-member-separation.sql.
begin;

do $contract$
declare
  v_definition text;
  v_signature text;
begin
  if pg_catalog.to_regprocedure('public.is_non_admin_member_account(uuid)') is null then
    raise exception 'FAIL common administrator-history helper is missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.is_non_admin_member_account(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition !~ 'public.admin_accounts'
     or v_definition ~ 'admin_account.status[[:space:]]*=' then
    raise exception 'FAIL helper does not cover every administrator-history status';
  end if;

  foreach v_signature in array array[
    'public.get_my_member_access()',
    'public.get_my_favorite_members()',
    'public.get_my_favorite_members_with_likes()',
    'public.get_received_favorites()',
    'public.get_received_likes()',
    'public.get_my_matches()',
    'public.get_my_match_summary()',
    'public.get_match_messages(uuid)'
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::pg_catalog.regprocedure)
    into v_definition;
    if v_definition !~ 'is_non_admin_member_account' then
      raise exception 'FAIL % lacks the administrator-history guard', v_signature;
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger as trigger_info
    where trigger_info.tgname in (
      'favorites_non_admin_member_relationship',
      'likes_non_admin_member_relationship',
      'matches_non_admin_member_relationship',
      'messages_non_admin_member_relationship'
    ) and not trigger_info.tgisinternal
  ) <> 4 then
    raise exception 'FAIL relationship write guards differ';
  end if;

  raise notice 'PASS administrator-history access, relationship, and preservation contracts';
end
$contract$;

rollback;
