import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const moduleCache = new Map();

const loadTypeScriptModule = (filename) => {
  const resolvedFilename = resolve(filename);
  if (moduleCache.has(resolvedFilename)) return moduleCache.get(resolvedFilename).exports;

  const source = readFileSync(resolvedFilename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: resolvedFilename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(resolvedFilename, loadedModule);

  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected require: ${specifier}`);
    return loadTypeScriptModule(resolve(dirname(resolvedFilename), `${specifier}.ts`));
  };
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`,
    { filename: resolvedFilename },
  ).runInThisContext();
  wrapper(loadedModule.exports, localRequire, loadedModule, resolvedFilename, dirname(resolvedFilename));

  return loadedModule.exports;
};

let scoringModule;
let loadError;

try {
  scoringModule = loadTypeScriptModule(resolve(import.meta.dirname, 'scoring.ts'));
} catch (error) {
  loadError = error;
}

const domainCases = [
  { id: 'emotional-openness', questions: [['Q01', false], ['Q02', false], ['Q03', true]] },
  { id: 'conflict-resolution', questions: [['Q04', false], ['Q05', false], ['Q06', true]] },
  { id: 'shared-life-coordination', questions: [['Q07', false], ['Q08', false], ['Q09', true]] },
  { id: 'family-interaction', questions: [['Q10', false], ['Q11', false], ['Q12', true]] },
  { id: 'personal-autonomy', questions: [['Q13', false], ['Q14', false], ['Q15', true]] },
  { id: 'future-planning', questions: [['Q16', false], ['Q17', false], ['Q18', true]] },
];

const allQuestionIds = domainCases.flatMap(({ questions }) => questions.map(([id]) => id));
const neutralAnswers = () => Object.fromEntries(allQuestionIds.map((id) => [id, 3]));
const expectedBand = (rawScore) => {
  if (rawScore <= 7) return 'low';
  if (rawScore <= 10) return 'middle';
  return 'high';
};

test('scoring module is available', () => {
  assert.ifError(loadError);
  assert.equal(typeof scoringModule?.scoreMatchTest, 'function');
});

test('exhaustively scores all 125 response combinations in each of the six domains', () => {
  let verifiedCases = 0;

  for (const domain of domainCases) {
    for (let first = 1; first <= 5; first += 1) {
      for (let second = 1; second <= 5; second += 1) {
        for (let third = 1; third <= 5; third += 1) {
          const answers = neutralAnswers();
          const responses = [first, second, third];
          domain.questions.forEach(([questionId], index) => {
            answers[questionId] = responses[index];
          });

          const expectedRawScore = domain.questions.reduce(
            (sum, [, reverseScored], index) => sum + (reverseScored ? 6 - responses[index] : responses[index]),
            0,
          );
          const expectedAdjustedScores = domain.questions.map(
            ([questionId, reverseScored], index) => ({
              questionId,
              score: reverseScored ? 6 - responses[index] : responses[index],
            }),
          );
          const expectedNormalizedScore = ((expectedRawScore - 3) / 12) * 100;
          const result = scoringModule?.scoreMatchTest(answers);
          assert.equal(result?.ok, true, `${domain.id}: ${responses.join(',')}`);
          const score = result.domainScores.find(({ domainId }) => domainId === domain.id);

          assert.deepEqual(
            score,
            {
              domainId: domain.id,
              rawScore: expectedRawScore,
              normalizedScore: expectedNormalizedScore,
              displayScore: Math.round(expectedNormalizedScore),
              band: expectedBand(expectedRawScore),
              adjustedScores: expectedAdjustedScores,
            },
            `${domain.id}: ${responses.join(',')}`,
          );
          assert.equal(score.adjustedScores.length, 3, `${domain.id}: adjusted score count`);
          assert.equal(
            score.adjustedScores.reduce((sum, item) => sum + item.score, 0),
            score.rawScore,
            `${domain.id}: adjusted score sum`,
          );
          verifiedCases += 1;
        }
      }
    }
  }

  assert.equal(verifiedCases, 750);
});

