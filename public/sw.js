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
      ? payload.type
      : null;
    const body = type === 'new_message'
      ? '새 메시지가 도착했습니다.'
      : type === 'new_like'
        ? '새로운 좋아요를 받았습니다.'
        : type === 'new_match'
          ? '새로운 매칭이 성사되었습니다.'
          : type === 'support_inquiry_answered'
            ? '문의에 답변이 등록되었습니다.'
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
      },
    });
  })());
});

// Click destination handling is intentionally deferred to Phase 2-C.
