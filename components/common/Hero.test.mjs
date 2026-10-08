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

test('Hero presents the direct self-matching message without the founding-member notice', () => {
  const text = collectText(tree);

  assert.match(text, /셀프 결혼매칭 ComMatch/);
  assert.match(text, /결혼 상대, 이제 내가 직접 찾아보세요\./);
  assert.match(text, /조건과 가치관을 확인하고 원하는 상대에게 직접 관심을 표현하는 셀프 결혼매칭 서비스/);
  assert.match(text, /현재 무료 이용/);
  assert.doesNotMatch(text, /첫 회원 20명|남성 10명|여성 10명/);
});

test('Hero links to the match test and detailed usage guide', () => {
  const ctas = findAll(
    tree,
    (node) => node.type === 'a',
  );

  const destinations = Object.fromEntries(ctas.map((cta) => [collectText(cta), cta.props.href]));
  assert.equal(destinations['내 매칭 성향 알아보기'], '/match-test');
  assert.equal(destinations['이용방법 보기'], '/how-to-use');
});

test('Hero renders one full-width responsive LCP image', () => {
  const images = findAll(tree, (node) => node.type === 'img');

  assert.equal(images.length, 1);
  assert.equal(images[0].props.src, '/images/hero/commatch-hero-couple.png');
  assert.match(images[0].props.alt, /대화하는 남녀/);
  assert.equal(images[0].props.fill, true);
  assert.equal(images[0].props.preload, true);
  assert.equal(images[0].props.sizes, '100vw');
  assert.match(images[0].props.className, /\bobject-cover\b/);
  assert.match(images[0].props.className, /object-\[/);
});

test('Hero uses an isolated desktop background stack with non-blocking overlay', () => {
  assert.equal(tree.type, 'section');
  assert.match(tree.props.className, /\brelative\b/);
  assert.match(tree.props.className, /\bisolate\b/);
  assert.match(tree.props.className, /\boverflow-hidden\b/);
  assert.match(tree.props.className, /lg:min-h-\[680px\]/);

  const overlays = findAll(
    tree,
    (node) => typeof node.props?.className === 'string'
      && node.props.className.includes('pointer-events-none')
      && node.props.className.includes('z-10'),
  );
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].props['aria-hidden'], 'true');
  assert.match(overlays[0].props.className, /\bhidden\b/);
  assert.match(overlays[0].props.className, /\blg:block\b/);

  const contentLayers = findAll(
    tree,
    (node) => typeof node.props?.className === 'string'
      && node.props.className.includes('z-20')
      && collectText(node).includes('내 매칭 성향 알아보기'),
  );
  assert.equal(contentLayers.length, 1);
});

test('Hero keeps mobile copy before the single 3:2 image and prevents horizontal overflow', () => {
  const sectionChildren = Array.isArray(tree.props.children)
    ? tree.props.children
    : [tree.props.children];
  const copyIndex = sectionChildren.findIndex((child) => collectText(child).includes('결혼 상대, 이제 내가 직접 찾아보세요.'));
  const imageIndex = sectionChildren.findIndex((child) => findAll(child, (node) => node.type === 'img').length === 1);

  assert.ok(copyIndex >= 0);
  assert.ok(imageIndex > copyIndex);

  const imageLayers = findAll(
    tree,
    (node) => typeof node.props?.className === 'string'
      && node.props.className.includes('aspect-[3/2]')
      && findAll(node, (child) => child.type === 'img').length === 1,
  );
  assert.equal(imageLayers.length, 1);
  assert.match(imageLayers[0].props.className, /\bw-full\b/);
  assert.match(imageLayers[0].props.className, /\bz-0\b/);
  assert.match(imageLayers[0].props.className, /\blg:absolute\b/);
  assert.match(imageLayers[0].props.className, /\blg:inset-0\b/);
});
