import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, plain, memoryStorage } from './test-runtime.mjs';

// Real installed SDK, inert document: scripts are recorded but NEVER downloaded or executed.
// Assertions concern SDK command preparation, not network collection success.
const events = (e) => plain((e.browser.vaq ?? []).filter(([type]) => type === 'event').map(([, payload]) => payload));
function setup(options = {}) {
  const e = environment({ url: 'https://www.commatch.net/signup?email=private@example.com#token', sdk: 'real', ready: false, ...options });
  const effects = [];
  const page = e.load('components/analytics/PublicWebAnalytics.tsx', {
    react: { useEffect: (effect) => effects.push(effect) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    // Its child can remain suspended; the real public inject API must prepare the SDK explicitly.
    '@vercel/analytics/next': { Analytics: () => null },
  });
  const api = e.load('lib/analytics/promotion.ts');
  page.default();
  return { e, api, initialize: () => effects.forEach((effect) => effect()), filter: page.filterPublicPageView };
}

test('cold signup waits for real SDK and filter registration, then attempts one event across initialization replay', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_start');
  assert.equal(e.browser.va, undefined);
  assert.equal(events(e).length, 0);
  initialize(); initialize();
  assert.deepEqual(events(e), [{ name: 'signup_start', data: { channel: 'unknown', campaign: 'none' } }]);
  assert.equal(e.browser.vaq[0][0], 'beforeSend');
  assert.equal(e.scripts.length, 1);
  assert.equal(e.scripts[0].dataset.disableAutoTrack, '1');
  assert.equal(e.scripts[0].dataset.sdkn, '@vercel/analytics/next');
});

test('uninitialized SDK cannot receive unapproved names or payloads and the actual registered filter protects auth URLs', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_verified'); api.trackPromotionEvent('purchase');
  api.trackPromotionEvent('signup_start', { email: 'private@example.com', answer: 5 });
  assert.equal(events(e).length, 0);
  initialize();
  const beforeSend = e.browser.vaq.find(([type]) => type === 'beforeSend')[1];
  assert.equal(beforeSend({ type: 'pageview', url: e.browser.location.href }), null);
  assert.equal(beforeSend({ type: 'event', url: '/auth/callback?code=private' }), null);
  assert.equal(beforeSend({ type: 'event', url: e.browser.location.href }).url, 'https://www.commatch.net/signup');
  assert.equal(JSON.stringify(events(e)).includes('private'), false);
  assert.equal(events(e).length, 1);
});

test('operator exclusion enabled before or during waiting discards the queue permanently', () => {
  for (const before of [false, true]) {
    const { e, api, initialize } = setup();
    if (before) e.browser.localStorage.setItem(api.ANALYTICS_EXCLUDE_KEY, '1');
    api.trackPromotionEvent('signup_start');
    e.browser.localStorage.setItem(api.ANALYTICS_EXCLUDE_KEY, '1');
    initialize();
    e.browser.localStorage.removeItem(api.ANALYTICS_EXCLUDE_KEY);
    initialize();
    assert.equal(events(e).length, 0);
    api.trackPromotionEvent('signup_submitted');
    assert.equal(events(e).length, 1);
  }
});

test('queue is bounded to twenty approved events and snapshots only validated attribution', () => {
  const { e, api, initialize } = setup({ url: 'https://www.commatch.net/signup?utm_source=youtube&utm_campaign=launch_2026' });
  for (let i = 0; i < 50; i++) api.trackPromotionEvent('signup_start');
  e.storage.setItem(api.PROMOTION_STORAGE_KEY, '{"channel":"private@example.com","campaign":"secret"}');
  initialize();
  assert.equal(events(e).length, 20);
  assert.ok(events(e).every((event) => JSON.stringify(event.data) === '{"channel":"youtube","campaign":"launch_2026"}'));
});

test('initialization timeout drops pending events and never retries or throws', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_start');
  e.expireTimers();
  assert.doesNotThrow(initialize);
  api.trackPromotionEvent('signup_submitted');
  assert.equal(events(e).length, 0);
  assert.equal(e.scripts.length, 0);
});

test('actual SDK injection failure disables events safely without retry', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_start');
  e.failInitialization();
  assert.doesNotThrow(initialize);
  assert.doesNotThrow(initialize);
  api.trackPromotionEvent('signup_submitted');
  assert.equal(events(e).length, 0);
});

test('page refresh loses pending memory events without replaying them from storage', () => {
  const storage = memoryStorage();
  const old = setup({ storage }); old.api.trackPromotionEvent('signup_start');
  const refreshed = setup({ storage });
  refreshed.api.trackPromotionEvent('signup_start');
  refreshed.initialize(); refreshed.initialize();
  assert.equal(events(refreshed.e).length, 1);
  assert.equal(events(old.e).length, 0);
});

test('exclusion detected during flush discards all remaining queued events', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_start');
  api.trackPromotionEvent('signup_submitted');
  api.trackPromotionEvent('signup_start');
  const originalRead = e.browser.localStorage.getItem;
  let reads = 0;
  e.browser.localStorage.getItem = (key) => key === api.ANALYTICS_EXCLUDE_KEY
    ? (++reads === 3 ? '1' : null) : originalRead(key);
  initialize();
  assert.equal(events(e).length, 1);
});

test('invalid filter cannot mark SDK ready or release pending events', () => {
  const { e, api, initialize } = setup();
  api.trackPromotionEvent('signup_start');
  api.initializePromotionAnalytics(null);
  assert.equal(e.browser.va, undefined);
  assert.equal(events(e).length, 0);
  initialize();
  assert.equal(events(e).length, 1);
});

for (const [elapsed, expected] of [[29_999, 1], [30_000, 0], [30_001, 0]]) {
  test(`delayed timer: pending event at ${elapsed}ms produces ${expected} SDK attempts`, () => {
    let time = 1_000;
    const { e, api, initialize } = setup({ now: () => time });
    api.trackPromotionEvent('signup_start');
    time += elapsed;
    // Deliberately do not run the timer: elapsed time must be enforced independently.
    initialize(); initialize();
    assert.equal(events(e).length, expected);
  });
}

test('late enqueue cannot extend an overdue initialization queue when timer has not fired', () => {
  let time = 1_000;
  const { e, api, initialize } = setup({ now: () => time });
  api.trackPromotionEvent('signup_start');
  time += 30_000;
  api.trackPromotionEvent('signup_submitted');
  initialize();
  assert.equal(events(e).length, 0);
});

test('queue expiration during SDK initialization prevents stale event delivery', () => {
  let time = 1_000;
  const { e, api, initialize } = setup({ now: () => time });
  api.trackPromotionEvent('signup_start');
  time += 29_999;
  e.scripts.push = function (script) {
    time += 1;
    return Array.prototype.push.call(this, script);
  };
  initialize();
  assert.equal(events(e).length, 0);
});

test('expiration is rechecked before each SDK attempt while draining the queue', () => {
  let time = 1_000;
  const { e, api, initialize } = setup({ now: () => time });
  api.trackPromotionEvent('signup_start');
  api.trackPromotionEvent('signup_submitted');
  time += 29_999;
  const originalRead = e.browser.localStorage.getItem;
  let reads = 0;
  e.browser.localStorage.getItem = (key) => {
    // Root attribution reads first, then one opt-out check before each attempt.
    if (key === api.ANALYTICS_EXCLUDE_KEY && ++reads === 3) time += 1;
    return originalRead(key);
  };
  initialize();
  assert.deepEqual(events(e).map(({ name }) => name), ['signup_start']);
});
