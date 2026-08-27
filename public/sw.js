self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = null;
    try {
      payload = event.data?.json() ?? null;
    } catch {
      payload = null;
    }

    const eventId = typeof payload?.eventId === 'string' ? payload.eventId : null;
    const notificationId = typeof payload?.notificationId === 'string'
      ? payload.notificationId
      : null;
    const type = payload?.type === 'new_message'
      || payload?.type === 'new_like'
      || payload?.type === 'new_match'
      || payload?.type === 'support_inquiry_answered'
      || payload?.type === 'match_ended'
      ? payload.type
      : null;
    const targetId = typeof payload?.targetId === 'string'
      ? payload.targetId
      : payload?.targetId === null
        ? null
        : undefined;
    const body = type === 'new_message'
      ? '새 메시지가 도착했습니다.'
      : type === 'new_like'
        ? '새로운 좋아요를 받았습니다.'
        : type === 'new_match'
          ? '새로운 매칭이 성사되었습니다.'
          : type === 'support_inquiry_answered'
            ? '문의에 답변이 등록되었습니다.'
            : type === 'match_ended'
              ? '매칭이 종료되었습니다.'
              : '새 알림이 도착했습니다.';

    await self.registration.showNotification('ComMatch', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: eventId ? `commatch-push-${eventId}` : undefined,
      data: {
        version: 1,
        eventId,
        notificationId,
        type,
        targetId,
      },
    });
  })());
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getNotificationDestination(data) {
  const type = data?.type;
  const targetId = typeof data?.targetId === 'string' && UUID_PATTERN.test(data.targetId)
    ? data.targetId
    : null;

  if ((type === 'new_message' || type === 'new_match' || type === 'match_ended') && targetId) {
    return `/matches/${targetId}/chat`;
  }
  if (type === 'new_like' && data?.targetId === null) {
    return '/premium/received-likes';
  }
  if (type === 'support_inquiry_answered' && targetId) {
    return `/support/inquiries/${targetId}`;
  }
  return '/notifications';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = getNotificationDestination(event.notification.data);
    let destination = new URL('/notifications', self.location.origin);
    try {
      const candidate = new URL(path, self.location.origin);
      if (candidate.origin === self.location.origin) destination = candidate;
    } catch {
      // Keep the same-origin fallback destination.
    }

    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    const exactClient = windowClients.find((client) => {
      try {
        const clientUrl = new URL(client.url);
        return clientUrl.origin === self.location.origin
          && clientUrl.href === destination.href;
      } catch {
        return false;
      }
    });

    if (exactClient) {
      await exactClient.focus();
      return;
    }
    await self.clients.openWindow(destination.href);
  })());
});
