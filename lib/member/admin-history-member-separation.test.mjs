import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/admin-history-member-separation.sql', import.meta.url),
  'utf8',
);

test('one common helper treats every administrator history row as non-member identity', () => {
  assert.match(migration, /function public\.is_non_admin_member_account\(p_user_id uuid\)/);
  assert.match(migration, /from public\.admin_accounts as admin_account/);
  assert.doesNotMatch(migration, /admin_account\.status\s*=/);
});

test('member access and first profile onboarding are denied to administrator history accounts', () => {
  assert.match(migration, /create or replace function public\.get_my_member_access\(\)/);
  assert.match(migration, /public\.is_non_admin_member_account\(auth_context\.user_id\)/);
  assert.match(migration, /is_member_profile_onboarding_allowed[\s\S]*get_my_member_access/);
});

test('new likes, favorites, and matches reject either administrator-history side', () => {
  assert.match(migration, /function public\.enforce_non_admin_member_relationship\(\)/);
  assert.match(migration, /before insert or update on public\.(likes|favorites|matches)/);
  assert.match(migration, /create policy "Users can insert own favorites"/);
  assert.match(migration, /favorite_user_id/);
});

test('relationship RPCs and direct table reads hide administrator-history counterparts', () => {
  for (const signature of [
    'get_my_favorite_members()',
    'get_my_favorite_members_with_likes()',
    'get_received_favorites()',
    'get_received_likes()',
    'get_my_matches()',
    'get_my_match_summary()',
    'get_match_messages(p_match_id uuid)',
  ]) {
    assert.ok(migration.includes(`function public.${signature}`), `${signature} must be replaced`);
  }
  for (const policy of [
    'Users can read own favorites',
    'Users can read own sent likes',
    'matches_select_participant',
    'messages_select_participant',
  ]) {
    assert.ok(migration.includes(`policy ${policy.includes(' ') ? `"${policy}"` : policy}`));
  }
});

test('existing relationship, message, and audit rows are never deleted or rewritten', () => {
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.(favorites|matches|messages|admin_audit_logs)\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\.(likes|favorites|matches|messages|admin_audit_logs)\s+set\b/i);
  assert.match(migration, /is_non_admin_member_account\(target_user_id\)[\s\S]*delete from public\.likes/);
});
