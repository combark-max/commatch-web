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

const sampleDomainLabels = [
  '감정 공유 개방성',
  '갈등 대화와 공동 해결',
  '공동생활 조율 선호',
  '가족 교류 선호',
  '개인 시간과 자율성',
  '미래 계획의 구체성',
];

test('core approach keeps the about anchor and three factual service steps', () => {
  const tree = loadedModule.exports.CoreApproach();
  const text = collectText(tree);

  assert.equal(tree.props.id, 'about');
  assert.match(tree.props.className, /scroll-mt-/);
  for (const copy of [
    '직접 찾기',
    '원하는 조건으로 상대방을 살펴봅니다.',
    '서로 선택',
    '일방적인 연결이 아닌 상호 관심을 바탕으로 매칭합니다.',
    '매칭 후 대화',
    '서로 연결된 뒤 대화를 시작합니다.',
  ]) assert.match(text, new RegExp(copy));
  assert.match(text, /프로필에서 상대방이 공개한 정보를 살펴보고, 관계 성향 테스트에서는 나의 관계 방식을 알아보세요\./);
});

test('match-test promotion uses the approved three-part preview and factual copy', () => {
  const tree = loadedModule.exports.MatchTestPromo();
  const text = collectText(tree);
  const links = findAll(tree, (node) => node.type === 'a');

  for (const copy of [
    '나와 맞는 사람은 어떤 사람일까요?',
    '18가지 질문으로 나의 연애·결혼 관계 성향을 알아보세요.',
    '감정 표현부터 갈등 대화, 생활 방식과 미래 계획까지 6가지 관계 성향을 살펴볼 수 있습니다.',
    '회원가입 없이 결과를 확인할 수 있습니다.',
    '질문 예시',
    '가상 응답 결과 예시',
  ]) {
    assert.match(text, new RegExp(copy));
  }
  for (const domain of [
    '감정 공유 개방성',
    '갈등 대화와 공동 해결',
    '공동생활 조율 선호',
    '가족 교류 선호',
    '개인 시간과 자율성',
    '미래 계획의 구체성',
  ]) assert.match(text, new RegExp(domain));
  assert.match(text, /실제 회원 통계|궁합 확률|추천 점수가 아닙니다/);
  assert.doesNotMatch(text, /프로필과 매칭 테스트를 통해 서로의 생각을 미리 확인할 수 있습니다/);
  const testLink = links.find((link) => link.props.href === '/match-test');
  assert.ok(testLink);
  assert.match(collectText(testLink), /매칭테스트 시작하기/);

  assert.match(tree.props.className, /py-8/);
  const desktopGrid = findAll(tree, (node) => typeof node.props?.className === 'string'
    && node.props.className.includes('lg:grid-cols-[0.74fr_1.08fr_1.18fr]'));
  assert.equal(desktopGrid.length, 1);
  const graphLabels = findAll(tree, (node) => node.type === 'span'
    && typeof node.props?.className === 'string'
    && node.props.className.includes('text-sm')
    && sampleDomainLabels.some((label) => collectText(node) === label));
  assert.equal(graphLabels.length, 6);
  const graphBars = findAll(tree, (node) => node.props?.role === 'img');
  assert.equal(graphBars.length, 6);
  assert.ok(graphBars.every((bar) => bar.props.className.includes('h-full')));
});

test('service journey renders the approved four factual steps and detailed guide link', () => {
  const tree = loadedModule.exports.ServiceJourney();
  const text = collectText(tree);
  const links = findAll(tree, (node) => node.type === 'a');

  assert.match(text, /이용방법은 간단합니다/);
  for (const label of [
    '01회원가입간단한 정보로 시작',
    '02프로필 작성나와 원하는 인연에 관한 정보 입력',
    '03조건 검색원하는 상대를 직접 탐색',
    '04매칭 & 대화서로 연결되면 대화 시작',
  ]) {
    assert.match(text, new RegExp(label));
  }
  assert.ok(links.some((link) => link.props.href === '/how-to-use'));
  assert.doesNotMatch(text, /매칭테스트.*필수|자동 매칭|즉시 채팅/);
  const images = findAll(tree, (node) => node.type === 'img');
  assert.equal(images.length, 1);
  assert.equal(images[0].props.src, '/images/landing/journey-sunset-couple.webp');
  assert.equal(images[0].props.sizes, '(min-width: 1024px) 34vw, 100vw');
});

test('trust section preserves implemented protections and policy links without invented verification', () => {
  const tree = loadedModule.exports.TrustSafety();
  const text = collectText(tree);
  const links = findAll(tree, (node) => node.type === 'a');

  assert.match(text, /안전하고 신뢰할 수 있는 ComMatch/);
  for (const label of ['개인정보 보호', '신고 기능', '상호 매칭', '프로필·계정 관리']) {
    assert.match(text, new RegExp(label));
  }
  assert.ok(links.some((link) => link.props.href === '/privacy'));
  assert.ok(links.some((link) => link.props.href === '/terms'));
  assert.doesNotMatch(text, /100%|완벽한 신원|신원 인증 완료|운영자가.*보증/);

  assert.match(tree.props.className, /py-8/);
  const cards = findAll(tree, (node) => node.type === 'article');
  assert.equal(cards.length, 4);
  assert.ok(cards.every((card) => /rounded-2xl/.test(card.props.className)));
  assert.ok(cards.every((card) => /border/.test(card.props.className)));
  const iconFrames = findAll(tree, (node) => node.type === 'span'
    && typeof node.props?.className === 'string'
    && node.props.className.includes('h-14')
    && node.props.className.includes('w-14'));
  assert.equal(iconFrames.length, 4);
});

test('final CTA uses the approved warm invitation and destinations', () => {
  const tree = loadedModule.exports.FinalSignupCta();
  const text = collectText(tree);
  const links = findAll(tree, (node) => node.type === 'a');
  const destinations = Object.fromEntries(links.map((link) => [collectText(link), link.props.href]));

  assert.match(text, /지금, 좋은 인연을 시작해 보세요\./);
  assert.match(text, /ComMatch가 당신의 새로운 시작을 응원합니다\./);
  assert.equal(destinations['회원가입하기'], '/signup');
  assert.equal(destinations['매칭테스트 먼저하기'], '/match-test');
  assert.doesNotMatch(text, /영구 무료|평생 무료/);
  const images = findAll(tree, (node) => node.type === 'img');
  assert.equal(images.length, 1);
  assert.equal(images[0].props.src, '/images/landing/cta-sunset-landscape.webp');
  assert.equal(images[0].props.sizes, '100vw');
});
