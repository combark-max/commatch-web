import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '..');
const NOT_FOUND_MESSAGE = '입력한 정보와 일치하는 계정을 확인할 수 없습니다.';
const INVALID_MESSAGE = '입력한 정보를 다시 확인해주세요.';
const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const SERVICE_ROLE_KEY = 'test-service-role-key';
const CLIENT_IP = '203.0.113.10';

const loadModule = (relativePath, requireOverrides, globals = {}) => {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({
    ...globals,
    console: globals.console ?? console,
    exports: loadedModule.exports,
    module: loadedModule,
    require: (specifier) => {
      if (specifier in requireOverrides) return requireOverrides[specifier];
      throw new Error(`Unexpected require: ${specifier}`);
    },
  });
  const wrapper = new vm.Script(`(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`, {
    filename,
  }).runInContext(context);
  wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));
  return loadedModule.exports;
};

const responseJson = async (response) => JSON.parse(await response.text());

const phoneModule = loadModule('lib/auth/phone.ts', {});

const createRouteHarness = ({
  accounts = [],
  profiles = [],
  authUser = null,
  limiterResult = [{ allowed: true, retry_after_seconds: 0 }],
  limiterError = null,
} = {}) => {
  const calls = [];
  const admin = {
    rpc: async (name, args) => {
      calls.push({ type: 'rpc', name, args });
      return { data: limiterResult, error: limiterError };
    },
    from: (table) => {
      const filters = [];
      const query = {
        select: (columns) => {
          calls.push({ type: 'select', table, columns });
          return query;
        },
        eq: (column, value) => {
          filters.push({ method: 'eq', column, value });
          return query;
        },
        not: (column, operator, value) => {
          filters.push({ method: 'not', column, operator, value });
          return query;
        },
        limit: async (limit) => {
          calls.push({ type: 'table', table, filters: structuredClone(filters), limit });
          return { data: table === 'accounts' ? accounts : profiles, error: null };
        },
      };
      return query;
    },
    auth: {
      admin: {
        getUserById: async (userId) => {
          calls.push({ type: 'auth', userId });
          return { data: { user: authUser }, error: null };
        },
      },
    },
  };

  const route = loadModule('app/api/account/find-email/route.ts', {
    'node:crypto': { createHmac },
    'next/server': {
      NextResponse: {
        json: (body, init) => new Response(JSON.stringify(body), {
          headers: {
            'content-type': 'application/json',
            ...init?.headers,
          },
          status: init?.status ?? 200,
        }),
      },
    },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/auth/phone': phoneModule,
  }, {
    Headers,
    Response,
    process: {
      env: {
        NODE_ENV: 'test',
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        VERCEL: '1',
      },
    },
  });

  const request = ({
    nickname = '테스터',
    birthDate = '1990-01-01',
    phone = '010-1234-5678',
    headers = { 'x-vercel-forwarded-for': CLIENT_IP },
  } = {}) => ({
    headers: new Headers(headers),
    json: async () => ({ nickname, birthDate, phone }),
  });

  return { POST: route.POST, request, calls };
};

test('matching nickname, birth date, and verified phone returns only the masked email', async () => {
  const harness = createRouteHarness({
    accounts: [{ user_id: 'user-1' }],
    profiles: [{ id: 'user-1', nickname: '테스터', birth_date: '1990-01-01' }],
    authUser: { id: 'user-1', email: 'member@example.com', phone: '+821012345678' },
  });

  const response = await harness.POST(harness.request());
  const body = await responseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body, { found: true, maskedEmail: 'mem***@example.com' });
  assert.equal(JSON.stringify(body).includes('member@example.com'), false);
  assert.equal(JSON.stringify(body).includes('+821012345678'), false);
  assert.equal(JSON.stringify(body).includes('user-1'), false);
  const accountCall = harness.calls.find((call) => call.type === 'table' && call.table === 'accounts');
  assert.deepEqual(accountCall, {
    type: 'table',
    table: 'accounts',
    filters: [
      { method: 'eq', column: 'phone_e164', value: '+821012345678' },
      { method: 'not', column: 'phone_verified_at', operator: 'is', value: null },
    ],
    limit: 2,
  });
});

test('phone mismatch returns not found without querying Auth', async () => {
  const harness = createRouteHarness({ accounts: [] });

  const response = await harness.POST(harness.request({ phone: '010-9999-9999' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { found: false, message: NOT_FOUND_MESSAGE });
  assert.equal(harness.calls.some((call) => call.type === 'auth'), false);
});

test('an account without a verified phone is excluded by the server query', async () => {
  const harness = createRouteHarness({ accounts: [] });

  const response = await harness.POST(harness.request());

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { found: false, message: NOT_FOUND_MESSAGE });
  const accountCall = harness.calls.find((call) => call.type === 'table' && call.table === 'accounts');
  assert.ok(accountCall.filters.some((filter) =>
    filter.method === 'not'
    && filter.column === 'phone_verified_at'
    && filter.operator === 'is'
    && filter.value === null));
});

for (const [label, profiles] of [
  ['nickname mismatch', [{ id: 'user-1', nickname: '다른닉네임', birth_date: '1990-01-01' }]],
  ['birth date mismatch', []],
]) {
  test(`${label} returns not found without querying Auth`, async () => {
    const harness = createRouteHarness({
      accounts: [{ user_id: 'user-1' }],
      profiles,
    });

    const response = await harness.POST(harness.request());

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { found: false, message: NOT_FOUND_MESSAGE });
    assert.equal(harness.calls.some((call) => call.type === 'auth'), false);
  });
}

