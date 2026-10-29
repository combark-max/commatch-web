import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const nativeRequire = createRequire(import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};

// Replace only the SDK transport; no collection script or production request is used.
function environment({ url = 'https://www.commatch.net/match-test', referrer = '', storage = memoryStorage(), sdk = 'mock', ready = true, now = () => Date.now() } = {}) {
  const sent = [];
  const browser = { location: new URL(url), sessionStorage: storage, localStorage: memoryStorage() };
  const scripts = [], timers = new Map();
  let initializationError = false, timerId = 0;
  browser.setTimeout = (callback) => { const id = ++timerId; timers.set(id, callback); return id; };
  browser.clearTimeout = (id) => timers.delete(id);
  const document = { referrer,
    createElement: () => ({ src: '', dataset: {} }),
    head: {
      querySelector: (selector) => scripts.find((script) => selector.includes(script.src)) ?? null,
      appendChild: (script) => { if (initializationError) throw new Error('script injection denied'); scripts.push(script); },
    },
  };
  const cache = new Map();
  let transportError = false;
  const load = (relative, dependencies = {}) => {
    const filename = resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    assert.ok(existsSync(filename), `Missing approved analytics implementation: ${relative}`);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, fileName: filename }).outputText;
    const loaded = { exports: {} };
    const context = vm.createContext({ window: browser, document, URL,
      Date: class extends Date { static now() { return now(); } }, process: { env: { NODE_ENV: 'production' } },
      console, setTimeout, clearTimeout, sessionStorage: storage,
    });
    const require = (specifier) => {
      if (specifier in dependencies) return dependencies[specifier];
      if (specifier === '@vercel/analytics' && sdk === 'real') return load('node_modules/@vercel/analytics/dist/index.js');
      if (specifier === '@vercel/analytics') return { inject: () => {}, track: (name, properties) => {
        if (transportError) throw new Error('transport unavailable');
        sent.push({ name, properties: plain(properties) });
      } };
      if (specifier.startsWith('@/')) return load(`${specifier.slice(2)}.ts`);
      if (specifier.startsWith('.')) return load(`${resolve(dirname(filename), specifier)}.ts`);
      return nativeRequire(specifier);
    };
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(require, loaded, loaded.exports);
    cache.set(filename, loaded.exports);
    if (filename === resolve(root, 'lib/analytics/promotion.ts') && ready && loaded.exports.initializePromotionAnalytics) {
      loaded.exports.initializePromotionAnalytics((event) => event);
    }
    return loaded.exports;
  };
  return { load, browser, sent, storage, scripts,
    expireTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    failInitialization: () => { initializationError = true; },
    failTransport: () => { transportError = true; } };
}


export { environment, memoryStorage, plain };
