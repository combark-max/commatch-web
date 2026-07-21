-- ComMatch 비공개 계정 정보 테이블 생성 스크립트
-- 이 파일은 자동 실행되지 않으며, 사용자가 Supabase SQL Editor에서 직접 실행해야 합니다.
-- 실행 전에 Supabase Auth에 잔존 사용자가 없는지 다시 확인하세요.
-- 이 SQL은 Auth 사용자나 accounts 데이터를 자동 생성하지 않으며, 기존 데이터 backfill도 수행하지 않습니다.
-- 롤백이 필요해도 accounts 데이터가 존재한다면 테이블을 즉시 삭제하지 말고 데이터를 먼저 검토하세요.
-- service role key는 서버 전용이며 브라우저나 클라이언트 코드에 노출하면 안 됩니다.

do $$
declare
  actual_columns text[];
begin
  if to_regclass('public.accounts') is null then
    create table public.accounts (
      user_id uuid primary key,
      login_id text not null,
      name text not null,
      phone_e164 text not null,
      phone_verified_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint accounts_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade,
      constraint accounts_login_id_key unique (login_id),
      constraint accounts_phone_e164_key unique (phone_e164),
      constraint accounts_login_id_format_check
        check (login_id ~ '^[a-z0-9_]{5,20}$'),
      constraint accounts_name_format_check
        check (
          char_length(name) between 1 and 100
          and name !~ '^[[:space:]]|[[:space:]]$'
        ),
      constraint accounts_phone_e164_format_check
        check (phone_e164 ~ '^\+8210[0-9]{8}$')
    );
  else
    select array_agg(
      format('%s:%s:%s', column_name, udt_name, is_nullable)
      order by ordinal_position
    )
    into actual_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts';

    if actual_columns is distinct from array[
      'user_id:uuid:NO',
      'login_id:text:NO',
      'name:text:NO',
      'phone_e164:text:NO',
      'phone_verified_at:timestamptz:NO',
      'created_at:timestamptz:NO',
      'updated_at:timestamptz:NO'
    ]::text[] then
      raise exception 'public.accounts 구조가 예상 컬럼과 다릅니다. 기존 테이블을 확인한 후 실행하세요.';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'accounts'
        and column_name = 'created_at'
        and column_default = 'now()'
    ) or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'accounts'
        and column_name = 'updated_at'
        and column_default = 'now()'
    ) then
      raise exception 'public.accounts timestamp 기본값이 예상과 다릅니다. 기존 테이블을 확인한 후 실행하세요.';
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_pkey'
        and contype = 'p'
        and regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g') = 'PRIMARYKEY(user_id)'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_user_id_fkey'
        and contype = 'f'
        and confrelid = 'auth.users'::regclass
        and confdeltype = 'c'
        and regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g') = 'FOREIGNKEY(user_id)REFERENCESauth.users(id)ONDELETECASCADE'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_login_id_key'
        and contype = 'u'
        and regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g') = 'UNIQUE(login_id)'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_phone_e164_key'
        and contype = 'u'
        and regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g') = 'UNIQUE(phone_e164)'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_login_id_format_check'
        and contype = 'c'
        and replace(replace(regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]]+', '', 'g'), '(', ''), ')', '')
          = 'login_id~''^[a-z0-9_]{5,20}$''::text'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_name_format_check'
        and contype = 'c'
        and replace(replace(regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]]+', '', 'g'), '(', ''), ')', '')
          = 'char_lengthname>=1andchar_lengthname<=100andname!~''^[[:space:]]|[[:space:]]$''::text'
    ) or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.accounts'::regclass
        and conname = 'accounts_phone_e164_format_check'
        and contype = 'c'
        and replace(replace(regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]]+', '', 'g'), '(', ''), ')', '')
          = 'phone_e164~''^\+8210[0-9]{8}$''::text'
    ) then
      raise exception 'public.accounts 제약조건이 예상 구조와 다릅니다. 기존 테이블을 확인한 후 실행하세요.';
    end if;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.set_accounts_updated_at()') is null then
    execute $function$
      create function public.set_accounts_updated_at()
      returns trigger
      language plpgsql
      security invoker
      as $body$
      begin
        new.updated_at = pg_catalog.now();
        return new;
      end;
      $body$
    $function$;
  elsif not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    join pg_language as l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.proname = 'set_accounts_updated_at'
      and p.pronargs = 0
      and p.prorettype = 'pg_catalog.trigger'::regtype
      and l.lanname = 'plpgsql'
      and not p.prosecdef
      and p.proconfig is null
      and regexp_replace(lower(p.prosrc), '[[:space:]]+', '', 'g')
        = 'beginnew.updated_at=pg_catalog.now();returnnew;end;'
  ) then
    raise exception 'public.set_accounts_updated_at() 함수가 예상 정의와 다릅니다. 기존 함수를 확인한 후 실행하세요.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.accounts'::regclass
      and tgname = 'accounts_set_updated_at'
      and not tgisinternal
  ) then
    execute 'create trigger accounts_set_updated_at
      before update on public.accounts
      for each row
      execute function public.set_accounts_updated_at()';
  elsif not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.accounts'::regclass
      and tgname = 'accounts_set_updated_at'
      and not tgisinternal
      and tgfoid = 'public.set_accounts_updated_at()'::regprocedure
      and tgtype = 19
      and tgenabled = 'O'
      and tgnargs = 0
  ) then
    raise exception 'accounts_set_updated_at 트리거가 예상 정의와 다릅니다. 기존 트리거를 확인한 후 실행하세요.';
  end if;
