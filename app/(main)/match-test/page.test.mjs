import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../../..');
const moduleCache = new Map();

const jsx = (type, props) => ({ type, props: props ?? {} });
const reactStub = {
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};

const aliases = {
  '@/lib/match-test/questions': resolve(projectRoot, 'lib/match-test/questions.ts'),
  '@/lib/match-test/scoring': resolve(projectRoot, 'lib/match-test/scoring.ts'),
  '@/lib/match-test/analysis': resolve(projectRoot, 'lib/match-test/analysis.ts'),
  '@/lib/match-test/session': resolve(projectRoot, 'lib/match-test/session.ts'),
};

const loadModule = (filename) => {
  const resolvedFilename = resolve(filename);
  if (moduleCache.has(resolvedFilename)) return moduleCache.get(resolvedFilename).exports;
  const isPageModule = resolvedFilename === resolve(import.meta.dirname, 'page.tsx');
  const source = `${readFileSync(resolvedFilename, 'utf8')}${isPageModule ? `
export const __testExports = {
  MATCH_TEST_DISPLAY_QUESTIONS,
  createInitialMatchTestState,
  reduceMatchTestState,
  createMatchTestResult,
  QuestionScreen,
  ResultScreen,
};
` : ''}`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: resolvedFilename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(resolvedFilename, loadedModule);
  const localRequire = (specifier) => {
    if (specifier === 'react/jsx-runtime') return { Fragment: Symbol('Fragment'), jsx, jsxs: jsx };
    if (specifier === 'react') return reactStub;
    if (specifier === 'next/link') return { __esModule: true, default: 'a' };
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => 'svg' });
    if (specifier === '@/lib/auth/auth') {
      return { getCurrentUser: async () => ({ data: { user: null }, error: null }) };
    }
    if (aliases[specifier]) return loadModule(aliases[specifier]);
    if (specifier.startsWith('.')) return loadModule(resolve(dirname(resolvedFilename), `${specifier}.ts`));
    throw new Error(`Unexpected require: ${specifier}`);
  };
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
    { filename: resolvedFilename },
  ).runInThisContext();
  wrapper(loadedModule.exports, localRequire, loadedModule, resolvedFilename, dirname(resolvedFilename));
  return loadedModule.exports;
};

let pageModule;
let loadError;
try {
  pageModule = loadModule(resolve(import.meta.dirname, 'page.tsx'));
} catch (error) {
  loadError = error;
}

const questionsModule = loadModule(resolve(projectRoot, 'lib/match-test/questions.ts'));
const pageApi = pageModule?.__testExports;

const collectText = (value) => {
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  if (typeof value.type === 'function') return collectText(value.type(value.props ?? {}));
  return collectText(value.props?.children);
};

const findAll = (value, predicate, matches = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => findAll(item, predicate, matches));
    return matches;
  }
  if (!value || typeof value !== 'object') return matches;
  if (typeof value.type === 'function') {
    findAll(value.type(value.props ?? {}), predicate, matches);
    return matches;
  }
  if (predicate(value)) matches.push(value);
  findAll(value.props?.children, predicate, matches);
  return matches;
};

const neutralAnswers = Object.fromEntries(
  questionsModule.MATCH_TEST_QUESTIONS.map(({ id }) => [id, 3]),
);

test('page module connects the approved fixed question order without duplicates', () => {
  assert.ifError(loadError);
  assert.deepEqual(pageApi.MATCH_TEST_DISPLAY_QUESTIONS.map(({ id }) => id), [
    'Q01', 'Q04', 'Q07', 'Q10', 'Q13', 'Q16',
    'Q02', 'Q05', 'Q08', 'Q11', 'Q14', 'Q17',
    'Q03', 'Q06', 'Q09', 'Q12', 'Q15', 'Q18',
  ]);
  assert.equal(new Set(pageApi.MATCH_TEST_DISPLAY_QUESTIONS.map(({ id }) => id)).size, 18);
});

test('progress state blocks unanswered navigation and preserves edited answers', () => {
  const initial = pageApi.createInitialMatchTestState();
  const blocked = pageApi.reduceMatchTestState(initial, { type: 'next' });
  assert.deepEqual(blocked, initial);

  const answered = pageApi.reduceMatchTestState(initial, { type: 'answer', value: 2 });
  const advanced = pageApi.reduceMatchTestState(answered, { type: 'next' });
  assert.equal(advanced.currentQuestionId, 'Q04');
  const returned = pageApi.reduceMatchTestState(advanced, { type: 'previous' });
  const edited = pageApi.reduceMatchTestState(returned, { type: 'answer', value: 5 });
  assert.equal(edited.answers.Q01, 5);
});

