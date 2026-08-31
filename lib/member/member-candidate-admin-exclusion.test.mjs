import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/member-candidate-admin-exclusion.sql', import.meta.url),
  'utf8',
);

const latestSources = {
  'get_visible_member_summaries()': readFileSync(
    new URL('../../supabase/member-profile-visibility.sql', import.meta.url),
    'utf8',
  ),
  'search_members_advanced(': readFileSync(
    new URL('../../supabase/advanced-member-search-service-guard.sql', import.meta.url),
    'utf8',
  ),
  'get_ai_match_candidates()': readFileSync(
    new URL('../../supabase/priority-recommendation-premium-migration.sql', import.meta.url),
    'utf8',
  ),
  'get_visible_member_detail(': readFileSync(
    new URL('../../supabase/member-profile-premium-badge.sql', import.meta.url),
    'utf8',
  ),
};

const functionBody = (signature) => {
  const start = migration.indexOf(`create or replace function public.${signature}`);
  assert.notEqual(start, -1, `${signature} definition must exist`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${signature} definition must terminate`);
  return migration.slice(start, end);
};

const latestFunctionBody = (signature) => {
  const source = latestSources[signature];
  const replaceStart = source.indexOf(`create or replace function public.${signature}`);
  const createStart = source.indexOf(`create function public.${signature}`);
  const start = replaceStart === -1 ? createStart : replaceStart;
  assert.notEqual(start, -1, `${signature} latest source definition must exist`);
  const end = source.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${signature} latest source definition must terminate`);
  return source.slice(start, end);
};

const cases = [
  ['get_visible_member_summaries()', 'member_profile.id'],
  ['search_members_advanced(', 'member_profile.id'],
  ['get_ai_match_candidates()', 'candidate_profile.id'],
  ['get_visible_member_detail(', 'target_profile.id'],
];

for (const [signature, target] of cases) {
  test(`${signature} excludes administrator history without checking status`, () => {
    const body = functionBody(signature);
    assert.match(body, /from public\.admin_accounts as admin_account/);
    assert.ok(body.includes(`admin_account.user_id = ${target}`));
    assert.doesNotMatch(body, /admin_account\.status/);
  });

  test(`${signature} otherwise matches its latest source definition`, () => {
    const adminExclusion = new RegExp(
      `\\n    and not exists \\(\\n      select 1\\n      from public\\.admin_accounts as admin_account\\n      where admin_account\\.user_id = ${target.replace('.', '\\.')}\\n    \\)`,
    );
    const migratedBody = functionBody(signature)
      .replace(adminExclusion, '')
      .replace('create or replace function public.get_visible_member_detail(', 'create function public.get_visible_member_detail(');
    assert.equal(migratedBody, latestFunctionBody(signature));
  });
}

test('visible summaries preserve self, gender, and hidden-profile filters', () => {
  const body = functionBody('get_visible_member_summaries()');
  assert.match(body, /member_profile\.id <> v_user_id/);
  assert.match(body, /member_profile\.gender = case v_gender/);
  assert.match(body, /restriction\.profile_visibility = 'hidden'/);
});

test('advanced search preserves service, Premium, visibility, and field filters', () => {
  const body = functionBody('search_members_advanced(');
  assert.match(body, /is_member_service_allowed\(\)/);
  assert.match(body, /has_premium_feature\('advanced_member_search'\)/);
  assert.match(body, /restriction\.profile_visibility = 'hidden'/);
  for (const filter of ['p_height_min', 'p_height_max', 'v_education', 'v_drinking', 'v_hobby']) {
    assert.ok(body.includes(filter), `${filter} must remain`);
  }
});

test('AI candidates preserve priority and active-suspension behavior', () => {
  const body = functionBody('get_ai_match_candidates()');
  assert.match(body, /'priority_recommendation' = any\(membership\.feature_keys\)/);
  assert.match(body, /restriction\.profile_visibility = 'hidden'/);
  assert.match(body, /restriction\.account_status = 'suspended'/);
  assert.match(body, /restriction\.suspended_until > pg_catalog\.now\(\)/);
  assert.match(body, /candidate_profile\.id <> v_user_id/);
});

test('member detail preserves visibility, locking, return shape, and Premium badge', () => {
  const body = functionBody('get_visible_member_detail(');
  assert.match(body, /lock_member_service_write\(p_target_user_id\)/);
  assert.match(body, /is_member_profile_visible\(target_profile\.id\)/);
  assert.match(body, /is_premium_available/);
  assert.match(body, /membership\.status = 'active'/);
});

test('all four RPCs retain owner, security, search path, and grants', () => {
  assert.equal((migration.match(/security definer/g) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = ''/g) ?? []).length, 4);

  for (const signature of [
    'get_visible_member_summaries()',
    'search_members_advanced(integer, integer, text, text, text)',
    'get_ai_match_candidates()',
    'get_visible_member_detail(uuid)',
  ]) {
    assert.ok(migration.includes(`alter function public.${signature} owner to postgres;`));
    assert.ok(migration.includes(`grant execute on function public.${signature}`));
  }
});
