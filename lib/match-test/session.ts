import type { LikertValue, QuestionId } from './types';

export const MATCH_TEST_V2_STORAGE_KEY = 'commatch-match-test:v2';

export const MATCH_TEST_DISPLAY_ORDER = [
  'Q01', 'Q04', 'Q07', 'Q10', 'Q13', 'Q16',
  'Q02', 'Q05', 'Q08', 'Q11', 'Q14', 'Q17',
  'Q03', 'Q06', 'Q09', 'Q12', 'Q15', 'Q18',
] as const satisfies readonly QuestionId[];

export type MatchTestSessionState = {
  readonly schemaVersion: 1;
  readonly testVersion: '2.0';
  readonly phase: 'questions' | 'result';
  readonly currentQuestionId: QuestionId;
  readonly answers: Readonly<Partial<Record<QuestionId, LikertValue>>>;
};

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const QUESTION_ID_SET = new Set<string>(MATCH_TEST_DISPLAY_ORDER);

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isQuestionId = (value: unknown): value is QuestionId => (
  typeof value === 'string' && QUESTION_ID_SET.has(value)
);

const isLikertValue = (value: unknown): value is LikertValue => (
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
);

const parseAnswers = (value: unknown): Partial<Record<QuestionId, LikertValue>> | null => {
  if (!isPlainObject(value)) return null;

  const answers: Partial<Record<QuestionId, LikertValue>> = {};
  for (const [questionId, answer] of Object.entries(value)) {
    if (!isQuestionId(questionId) || !isLikertValue(answer)) return null;
    answers[questionId] = answer;
  }
  return answers;
};

const isCompleteAnswers = (answers: Readonly<Partial<Record<QuestionId, LikertValue>>>) => (
  MATCH_TEST_DISPLAY_ORDER.every((questionId) => isLikertValue(answers[questionId]))
);

export const parseMatchTestSession = (serialized: string | null): MatchTestSessionState | null => {
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isPlainObject(parsed)) return null;
    if (parsed.schemaVersion !== 1 || parsed.testVersion !== '2.0') return null;
    if (parsed.phase !== 'questions' && parsed.phase !== 'result') return null;
    if (!isQuestionId(parsed.currentQuestionId)) return null;

    const answers = parseAnswers(parsed.answers);
    if (!answers) return null;

    if (parsed.phase === 'result' && !isCompleteAnswers(answers)) {
      const firstUnanswered = MATCH_TEST_DISPLAY_ORDER.find((questionId) => answers[questionId] === undefined);
      return {
        schemaVersion: 1,
        testVersion: '2.0',
        phase: 'questions',
        currentQuestionId: firstUnanswered ?? 'Q01',
        answers,
      };
    }

    return {
      schemaVersion: 1,
      testVersion: '2.0',
      phase: parsed.phase,
      currentQuestionId: parsed.currentQuestionId,
      answers,
    };
  } catch {
    return null;
  }
};

export const readMatchTestSession = (storage: SessionStorageLike): MatchTestSessionState | null => {
  let serialized: string | null;
  try {
    serialized = storage.getItem(MATCH_TEST_V2_STORAGE_KEY);
  } catch {
    return null;
  }

  if (serialized === null) return null;
  const restored = parseMatchTestSession(serialized);
  if (restored) return restored;

  try {
    storage.removeItem(MATCH_TEST_V2_STORAGE_KEY);
  } catch {
    // Storage failures must not prevent the in-memory test flow.
  }
  return null;
};

export const writeMatchTestSession = (
  storage: SessionStorageLike,
  state: MatchTestSessionState,
  restorationComplete: boolean,
): boolean => {
  if (!restorationComplete) return false;
  if (!parseMatchTestSession(JSON.stringify(state))) return false;

  try {
    storage.setItem(MATCH_TEST_V2_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
};

export const clearMatchTestSession = (storage: SessionStorageLike): boolean => {
  try {
    storage.removeItem(MATCH_TEST_V2_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};