test('an Auth user without a valid email returns not found', async () => {
  const harness = createRouteHarness({
    accounts: [{ user_id: 'user-1' }],
    profiles: [{ id: 'user-1', nickname: '테스터', birth_date: '1990-01-01' }],
    authUser: { id: 'user-1', email: null },
  });

  const response = await harness.POST(harness.request());

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { found: false, message: NOT_FOUND_MESSAGE });
});

test('route hashes the Vercel client IP and consumes the shared database limiter', async () => {
  const harness = createRouteHarness();

  const response = await harness.POST(harness.request());

  assert.equal(response.status, 200);
  const limiterCall = harness.calls.find((call) => call.type === 'rpc');
  assert.equal(limiterCall.name, 'consume_account_find_email_rate_limit');
  assert.deepEqual(
    JSON.parse(JSON.stringify(limiterCall.args)),
    {
      p_identifier_hash: createHmac('sha256', SERVICE_ROLE_KEY)
        .update(CLIENT_IP)
        .digest('hex'),
    },
  );
  assert.equal(JSON.stringify(harness.calls[0].args).includes(CLIENT_IP), false);
});

test('database limiter denial returns 429 without account information', async () => {
  const harness = createRouteHarness({
    limiterResult: [{ allowed: false, retry_after_seconds: 537 }],
  });

  const response = await harness.POST(harness.request());
  const body = await responseJson(response);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '537');
  assert.deepEqual(body, { message: RATE_LIMIT_MESSAGE });
  assert.equal('found' in body, false);
  assert.equal('maskedEmail' in body, false);
});

test('invalid nickname, birth date, or phone keeps 400 validation without account fields', async () => {
  for (const input of [
    { nickname: '가', birthDate: '1990-01-01' },
    { nickname: '테스터', birthDate: '19900101' },
    { nickname: '테스터', birthDate: '1990-01-01', phone: '010-123-4567' },
  ]) {
    const harness = createRouteHarness();
    const response = await harness.POST(harness.request(input));
    const body = await responseJson(response);

    assert.equal(response.status, 400);
    assert.deepEqual(body, { message: INVALID_MESSAGE });
    assert.equal('found' in body, false);
    assert.equal('maskedEmail' in body, false);
  }
});

test('invalid input is rejected before the database limiter is consumed', async () => {
  const harness = createRouteHarness({
    limiterResult: [{ allowed: false, retry_after_seconds: 537 }],
  });

  const response = await harness.POST(harness.request({ nickname: '가' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await responseJson(response), { message: INVALID_MESSAGE });
  assert.equal(harness.calls.length, 0);
});

const findElement = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
};

const createPageHarness = (response) => {
  const stateValues = ['테스터', '1990-01-01', '010-1234-5678', false, null, null];
  const stateUpdates = stateValues.map(() => []);
  const requests = [];
  let hookIndex = 0;
  const useState = (initialValue) => {
    const index = hookIndex++;
    const value = index < stateValues.length ? stateValues[index] : initialValue;
    return [value, (nextValue) => stateUpdates[index].push(nextValue)];
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const icon = () => null;
  const page = loadModule('app/(auth)/find-email/page.tsx', {
    react: { useState },
    'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    'next/link': { __esModule: true, default: ({ children }) => children },
    'lucide-react': { Loader2: icon, MailSearch: icon },
  }, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return response;
    },
  });
  const tree = page.default();
  const form = findElement(tree, (node) => node.type === 'form');
  assert.ok(form, 'find-email form should be rendered');
  return { tree, form, stateUpdates, requests };
};

test('UI submits the phone and displays a masked email after a successful match', async () => {
  const harness = createPageHarness({
    ok: true,
    json: async () => ({ found: true, maskedEmail: 'mem***@example.com' }),
  });

  assert.ok(findElement(harness.tree, (node) => node.type === 'input' && node.props?.id === 'phone'));

  await harness.form.props.onSubmit({ preventDefault() {} });

  assert.deepEqual(JSON.parse(harness.requests[0].init.body), {
    nickname: '테스터',
    birthDate: '1990-01-01',
    phone: '010-1234-5678',
  });
  assert.deepEqual(harness.stateUpdates[3], [true, false]);
  assert.deepEqual(harness.stateUpdates[4], [null, 'mem***@example.com']);
  assert.deepEqual(harness.stateUpdates[5], [null]);
});

for (const [label, response, expectedMessage] of [
  [
    'not-found response',
    { ok: true, json: async () => ({ found: false, message: NOT_FOUND_MESSAGE }) },
    NOT_FOUND_MESSAGE,
  ],
  [
    'rate-limit response',
    { ok: false, json: async () => ({ message: RATE_LIMIT_MESSAGE }) },
    RATE_LIMIT_MESSAGE,
  ],
]) {
  test(`UI displays ${label} as an error`, async () => {
    const harness = createPageHarness(response);

    await harness.form.props.onSubmit({ preventDefault() {} });

    assert.deepEqual(harness.stateUpdates[4], [null]);
    assert.deepEqual(harness.stateUpdates[5], [null, expectedMessage]);
  });
}

test('route does not contain the removed process-memory rate limiter', () => {
  const source = readFileSync(resolve(projectRoot, 'app/api/account/find-email/route.ts'), 'utf8');
  assert.equal(source.includes('new Map'), false);
});
