import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(projectRoot, 'components/common/Hero.tsx');
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

const jsx = (type, props) => ({ type, props: props ?? {} });
const loadedModule = { exports: {} };
const context = vm.createContext({
  exports: loadedModule.exports,
  module: loadedModule,
  require: (specifier) => {
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx };
    if (specifier === 'next/link') return { __esModule: true, default: 'a' };
    throw new Error(`Unexpected require: ${specifier}`);
  },
});
const wrapper = new vm.Script(
  `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
  { filename },
).runInContext(context);
wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));

const collectText = (value) => {
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return collectText(value.props?.children);
};

const findAll = (value, predicate, matches = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => findAll(item, predicate, matches));
    return matches;
  }
  if (!value || typeof value !== 'object') return matches;
  if (predicate(value)) matches.push(value);
  findAll(value.props?.children, predicate, matches);
  return matches;
};

const tree = loadedModule.exports.default();

test('Hero presents the approved first-member recruitment message', () => {
  const recruitmentNotices = findAll(
    tree,
    (node) => node.type === 'aside' && node.props?.['aria-label'] === '첫 회원 모집 안내',
  );

  assert.equal(recruitmentNotices.length, 1);
  const noticeText = collectText(recruitmentNotices[0]);
  assert.match(noticeText, /ComMatch 첫 회원 20명을 찾습니다/);
  assert.match(noticeText, /남성 10명 · 여성 10명부터 시작합니다\./);
  assert.match(noticeText, /현재 무료로 이용하실 수 있습니다\./);
});

test('recruitment notice follows the Hero description and precedes the CTA', () => {
  const text = collectText(tree);
  const descriptionIndex = text.indexOf('상담사가 아닌,당신이 직접 선택하는셀프 결혼정보 플랫폼');
  const noticeIndex = text.indexOf('ComMatch 첫 회원 20명을 찾습니다');
  const ctaIndex = text.indexOf('무료로 시작하기');

  assert.ok(descriptionIndex >= 0);
  assert.ok(noticeIndex > descriptionIndex);
  assert.ok(ctaIndex > noticeIndex);
});

test('Hero keeps the existing free-start CTA destination', () => {
  const ctas = findAll(
    tree,
    (node) => node.type === 'a' && collectText(node) === '무료로 시작하기',
  );

  assert.equal(ctas.length, 1);
  assert.equal(ctas[0].props.href, '/match-test');
});
