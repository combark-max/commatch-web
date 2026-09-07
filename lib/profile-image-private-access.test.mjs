import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/profile-images-private-access.sql', import.meta.url),
  'utf8',
);
const readOptionalMigration = (relativePath) => {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
};
const restrictiveMigration = readOptionalMigration(
  '../supabase/profile-images-private-access-restrict.sql',
);
const route = readFileSync(
  new URL('../app/api/profile-images/route.ts', import.meta.url),
  'utf8',
);

test('additive migration leaves the public bucket and read policies intact', () => {
  assert.doesNotMatch(migration, /set public = false/);
  assert.doesNotMatch(migration, /drop policy if exists "Public can view profile images"/);
  assert.doesNotMatch(migration, /drop policy if exists profile_images_select/);
  assert.match(migration, /profile_images bucket must remain public during the additive deployment stage/);
  assert.match(migration, /Both public profile image SELECT policies must remain during the additive deployment stage/);
});

test('restrictive migration alone makes the bucket private and removes public reads', () => {
  assert.match(restrictiveMigration, /STEP B: RESTRICTIVE/);
  assert.match(restrictiveMigration, /can_access_profile_image\(text\)/);
  assert.match(restrictiveMigration, /update storage\.buckets[\s\S]*set public = false[\s\S]*id = 'profile_images'/);
  assert.match(restrictiveMigration, /drop policy if exists "Public can view profile images"/);
  assert.match(restrictiveMigration, /drop policy if exists profile_images_select/);
  assert.match(restrictiveMigration, /ROLLBACK ORDER/);
});

test('signed-image authorization keeps member relationship and active administrator viewing paths', () => {
  assert.match(migration, /function public\.can_access_profile_image\(p_object_path text\)/);
  assert.match(migration, /admin_account\.status = 'active'/);
  assert.match(migration, /admin_account\.role in \('super_admin', 'admin', 'moderator'\)/);
  assert.match(migration, /public\.is_member_service_allowed\(\)/);
  assert.match(migration, /restriction\.account_status = 'suspended'/);
  assert.match(migration, /restriction\.suspended_until is null/);
  assert.match(migration, /public\.is_member_profile_visible\(v_owner_id\)/);
  assert.match(migration, /viewer_profile\.gender/);
  assert.match(migration, /owner_profile\.gender/);
  assert.match(migration, /v_owner_gender is null/);
  assert.match(migration, /from public\.matches as match_row/);
  assert.match(migration, /from public\.favorites as favorite_row/);
  assert.match(migration, /from public\.likes as like_row/);

  const selfAccess = migration.indexOf('if v_owner_id = v_user_id then');
  const relationshipAccess = migration.indexOf('from public.matches as match_row');
  const browseVisibility = migration.indexOf('not public.is_member_profile_visible(v_owner_id)');
  const activeSuspension = migration.indexOf("restriction.account_status = 'suspended'");
  assert.ok(selfAccess >= 0 && selfAccess < relationshipAccess);
  assert.ok(relationshipAccess < browseVisibility && relationshipAccess < activeSuspension);
});

test('private transition preserves storage objects and write/delete policies', () => {
  assert.doesNotMatch(restrictiveMigration, /\b(delete from|update) storage\.objects\b/i);
  assert.doesNotMatch(restrictiveMigration, /drop policy if exists profile_images_(insert|update|delete)/i);
});

test('central route authenticates and authorizes before issuing a short signed URL', () => {
  const authentication = route.indexOf('supabase.auth.getUser()');
  const authorization = route.indexOf("'can_access_profile_image'");
  const signer = route.indexOf("createSupabaseAdminClient()");
  const signedUrl = route.indexOf('.createSignedUrl(');
  assert.ok(authentication >= 0 && authentication < authorization);
  assert.ok(authorization < signer && signer < signedUrl);
  assert.match(route, /SIGNED_URL_TTL_SECONDS = 60/);
  assert.match(route, /Cache-Control'.*'private, no-store'/);
  assert.doesNotMatch(route, /getPublicUrl/);
});
