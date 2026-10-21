import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

let sessionModule;
let loadError;

try {
  const filename = resolve(import.meta.dirname, 'session.ts');
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
  sessionModule = loadedModule.exports;
} catch (error) {
  loadError = error;
}

const validPartial = {
  schemaVersion: 1,
  testVersion: '2.0',
  phase: 'questions',
  currentQuestionId: 'Q07',
  answers: { Q01: 5, Q04: 2 },
};

const completeAnswers = Object.fromEntries(
  Array.from({ length: 18 }, (_, index) => [`Q${String(index + 1).padStart(2, '0')}`, 3]),
);

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('session module exposes the v2 storage contract and fixed interleaved order', () => {
  assert.ifError(loadError);
  assert.equal(sessionModule.MATCH_TEST_V2_STORAGE_KEY, 'commatch-match-test:v2');
  assert.deepEqual(sessionModule.MATCH_TEST_DISPLAY_ORDER, [
    'Q01', 'Q04', 'Q07', 'Q10', 'Q13', 'Q16',
    'Q02', 'Q05', 'Q08', 'Q11', 'Q14', 'Q17',
    'Q03', 'Q06', 'Q09', 'Q12', 'Q15', 'Q18',
  ]);
  assert.equal(new Set(sessionModule.MATCH_TEST_DISPLAY_ORDER).size, 18);
});

test('parses valid partial progress without changing the input', () => {
  const serialized = JSON.stringify(validPartial);
  const restored = sessionModule.parseMatchTestSession(serialized);

  assert.deepEqual(restored, validPartial);
  assert.equal(serialized, JSON.stringify(validPartial));
});

test('restores result phase only for all eighteen valid answers', () => {
  const validResult = { ...validPartial, phase: 'result', currentQuestionId: 'Q18', answers: completeAnswers };
  assert.deepEqual(sessionModule.parseMatchTestSession(JSON.stringify(validResult)), validResult);

  const incompleteResult = { ...validResult, answers: { ...completeAnswers } };
  delete incompleteResult.answers.Q04;
  const restored = sessionModule.parseMatchTestSession(JSON.stringify(incompleteResult));
  assert.equal(restored.phase, 'questions');
  assert.equal(restored.currentQuestionId, 'Q04');
});

test('rejects malformed JSON, versions, fields, question IDs and Likert values', () => {
  const invalidValues = [
    null,
    '',
    '{',
    JSON.stringify([]),
    JSON.stringify({ ...validPartial, schemaVersion: 2 }),
    JSON.stringify({ ...validPartial, testVersion: '1.0' }),
    JSON.stringify({ ...validPartial, phase: 'done' }),
    JSON.stringify({ ...validPartial, currentQuestionId: 'Q99' }),
    JSON.stringify({ ...validPartial, answers: { Q99: 3 } }),
    JSON.stringify({ ...validPartial, answers: { Q01: 0 } }),
    JSON.stringify({ ...validPartial, answers: { Q01: 6 } }),
    JSON.stringify({ ...validPartial, answers: { Q01: 2.5 } }),
    JSON.stringify({ ...validPartial, answers: null }),
  ];

  for (const value of invalidValues) {
    assert.equal(sessionModule.parseMatchTestSession(value), null);
  }
});

test('reads valid v2 progress and never reads or changes the v1 key', () => {
  const storage = new MemoryStorage();
  storage.setItem('commatch-match-test', 'legacy-v1');
  storage.setItem('commatch-match-test:v2', JSON.stringify(validPartial));

  assert.deepEqual(sessionModule.readMatchTestSession(storage), validPartial);
  assert.equal(storage.getItem('commatch-match-test'), 'legacy-v1');
});

test('cleans only malformed v2 data while preserving v1 data', () => {
  const storage = new MemoryStorage();
  storage.setItem('commatch-match-test', 'legacy-v1');
  storage.setItem('commatch-match-test:v2', '{broken');

  assert.equal(sessionModule.readMatchTestSession(storage), null);
  assert.equal(storage.getItem('commatch-match-test:v2'), null);
  assert.equal(storage.getItem('commatch-match-test'), 'legacy-v1');
});

test('does not overwrite storage until restoration is complete', () => {
  const storage = new MemoryStorage();
  storage.setItem('commatch-match-test:v2', 'existing-progress');

  assert.equal(sessionModule.writeMatchTestSession(storage, validPartial, false), false);
  assert.equal(storage.getItem('commatch-match-test:v2'), 'existing-progress');
  assert.equal(sessionModule.writeMatchTestSession(storage, validPartial, true), true);
  assert.deepEqual(JSON.parse(storage.getItem('commatch-match-test:v2')), validPartial);
});

test('continues safely when storage read, write or delete throws', () => {
  const throwingStorage = {
    getItem() { throw new Error('read blocked'); },
    setItem() { throw new Error('write blocked'); },
    removeItem() { throw new Error('delete blocked'); },
  };

  assert.doesNotThrow(() => sessionModule.readMatchTestSession(throwingStorage));
  assert.equal(sessionModule.readMatchTestSession(throwingStorage), null);
  assert.doesNotThrow(() => sessionModule.writeMatchTestSession(throwingStorage, validPartial, true));
  assert.equal(sessionModule.writeMatchTestSession(throwingStorage, validPartial, true), false);
  assert.doesNotThrow(() => sessionModule.clearMatchTestSession(throwingStorage));
  assert.equal(sessionModule.clearMatchTestSession(throwingStorage), false);
});

test('restart clears only the v2 key', () => {
  const storage = new MemoryStorage();
  storage.setItem('commatch-match-test', 'legacy-v1');
  storage.setItem('commatch-match-test:v2', JSON.stringify(validPartial));

  assert.equal(sessionModule.clearMatchTestSession(storage), true);
  assert.equal(storage.getItem('commatch-match-test:v2'), null);
  assert.equal(storage.getItem('commatch-match-test'), 'legacy-v1');
});
