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
    if (specifier === 'next/image') return { __esModule: true, default: 'img' };
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

test('Hero presents the approved bright relationship message and current-use notice once', () => {
  const text = collectText(tree);

  assert.match(text, /좋은 사람을, 더 가까이!/);
  assert.match(text, /진지한 만남이 좋은 인연이 됩니다\./);
  assert.match(text, /ComMatch는 가치관이 맞는 사람을 직접 찾아보고, 서로의 선택으로 인연을 이어가는 셀프매칭 서비스입니다\./);
  assert.equal((text.match(/현재 무료 이용/g) ?? []).length, 1);
  assert.doesNotMatch(text, /첫 회원 20명|남성 10명|여성 10명/);
});

test('Hero links to the relationship test and the detailed usage page', () => {
  const ctas = findAll(tree, (node) => node.type === 'a');
  const destinations = Object.fromEntries(ctas.map((cta) => [collectText(cta), cta.props.href]));

  assert.equal(destinations['내 매칭 성향 알아보기'], '/match-test');
  assert.equal(destinations['이용방법 보기'], '/how-to-use');
});

test('Hero uses the generated full-width photograph with a separate mobile crop', () => {
  const images = findAll(tree, (node) => node.type === 'img');
  assert.equal(images.length, 1);
  assert.equal(images[0].props.src, '/images/landing/hero-couple-wide.webp');
  assert.match(images[0].props.alt, /대화하는 커플/);
  assert.equal(images[0].props.fill, true);
  assert.equal(images[0].props.preload, true);
  assert.equal(images[0].props.sizes, '100vw');
  assert.match(images[0].props.className, /object-cover/);

  const imageLayers = findAll(
    tree,
    (node) => typeof node.props?.className === 'string'
      && node.props.className.includes('aspect-[3/2]')
      && findAll(node, (child) => child.type === 'img').length === 1,
  );
  assert.equal(imageLayers.length, 1);
  assert.match(imageLayers[0].props.className, /lg:absolute/);
  assert.match(imageLayers[0].props.className, /lg:inset-0/);
  assert.match(tree.props.className, /lg:min-h-/);
});

test('Hero uses the approved light palette without a dark full-screen overlay', () => {
  assert.match(tree.props.className, /bg-\[#FFFDF8\]/);
  assert.doesNotMatch(tree.props.className, /bg-\[#142B27\]/);
  const darkOverlays = findAll(tree, (node) => typeof node.props?.className === 'string'
    && node.props.className.includes('rgba(20,43,39,0.99)'));
  assert.equal(darkOverlays.length, 0);
  const ctas = findAll(tree, (node) => node.type === 'a');
  assert.ok(ctas.every((cta) => /focus/.test(cta.props.className)));
});
