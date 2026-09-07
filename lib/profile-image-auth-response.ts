import type { CookieMethodsServer, CookieOptions } from '@supabase/ssr';

const REFRESH_RESPONSE_CACHE_CONTROL =
  'private, no-cache, no-store, must-revalidate, max-age=0';

type WritableCookieStore = {
  getAll: CookieMethodsServer['getAll'];
  set: (name: string, value: string, options: CookieOptions) => void;
};

export function createProfileImageAuthResponse(cookieStore: WritableCookieStore) {
  const refreshHeaders = new Headers();
  let authCookiesWereSet = false;

  const cookies = {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet, headers) {
      authCookiesWereSet = true;
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      });
      Object.entries(headers).forEach(([name, value]) => {
        refreshHeaders.set(name, value);
      });
    },
  } satisfies CookieMethodsServer;

  return {
    cookies,
    applyTo(headers: Headers) {
      if (!authCookiesWereSet) return;

      refreshHeaders.forEach((value, name) => {
        headers.set(name, value);
      });
      if (!refreshHeaders.has('Cache-Control')) {
        headers.set('Cache-Control', REFRESH_RESPONSE_CACHE_CONTROL);
      }
    },
  };
}
