-- 프로필에 nullable 결혼 이력 컬럼과 허용값 CHECK 제약을 추가합니다.
-- 기존 행은 백필하지 않으며 DEFAULT, NOT NULL, RLS, 권한은 변경하지 않습니다.

begin;

do $column_validation$
declare
  existing_data_type text;
  existing_is_nullable text;
  existing_column_default text;
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist';
  end if;

  select data_type, is_nullable, column_default
  into existing_data_type, existing_is_nullable, existing_column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'marriage_history';

  if not found then
    alter table public.profiles
    add column marriage_history text;
  elsif existing_data_type <> 'text'
     or existing_is_nullable <> 'YES'
     or existing_column_default is not null then
    raise exception 'public.profiles.marriage_history has an unexpected definition';
  end if;
end
$column_validation$;

do $constraint_validation$
declare
  existing_constraint_type "char";
  existing_constraint_is_validated boolean;
  existing_constraint_is_no_inherit boolean;
  normalized_constraint_expression text;
begin
  select
    constraint_info.contype,
    constraint_info.convalidated,
    constraint_info.connoinherit,
    pg_catalog.regexp_replace(
      pg_catalog.lower(
        pg_catalog.pg_get_expr(
          constraint_info.conbin,
          constraint_info.conrelid,
          false
        )
      ),
      '[[:space:]()]',
      '',
      'g'
    )
  into
    existing_constraint_type,
    existing_constraint_is_validated,
    existing_constraint_is_no_inherit,
    normalized_constraint_expression
  from pg_catalog.pg_constraint as constraint_info
  where constraint_info.conrelid = 'public.profiles'::pg_catalog.regclass
    and constraint_info.conname = 'profiles_marriage_history_check';

  if not found then
    alter table public.profiles
    add constraint profiles_marriage_history_check
    check (
      marriage_history is null
      or marriage_history in ('first_marriage', 'remarriage')
    );
  elsif existing_constraint_type <> 'c'
     or not existing_constraint_is_validated
     or existing_constraint_is_no_inherit
     or normalized_constraint_expression
       <> 'marriage_historyisnullormarriage_history=anyarray[''first_marriage''::text,''remarriage''::text]' then
    raise exception 'public.profiles.profiles_marriage_history_check has an unexpected definition';
  end if;
end
$constraint_validation$;

commit;