test('creates results only from eighteen valid QuestionId answers', () => {
  assert.equal(pageApi.createMatchTestResult({ Q01: 3 }), null);
  const result = pageApi.createMatchTestResult(neutralAnswers);
  assert.ok(result);
  assert.equal(result.domainResults.length, 6);
  assert.equal(typeof result.summary, 'string');
  assert.equal(typeof result.limitation, 'string');
});

test('question screen uses accessible native radios and disables next without an answer', () => {
  const question = pageApi.MATCH_TEST_DISPLAY_QUESTIONS[0];
  let selected;
  const tree = pageApi.QuestionScreen({
    question,
    questionNumber: 1,
    selectedAnswer: undefined,
    onAnswer: (value) => { selected = value; },
    onPrevious: () => {},
    onNext: () => {},
  });
  const radios = findAll(tree, (node) => node.type === 'input' && node.props.type === 'radio');
  const buttons = findAll(tree, (node) => node.type === 'button');

  assert.equal(findAll(tree, (node) => node.type === 'fieldset').length, 1);
  assert.equal(findAll(tree, (node) => node.type === 'legend').length, 1);
  assert.equal(radios.length, 5);
  assert.deepEqual(radios.map((radio) => radio.props.value), [1, 2, 3, 4, 5]);
  assert.ok(radios.every((radio) => radio.props.name === 'match-test-answer'));
  radios[4].props.onChange();
  assert.equal(selected, 5);
  assert.equal(buttons.find((button) => collectText(button).includes('다음 질문')).props.disabled, true);
  assert.match(collectText(tree), /관계 성향 테스트/);
  assert.match(collectText(tree), /1 \/ 18/);
});

test('result screen renders six scores, details, mixed copy, questions, summary and limitation', () => {
  const mixedAnswers = { ...neutralAnswers, Q01: 1, Q02: 4, Q03: 2 };
  const analysis = pageApi.createMatchTestResult(mixedAnswers);
  const tree = pageApi.ResultScreen({ analysis, authState: 'anonymous', onRestart: () => {} });
  const progressBars = findAll(tree, (node) => node.props?.role === 'progressbar');
  const text = collectText(tree);

  assert.equal(progressBars.length, 6);
  assert.ok(progressBars.every((bar) => bar.props['aria-valuemin'] === 0 && bar.props['aria-valuemax'] === 100));
  assert.equal(findAll(tree, (node) => node.type === 'details').length, 6);
  assert.match(text, new RegExp(analysis.summary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /감정을 나누는 방식이 상황이나 감정의 종류에 따라/);
  assert.equal(analysis.domainResults.filter(({ mixedDescription }) => mixedDescription).length, 1);
  for (const domain of analysis.domainResults) assert.match(text, new RegExp(domain.conversationQuestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, new RegExp(analysis.limitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(text, /다시 테스트하기/);
});

test('result CTA follows anonymous, authenticated and failed-auth destinations', () => {
  const analysis = pageApi.createMatchTestResult(neutralAnswers);
  const cases = [
    ['anonymous', ['/signup', '/login']],
    ['authenticated', ['/dashboard']],
    ['error', ['/']],
  ];

  for (const [authState, expectedHrefs] of cases) {
    const tree = pageApi.ResultScreen({ analysis, authState, onRestart: () => {} });
    const hrefs = findAll(tree, (node) => node.type === 'a').map((node) => node.props.href);
    assert.deepEqual(hrefs, expectedHrefs);
  }
});

test('restart returns to the first unanswered question with no answers', () => {
  const state = { phase: 'result', currentQuestionId: 'Q18', answers: neutralAnswers };
  assert.deepEqual(pageApi.reduceMatchTestState(state, { type: 'restart' }), pageApi.createInitialMatchTestState());
});

test('defers session restoration so mounting does not synchronously cascade state updates', () => {
  const originalUseEffect = reactStub.useEffect;
  const originalUseState = reactStub.useState;
  const originalWindow = globalThis.window;
  const effects = [];
  const updates = [];
  const scheduled = [];

  reactStub.useEffect = (effect) => { effects.push(effect); };
  reactStub.useState = (initial) => [
    typeof initial === 'function' ? initial() : initial,
    (value) => { updates.push(value); },
  ];
  globalThis.window = {
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: (callback) => { scheduled.push(callback); return 1; },
    clearTimeout: () => {},
  };

  try {
    pageModule.default();
    const cleanup = effects[0]();
    assert.equal(updates.length, 0);
    assert.equal(scheduled.length, 1);
    scheduled[0]();
    assert.equal(updates.length, 1);
    cleanup();
  } finally {
    reactStub.useEffect = originalUseEffect;
    reactStub.useState = originalUseState;
    globalThis.window = originalWindow;
  }
});
