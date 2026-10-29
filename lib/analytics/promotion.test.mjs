import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, memoryStorage, plain } from './test-runtime.mjs';

test('approved UTM overrides referrer and campaign is allowlisted', () => {
  const { classifyPromotion } = environment().load('lib/analytics/promotion.ts');
  for (const channel of ['naver_blog', 'naver_cafe', 'naver_kin', 'daum_cafe', 'google', 'gemini', 'youtube', 'direct']) {
    assert.deepEqual(plain(classifyPromotion(`https://www.commatch.net/?utm_source=${channel}&utm_campaign=launch_2026`, 'https://google.com/')),
      { channel, campaign: 'launch_2026' });
  }
  assert.deepEqual(plain(classifyPromotion('https://www.commatch.net/?utm_source=email@example.com&utm_campaign=private', 'https://kin.naver.com/qna/1')),
    { channel: 'naver_kin', campaign: 'none' });
  assert.deepEqual(plain(classifyPromotion('https://www.commatch.net/?utm_source=google&utm_campaign=match_test_2026', '')),
    { channel: 'google', campaign: 'match_test_2026' });
});

test('referrer hostname boundaries resist lookalikes and missing sources stay unknown', () => {
  const { classifyPromotion } = environment().load('lib/analytics/promotion.ts');
  const cases = [
    ['https://blog.naver.com/entry', 'naver_blog'], ['https://m.blog.naver.com/entry', 'naver_blog'],
    ['https://cafe.naver.com/a', 'naver_cafe'], ['https://kin.naver.com/a', 'naver_kin'],
    ['https://cafe.daum.net/a', 'daum_cafe'], ['https://www.google.com/search', 'google'],
    ['https://www.google.co.kr/search', 'google'], ['https://gemini.google.com/app', 'gemini'],
    ['https://m.youtube.com/watch', 'youtube'], ['https://youtu.be/a', 'youtube'],
    ['', 'unknown'], ['https://naver.com/', 'unknown'], ['https://www.commatch.net/', 'unknown'],
    ['https://blog.naver.com.evil.test/', 'unknown'], ['https://evilgoogle.com/', 'unknown'],
    ['https://google.com@evil.test/', 'unknown'], ['javascript:google.com', 'unknown'], ['invalid', 'unknown'],
  ];
  for (const [referrer, channel] of cases) {
    assert.deepEqual(plain(classifyPromotion('https://www.commatch.net/', referrer)), { channel, campaign: 'none' }, referrer);
  }
});

test('first-touch attribution survives same-tab navigation and module reload', () => {
  const storage = memoryStorage();
  const first = environment({ url: 'https://www.commatch.net/?utm_source=naver_blog&utm_campaign=launch_2026', storage });
  first.load('lib/analytics/promotion.ts').capturePromotion();
  const second = environment({ url: 'https://www.commatch.net/signup?utm_source=google', storage });
  second.load('lib/analytics/promotion.ts').trackPromotionEvent('signup_start');
  assert.deepEqual(second.sent, [{ name: 'signup_start', properties: { channel: 'naver_blog', campaign: 'launch_2026' } }]);
});

test('stored attribution is revalidated and arbitrary properties never leave the wrapper', () => {
  for (const value of ['invalid JSON', '{"channel":"email@example.com","campaign":"none"}',
    '{"channel":"google","campaign":"secret"}', '{"channel":"google","campaign":"none","email":"private"}']) {
    const e = environment({ url: 'https://www.commatch.net/signup' });
    const api = e.load('lib/analytics/promotion.ts');
    e.storage.setItem(api.PROMOTION_STORAGE_KEY, value);
    api.trackPromotionEvent('signup_start', { email: 'private' });
    assert.deepEqual(e.sent, [{ name: 'signup_start', properties: { channel: 'unknown', campaign: 'none' } }]);
  }
});

test('unknown events and mismatched routes never reach the SDK', () => {
  const e = environment();
  const api = e.load('lib/analytics/promotion.ts');
  for (const name of ['purchase', 'Signup', 'signup_verified', '', null, {}, '__proto__', 'signup_start']) api.trackPromotionEvent(name);
  api.trackPromotionEvent('match_test_start');
  api.trackPromotionEvent('match_test_complete');
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start', 'match_test_complete']);
});

test('only the exact operator flag suppresses approved events', () => {
  const e = environment();
  const api = e.load('lib/analytics/promotion.ts');
  e.browser.localStorage.setItem(api.ANALYTICS_EXCLUDE_KEY, '1');
  api.trackPromotionEvent('match_test_start');
  assert.equal(e.sent.length, 0);
  e.browser.localStorage.setItem(api.ANALYTICS_EXCLUDE_KEY, '0');
  api.trackPromotionEvent('match_test_start');
  assert.equal(e.sent.length, 1);
});

test('storage getter/read/write errors and SDK failures never interrupt service flows', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const e = environment({ url: 'https://www.commatch.net/match-test?utm_source=youtube', storage: broken });
  const api = e.load('lib/analytics/promotion.ts');
  Object.defineProperty(e.browser, 'localStorage', { get() { throw new Error('denied'); } });
  api.capturePromotion();
  e.browser.location = new URL('https://www.commatch.net/match-test');
  api.trackPromotionEvent('match_test_start');
  assert.deepEqual(e.sent[0].properties, { channel: 'youtube', campaign: 'none' });
  Object.defineProperty(e.browser, 'sessionStorage', { get() { throw new Error('denied'); } });
  e.failTransport();
  assert.doesNotThrow(() => api.trackPromotionEvent('match_test_complete'));
});
