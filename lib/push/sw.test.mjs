import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
const drainRouteSource = await readFile(
  new URL('../../app/api/internal/push/drain/route.ts', import.meta.url),
  'utf8',
);
const MATCH_ID = '8f574a72-f086-4b10-a33d-cf78e62fd036';
const INQUIRY_ID = 'b93e4459-9f5d-49de-a2bd-dca449eb18c4';

function createWorker(windowClients = []) {
  const listeners = new Map();
  const shownNotifications = [];
  const openedUrls = [];
  const self = {
    location: { origin: 'https://commatch.test' },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    registration: {
      async showNotification(title, options) {
        shownNotifications.push({ title, options });
      },
    },
    clients: {
      async claim() {},
      async matchAll() {
        return windowClients;
      },
      async openWindow(url) {
        openedUrls.push(url);
      },
    },
    async skipWaiting() {},
  };

  vm.runInNewContext(script, { self, URL });
  return { listeners, shownNotifications, openedUrls };
}

test('drain routing lookup does not directly read the protected push_events table', () => {
  assert.match(drainRouteSource, /\.from\('notifications'\)/);
  assert.doesNotMatch(drainRouteSource, /push_events!inner/);
  assert.doesNotMatch(drainRouteSource, /\.from\(['"]push_events['"]\)/);
});

async function dispatch(listener, event) {
  let pending;
  listener({
    ...event,
    waitUntil(promise) {
      pending = promise;
    },
  });
  await pending;
}

test('push display contract retains existing fields and stores routing data', async () => {
  const worker = createWorker();
  await dispatch(worker.listeners.get('push'), {
    data: {
      json: () => ({
        eventId: MATCH_ID,
        notificationId: INQUIRY_ID,
        type: 'new_message',
        targetId: MATCH_ID,
      }),
    },
  });

  assert.equal(worker.shownNotifications.length, 1);
  assert.equal(worker.shownNotifications[0].title, 'ComMatch');
  assert.equal(worker.shownNotifications[0].options.icon, '/icons/icon-192.png');
  assert.equal(worker.shownNotifications[0].options.badge, '/icons/icon-192.png');
  assert.deepEqual(
    JSON.parse(JSON.stringify(worker.shownNotifications[0].options.data)),
    {
      version: 1,
      eventId: MATCH_ID,
      notificationId: INQUIRY_ID,
      type: 'new_message',
      targetId: MATCH_ID,
    },
  );
});

test('malformed push payload keeps the generic display fallback', async () => {
  const worker = createWorker();
  await dispatch(worker.listeners.get('push'), {
    data: {
      json() {
        throw new Error('invalid payload');
      },
    },
  });

  assert.equal(worker.shownNotifications.length, 1);
  assert.equal(worker.shownNotifications[0].title, 'ComMatch');
  assert.equal(worker.shownNotifications[0].options.body, '새 알림이 도착했습니다.');
  assert.equal(worker.shownNotifications[0].options.data.type, null);
  assert.equal(worker.shownNotifications[0].options.data.targetId, undefined);
});

test('notification clicks open only allowlisted same-origin destinations', async () => {
  const cases = [
    ['new_message', MATCH_ID, `/matches/${MATCH_ID}/chat`],
    ['new_like', null, '/premium/received-likes'],
    ['new_match', MATCH_ID, `/matches/${MATCH_ID}/chat`],
    ['support_inquiry_answered', INQUIRY_ID, `/support/inquiries/${INQUIRY_ID}`],
    ['new_message', null, '/notifications'],
    ['support_inquiry_answered', 'not-a-uuid', '/notifications'],
    ['new_message', 'https://evil.example/path', '/notifications'],
    ['new_like', undefined, '/notifications'],
    ['new_like', 'https://evil.example/path', '/notifications'],
    ['unknown', MATCH_ID, '/notifications'],
  ];

  for (const [type, targetId, path] of cases) {
    const worker = createWorker();
    let closed = false;
    await dispatch(worker.listeners.get('notificationclick'), {
      notification: {
        data: { type, targetId },
        close() {
          closed = true;
        },
      },
    });
    assert.equal(closed, true);
    assert.deepEqual(worker.openedUrls, [`https://commatch.test${path}`]);
  }
});

test('notification clicks focus only an exact client and never navigate another tab', async () => {
  let exactFocusCount = 0;
  let otherFocusCount = 0;
  let navigateCount = 0;
  const exactUrl = `https://commatch.test/matches/${MATCH_ID}/chat`;
  const exactClient = {
    url: exactUrl,
    async focus() {
      exactFocusCount += 1;
    },
    async navigate() {
      navigateCount += 1;
    },
  };
  const otherClient = {
    url: 'https://commatch.test/settings',
    async focus() {
      otherFocusCount += 1;
    },
    async navigate() {
      navigateCount += 1;
    },
  };

  const exactWorker = createWorker([otherClient, exactClient]);
  await dispatch(exactWorker.listeners.get('notificationclick'), {
    notification: { data: { type: 'new_message', targetId: MATCH_ID }, close() {} },
  });
  assert.equal(exactFocusCount, 1);
  assert.equal(otherFocusCount, 0);
  assert.equal(navigateCount, 0);
  assert.deepEqual(exactWorker.openedUrls, []);

  const otherWorker = createWorker([otherClient]);
  await dispatch(otherWorker.listeners.get('notificationclick'), {
    notification: { data: { type: 'new_message', targetId: MATCH_ID }, close() {} },
  });
  assert.equal(otherFocusCount, 0);
  assert.equal(navigateCount, 0);
  assert.deepEqual(otherWorker.openedUrls, [exactUrl]);
});
