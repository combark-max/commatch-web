import assert from 'node:assert/strict';
import test from 'node:test';

const batchModule = await import('./profile-image-batch.ts').catch(() => ({}));
const profileImageModule = await import('./profile-image.ts').catch(() => ({}));

const {
  MAX_PROFILE_IMAGE_BATCH_SIZE,
  handleProfileImageBatch,
  fetchProfileImageBatchUrls,
  getProfileImageDisplayUrl,
} = batchModule;
const { parseProfileImageRequestPath } = profileImageModule;

const OWNER_A = 'c692c612-4499-4802-9b45-611e4f132ac0';
const OWNER_B = '2df90ec0-4f4a-442c-a575-12a45880fd0e';
const OWNER_C = '4dc4954e-477f-4a77-bba4-d51db1c6240e';
const PATH_A = `${OWNER_A}/profile-a.webp`;
const PATH_B = `${OWNER_B}/profile-b.webp`;
const PATH_C = `${OWNER_C}/profile-c.webp`;

const makePaths = (count) => Array.from({ length: count }, (_, index) => {
  const suffix = String(index + 1).padStart(12, '0');
  return `00000000-0000-4000-8000-${suffix}/profile-${index + 1}.webp`;
});

const authenticatedDependencies = (overrides = {}) => ({
  authenticate: async () => true,
  parsePath: parseProfileImageRequestPath,
  canAccessMany: async (paths) => paths,
  createSignedUrls: async (paths) => paths.map((path) => ({
    path,
    signedUrl: `https://storage.example/${path}?token=signed`,
  })),
  ...overrides,
});

test('batch profile image requests reject unauthenticated callers before signing', async () => {
  assert.equal(typeof handleProfileImageBatch, 'function');
  let authorizationCalls = 0;
  let signingCalls = 0;

  const result = await handleProfileImageBatch({ paths: [PATH_A] }, {
    authenticate: async () => false,
    parsePath: parseProfileImageRequestPath,
    canAccessMany: async () => {
      authorizationCalls += 1;
      return [PATH_A];
    },
    createSignedUrls: async () => {
      signingCalls += 1;
      return [];
    },
  });

  assert.deepEqual(result, {
    status: 401,
    body: { error: 'Authentication required' },
  });
  assert.equal(authorizationCalls, 0);
  assert.equal(signingCalls, 0);
});

test('batch profile image requests validate path arrays and enforce the raw input limit', async () => {
  assert.equal(MAX_PROFILE_IMAGE_BATCH_SIZE, 50);

  for (const invalidBody of [null, {}, { paths: 'not-an-array' }, { paths: ['invalid-path'] }]) {
    const result = await handleProfileImageBatch(invalidBody, authenticatedDependencies());
    assert.equal(result.status, 400);
  }

  const overLimit = await handleProfileImageBatch(
    { paths: Array.from({ length: 51 }, () => PATH_A) },
    authenticatedDependencies(),
  );
  assert.equal(overLimit.status, 400);
});

test('batch profile image requests deduplicate paths, authorize once, and sign allowed paths once for 60 seconds', async () => {
  const authorizationCalls = [];
  const signingCalls = [];

  const result = await handleProfileImageBatch(
    { paths: [PATH_A, PATH_A, PATH_B, PATH_C] },
    authenticatedDependencies({
      canAccessMany: async (paths) => {
        authorizationCalls.push(paths);
        return [PATH_A, PATH_C];
      },
      createSignedUrls: async (paths, expiresIn) => {
        signingCalls.push({ paths, expiresIn });
        return paths.map((path) => ({
          path,
          signedUrl: `https://storage.example/${path}?token=signed`,
        }));
      },
    }),
  );

  assert.deepEqual(authorizationCalls, [[PATH_A, PATH_B, PATH_C]]);
  assert.deepEqual(signingCalls, [{ paths: [PATH_A, PATH_C], expiresIn: 60 }]);
  assert.deepEqual(result, {
    status: 200,
    body: {
      urls: {
        [PATH_A]: `https://storage.example/${PATH_A}?token=signed`,
        [PATH_C]: `https://storage.example/${PATH_C}?token=signed`,
      },
    },
  });
  assert.equal('deniedPaths' in result.body, false);
  assert.equal('missingPaths' in result.body, false);
});

