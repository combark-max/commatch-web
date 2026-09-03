import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '..');

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

const createRouteHarness = ({
  profile = null,
  profileError = null,
  legacyProfile = null,
  legacyProfileError = null,
  storageResult = { data: [], error: null },
  favoritesError = null,
  preferencesError = null,
  profileDeleteError = null,
  authDeleteError = null,
} = {}) => {
  const calls = [];
  const errors = [];
  let profileLookupCount = 0;

  const admin = {
    auth: {
      admin: {
        deleteUser: async (userId) => {
          calls.push(`auth_delete:${userId}`);
          return { data: { user: authDeleteError ? null : { id: userId } }, error: authDeleteError };
        },
      },
    },
    from: (table) => ({
      delete: () => ({
        eq: async () => {
          calls.push(`${table}_delete`);
          if (table === 'preferences') return { error: preferencesError };
          if (table === 'profiles') return { error: profileDeleteError };
          throw new Error(`Unexpected delete table: ${table}`);
        },
        or: async () => {
          calls.push(`${table}_delete`);
          return { error: favoritesError };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            profileLookupCount += 1;
            calls.push(profileLookupCount === 1 ? 'profile_lookup' : 'legacy_profile_lookup');
            return profileLookupCount === 1
              ? { data: profile, error: profileError }
              : { data: legacyProfile, error: legacyProfileError };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        remove: async (paths) => {
          calls.push(`storage_delete:${paths.join(',')}`);
          return storageResult;
        },
      }),
    },
  };

  const route = loadModule('app/api/account/delete/route.ts', {
    'next/server': {
      NextResponse: {
        json: (body, init) => new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
          status: init?.status ?? 200,
        }),
      },
    },
    '@/lib/supabase/admin': { createSupabaseAdminClient: () => admin },
    '@/lib/supabase/server': {
      createServerSupabaseClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: 'user-1' } },
            error: null,
          }),
        },
      }),
    },
  }, {
    Response,
    URL,
    console: { error: (...args) => errors.push(args) },
  });

  return { DELETE: route.DELETE, calls, errors };
};

test('Auth-only retry skips Storage, accepts zero-row deletes, and reaches Auth deletion', async () => {
  const harness = createRouteHarness();

  const response = await harness.DELETE();

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), { success: true });
  assert.deepEqual(harness.calls, [
    'profile_lookup',
    'favorites_delete',
    'preferences_delete',
    'profiles_delete',
    'auth_delete:user-1',
  ]);
});

test('Storage empty success remains successful and preserves deletion order', async () => {
  const harness = createRouteHarness({
    profile: { profile_image: 'user-1/avatar.png', profile_images: ['user-1/avatar.png'] },
    storageResult: { data: [], error: null },
  });

  const response = await harness.DELETE();

  assert.equal(response.status, 200);
  assert.deepEqual(harness.calls, [
    'profile_lookup',
    'storage_delete:user-1/avatar.png',
    'favorites_delete',
    'preferences_delete',
    'profiles_delete',
    'auth_delete:user-1',
  ]);
});

test('Auth deletion failure logs auth_delete and returns the dedicated retry message', async () => {
  const harness = createRouteHarness({
    authDeleteError: { message: 'upstream failed', code: 'unexpected_failure' },
  });

  const response = await harness.DELETE();
  const body = await responseJson(response);

  assert.equal(response.status, 500);
  assert.equal(
    body.message,
    '계정 데이터 정리는 진행되었지만 로그인 계정 삭제를 완료하지 못했습니다. 같은 화면에서 다시 시도해 주세요.',
  );
  assert.equal(harness.errors.length, 1);
  assert.equal(harness.errors[0][1].stage, 'auth_delete');
  assert.equal(harness.errors[0][1].userId, 'user-1');
  assert.equal(harness.errors[0][1].code, 'unexpected_failure');
});

for (const scenario of [
  {
    name: 'profile lookup',
    options: { profileError: { message: 'new columns failed' }, legacyProfileError: { message: 'lookup failed', code: 'PGRST500' } },
    stage: 'profile_lookup',
  },
  {
    name: 'Storage deletion',
    options: { profile: { profile_image: 'user-1/avatar.png' }, storageResult: { data: null, error: { message: 'storage failed', code: 'storage_error' } } },
    stage: 'storage_delete',
  },
  { name: 'favorites deletion', options: { favoritesError: { message: 'favorites failed', code: 'DB001' } }, stage: 'favorites_delete' },
  { name: 'preferences deletion', options: { preferencesError: { message: 'preferences failed', code: 'DB002' } }, stage: 'preferences_delete' },
  { name: 'profile deletion', options: { profileDeleteError: { message: 'profile failed', code: 'DB003' } }, stage: 'profile_delete' },
]) {
  test(`${scenario.name} failure logs ${scenario.stage} and returns the partial-cleanup retry message`, async () => {
    const harness = createRouteHarness(scenario.options);

    const response = await harness.DELETE();
    const body = await responseJson(response);

    assert.equal(response.status, 500);
    assert.equal(
      body.message,
      '회원탈퇴 처리 중 오류가 발생했습니다. 일부 데이터가 이미 정리되었을 수 있으니 같은 화면에서 다시 시도해 주세요.',
    );
    assert.equal(harness.errors.length, 1);
    assert.equal(harness.errors[0][1].stage, scenario.stage);
    assert.equal(harness.errors[0][1].userId, 'user-1');
  });
}

