import { inject, track, type BeforeSend } from '@vercel/analytics';

export const ANALYTICS_EXCLUDE_KEY = 'commatch.analytics.exclude';
export const PROMOTION_STORAGE_KEY = 'commatch.promotion:v1';

const CHANNELS = [
  'naver_blog', 'naver_cafe', 'naver_kin', 'daum_cafe',
  'google', 'gemini', 'youtube', 'direct', 'unknown',
] as const;
const CAMPAIGNS = ['none', 'launch_2026', 'match_test_2026'] as const;
const EVENTS = ['match_test_start', 'match_test_complete', 'signup_start', 'signup_submitted'] as const;
export type PromotionEvent = typeof EVENTS[number];
type Attribution = { channel: typeof CHANNELS[number]; campaign: typeof CAMPAIGNS[number] };

const isChannel = (value: unknown): value is Attribution['channel'] => (
  typeof value === 'string' && CHANNELS.some((channel) => channel === value)
);
const isCampaign = (value: unknown): value is Attribution['campaign'] => (
  typeof value === 'string' && CAMPAIGNS.some((campaign) => campaign === value)
);
const isEvent = (value: unknown): value is PromotionEvent => (
  typeof value === 'string' && EVENTS.some((event) => event === value)
);
const unknownAttribution = (): Attribution => ({ channel: 'unknown', campaign: 'none' });
const matchesHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function classifyPromotion(href: string, referrer: string): Attribution {
  const attribution = unknownAttribution();
  try {
    const url = new URL(href);
    const source = url.searchParams.get('utm_source');
    const campaign = url.searchParams.get('utm_campaign');
    if (isCampaign(campaign)) attribution.campaign = campaign;
    if (isChannel(source) && source !== 'unknown') {
      attribution.channel = source;
      return attribution;
    }
  } catch { /* Malformed URLs must never interrupt a page. */ }

  try {
    const url = new URL(referrer);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return attribution;
    const host = url.hostname;
    const sources: readonly [string, Attribution['channel']][] = [
      ['blog.naver.com', 'naver_blog'], ['cafe.naver.com', 'naver_cafe'],
      ['kin.naver.com', 'naver_kin'], ['cafe.daum.net', 'daum_cafe'],
      ['gemini.google.com', 'gemini'], ['google.com', 'google'], ['google.co.kr', 'google'],
      ['youtube.com', 'youtube'], ['youtu.be', 'youtube'],
    ];
    attribution.channel = sources.find(([domain]) => matchesHost(host, domain))?.[1] ?? 'unknown';
  } catch { /* Missing referrer is unknown, not evidence of a direct visit. */ }
  return attribution;
}

export function isAnalyticsExcluded(): boolean {
  try {
    return window.localStorage.getItem(ANALYTICS_EXCLUDE_KEY) === '1';
  } catch {
    return false;
  }
}

function parseAttribution(value: string | null): Attribution | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || !isChannel(record.channel) || !isCampaign(record.campaign)) return null;
    return { channel: record.channel, campaign: record.campaign };
  } catch {
    return null;
  }
}

// Best-effort first touch for this tab; storage-disabled navigation still has an in-memory fallback.
let fallbackAttribution: Attribution | null = null;
export function capturePromotion(): Attribution {
  if (typeof window === 'undefined' || isAnalyticsExcluded()) return unknownAttribution();
  try {
    const stored = parseAttribution(window.sessionStorage.getItem(PROMOTION_STORAGE_KEY));
    if (stored) {
      fallbackAttribution = stored;
      return { ...stored };
    }
  } catch { /* Storage access is optional. */ }
  const attribution = fallbackAttribution ?? classifyPromotion(window.location.href, document.referrer);
  fallbackAttribution = { ...attribution };
  try {
    window.sessionStorage.setItem(PROMOTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch { /* Quota/security failures must not affect the service. */ }
  return { ...attribution };
}

// Only approved names and two validated codes are held, never URLs, identities or answers.
type PendingEvent = { name: PromotionEvent; attribution: Attribution };
const MAX_PENDING_EVENTS = 20;
const INITIALIZATION_TIMEOUT_MS = 30_000;
let initialization: 'waiting' | 'initializing' | 'ready' | 'failed' = 'waiting';
let pendingEvents: PendingEvent[] = [];
let expiryTimer: number | undefined;
let pendingDeadline: number | undefined;

function clearPendingEvents(): void {
  pendingEvents = [];
  pendingDeadline = undefined;
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }
}

function expireOverdueQueue(): boolean {
  if (pendingDeadline === undefined || Date.now() < pendingDeadline) return false;
  initialization = 'failed';
  clearPendingEvents();
  return true;
}

function attemptEvent(event: PendingEvent, deadline?: number): boolean {
  // Recheck at the last possible point, including when draining previously queued events.
  if (isAnalyticsExcluded()) {
    clearPendingEvents();
    return false;
  }
  if (deadline !== undefined && Date.now() >= deadline) return false;
  try {
    track(event.name, { channel: event.attribution.channel, campaign: event.attribution.campaign });
  } catch { /* One best-effort SDK attempt, without retries or impact on service success. */ }
  return true;
}

export function initializePromotionAnalytics(beforeSend: BeforeSend): void {
  if (typeof window === 'undefined' || initialization !== 'waiting' || typeof beforeSend !== 'function') return;
  if (expireOverdueQueue()) return;
  initialization = 'initializing';
  try {
    // Public SDK API: 2.0.1 synchronously prepares its queue and registers beforeSend.
    // Match the installed Next adapter's configuration, including resilient intake.
    // Keep Next's component for route pageviews; disable generic automatic pageviews here.
    inject({
      beforeSend,
      disableAutoTrack: true,
      framework: 'next',
      basePath: process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH,
    }, process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG);
    initialization = 'ready';
    const queued = pendingEvents;
    const deadline = pendingDeadline;
    clearPendingEvents();
    for (const event of queued) {
      if (!attemptEvent(event, deadline)) break;
    }
  } catch {
    initialization = 'failed';
    clearPendingEvents();
  }
}

export function trackPromotionEvent(name: unknown): void {
  try {
    if (typeof window === 'undefined' || !isEvent(name)) return;
    if (isAnalyticsExcluded()) {
      clearPendingEvents();
      return;
    }
    if (initialization === 'failed' || expireOverdueQueue()) return;
    const path = window.location.pathname.replace(/\/+$/, '');
    const expectedPath = name.startsWith('signup_') ? '/signup' : '/match-test';
    if (path !== expectedPath) return;
    const event = { name, attribution: capturePromotion() };
    if (initialization === 'ready') {
      attemptEvent(event);
      return;
    }
    if (expireOverdueQueue() || pendingEvents.length >= MAX_PENDING_EVENTS) return;
    pendingEvents.push(event);
    if (expiryTimer === undefined) {
      pendingDeadline = Date.now() + INITIALIZATION_TIMEOUT_MS;
      // A retention deadline, not a readiness delay or polling/retry mechanism.
      expiryTimer = window.setTimeout(() => {
        initialization = 'failed';
        clearPendingEvents();
      }, INITIALIZATION_TIMEOUT_MS);
    }
  } catch { /* Analytics must never change signup or test success/failure. */ }
}