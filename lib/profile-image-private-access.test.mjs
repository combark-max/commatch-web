import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileImageAuthResponseModule = await import('./profile-image-auth-response.ts')
  .catch(() => ({}));
const { createProfileImageAuthResponse } = profileImageAuthResponseModule;

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
const batchRoute = readOptionalMigration(
  '../app/api/profile-images/batch/route.ts',
);
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
const memberList = readFileSync(
  new URL('../app/(main)/members/members-client.tsx', import.meta.url),
  'utf8',
);
const favoriteList = readFileSync(
  new URL('../app/(main)/favorites/page.tsx', import.meta.url),
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

test('central route authenticates and authorizes before issuing a 60-second signed URL', () => {
  const authentication = route.indexOf('supabase.auth.getUser()');
  const authorization = route.indexOf("'can_access_profile_image'");
  const signer = route.indexOf("createSupabaseAdminClient()");
  const signedUrl = route.indexOf('.createSignedUrl(');
  assert.ok(authentication >= 0 && authentication < authorization);
  assert.ok(authorization < signer && signer < signedUrl);
  assert.match(route, /SIGNED_URL_TTL_SECONDS = 60/);
  assert.doesNotMatch(route, /getPublicUrl/);
});

test('profile image requests bypass only proxy authentication and remain authenticated in the route', () => {
  const bypass = proxy.indexOf("request.nextUrl.pathname === '/api/profile-images'");
  const proxyAuthentication = proxy.indexOf('await supabase.auth.getUser()');

  assert.ok(bypass >= 0 && bypass < proxyAuthentication);
  assert.match(
    proxy.slice(bypass, proxyAuthentication),
    /return NextResponse\.next\(\)/,
  );
  assert.equal(proxy.match(/await supabase\.auth\.getUser\(\)/g)?.length, 1);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
});

test('batch profile image requests also bypass proxy authentication and authenticate once in their route', () => {
  const bypass = proxy.indexOf("request.nextUrl.pathname === '/api/profile-images/batch'");
  const proxyAuthentication = proxy.indexOf('await supabase.auth.getUser()');

  assert.ok(bypass >= 0 && bypass < proxyAuthentication);
  assert.match(batchRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(batchRoute, /'can_access_profile_image'/);
  assert.match(batchRoute, /\.createSignedUrls\(/);
  assert.doesNotMatch(batchRoute, /createSignedUrl\(/);

  const routeAuthentication = batchRoute.indexOf('supabase.auth.getUser()');
  const adminClient = batchRoute.indexOf('createSupabaseAdminClient()');
  assert.ok(routeAuthentication >= 0 && routeAuthentication < adminClient);
});

test('successful image redirects use only a 45-second private browser cache', () => {
  const redirectStart = route.indexOf('const response = NextResponse.redirect');
  const redirectEnd = route.indexOf('return response;', redirectStart);
  const redirectBlock = route.slice(redirectStart, redirectEnd);

  assert.ok(redirectStart >= 0 && redirectEnd > redirectStart);
  assert.match(redirectBlock, /Cache-Control', 'private, max-age=45'/);
  assert.match(redirectBlock, /applyAuthResponseHeaders\(response\.headers\)/);
  assert.doesNotMatch(redirectBlock, /no-store|public|s-maxage/);
});

test('profile image responses keep the 45-second private cache when auth cookies are unchanged', () => {
  assert.equal(typeof createProfileImageAuthResponse, 'function');

  const authResponse = createProfileImageAuthResponse({
    getAll: () => [],
    set: () => assert.fail('unchanged auth must not write a cookie'),
  });
  const headers = new Headers({ 'Cache-Control': 'private, max-age=45' });

  authResponse.applyTo(headers);

  assert.equal(headers.get('Cache-Control'), 'private, max-age=45');
  assert.equal(headers.has('Expires'), false);
  assert.equal(headers.has('Pragma'), false);
});

test('profile image auth refresh preserves cookie writes and applies Supabase no-store headers', async () => {
  assert.equal(typeof createProfileImageAuthResponse, 'function');

  const cookieWrites = [];
  const authResponse = createProfileImageAuthResponse({
    getAll: () => [{ name: 'sb-session', value: 'old-session' }],
    set: (...args) => cookieWrites.push(args),
  });
  const cookieOptions = { httpOnly: true, path: '/', sameSite: 'lax' };

  await authResponse.cookies.setAll(
    [{ name: 'sb-session', value: 'new-session', options: cookieOptions }],
    {
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
      Expires: '0',
      Pragma: 'no-cache',
    },
  );

  const headers = new Headers();
  authResponse.applyTo(headers);

  assert.deepEqual(cookieWrites, [['sb-session', 'new-session', cookieOptions]]);
  assert.equal(
    headers.get('Cache-Control'),
    'private, no-cache, no-store, must-revalidate, max-age=0',
  );
  assert.equal(headers.get('Expires'), '0');
  assert.equal(headers.get('Pragma'), 'no-cache');
});

test('raw profile images in multi-card member and favorite lists are lazy-loaded', () => {
  assert.match(
    memberList,
    /<img[\s\S]*?loading="lazy"[\s\S]*?\/>/,
  );
  assert.match(
    favoriteList,
    /<img[\s\S]*?loading="lazy"[\s\S]*?\/>/,
  );
});
