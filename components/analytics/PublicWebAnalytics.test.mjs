import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(projectRoot, 'components/analytics/PublicWebAnalytics.tsx');
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
  URL,
  exports: loadedModule.exports,
  module: loadedModule,
  window: { location: { origin: 'https://www.commatch.net' } },
  require: (specifier) => {
    if (specifier === 'react/jsx-runtime') return { jsx: () => null };
    if (specifier === '@vercel/analytics/next') return { Analytics: () => null };
    throw new Error(`Unexpected require: ${specifier}`);
  },
});
const wrapper = new vm.Script(
  `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
  { filename },
).runInContext(context);
wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));

const { filterPublicPageView } = loadedModule.exports;

const pageview = (url) => ({ type: 'pageview', url });
const assertPageview = (actual, expectedUrl, message) => {
  assert.equal(actual?.type, 'pageview', message);
  assert.equal(actual?.url, expectedUrl, message);
};

test('allows the match-test pageview', () => {
  assertPageview(
    filterPublicPageView(pageview('https://www.commatch.net/match-test')),
    'https://www.commatch.net/match-test',
  );
});

test('strips query and hash from match-test pageviews', () => {
  assertPageview(
    filterPublicPageView(pageview('/match-test?source=test#result')),
    'https://www.commatch.net/match-test',
  );
});

test('normalizes a trailing slash from match-test pageviews', () => {
  assertPageview(
    filterPublicPageView(pageview('/match-test/')),
    'https://www.commatch.net/match-test',
  );
});

test('keeps authentication and member paths blocked', () => {
  const blockedPaths = [
    '/signup',
    '/verify-email',
    '/verified',
    '/auth/callback',
    '/consent',
    '/profile/create',
    '/dashboard',
  ];

  for (const path of blockedPaths) {
    assert.equal(filterPublicPageView(pageview(path)), null, path);
  }
});

test('keeps custom events blocked even on match-test', () => {
  assert.equal(
    filterPublicPageView({ type: 'event', url: 'https://www.commatch.net/match-test' }),
    null,
  );
});

test('keeps cross-origin match-test pageviews blocked', () => {
  assert.equal(
    filterPublicPageView(pageview('https://external.example/match-test')),
    null,
  );
});

test('keeps the existing static public pages allowed', () => {
  const publicPaths = ['/', '/about', '/faq', '/notices', '/privacy', '/terms'];

  for (const path of publicPaths) {
    assertPageview(
      filterPublicPageView(pageview(path)),
      `https://www.commatch.net${path}`,
      path,
    );
  }
});

test('keeps notice detail pageviews anonymized', () => {
  assertPageview(
    filterPublicPageView(pageview('/notices/real-notice-id?source=test#content')),
    'https://www.commatch.net/notices/[id]',
  );
});
