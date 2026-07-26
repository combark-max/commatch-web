-- 결혼 가치관 컬럼과 닉네임 정규화 UNIQUE 인덱스를 추가합니다.
-- 실행 전 lower(btrim(nickname)) 기준의 기존 닉네임 중복이 없는지 확인해야 합니다.
-- 기존 프로필 값과 RLS 정책은 변경하지 않습니다.

begin;

do $$
declare
  existing_data_type text;
  existing_is_nullable text;
begin
  select data_type, is_nullable
  into existing_data_type, existing_is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'marriage_values';

  if not found then
    alter table public.profiles
    add column marriage_values text;
  elsif existing_data_type <> 'text' or existing_is_nullable <> 'YES' then
    raise exception 'public.profiles.marriage_values has an unexpected definition';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.profiles
    group by lower(btrim(nickname))
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized nicknames exist; resolve them before creating the unique index';
  end if;

  if to_regclass('public.profiles_nickname_normalized_uidx') is null then
    create unique index profiles_nickname_normalized_uidx
    on public.profiles (lower(btrim(nickname)));
  elsif not exists (
    select 1
    from pg_index as index_info
    where index_info.indexrelid = 'public.profiles_nickname_normalized_uidx'::regclass
      and index_info.indrelid = 'public.profiles'::regclass
      and index_info.indisunique
      and index_info.indpred is null
      and index_info.indnkeyatts = 1
      and regexp_replace(
        lower(pg_get_expr(index_info.indexprs, index_info.indrelid)),
        '[[:space:]]+',
        '',
        'g'
      ) = 'lower(btrim(nickname))'
  ) then
    raise exception 'public.profiles_nickname_normalized_uidx exists with an unexpected definition';
  end if;
end
$$;

commit;
