export const MAX_PROFILE_IMAGE_BATCH_SIZE = 50;
export const PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS = 60;
const PROFILE_IMAGE_ACCESS_CONCURRENCY = 8;

type BatchBody = {
  urls?: Record<string, string>;
  error?: string;
};

type BatchResult = {
  status: number;
  body: BatchBody;
};

type SignedProfileImage = {
  path: string | null;
  signedUrl: string | null;
};

type ProfileImageBatchDependencies = {
  authenticate: () => Promise<boolean>;
  parsePath: (value: string | null) => string | null;
  canAccess: (path: string) => Promise<boolean>;
  createSignedUrls: (
    paths: string[],
    expiresIn: number,
  ) => Promise<SignedProfileImage[]>;
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function handleProfileImageBatch(
  input: unknown,
  dependencies: ProfileImageBatchDependencies,
): Promise<BatchResult> {
  let isAuthenticated = false;
  try {
    isAuthenticated = await dependencies.authenticate();
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    return { status: 401, body: { error: 'Authentication required' } };
  }

  if (!input || typeof input !== 'object' || !('paths' in input)) {
    return { status: 400, body: { error: 'Invalid profile image paths' } };
  }

  const rawPaths = (input as { paths?: unknown }).paths;
  if (!Array.isArray(rawPaths) || rawPaths.length > MAX_PROFILE_IMAGE_BATCH_SIZE) {
    return { status: 400, body: { error: 'Invalid profile image paths' } };
  }

  const paths: string[] = [];
  const seenPaths = new Set<string>();
  for (const rawPath of rawPaths) {
    if (typeof rawPath !== 'string') {
      return { status: 400, body: { error: 'Invalid profile image paths' } };
    }

    const path = dependencies.parsePath(rawPath);
    if (!path) {
      return { status: 400, body: { error: 'Invalid profile image paths' } };
    }
    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      paths.push(path);
    }
  }

  if (paths.length === 0) {
    return { status: 200, body: { urls: {} } };
  }

  const accessResults = await mapWithConcurrency(
    paths,
    PROFILE_IMAGE_ACCESS_CONCURRENCY,
    async (path) => {
      try {
        return await dependencies.canAccess(path) ? path : null;
      } catch {
        return null;
      }
    },
  );
  const allowedPaths = accessResults.filter((path): path is string => path !== null);

  if (allowedPaths.length === 0) {
    return { status: 200, body: { urls: {} } };
  }

  let signedImages: SignedProfileImage[];
  try {
    signedImages = await dependencies.createSignedUrls(
      allowedPaths,
      PROFILE_IMAGE_SIGNED_URL_TTL_SECONDS,
    );
  } catch {
    return { status: 500, body: { error: 'Unable to load profile images' } };
  }

  const allowedPathSet = new Set(allowedPaths);
  const urls: Record<string, string> = {};
  for (const signedImage of signedImages) {
    if (
      signedImage.path
      && allowedPathSet.has(signedImage.path)
      && typeof signedImage.signedUrl === 'string'
      && signedImage.signedUrl.length > 0
    ) {
      urls[signedImage.path] = signedImage.signedUrl;
    }
  }

  return { status: 200, body: { urls } };
}

type BatchFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function normalizeProfileImageBatchPaths(paths: readonly (string | null)[]): string[] {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))]
    .slice(0, MAX_PROFILE_IMAGE_BATCH_SIZE);
}

export async function fetchProfileImageBatchUrls(
  paths: readonly (string | null)[],
  fetcher: BatchFetch = fetch,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const requestedPaths = normalizeProfileImageBatchPaths(paths);
  if (requestedPaths.length === 0) return {};

  try {
    const response = await fetcher('/api/profile-images/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: requestedPaths }),
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok) return {};

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('urls' in payload)) return {};
    const rawUrls = (payload as { urls?: unknown }).urls;
    if (!rawUrls || typeof rawUrls !== 'object' || Array.isArray(rawUrls)) return {};

    const requestedPathSet = new Set(requestedPaths);
    const urls: Record<string, string> = {};
    for (const [path, signedUrl] of Object.entries(rawUrls)) {
      if (requestedPathSet.has(path) && typeof signedUrl === 'string' && signedUrl.length > 0) {
        urls[path] = signedUrl;
      }
    }
    return urls;
  } catch {
    return {};
  }
}

export function getProfileImageDisplayUrl(
  objectPath: string | null,
  protectedUrl: string | null,
  batchUrls: Readonly<Record<string, string>> | null,
  failedBatchPaths?: ReadonlySet<string>,
): string | null {
  if (batchUrls === null) return null;
  if (!objectPath) return protectedUrl;
  if (failedBatchPaths?.has(objectPath)) return protectedUrl;
  return batchUrls[objectPath] ?? protectedUrl;
}
