import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { beforeEach } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(projectRoot, 'components/landing/BalanceGame.tsx');
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
const stateSlots = [];
const refSlots = [];
let stateCursor = 0;
let refCursor = 0;

beforeEach(() => {
  stateSlots.length = 0;
  refSlots.length = 0;
  stateCursor = 0;
  refCursor = 0;
});

const loadedModule = { exports: {} };
const context = vm.createContext({
  exports: loadedModule.exports,
  module: loadedModule,
  require: (specifier) => {
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx };
    if (specifier === 'react') {
      return {
        useEffect: (effect) => effect(),
        useRef: (initialValue) => {
          const slot = refCursor++;
          refSlots[slot] ??= { current: initialValue };
          return refSlots[slot];
        },
        useState: (initialValue) => {
          const slot = stateCursor++;
          if (!(slot in stateSlots)) stateSlots[slot] = typeof initialValue === 'function' ? initialValue() : initialValue;
          const setValue = (nextValue) => {
            stateSlots[slot] = typeof nextValue === 'function' ? nextValue(stateSlots[slot]) : nextValue;
          };
          return [stateSlots[slot], setValue];
        },
      };
    }
    if (specifier === 'next/image') return { __esModule: true, default: 'img' };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => 'svg' });
    throw new Error(`Unexpected require: ${specifier}`);
  },
});
const wrapper = new vm.Script(
  `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
  { filename },
).runInContext(context);
wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));

const render = () => {
  stateCursor = 0;
  refCursor = 0;
  return loadedModule.exports.default();
};

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

const buttonByText = (tree, label) => findAll(tree, (node) => node.type === 'button')
  .find((button) => collectText(button).includes(label));

test('balance game contains the three approved questions, choices and deterministic feedback', () => {
  for (const copy of [
    '결혼 상대를 선택한다면?', '소박하지만 나와 대화가 잘 통하는 사람', '경제적으로 안정적이지만 표현이 서툰 사람',
    '이번 선택에서는 대화가 잘 통하는 관계에 조금 더 마음이 가셨네요.', '이번 선택에서는 안정적인 생활 기반에 조금 더 마음이 가셨네요.',
    '연인이 속상해할 때 나는?', '먼저 다가가 대화한다', '혼자 정리할 시간을 준다',
    '이번에는 감정을 함께 풀어가는 대화를 선택하셨네요.', '이번에는 서로의 정리할 시간을 존중하는 방식을 선택하셨네요.',
    '결혼생활에서 더 끌리는 모습은?', '취미와 여가를 함께 즐기는 부부', '각자의 시간을 존중하는 부부',
    '이번에는 함께하는 활동과 시간을 선택하셨네요.', '이번에는 독립적인 시간과 자율성을 선택하셨네요.',
    '한 번의 선택으로 관계 성향 전체를 판단할 수는 없습니다.',
    '당신의 선택은 어떤가요?', '가볍게 선택해 보세요.', '회원가입 없이 참여할 수 있습니다.',
  ]) assert.ok(source.includes(copy), `missing approved copy: ${copy}`);
});

test('balance choices use the two approved generated photographs responsively', () => {
  const tree = render();
  const images = findAll(tree, (node) => node.type === 'img');

  assert.deepEqual(images.map((image) => image.props.src), [
    '/images/landing/balance-conversation.webp',
    '/images/landing/balance-stability.webp',
  ]);
  assert.ok(images.every((image) => image.props.fill === true));
  assert.ok(images.every((image) => image.props.sizes === '(min-width: 1024px) 22vw, (min-width: 768px) 42vw, 100vw'));
  assert.ok(images.every((image) => /object-cover/.test(image.props.className)));
});

test('desktop game stays compact while mobile choices remain stacked and touchable', () => {
  const tree = render();
  assert.match(tree.props.className, /py-8/);
  assert.doesNotMatch(tree.props.className, /py-14|py-16|py-24/);

  const desktopShell = findAll(tree, (node) => typeof node.props?.className === 'string'
    && node.props.className.includes('lg:grid-cols-[1fr_0.38fr]'));
  assert.equal(desktopShell.length, 1);

  const choiceGrid = findAll(tree, (node) => typeof node.props?.className === 'string'
    && node.props.className.includes('md:grid-cols-2'));
  assert.equal(choiceGrid.length, 1);

  const imageFrames = findAll(tree, (node) => typeof node.props?.className === 'string'
    && node.props.className.includes('lg:aspect-[2/1]'));
  assert.equal(imageFrames.length, 2);

  const guidance = findAll(tree, (node) => node.props?.['aria-label'] === '선택 안내 및 다음 단계');
  assert.equal(guidance.length, 1);
  assert.match(guidance[0].props.className, /lg:border-l/);
  assert.ok(findAll(tree, (node) => node.type === 'button')
    .every((button) => /min-h-(11|12)/.test(button.props.className)));
});

test('a choice can be changed and exposes pressed state with accessible feedback', () => {
  let tree = render();
  const choiceA = buttonByText(tree, '소박하지만 나와 대화가 잘 통하는 사람');
  assert.equal(choiceA.props['aria-pressed'], false);
  assert.match(choiceA.props.className, /min-h-/);
  assert.match(choiceA.props.className, /focus-visible/);

  choiceA.props.onClick();
  tree = render();
  assert.equal(buttonByText(tree, '소박하지만 나와 대화가 잘 통하는 사람').props['aria-pressed'], true);
  assert.match(collectText(tree), /이번 선택에서는 대화가 잘 통하는 관계에 조금 더 마음이 가셨네요\./);
  assert.equal(findAll(tree, (node) => node.props?.role === 'status').length, 1);

  buttonByText(tree, '경제적으로 안정적이지만 표현이 서툰 사람').props.onClick();
  tree = render();
  assert.equal(buttonByText(tree, '경제적으로 안정적이지만 표현이 서툰 사람').props['aria-pressed'], true);
  assert.equal(buttonByText(tree, '소박하지만 나와 대화가 잘 통하는 사람').props['aria-pressed'], false);
  assert.match(collectText(tree), /이번 선택에서는 안정적인 생활 기반에 조금 더 마음이 가셨네요\./);
});

test('the game advances manually through all questions and restarts without storage', () => {
  let tree = render();
  assert.equal(buttonByText(tree, '다음 질문').props.disabled, true);
  buttonByText(tree, '소박하지만 나와 대화가 잘 통하는 사람').props.onClick();
  tree = render();
  assert.equal(buttonByText(tree, '다음 질문').props.disabled, false);
  buttonByText(tree, '다음 질문').props.onClick();
  tree = render();
  assert.match(collectText(tree), /연인이 속상해할 때 나는\?/);
  assert.equal(buttonByText(tree, '다음 질문').props.disabled, true);

  buttonByText(tree, '혼자 정리할 시간을 준다').props.onClick();
  tree = render();
  buttonByText(tree, '다음 질문').props.onClick();
  tree = render();
  assert.match(collectText(tree), /결혼생활에서 더 끌리는 모습은\?/);

  buttonByText(tree, '취미와 여가를 함께 즐기는 부부').props.onClick();
  tree = render();
  buttonByText(tree, '처음부터 다시 하기').props.onClick();
  tree = render();
  assert.match(collectText(tree), /결혼 상대를 선택한다면\?/);
  assert.doesNotMatch(collectText(tree), /이번 선택에서는 안정적인 생활 기반에 조금 더 마음이 가셨네요\./);

  assert.doesNotMatch(source, /sessionStorage|localStorage|fetch\s*\(|supabase|\/api\//i);
  assert.doesNotMatch(source, /이용자|투표|통계|%/);
});

test('question heading is programmatically focusable for manual navigation', () => {
  const tree = render();
  const headings = findAll(tree, (node) => node.type === 'h3');
  assert.equal(headings.length, 1);
  assert.equal(headings[0].props.tabIndex, -1);
  assert.ok(headings[0].props.ref);
});
