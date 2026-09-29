'use client';

import {
  Analytics,
  type BeforeSendEvent,
} from '@vercel/analytics/next';

const PUBLIC_PATHS = new Set([
  '/',
  '/about',
  '/faq',
  '/notices',
  '/privacy',
  '/terms',
]);

export function filterPublicPageView(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') return null;

  const url = new URL(event.url, window.location.origin);
  if (url.origin !== window.location.origin) return null;

  const pathname = url.pathname === '/'
    ? '/'
    : url.pathname.replace(/\/+$/, '');

  if (/^\/notices\/[^/]+$/.test(pathname)) {
    return {
      ...event,
      url: `${url.origin}/notices/[id]`,
    };
  }

  if (!PUBLIC_PATHS.has(pathname)) return null;

  return {
    ...event,
    url: `${url.origin}${pathname}`,
  };
}

export default function PublicWebAnalytics() {
  return <Analytics beforeSend={filterPublicPageView} />;
}
