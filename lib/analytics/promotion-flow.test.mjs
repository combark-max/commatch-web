import assert from 'node:assert/strict';
import test from 'node:test';
import { environment } from './test-runtime.mjs';

// A small hook driver follows existing VM-based component tests without adding a DOM/test dependency.
// Actual page handlers, validation, reducers, scoring, session persistence and analytics all run.
function hooks(e) {
  let slots = [], deps = [], cursor = 0, pending = [], timers = new Map(), nextTimer = 0;
  const cleanups = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory) { return factory(); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!deps[index] || dependencies.some((value, i) => !Object.is(value, deps[index][i]))) {
        deps[index] = dependencies;
        pending.push({ index, effect });
      }
    },
  };
  Object.assign(e.browser, {
    setTimeout: (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), scrollTo: () => {},
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  });
  let component;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  return {
    dependencies: { react, 'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/link': { __esModule: true, default: 'a' },
      'lucide-react': new Proxy({}, { get: () => 'svg' }),
      '@/lib/auth/auth': { getCurrentUser: async () => ({ data: { user: null }, error: null }) },
    },
    setComponent(value) { component = value; },
    reset() { for (const cleanup of cleanups) cleanup?.(); slots = []; deps = []; pending = []; timers = new Map(); cleanups.length = 0; },
    async settle({ strict = false } = {}) {
      let tree;
      for (let round = 0; round < 3; round++) {
        cursor = 0; pending = []; tree = component();
        for (const { index, effect } of pending) {
          cleanups[index]?.(); cleanups[index] = effect();
          if (strict && round === 0) { cleanups[index]?.(); cleanups[index] = effect(); }
        }
        const scheduled = [...timers.entries()].filter(([, timer]) => timer.delay === 0);
        scheduled.forEach(([id, { callback }]) => { timers.delete(id); callback(); });
        await new Promise((done) => setImmediate(done));
      }
      return tree;
    },
  };
}

async function matchPage(options = {}) {
  const e = environment(options);
  const h = hooks(e);
  h.setComponent(e.load('app/(main)/match-test/page.tsx', h.dependencies).default);
  return { e, h, tree: await h.settle({ strict: true }) };
}

async function finishTest(h, tree) {
  for (let i = 0; i < 18; i++) {
    tree.props.onAnswer(3); tree = await h.settle();
    tree.props.onNext(); tree = await h.settle();
  }
  return tree;
}

test('first valid answer and valid result emit once despite repeated effects; restart allows a new attempt', async () => {
  const { e, h, tree: initial } = await matchPage();
  assert.equal(e.sent.length, 0);
  initial.props.onAnswer(3);
  let tree = await h.settle({ strict: true });
  tree.props.onAnswer(4); tree = await h.settle();
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start']);
  tree = await finishTest(h, tree);
  assert.ok(tree.props.analysis);
  await h.settle({ strict: true });
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start', 'match_test_complete']);
  tree.props.onRestart(); tree = await h.settle();
  tree = await finishTest(h, tree);
  assert.ok(tree.props.analysis);
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start', 'match_test_complete', 'match_test_start', 'match_test_complete']);
});

test('refresh/back restoration does not replay start or completion events', async () => {
  const { e, h, tree: initial } = await matchPage();
  initial.props.onAnswer(3); await h.settle();
  h.reset(); let tree = await h.settle({ strict: true });
  tree.props.onAnswer(4); tree = await h.settle();
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start']);
  await finishTest(h, tree);
  h.reset(); tree = await h.settle({ strict: true });
  assert.ok(tree.props.analysis);
  assert.deepEqual(e.sent.map(({ name }) => name), ['match_test_start', 'match_test_complete']);
});

test('invalid response does not count as a start and analytics errors leave results working', async () => {
  const { e, h, tree } = await matchPage();
  tree.props.onAnswer(0); let current = await h.settle();
  assert.equal(e.sent.length, 0);
  e.failTransport();
  current = await finishTest(h, current);
  assert.ok(current.props.analysis);
  assert.equal(e.sent.length, 0);
});

function find(value, type) {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.map((item) => find(item, type)).find(Boolean);
  return value.type === type ? value : find(value.props?.children, type);
}

async function signupPage(response = { data: { user: { identities: [{ id: 'test' }] } }, error: null }, options = {}) {
  const e = environment({ url: 'https://www.commatch.net/signup?email=private@example.com#token', ...options });
  const h = hooks(e);
  const requests = [], destinations = [];
  const form = {
    useForm: ({ resolver }) => ({ register: () => ({}), formState: { errors: {} },
      handleSubmit: (submit) => async (values) => {
        const result = await resolver(values, {}, { fields: {}, shouldUseNativeValidation: false });
        if (Object.keys(result.errors).length === 0) await submit(result.values);
      },
    }),
  };
  h.setComponent(e.load('app/(auth)/signup/page.tsx', {
    ...h.dependencies,
    '@/lib/auth/auth': { signUp: async (...args) => { requests.push(args); if (response instanceof Error) throw response; return typeof response === 'function' ? await response() : response; } },
    'next/navigation': { useRouter: () => ({ push: (value) => destinations.push(value), back: () => {} }) },
    'react-hook-form': form,
    '@/components/ui/Button': { __esModule: true, default: 'button' },
    '@/components/ui/Toast': { __esModule: true, default: 'toast' },
  }).default);
  return { e, h, requests, destinations, tree: await h.settle({ strict: true }) };
}
const validSignup = { email: ' person@example.com ', password: 'abc12345', confirmPassword: 'abc12345' };

