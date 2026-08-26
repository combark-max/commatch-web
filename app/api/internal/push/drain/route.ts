import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  assertPushServerConfigured,
  sendPushDelivery,
  type PushDeliveryClaim,
  type PushEventType,
} from '@/lib/push/server';

export const runtime = 'nodejs';

const EXPANSION_LIMIT = 100;
const CLAIM_LIMIT = 20;
const CLAIM_LEASE_SECONDS = 120;
const SEND_CONCURRENCY = 4;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type ClaimRow = {
  delivery_id?: unknown;
  delivery_claim_token?: unknown;
  push_event_id?: unknown;
  notification_id?: unknown;
  event_type?: unknown;
  push_subscription_id?: unknown;
  endpoint?: unknown;
  p256dh?: unknown;
  auth?: unknown;
  expiration_time?: unknown;
  attempt_count?: unknown;
};

type RoutingNotification = {
  id: string;
  type: PushEventType;
  matchId: string | null;
  inquiryId: string | null;
};

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isPushEventType(value: unknown): value is PushEventType {
  return value === 'new_message'
    || value === 'new_like'
    || value === 'new_match'
    || value === 'support_inquiry_answered';
}

function parseClaim(value: unknown): PushDeliveryClaim | null {
  const row = value as ClaimRow;
  if (
    typeof row.delivery_id !== 'string'
    || !UUID_PATTERN.test(row.delivery_id)
    || typeof row.delivery_claim_token !== 'string'
    || !UUID_PATTERN.test(row.delivery_claim_token)
    || typeof row.push_event_id !== 'string'
    || !UUID_PATTERN.test(row.push_event_id)
    || typeof row.notification_id !== 'string'
    || !UUID_PATTERN.test(row.notification_id)
    || !isPushEventType(row.event_type)
    || typeof row.push_subscription_id !== 'string'
    || !UUID_PATTERN.test(row.push_subscription_id)
    || typeof row.endpoint !== 'string'
    || !row.endpoint.startsWith('https://')
    || typeof row.p256dh !== 'string'
    || !BASE64_URL_PATTERN.test(row.p256dh)
    || typeof row.auth !== 'string'
    || !BASE64_URL_PATTERN.test(row.auth)
    || (row.expiration_time !== null && typeof row.expiration_time !== 'string')
    || typeof row.attempt_count !== 'number'
    || !Number.isInteger(row.attempt_count)
    || row.attempt_count < 1
  ) {
    return null;
  }

  return {
    deliveryId: row.delivery_id,
    claimToken: row.delivery_claim_token,
    pushEventId: row.push_event_id,
    notificationId: row.notification_id,
    eventType: row.event_type,
    pushSubscriptionId: row.push_subscription_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    expirationTime: row.expiration_time,
    attemptCount: row.attempt_count,
  };
}

function parseNullableUuid(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

function parseRoutingNotifications(value: unknown): RoutingNotification[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const matchId = parseNullableUuid(row.match_id);
    const inquiryId = parseNullableUuid(row.inquiry_id);
    if (
      typeof row.id !== 'string'
      || !UUID_PATTERN.test(row.id)
      || !isPushEventType(row.type)
      || matchId === undefined
      || inquiryId === undefined
    ) {
      return [];
    }

    return [{
      id: row.id,
      type: row.type,
      matchId,
      inquiryId,
    }];
  });
}

function resolveTargetId(
  claim: PushDeliveryClaim,
  notifications: RoutingNotification[],
): string | null | undefined {
  const notification = notifications.find((row) => row.id === claim.notificationId);
  if (
    !notification
    || notification.type !== claim.eventType
  ) {
    return undefined;
  }

  if (claim.eventType === 'new_message' || claim.eventType === 'new_match') {
    return notification.matchId ?? undefined;
  }
  if (claim.eventType === 'support_inquiry_answered') {
    return notification.inquiryId ?? undefined;
  }
  return null;
}

