import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/advanced-search-suspension-corrective.sql', import.meta.url),
  'utf8',
);

test('advanced search excludes visible members whose suspension is still active', () => {
  assert.match(
    migration,
    /restriction\.profile_visibility = 'hidden'[\s\S]*or \([\s\S]*restriction\.account_status = 'suspended'[\s\S]*restriction\.suspended_until is null[\s\S]*or restriction\.suspended_until > pg_catalog\.now\(\)/,
  );
});

test('expired suspensions remain searchable', () => {
  assert.doesNotMatch(migration, /restriction\.suspended_until\s*(?:<|<=)\s*pg_catalog\.now\(\)/);
  assert.doesNotMatch(migration, /restriction\.account_status = 'suspended'\s*\)/);
});

test('hidden members remain excluded and ordinary active members are not broadly excluded', () => {
  assert.match(migration, /restriction\.profile_visibility = 'hidden'/);
  assert.doesNotMatch(migration, /restriction\.account_status\s*(?:<>|!=)\s*'active'/);
});

test('member access, Premium, opposite-gender, and administrator-history guards are preserved', () => {
  assert.match(migration, /public\.is_member_service_allowed\(\)/);
  assert.match(migration, /public\.has_premium_feature\('advanced_member_search'\)/);
  assert.match(migration, /member_profile\.gender = case when v_gender = '남성' then '여성' else '남성' end/);
  assert.match(migration, /from public\.admin_accounts as admin_account[\s\S]*admin_account\.user_id = member_profile\.id/);
});

test('all existing advanced-search filters are preserved', () => {
  for (const clause of [
    'member_profile.height >= p_height_min',
    'member_profile.height <= p_height_max',
    'member_profile.education = v_education',
    'member_profile.drinking = v_drinking',
    "pg_catalog.lower(coalesce(member_profile.hobby, ''))",
  ]) {
    assert.ok(migration.includes(clause), `${clause} must remain in the function`);
  }
});

test('signature, return contract, and security metadata are preserved', () => {
  assert.match(
    migration,
    /create or replace function public\.search_members_advanced\(\s*p_height_min integer default null,\s*p_height_max integer default null,\s*p_education text default null,\s*p_drinking text default null,\s*p_hobby text default null\s*\)/,
  );
  assert.match(
    migration,
    /returns table \(\s*id uuid,\s*nickname text,\s*age integer,\s*gender text,\s*region text,\s*job text,\s*introduction text,\s*profile_image text\s*\)/,
  );
  assert.match(migration, /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/);
  assert.match(
    migration,
    /alter function public\.search_members_advanced\(integer, integer, text, text, text\)\s+owner to postgres/,
  );
});

test('the existing ACL is restored exactly after replacement', () => {
  assert.match(
    migration,
    /revoke all on function public\.search_members_advanced\(integer, integer, text, text, text\)\s+from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.search_members_advanced\(integer, integer, text, text, text\)\s+to authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*\bto (?:public|anon)\b/);
});
