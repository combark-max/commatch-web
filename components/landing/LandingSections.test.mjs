import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(projectRoot, 'components/landing/LandingSections.tsx');
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
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => 'svg' });
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

test('benefits keep the three approved self-matching promises', () => {
  const tree = loadedModule.exports.LandingBenefits();
  const text = collectText(tree);

  assert.match(text, /내가 직접 선택/);
  assert.match(text, /가치관까지 확인/);
  assert.match(text, /서로 관심이 있을 때 대화/);
});

test('match-test promotion is a static preview that links to the real test', () => {
  const tree = loadedModule.exports.MatchTestPromo();
  const text = collectText(tree);
  const links = findAll(tree, (node) => node.type === 'a');

  assert.match(text, /나는 어떤 사람과 잘 맞을까\?/);
  assert.match(text, /약 1분/);
  assert.match(text, /10문항/);
  assert.match(text, /회원가입 없이 이용 가능/);
  assert.match(text, /데이트에서 더 중요한 것은\?/);
  const matchTestLink = links.find((link) => link.props.href === '/match-test');
  assert.ok(matchTestLink);
  assert.match(collectText(matchTestLink), /1분 매칭 테스트 시작/);
});

test('service journey renders four clearly labelled example screens with synthetic content', () => {
  const tree = loadedModule.exports.ServiceJourney();
  const text = collectText(tree);
  const exampleLabels = findAll(tree, (node) => collectText(node) === '서비스 화면 예시');

  for (const label of ['01 상대 찾기', '02 프로필 확인', '03 서로 관심 확인', '04 대화 시작']) {
    assert.match(text, new RegExp(label));
  }
  for (const syntheticContent of [
    '예시 회원 · 38세',
    '서울 · 기획 직군',
    '대화와 배려를 중요하게 생각해요.',
    '산책과 전시',
    '함께 조율하기',
    '서로 관심을 확인했어요',
    '프로필의 여행 이야기가 인상적이었어요.',
    '천천히 이야기 나눠봐요.',
  ]) {
    assert.match(text, new RegExp(syntheticContent));
  }
  assert.equal(exampleLabels.length, 4);
});

test('comparison, trust, usage and final CTA expose only the approved landing claims', () => {
  const comparisonText = collectText(loadedModule.exports.MatchingComparison());
  const trustText = collectText(loadedModule.exports.TrustSafety());
  const usageTree = loadedModule.exports.LandingHowToUse();
  const usageText = collectText(usageTree);
  const finalTree = loadedModule.exports.FinalMatchCta();
  const finalText = collectText(finalTree);
  const links = [usageTree, finalTree].flatMap((tree) => findAll(tree, (node) => node.type === 'a'));

  assert.match(comparisonText, /일반적인 소개 방식/);
  assert.match(comparisonText, /ComMatch 셀프매칭/);
  assert.match(comparisonText, /내 결혼 상대를 가장 잘 아는 사람은 결국 나 자신입니다\./);
  for (const label of ['개인정보 보호', '상호 매칭', '신고 기능', '프로필·계정 관리']) {
    assert.match(trustText, new RegExp(label));
  }
  assert.doesNotMatch(trustText, /100%|완벽한 신원|휴대폰 본인인증 완료/);
  for (const label of ['1회원가입', '2프로필 작성', '3상대 찾기', '4매칭 & 대화']) {
    assert.match(usageText, new RegExp(label));
  }
  const howToUseLink = links.find((link) => link.props.href === '/how-to-use');
  assert.ok(howToUseLink);
  assert.match(collectText(howToUseLink), /자세한 이용방법 보기/);
  assert.match(finalText, /좋은 인연을 기다리기만 하지 마세요\./);
  const finalMatchTestLink = links.find((link) => link.props.href === '/match-test');
  assert.ok(finalMatchTestLink);
  assert.match(collectText(finalMatchTestLink), /내 매칭 성향 알아보기/);
});