test('returns the minimum, neutral and maximum scores without a total score', () => {
  const minimumAnswers = neutralAnswers();
  const maximumAnswers = neutralAnswers();

  for (const { questions } of domainCases) {
    for (const [questionId, reverseScored] of questions) {
      minimumAnswers[questionId] = reverseScored ? 5 : 1;
      maximumAnswers[questionId] = reverseScored ? 1 : 5;
    }
  }

  const minimum = scoringModule?.scoreMatchTest(minimumAnswers);
  const neutral = scoringModule?.scoreMatchTest(neutralAnswers());
  const maximum = scoringModule?.scoreMatchTest(maximumAnswers);

  assert.equal(minimum?.ok, true);
  assert.equal(neutral?.ok, true);
  assert.equal(maximum?.ok, true);
  assert.ok(minimum.domainScores.every(({ rawScore, normalizedScore, displayScore, band }) => (
    rawScore === 3 && normalizedScore === 0 && displayScore === 0 && band === 'low'
  )));
  assert.ok(neutral.domainScores.every(({ rawScore, normalizedScore, displayScore, band }) => (
    rawScore === 9 && normalizedScore === 50 && displayScore === 50 && band === 'middle'
  )));
  assert.ok(maximum.domainScores.every(({ rawScore, normalizedScore, displayScore, band }) => (
    rawScore === 15 && normalizedScore === 100 && displayScore === 100 && band === 'high'
  )));
  assert.equal(Object.hasOwn(neutral, 'totalScore'), false);
  assert.equal(Object.hasOwn(neutral, 'compatibilityProbability'), false);
});

test('classifies raw-score boundaries before display rounding', () => {
  const cases = [
    { responses: [1, 1, 1], rawScore: 7, band: 'low' },
    { responses: [1, 2, 1], rawScore: 8, band: 'middle' },
    { responses: [1, 4, 1], rawScore: 10, band: 'middle' },
    { responses: [1, 5, 1], rawScore: 11, band: 'high' },
  ];

  for (const expected of cases) {
    const answers = neutralAnswers();
    answers.Q01 = expected.responses[0];
    answers.Q02 = expected.responses[1];
    answers.Q03 = expected.responses[2];
    const result = scoringModule?.scoreMatchTest(answers);
    assert.equal(result?.ok, true);
    const score = result.domainScores.find(({ domainId }) => domainId === 'emotional-openness');
    assert.equal(score.rawScore, expected.rawScore);
    assert.equal(score.band, expected.band);
  }
});

test('preserves different adjusted-score patterns that have the same raw score', () => {
  const evenAnswers = neutralAnswers();
  const mixedAnswers = { ...neutralAnswers(), Q01: 1, Q02: 3, Q03: 1 };

  const evenResult = scoringModule?.scoreMatchTest(evenAnswers);
  const mixedResult = scoringModule?.scoreMatchTest(mixedAnswers);

  assert.equal(evenResult?.ok, true);
  assert.equal(mixedResult?.ok, true);
  const evenScore = evenResult.domainScores.find(({ domainId }) => domainId === 'emotional-openness');
  const mixedScore = mixedResult.domainScores.find(({ domainId }) => domainId === 'emotional-openness');

  assert.equal(evenScore.rawScore, 9);
  assert.equal(mixedScore.rawScore, 9);
  assert.deepEqual(evenScore.adjustedScores, [
    { questionId: 'Q01', score: 3 },
    { questionId: 'Q02', score: 3 },
    { questionId: 'Q03', score: 3 },
  ]);
  assert.deepEqual(mixedScore.adjustedScores, [
    { questionId: 'Q01', score: 1 },
    { questionId: 'Q02', score: 3 },
    { questionId: 'Q03', score: 5 },
  ]);
});

test('returns the same result for the same answers without mutating the input', () => {
  const answers = Object.freeze({ ...neutralAnswers(), Q01: 5, Q03: 1, Q11: 2, Q18: 4 });
  const snapshot = { ...answers };

  const first = scoringModule?.scoreMatchTest(answers);
  const second = scoringModule?.scoreMatchTest(answers);

  assert.equal(first?.ok, true);
  assert.equal(second?.ok, true);
  assert.deepEqual(first, second);
  assert.deepEqual(answers, snapshot);
});

test('rejects missing, extra, non-integer and out-of-range answers without partial scores', () => {
  const missingAnswer = neutralAnswers();
  delete missingAnswer.Q18;
  const invalidInputs = [
    missingAnswer,
    { ...neutralAnswers(), Q19: 3 },
    { ...neutralAnswers(), Q01: 0 },
    { ...neutralAnswers(), Q01: 6 },
    { ...neutralAnswers(), Q01: 1.5 },
    { ...neutralAnswers(), Q01: Number.NaN },
    { ...neutralAnswers(), Q01: '3' },
    { ...neutralAnswers(), Q01: null },
    allQuestionIds.map(() => 3),
    null,
    undefined,
  ];

  for (const input of invalidInputs) {
    const result = scoringModule?.scoreMatchTest(input);
    assert.deepEqual(result, { ok: false, error: 'invalid-answers' });
    assert.equal(Object.hasOwn(result ?? {}, 'domainScores'), false);
  }
});