end
$$;

alter table public.accounts enable row level security;

do $$
declare
  normalized_qualifier text;
begin
  if not exists (
    select 1
    from pg_policy
    where polrelid = 'public.accounts'::regclass
      and polname = 'accounts_select_own'
  ) then
    execute 'create policy "accounts_select_own"
      on public.accounts
      for select
      to authenticated
      using ((select auth.uid()) = user_id)';
  else
    select replace(
      replace(
        regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)), '[[:space:]]+', '', 'g'),
        '(',
        ''
      ),
      ')',
      ''
    )
    into normalized_qualifier
    from pg_policy as p
    where p.polrelid = 'public.accounts'::regclass
      and p.polname = 'accounts_select_own';

    if not exists (
      select 1
      from pg_policy as p
      where p.polrelid = 'public.accounts'::regclass
        and p.polname = 'accounts_select_own'
        and p.polpermissive
        and p.polcmd = 'r'
        and p.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
        and p.polwithcheck is null
    ) or normalized_qualifier not in (
      'selectauth.uid=user_id',
      'selectauth.uidasuid=user_id'
    ) then
      raise exception 'accounts_select_own 정책이 예상 정의와 다릅니다. 기존 정책을 확인한 후 실행하세요.';
    end if;
  end if;
end
$$;

revoke all on table public.accounts from public, anon, authenticated, service_role;
grant select on table public.accounts to authenticated;
grant select, insert, update, delete on table public.accounts to service_role;

comment on table public.accounts is 'ComMatch 비공개 계정 정보. 클라이언트는 본인 행 조회만 가능하며 변경은 서버 전용이다.';
comment on column public.accounts.login_id is '소문자로 정규화된 5~20자 로그인 아이디';
comment on column public.accounts.phone_e164 is '확인된 한국 010 휴대폰 번호의 E.164 형식';

-- 롤백 검토용 참고 사항(자동 실행 금지):
-- 데이터가 없고 의존 객체를 확인한 경우에만 trigger, function, table 순으로 제거하세요.
-- public.accounts 삭제는 저장된 계정 정보를 영구 삭제하므로 실제 데이터가 있으면 실행하면 안 됩니다.
