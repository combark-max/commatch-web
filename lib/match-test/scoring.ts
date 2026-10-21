import { MATCH_TEST_DOMAINS, MATCH_TEST_QUESTIONS } from './questions';
import type {
  DomainScore,
  LikertValue,
  MatchTestAnswers,
  MatchTestScoringResult,
  ScoreBand,
} from './types';

const INVALID_ANSWERS_RESULT = {
  ok: false,
  error: 'invalid-answers',
} as const;

const QUESTION_IDS = MATCH_TEST_QUESTIONS.map(({ id }) => id);
const QUESTION_ID_SET = new Set<string>(QUESTION_IDS);
const REVERSE_SCORES: Readonly<Record<LikertValue, LikertValue>> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
};

const isLikertValue = (value: unknown): value is LikertValue => (
  Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 5
);

const isCompleteAnswerSet = (input: unknown): input is MatchTestAnswers => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false;

  const keys = Object.keys(input);
  if (keys.length !== QUESTION_IDS.length || keys.some((key) => !QUESTION_ID_SET.has(key))) return false;

  const answers = input as Record<string, unknown>;
  return QUESTION_IDS.every((questionId) => (
    Object.hasOwn(answers, questionId) && isLikertValue(answers[questionId])
  ));
};

const getScoreBand = (rawScore: number): ScoreBand => {
  if (rawScore <= 7) return 'low';
  if (rawScore <= 10) return 'middle';
  return 'high';
};

export const scoreMatchTest = (input: unknown): MatchTestScoringResult => {
  if (!isCompleteAnswerSet(input)) return INVALID_ANSWERS_RESULT;

  const domainScores: DomainScore[] = MATCH_TEST_DOMAINS.map(({ id: domainId }) => {
    const adjustedScores = MATCH_TEST_QUESTIONS
      .filter((question) => question.domainId === domainId)
      .map((question) => {
        const response = input[question.id];
        return {
          questionId: question.id,
          score: question.reverseScored ? REVERSE_SCORES[response] : response,
        };
      });
    const rawScore = adjustedScores.reduce((sum, { score }) => sum + score, 0);
    const normalizedScore = ((rawScore - 3) / 12) * 100;

    return {
      domainId,
      rawScore,
      normalizedScore,
      displayScore: Math.round(normalizedScore),
      band: getScoreBand(rawScore),
      adjustedScores,
    };
  });

  return {
    ok: true,
    domainScores,
  };
};