const findDeleteButton = (node) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && typeof node.props?.onClick === 'function') {
    const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    if (children.includes('탈퇴하기')) return node;
  }
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children) {
    const found = findDeleteButton(child);
    if (found) return found;
  }
  return null;
};

const createPageHarness = ({ fetchImpl, response, cleanupError = null } = {}) => {
  const stateValues = [false, true, '회원탈퇴', 'password', false, null];
  const stateUpdates = stateValues.map(() => []);
  let hookIndex = 0;
  const routerCalls = [];
  const authCalls = [];
  const alerts = [];
  const cleanupCalls = [];

  const useState = (initialValue) => {
    const index = hookIndex++;
    const value = index < stateValues.length ? stateValues[index] : initialValue;
    return [value, (nextValue) => stateUpdates[index].push(nextValue)];
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const icon = () => null;
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null }),
      signInWithPassword: async () => ({ data: { user: { id: 'user-1' }, session: {} }, error: null }),
      signOut: async () => {
        authCalls.push('signOut');
        return { error: null };
      },
    },
  };

  const page = loadModule('app/(main)/account/page.tsx', {
    react: { useEffect: () => {}, useState },
    'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    'next/navigation': {
      useRouter: () => ({
        push: (path) => routerCalls.push(`push:${path}`),
        refresh: () => routerCalls.push('refresh'),
        replace: (path) => routerCalls.push(`replace:${path}`),
      }),
    },
    'lucide-react': { AlertTriangle: icon, Loader2: icon, Settings: icon, X: icon },
    '@/components/push/PushSettings': { __esModule: true, default: icon },
    '@/lib/push/client': {
      cleanupPushBeforeSignOut: async () => {
        cleanupCalls.push('cleanup');
        if (cleanupError) throw cleanupError;
      },
    },
    '@/lib/supabase/client': { createClient: () => supabase },
  }, {
    fetch: fetchImpl ?? (async () => response),
    setTimeout,
    window: { alert: (message) => alerts.push(message) },
  });

  const tree = page.default();
  const deleteButton = findDeleteButton(tree);
  assert.ok(deleteButton, 'delete button should be rendered');

  return { deleteButton, stateUpdates, routerCalls, authCalls, alerts, cleanupCalls };
};

for (const scenario of [
  { name: 'fetch failure', fetchImpl: async () => { throw new Error('offline'); } },
  { name: 'JSON parsing failure', response: { ok: false, json: async () => { throw new Error('invalid json'); } } },
]) {
  test(`${scenario.name} shows retry guidance and always releases the deleting state`, async () => {
    const harness = createPageHarness(scenario);

    await harness.deleteButton.props.onClick();

    assert.deepEqual(harness.stateUpdates[4], [true, false]);
    assert.equal(
      harness.stateUpdates[5].at(-1),
      '회원탈퇴 처리 중 오류가 발생했습니다. 일부 데이터가 이미 정리되었을 수 있으니 같은 화면에서 다시 시도해 주세요.',
    );
  });
}

test('500 response shows the server message and releases the deleting state', async () => {
  const serverMessage = '로그인 계정 삭제가 완료되지 않았습니다. 같은 화면에서 다시 시도해 주세요.';
  const harness = createPageHarness({
    response: { ok: false, json: async () => ({ message: serverMessage }) },
  });

  await harness.deleteButton.props.onClick();

  assert.deepEqual(harness.stateUpdates[4], [true, false]);
  assert.equal(harness.stateUpdates[5].at(-1), serverMessage);
});

test('unexpected response payload falls back to retry guidance and releases the deleting state', async () => {
  const harness = createPageHarness({
    response: { ok: false, json: async () => ({ message: { detail: 'unexpected' } }) },
  });

  await harness.deleteButton.props.onClick();

  assert.deepEqual(harness.stateUpdates[4], [true, false]);
  assert.equal(
    harness.stateUpdates[5].at(-1),
    '회원탈퇴 처리 중 오류가 발생했습니다. 일부 데이터가 이미 정리되었을 수 있으니 같은 화면에서 다시 시도해 주세요.',
  );
});

test('successful deletion preserves Push cleanup, sign-out, alert, and navigation', async () => {
  const harness = createPageHarness({
    response: { ok: true, json: async () => ({ success: true }) },
  });

  await harness.deleteButton.props.onClick();

  assert.deepEqual(harness.cleanupCalls, ['cleanup']);
  assert.deepEqual(harness.authCalls, ['signOut']);
  assert.deepEqual(harness.alerts, ['회원탈퇴가 완료되었습니다.']);
  assert.deepEqual(harness.routerCalls, ['replace:/', 'refresh']);
  assert.deepEqual(harness.stateUpdates[4], [true, false]);
});