test('profile image authorization uses one batch call for 6, 20, and 50 paths', async () => {
  for (const count of [6, 20, 50]) {
    const paths = makePaths(count);
    const authorizationCalls = [];

    const result = await handleProfileImageBatch(
      { paths },
      authenticatedDependencies({
        canAccessMany: async (requestedPaths) => {
          authorizationCalls.push(requestedPaths);
          return requestedPaths;
        },
      }),
    );

    assert.equal(result.status, 200);
    assert.equal(authorizationCalls.length, 1);
    assert.deepEqual(authorizationCalls[0], paths);
    assert.equal(Object.keys(result.body.urls).length, count);
  }
});

test('batch authorization accepts only requested paths and remains fail-closed on RPC failure', async () => {
  const signingCalls = [];
  const result = await handleProfileImageBatch(
    { paths: [PATH_A, PATH_B, PATH_C] },
    authenticatedDependencies({
      canAccessMany: async () => [PATH_A, PATH_A, `${OWNER_A}/unrequested.webp`, null],
      createSignedUrls: async (paths, expiresIn) => {
        signingCalls.push({ paths, expiresIn });
        return paths.map((path) => ({
          path,
          signedUrl: `https://storage.example/${path}?token=signed`,
        }));
      },
    }),
  );

  assert.deepEqual(signingCalls, [{ paths: [PATH_A], expiresIn: 60 }]);
  assert.deepEqual(Object.keys(result.body.urls), [PATH_A]);

  let failedSigningCalls = 0;
  const failedResult = await handleProfileImageBatch(
    { paths: [PATH_A, PATH_B] },
    authenticatedDependencies({
      canAccessMany: async () => {
        throw new Error('RPC unavailable');
      },
      createSignedUrls: async () => {
        failedSigningCalls += 1;
        return [];
      },
    }),
  );
  assert.deepEqual(failedResult, { status: 200, body: { urls: {} } });
  assert.equal(failedSigningCalls, 0);
});

test('batch signing failures keep the existing 500 JSON contract', async () => {
  const result = await handleProfileImageBatch(
    { paths: [PATH_A] },
    authenticatedDependencies({
      createSignedUrls: async () => {
        throw new Error('Storage unavailable');
      },
    }),
  );

  assert.deepEqual(result, {
    status: 500,
    body: { error: 'Unable to load profile images' },
  });
});

test('batch client falls back to the existing protected single-image URL when batching fails or omits a path', async () => {
  assert.equal(typeof fetchProfileImageBatchUrls, 'function');
  assert.equal(typeof getProfileImageDisplayUrl, 'function');
  const protectedUrl = `/api/profile-images?path=${encodeURIComponent(PATH_A)}`;

  const failedUrls = await fetchProfileImageBatchUrls([PATH_A], async () => new Response(null, { status: 503 }));
  assert.deepEqual(failedUrls, {});
  assert.equal(getProfileImageDisplayUrl(PATH_A, protectedUrl, failedUrls), protectedUrl);
  assert.equal(getProfileImageDisplayUrl(PATH_A, protectedUrl, {}), protectedUrl);
  assert.equal(
    getProfileImageDisplayUrl(PATH_A, protectedUrl, { [PATH_A]: 'https://storage.example/signed-a' }),
    'https://storage.example/signed-a',
  );
});

test('batch client does not start per-image fallback requests while a batch is still pending', () => {
  const protectedUrl = `/api/profile-images?path=${encodeURIComponent(PATH_A)}`;
  assert.equal(getProfileImageDisplayUrl(PATH_A, protectedUrl, null), null);
});

test('an expired or failed batch URL falls back to the protected single-image URL for that path', () => {
  const protectedUrl = `/api/profile-images?path=${encodeURIComponent(PATH_A)}`;
  const batchUrls = { [PATH_A]: 'https://storage.example/expired-signed-a' };
  assert.equal(
    getProfileImageDisplayUrl(PATH_A, protectedUrl, batchUrls, new Set([PATH_A])),
    protectedUrl,
  );
});
