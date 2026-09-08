import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '..');
const UNAVAILABLE_MESSAGE = '현재 가입 이메일 찾기 기능을 이용할 수 없습니다.';

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

const collectText = (node) => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (!node || typeof node !== 'object') return '';
  return collectText(node.props?.children);
};

test('find-email page explains the temporary unavailability without rendering a submission form', () => {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const icon = () => null;
  const page = loadModule('app/(auth)/find-email/page.tsx', {
    'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    'next/link': { __esModule: true, default: 'a' },
    'lucide-react': { MailSearch: icon },
  });

  const tree = page.default();
  const text = collectText(tree);

  assert.equal(findElement(tree, (node) => node.type === 'form'), null);
  assert.equal(findElement(tree, (node) => node.type === 'input'), null);
  assert.match(text, /현재.*휴대폰 본인인증.*제공하지/);
  assert.match(text, /본인인증 서비스 도입 후.*가입 이메일 찾기/);
  assert.match(text, /현재.*이용할 수 없/);
  assert.ok(findElement(tree, (node) => node.type === 'a' && node.props?.href === '/login'));
});

test('find-email API always returns the same unavailable response without reading the request', async () => {
  const route = loadModule('app/api/account/find-email/route.ts', {
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
  }, { Response });
  let bodyReadCount = 0;
  const request = {
    json: async () => {
      bodyReadCount += 1;
      throw new Error('request body must not be read while the endpoint is unavailable');
    },
  };

  const firstResponse = await route.POST(request);
  const secondResponse = await route.POST({ arbitrary: 'input' });

  assert.equal(firstResponse.status, 503);
  assert.equal(secondResponse.status, 503);
  assert.deepEqual(await responseJson(firstResponse), { message: UNAVAILABLE_MESSAGE });
  assert.deepEqual(await responseJson(secondResponse), { message: UNAVAILABLE_MESSAGE });
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  assert.equal(bodyReadCount, 0);
});
