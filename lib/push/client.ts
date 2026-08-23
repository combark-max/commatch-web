import { createClient } from '@/lib/supabase/client';

export type PushCapability =
  | { status: 'ready'; permission: NotificationPermission }
  | { status: 'ios-install-required'; permission: 'unavailable' }
  | { status: 'unsupported'; permission: 'unavailable' }
  | { status: 'configuration-missing'; permission: NotificationPermission };

export type PushSubscriptionSettings = {
  subscriptionId: string;
  newMessageEnabled: boolean;
  newLikeEnabled: boolean;
  revokedAt: string | null;
};

type PushSettingsRow = {
  subscription_id?: unknown;
  new_message_enabled?: unknown;
  new_like_enabled?: unknown;
  revoked_at?: unknown;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '';

function isIosOrIpad(): boolean {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || navigatorWithStandalone.standalone === true;
}

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone;
  return navigatorWithStandalone.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

export function getPushCapability(): PushCapability {
  if (typeof window === 'undefined') {
    return { status: 'unsupported', permission: 'unavailable' };
  }

  if (isIosOrIpad() && !isStandalone()) {
    return { status: 'ios-install-required', permission: 'unavailable' };
  }

  if (
    !window.isSecureContext
    || !('serviceWorker' in navigator)
    || !('PushManager' in window)
    || !('Notification' in window)
  ) {
    return { status: 'unsupported', permission: 'unavailable' };
  }

  if (!VAPID_PUBLIC_KEY) {
    return { status: 'configuration-missing', permission: Notification.permission };
  }

  return { status: 'ready', permission: Notification.permission };
}

export async function ensureServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const capability = getPushCapability();
  if (capability.status !== 'ready') {
    throw new Error(`Push is not ready: ${capability.status}`);
  }

  await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  return navigator.serviceWorker.ready;
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete PushSubscription.');
  }

  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
    expirationTime: typeof json.expirationTime === 'number'
      ? new Date(json.expirationTime).toISOString()
      : null,
  };
}

function parseSettings(value: unknown): PushSubscriptionSettings | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const row = value[0] as PushSettingsRow;
  if (
    typeof row.subscription_id !== 'string'
    || typeof row.new_message_enabled !== 'boolean'
    || typeof row.new_like_enabled !== 'boolean'
    || (row.revoked_at !== null && typeof row.revoked_at !== 'string')
  ) {
    return null;
  }

  return {
    subscriptionId: row.subscription_id,
    newMessageEnabled: row.new_message_enabled,
    newLikeEnabled: row.new_like_enabled,
    revokedAt: row.revoked_at ?? null,
  };
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration || !registration.pushManager) return null;
  return registration.pushManager.getSubscription();
}

export async function getMyPushSubscriptionSettings(
  subscription: PushSubscription,
): Promise<PushSubscriptionSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_my_push_subscription_settings', {
    p_endpoint: subscription.endpoint,
  });
  if (error) throw error;
  return parseSettings(data);
}

export async function subscribeAndRegisterPush(options: {
  newMessageEnabled: boolean;
  newLikeEnabled: boolean;
}): Promise<{ subscription: PushSubscription; settings: PushSubscriptionSettings }> {
  const capability = getPushCapability();
  if (capability.status !== 'ready') {
    throw new Error(`Push is not ready: ${capability.status}`);
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'PUSH_PERMISSION_DENIED' : 'PUSH_PERMISSION_NOT_GRANTED');
  }

  const registration = await ensureServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const createdSubscription = subscription === null;

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  try {
    const serialized = serializeSubscription(subscription);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('register_my_push_subscription', {
      p_endpoint: serialized.endpoint,
      p_p256dh: serialized.p256dh,
      p_auth: serialized.auth,
      p_expiration_time: serialized.expirationTime,
      p_new_message_enabled: options.newMessageEnabled,
      p_new_like_enabled: options.newLikeEnabled,
    });
    if (error) throw error;

    const settings = parseSettings(data);
    if (!settings || settings.revokedAt !== null) {
      throw new Error('Server returned an invalid push subscription state.');
    }
    return { subscription, settings };
  } catch (error) {
    if (createdSubscription) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
}

export async function revokeAndUnsubscribePush(
  subscription?: PushSubscription | null,
): Promise<void> {
  const currentSubscription = subscription ?? await getCurrentPushSubscription();
  if (!currentSubscription) return;

  const supabase = createClient();
  let revokeError: unknown = null;
  try {
    const { error } = await supabase.rpc('revoke_my_push_subscription', {
      p_endpoint: currentSubscription.endpoint,
    });
    if (error) revokeError = error;
  } catch (error) {
    revokeError = error;
  }

  await currentSubscription.unsubscribe().catch(() => false);
  if (revokeError) throw revokeError;
}

export async function cleanupPushBeforeSignOut(): Promise<void> {
  try {
    await revokeAndUnsubscribePush();
  } catch (error) {
    console.error('로그아웃 전 Push 구독 정리를 완료하지 못했습니다.', error);
  }
}
