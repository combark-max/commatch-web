-- ComMatch unmatched sent-like cancellation.
--
-- Apply after supabase/notifications.sql. This migration leaves the existing
-- like, match, notification, and chat writers unchanged. It makes the RPC
-- below the only authenticated path for deleting likes.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.likes') is null
     or pg_catalog.to_regclass('public.matches') is null
     or pg_catalog.to_regprocedure('public.is_member_service_allowed()') is null
     or pg_catalog.to_regprocedure(
       'public.lock_member_service_write_pair(uuid,uuid)'
     ) is null then
    raise exception 'Required ComMatch likes, matching, or member access dependencies are missing';
  end if;
end
$preflight$;

-- A direct DELETE cannot share the pair lock used by the reciprocal-like
-- writer. Close that bypass so matched likes are protected by the RPC below.
revoke delete on table public.likes from public, anon, authenticated, service_role;
drop policy if exists "Users can delete own likes" on public.likes;

create or replace function public.cancel_member_like(target_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not coalesce(public.is_member_service_allowed(), false) then
    raise exception using errcode = '42501', message = 'Member service access is not allowed';
  end if;

  if target_user_id is null then
    raise exception using errcode = '22023', message = 'Target member is required';
  end if;

  if target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'A member cannot target themselves';
  end if;

  perform public.lock_member_service_write_pair(v_user_id, target_user_id);

  -- Both active and ended matches are permanent pair history. A like that
  -- belongs to either state must be managed through the match lifecycle.
  if exists (
    select 1
    from public.matches as match_row
    where match_row.user_1_id = least(v_user_id, target_user_id)
      and match_row.user_2_id = greatest(v_user_id, target_user_id)
  ) then
    return 'already_matched';
  end if;

  delete from public.likes as like_row
  where like_row.user_id = v_user_id
    and like_row.liked_user_id = target_user_id;

  get diagnostics v_deleted_count = row_count;
  return case when v_deleted_count = 1 then 'cancelled' else 'not_liked' end;
end
$function$;

comment on function public.cancel_member_like(uuid)
  is 'Cancels only an unmatched like sent by auth.uid(); matched pair history is immutable';

alter function public.cancel_member_like(uuid) owner to postgres;
revoke all on function public.cancel_member_like(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_member_like(uuid) to authenticated;

do $contract_validation$
declare
  v_function_oid oid := pg_catalog.to_regprocedure(
    'public.cancel_member_like(uuid)'
  );
begin
  if v_function_oid is null
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_roles as owner_role
         on owner_role.oid = function_info.proowner
       join pg_catalog.pg_language as language_info
         on language_info.oid = function_info.prolang
       where function_info.oid = v_function_oid
         and owner_role.rolname = 'postgres'
         and language_info.lanname = 'plpgsql'
         and function_info.pronargs = 1
         and function_info.proargtypes = '2950'::pg_catalog.oidvector
         and function_info.prorettype = 'pg_catalog.text'::pg_catalog.regtype
         and function_info.prosecdef
         and function_info.provolatile = 'v'
         and exists (
           select 1
           from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
           where function_config.setting = 'search_path=""'
         )
     ) then
    raise exception 'public.cancel_member_like(uuid) has an incompatible definition';
  end if;

  if pg_catalog.has_function_privilege('public', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', v_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'public.cancel_member_like(uuid) privileges differ from the approved definition';
  end if;

  if pg_catalog.has_table_privilege('public', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.likes', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.likes', 'DELETE') then
    raise exception 'Direct likes DELETE remains granted to an API role';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'public.likes'::pg_catalog.regclass
      and policy_info.polcmd = 'd'
  ) then
    raise exception 'A direct likes DELETE policy remains installed';
  end if;
end
$contract_validation$;

commit;

select 'PASS cancel_member_like installation and contract validation' as migration_result;
