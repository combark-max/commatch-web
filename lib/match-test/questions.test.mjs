import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let questionsModule;
let loadError;

try {
  const filename = resolve(import.meta.dirname, 'questions.ts');
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
    { filename },
  ).runInThisContext();
  wrapper(
    loadedModule.exports,
    (specifier) => { throw new Error(`Unexpected require: ${specifier}`); },
    loadedModule,
    filename,
    dirname(filename),
  );
  questionsModule = loadedModule.exports;
} catch (error) {
  loadError = error;
}

const expectedDomains = [
  { id: 'emotional-openness', label: '감정 공유 개방성' },
  { id: 'conflict-resolution', label: '갈등 대화와 공동 해결' },
  { id: 'shared-life-coordination', label: '공동생활 조율 선호' },
  { id: 'family-interaction', label: '가족 교류 선호' },
  { id: 'personal-autonomy', label: '개인 시간과 자율성' },
  { id: 'future-planning', label: '미래 계획의 구체성' },
];

const expectedQuestions = [
  ['Q01', 'emotional-openness', '기쁜 일이나 고마운 일이 생기면 연인에게 말로 표현하는 편입니다.', false],
  ['Q02', 'emotional-openness', '마음이 힘들 때 연인에게 내 감정을 솔직하게 이야기하고 싶습니다.', false],
  ['Q03', 'emotional-openness', '연인에게 느끼는 감정을 말로 표현하기보다 혼자 간직하는 편입니다.', true],
  ['Q04', 'conflict-resolution', '연인과 의견이 다를 때 내 생각을 직접 이야기하고 싶습니다.', false],
  ['Q05', 'conflict-resolution', '다툰 뒤에는 서로 어떤 점이 속상했는지 이야기하는 시간을 갖고 싶습니다.', false],
  ['Q06', 'conflict-resolution', '다툰 일은 다시 이야기해 풀기보다 각자 생각을 정리하며 넘어가는 편이 좋습니다.', true],
  ['Q07', 'shared-life-coordination', '결혼 후 가계 지출은 배우자와 함께 계획하고 싶습니다.', false],
  ['Q08', 'shared-life-coordination', '집안일의 역할은 각자의 상황에 맞게 배우자와 조정하는 편이 좋습니다.', false],
  ['Q09', 'shared-life-coordination', '함께 사는 생활의 기준은 서로 상의하기보다 각자의 방식을 유지하는 편이 좋습니다.', true],
  ['Q10', 'family-interaction', '결혼 후에도 서로의 가족과 정기적으로 시간을 보내고 싶습니다.', false],
  ['Q11', 'family-interaction', '결혼 후에도 서로의 가족과 안부나 일상을 자주 나누고 싶습니다.', false],
  ['Q12', 'family-interaction', '결혼 후에는 서로의 가족과 자주 교류하기보다 필요한 때를 중심으로 만나고 싶습니다.', true],
  ['Q13', 'personal-autonomy', '결혼 후에도 혼자만의 시간을 정기적으로 갖고 싶습니다.', false],
  ['Q14', 'personal-autonomy', '배우자와 취미가 달라도 각자 원하는 활동을 즐기고 싶습니다.', false],
  ['Q15', 'personal-autonomy', '쉬는 날에는 각자의 일정보다 배우자와 함께 보내는 시간을 우선하고 싶습니다.', true],
  ['Q16', 'future-planning', '결혼생활의 중요한 목표는 배우자와 미리 방향을 정해 두고 싶습니다.', false],
  ['Q17', 'future-planning', '미래의 변화를 예상해 필요한 준비를 미리 해 두는 편입니다.', false],
  ['Q18', 'future-planning', '장기 계획을 구체적으로 세우기보다 현재 상황에 맞춰 결정하는 편입니다.', true],
];

const expectedLikertOptions = [
  { value: 1, label: '전혀 그렇지 않다' },
  { value: 2, label: '그렇지 않은 편이다' },
  { value: 3, label: '보통이다' },
  { value: 4, label: '그런 편이다' },
  { value: 5, label: '매우 그렇다' },
];

test('question data module is available', () => {
  assert.ifError(loadError);
  assert.ok(questionsModule);
});

test('defines the six approved domains in canonical order', () => {
  assert.deepEqual(questionsModule?.MATCH_TEST_DOMAINS, expectedDomains);
});

test('defines all 18 approved questions verbatim with stable IDs and reverse metadata', () => {
  const actual = questionsModule?.MATCH_TEST_QUESTIONS.map((question) => [
    question.id,
    question.domainId,
    question.prompt,
    question.reverseScored,
  ]);

  assert.deepEqual(actual, expectedQuestions);
  assert.equal(new Set(actual?.map(([id]) => id)).size, 18);
});

test('assigns exactly three questions to every domain', () => {
  const counts = Object.fromEntries(expectedDomains.map(({ id }) => [id, 0]));

  for (const question of questionsModule?.MATCH_TEST_QUESTIONS ?? []) {
    counts[question.domainId] += 1;
  }

  assert.deepEqual(counts, Object.fromEntries(expectedDomains.map(({ id }) => [id, 3])));
});

test('marks only Q03, Q06, Q09, Q12, Q15 and Q18 for reverse scoring', () => {
  const reverseIds = questionsModule?.MATCH_TEST_QUESTIONS
    .filter(({ reverseScored }) => reverseScored)
    .map(({ id }) => id);

  assert.deepEqual(reverseIds, ['Q03', 'Q06', 'Q09', 'Q12', 'Q15', 'Q18']);
});

test('defines the approved five-point Likert response labels', () => {
  assert.deepEqual(questionsModule?.LIKERT_OPTIONS, expectedLikertOptions);
});
