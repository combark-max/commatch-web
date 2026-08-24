import 'server-only';

import webPush from 'web-push';

export type PushEventType =
  | 'new_message'
  | 'new_like'
  | 'new_match'
  | 'support_inquiry_answered';

export type PushDeliveryClaim = {
  deliveryId: string;
  claimToken: string;
  pushEventId: string;
  notificationId: string;
  eventType: PushEventType;
  pushSubscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: string | null;
  attemptCount: number;
};

export type PushSendResult =
  | { ok: true; httpStatus: number }
  | {
    ok: false;
    httpStatus: number | null;
    errorCode:
      | 'network'
      | 'timeout'
      | 'rate_limited'
      | 'push_service_error'
      | 'invalid_request'
      | 'vapid_rejected'
      | 'subscription_gone'
      | 'unknown';
    retryAfter: string | null;
  };

const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
const MIN_RETRY_AFTER_MS = 60 * 1000;

function getRequiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Push server configuration: ${name}`);
  return value;
}

function getVapidDetails() {
  const publicKey = getRequiredEnvironmentValue('NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY');
  const privateKey = getRequiredEnvironmentValue('WEB_PUSH_VAPID_PRIVATE_KEY');
  const subject = getRequiredEnvironmentValue('WEB_PUSH_VAPID_SUBJECT');

  if (
    publicKey.length < 80
    || publicKey.length > 120
    || !BASE64_URL_PATTERN.test(publicKey)
    || privateKey.length < 40
    || privateKey.length > 100
    || !BASE64_URL_PATTERN.test(privateKey)
    || (!subject.startsWith('mailto:') && !subject.startsWith('https://'))
  ) {
    throw new Error('Invalid Push server VAPID configuration');
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}

export function assertPushServerConfigured(): void {
  getVapidDetails();
}

function createPayload(claim: PushDeliveryClaim): string {
  const bodyByEventType: Record<PushEventType, string> = {
    new_message: '새 메시지가 도착했습니다.',
    new_like: '새로운 좋아요를 받았습니다.',
    new_match: '새로운 매칭이 성사되었습니다.',
    support_inquiry_answered: '문의에 답변이 등록되었습니다.',
  };

  return JSON.stringify({
    version: 1,
    eventId: claim.pushEventId,
    notificationId: claim.notificationId,
    type: claim.eventType,
    title: 'ComMatch',
    body: bodyByEventType[claim.eventType],
  });
}

function parseRetryAfter(value: string | undefined): string | null {
  if (!value) return null;

  const now = Date.now();
  const seconds = Number(value);
  const requestedAt = Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Date.parse(value);
  if (!Number.isFinite(requestedAt)) return null;

  const clampedAt = Math.min(
    now + MAX_RETRY_AFTER_MS,
    Math.max(now + MIN_RETRY_AFTER_MS, requestedAt),
  );
  return new Date(clampedAt).toISOString();
}

function normalizeWebPushError(error: unknown): PushSendResult {
  if (error instanceof webPush.WebPushError) {
    const httpStatus = error.statusCode;
    const retryAfter = httpStatus === 429
      ? parseRetryAfter(error.headers['retry-after'])
      : null;

    if (httpStatus === 404 || httpStatus === 410) {
      return { ok: false, httpStatus, errorCode: 'subscription_gone', retryAfter: null };
    }
    if (httpStatus === 429) {
      return { ok: false, httpStatus, errorCode: 'rate_limited', retryAfter };
    }
    if (httpStatus >= 500) {
      return { ok: false, httpStatus, errorCode: 'push_service_error', retryAfter: null };
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return { ok: false, httpStatus, errorCode: 'vapid_rejected', retryAfter: null };
    }
    if (httpStatus >= 400) {
      return { ok: false, httpStatus, errorCode: 'invalid_request', retryAfter: null };
    }
    return { ok: false, httpStatus, errorCode: 'unknown', retryAfter: null };
  }

  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  if (errorCode === 'ETIMEDOUT' || errorCode === 'ESOCKETTIMEDOUT') {
    return { ok: false, httpStatus: null, errorCode: 'timeout', retryAfter: null };
  }
  return { ok: false, httpStatus: null, errorCode: 'network', retryAfter: null };
}

export async function sendPushDelivery(claim: PushDeliveryClaim): Promise<PushSendResult> {
  const vapidDetails = getVapidDetails();
  const expirationTime = claim.expirationTime === null
    ? null
    : Date.parse(claim.expirationTime);

  const subscription: webPush.PushSubscription = {
    endpoint: claim.endpoint,
    expirationTime: expirationTime === null || Number.isNaN(expirationTime)
      ? null
      : expirationTime,
    keys: {
      p256dh: claim.p256dh,
      auth: claim.auth,
    },
  };

  try {
    const result = await webPush.sendNotification(subscription, createPayload(claim), {
      vapidDetails,
      TTL: 300,
      urgency: 'normal',
      topic: claim.pushEventId.replaceAll('-', '').slice(0, 32),
      timeout: 15_000,
    });
    return { ok: true, httpStatus: result.statusCode };
  } catch (error) {
    return normalizeWebPushError(error);
  }
}