export async function POST(request: Request) {
  const workerSecret = process.env.PUSH_WORKER_SECRET;
  if (!workerSecret || workerSecret.length < 32) {
    console.error('Push worker configuration is missing.', { code: 'worker_secret_missing' });
    return NextResponse.json({ message: 'Push worker is unavailable.' }, { status: 503 });
  }
  if (!isAuthorized(request, workerSecret)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  try {
    assertPushServerConfigured();
  } catch {
    console.error('Push worker configuration is missing or invalid.', { code: 'vapid_configuration_invalid' });
    return NextResponse.json({ message: 'Push worker is unavailable.' }, { status: 503 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    console.error('Push worker database configuration is missing.', { code: 'database_configuration_invalid' });
    return NextResponse.json({ message: 'Push worker is unavailable.' }, { status: 503 });
  }
  const { data: expanded, error: expansionError } = await admin.rpc('expand_push_event_batch', {
    p_limit: EXPANSION_LIMIT,
  });
  if (expansionError) {
    console.error('Push event expansion failed.', { code: expansionError.code ?? 'rpc_error' });
    return NextResponse.json({ message: 'Push drain failed.' }, { status: 500 });
  }

  const { data: claimedRows, error: claimError } = await admin.rpc('claim_push_delivery_batch', {
    p_limit: CLAIM_LIMIT,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });
  if (claimError) {
    console.error('Push delivery claim failed.', { code: claimError.code ?? 'rpc_error' });
    return NextResponse.json({ message: 'Push drain failed.' }, { status: 500 });
  }

  const claims = Array.isArray(claimedRows)
    ? claimedRows.map(parseClaim).filter((claim): claim is PushDeliveryClaim => claim !== null)
    : [];
  if (claims.length !== (Array.isArray(claimedRows) ? claimedRows.length : 0)) {
    console.error('Push delivery claim returned an incompatible shape.', { code: 'invalid_claim_shape' });
    return NextResponse.json({ message: 'Push drain failed.' }, { status: 500 });
  }

  let routingNotifications: RoutingNotification[] = [];
  if (claims.length > 0) {
    const { data, error } = await admin
      .from('notifications')
      .select(`
        id,
        type,
        match_id,
        inquiry_id
      `)
      .in('id', [...new Set(claims.map((claim) => claim.notificationId))]);

    if (error) {
      console.error('Push routing target lookup failed.', {
        code: error.code ?? 'routing_lookup_error',
      });
    } else {
      routingNotifications = parseRoutingNotifications(data);
    }
  }

  const routedClaims = claims.map((claim) => ({
    ...claim,
    targetId: resolveTargetId(claim, routingNotifications),
  }));

  const counts = { sent: 0, pending: 0, failed: 0, stale: 0 };
  try {
    for (let index = 0; index < routedClaims.length; index += SEND_CONCURRENCY) {
      const batch = routedClaims.slice(index, index + SEND_CONCURRENCY);
      const outcomes = await Promise.all(batch.map(async (claim): Promise<keyof typeof counts> => {
        const result = await sendPushDelivery(claim);
        if (result.ok) {
          const { data, error } = await admin.rpc('complete_push_delivery', {
            p_delivery_id: claim.deliveryId,
            p_claim_token: claim.claimToken,
            p_http_status: result.httpStatus,
          });
          if (error) throw new Error('complete_rpc_failed');
          return data === true ? 'sent' : 'stale';
        }

        const { data, error } = await admin.rpc('fail_push_delivery', {
          p_delivery_id: claim.deliveryId,
          p_claim_token: claim.claimToken,
          p_http_status: result.httpStatus,
          p_last_error_code: result.errorCode,
          p_retry_after: result.retryAfter,
        });
        if (error) throw new Error('fail_rpc_failed');
        if (data === 'pending') return 'pending';
        if (data === 'failed') return 'failed';
        return 'stale';
      }));

      for (const outcome of outcomes) counts[outcome] += 1;
    }
  } catch {
    console.error('Push delivery result update failed.', { code: 'delivery_result_rpc_failed' });
    return NextResponse.json({ message: 'Push drain failed.' }, { status: 500 });
  }

  return NextResponse.json({
    expanded: typeof expanded === 'number' ? expanded : 0,
    claimed: claims.length,
    ...counts,
  });
}