test('signup entry counts once per mount under effect replay and counts a fresh entry', async () => {
  const { e, h } = await signupPage();
  await h.settle({ strict: true });
  assert.deepEqual(e.sent.map(({ name }) => name), ['signup_start']);
  h.reset(); await h.settle({ strict: true });
  assert.deepEqual(e.sent.map(({ name }) => name), ['signup_start', 'signup_start']);
});

test('invalid signup never calls auth or sends submitted', async () => {
  const { e, requests, destinations, tree } = await signupPage();
  for (const values of [{ ...validSignup, email: 'invalid' }, { ...validSignup, password: '123' }, { ...validSignup, confirmPassword: 'different' }]) {
    await find(tree, 'form').props.onSubmit(values);
  }
  assert.equal(requests.length, 0); assert.equal(destinations.length, 0);
  assert.deepEqual(e.sent.map(({ name }) => name), ['signup_start']);
});

test('auth error and duplicate identity response never send signup_submitted', async () => {
  for (const response of [{ data: { user: null }, error: { code: 'email_exists', status: 422 } },
    { data: { user: { identities: [] } }, error: null }]) {
    const { e, tree, destinations } = await signupPage(response);
    await find(tree, 'form').props.onSubmit(validSignup);
    assert.equal(destinations.length, 0);
    assert.deepEqual(e.sent.map(({ name }) => name), ['signup_start']);
  }
});

test('successful signup preserves auth arguments, pending email and redirect; analytics failure is isolated', async () => {
  for (const fail of [false, true]) {
    const { e, tree, requests, destinations } = await signupPage();
    if (fail) e.failTransport();
    await find(tree, 'form').props.onSubmit(validSignup);
    assert.deepEqual(requests, [['person@example.com', 'abc12345', 'https://www.commatch.net/auth/callback?next=/consent']]);
    assert.equal(e.storage.getItem('commatch.pendingEmail'), 'person@example.com');
    assert.deepEqual(destinations, ['/verify-email?email=person%40example.com']);
    assert.deepEqual(e.sent.map(({ name }) => name), fail ? ['signup_start'] : ['signup_start', 'signup_submitted']);
    assert.ok(e.sent.every(({ properties }) => Object.keys(properties).join(',') === 'channel,campaign'));
  }
});

test('signup_submitted waits for successful Supabase response and ignores thrown or missing-user responses', async () => {
  let resolveAuth;
  const authResult = new Promise((resolve) => { resolveAuth = resolve; });
  const deferred = await signupPage(() => authResult);
  const submitting = find(deferred.tree, 'form').props.onSubmit(validSignup);
  await new Promise((done) => setImmediate(done));
  assert.equal(deferred.requests.length, 1);
  assert.deepEqual(deferred.e.sent.map(({ name }) => name), ['signup_start']);
  resolveAuth({ data: { user: { identities: [{ id: 'test' }] } }, error: null });
  await submitting;
  assert.deepEqual(deferred.e.sent.map(({ name }) => name), ['signup_start', 'signup_submitted']);
  for (const response of [new Error('network failed'), { data: { user: null }, error: null }]) {
    const failed = await signupPage(response);
    await find(failed.tree, 'form').props.onSubmit(validSignup);
    assert.deepEqual(failed.e.sent.map(({ name }) => name), ['signup_start']);
  }
});

test('concurrent successful signup responses produce only one submitted event per page entry', async () => {
  const { e, tree } = await signupPage();
  await Promise.all([find(tree, 'form').props.onSubmit(validSignup), find(tree, 'form').props.onSubmit(validSignup)]);
  assert.deepEqual(e.sent.map(({ name }) => name), ['signup_start', 'signup_submitted']);
});

test('actual SDK injection failure leaves signup redirect and match-test result intact', async () => {
  const signup = await signupPage(undefined, { sdk: 'real', ready: false });
  signup.e.failInitialization();
  signup.e.load('lib/analytics/promotion.ts').initializePromotionAnalytics((event) => event);
  await find(signup.tree, 'form').props.onSubmit(validSignup);
  assert.deepEqual(signup.destinations, ['/verify-email?email=person%40example.com']);
  assert.equal((signup.e.browser.vaq ?? []).filter(([type]) => type === 'event').length, 0);

  const match = await matchPage({ sdk: 'real', ready: false });
  match.e.failInitialization();
  match.e.load('lib/analytics/promotion.ts').initializePromotionAnalytics((event) => event);
  const result = await finishTest(match.h, match.tree);
  assert.ok(result.props.analysis);
  assert.equal((match.e.browser.vaq ?? []).filter(([type]) => type === 'event').length, 0);
});

test('direct signup page mount is preserved until actual SDK and PublicWebAnalytics filter are initialized', async () => {
  const signup = await signupPage(undefined, { sdk: 'real', ready: false });
  assert.equal(signup.e.browser.va, undefined);
  const effects = [];
  const publicAnalytics = signup.e.load('components/analytics/PublicWebAnalytics.tsx', {
    react: { useEffect: (effect) => effects.push(effect) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@vercel/analytics/next': { Analytics: () => null },
  });
  publicAnalytics.default();
  effects.forEach((effect) => effect()); effects.forEach((effect) => effect());
  await signup.h.settle({ strict: true });
  const names = () => Array.from(signup.e.browser.vaq ?? []).filter(([type]) => type === 'event').map(([, payload]) => payload.name);
  assert.deepEqual(names(), ['signup_start']);
  await find(signup.tree, 'form').props.onSubmit(validSignup);
  assert.deepEqual(names(), ['signup_start', 'signup_submitted']);
  assert.deepEqual(signup.destinations, ['/verify-email?email=person%40example.com']);
});
