'use client';

import { useEffect } from 'react';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { capturePromotion, initializePromotionAnalytics, isAnalyticsExcluded } from '@/lib/analytics/promotion';

const PUBLIC_PATHS = new Set([
  '/',
  '/about',
  '/faq',
  '/match-test',
  '/notices',
  '/privacy',
  '/terms',
]);

export function filterPublicPageView(event: BeforeSendEvent): BeforeSendEvent | null {
  if (isAnalyticsExcluded()) return null;
  try {
    const url = new URL(event.url, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');

    if (event.type === 'event') {
      // SDK 2.0.1 exposes only type/url here, not event names or properties.
      // The four-name allowlist belongs to trackPromotionEvent; direct SDK calls can bypass it.
      if (pathname !== '/signup' && pathname !== '/match-test') return null;
      return { ...event, url: `${url.origin}${pathname}` };
    }
    if (event.type !== 'pageview') return null;
    if (/^\/notices\/[^/]+$/.test(pathname)) {
      return { ...event, url: `${url.origin}/notices/[id]` };
    }
    if (!PUBLIC_PATHS.has(pathname)) return null;
    return { ...event, url: `${url.origin}${pathname}` };
  } catch {
    return null;
  }
}

export default function PublicWebAnalytics() {
  useEffect(() => {
    capturePromotion();
    initializePromotionAnalytics(filterPublicPageView);
  }, []);
  return <Analytics beforeSend={filterPublicPageView} />;
}
