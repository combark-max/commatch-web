'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, RotateCcw } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/auth';
import { analyzeMatchTest, type MatchTestAnalysis } from '@/lib/match-test/analysis';
import { LIKERT_OPTIONS, MATCH_TEST_DOMAINS, MATCH_TEST_QUESTIONS } from '@/lib/match-test/questions';
import { scoreMatchTest } from '@/lib/match-test/scoring';
import {
  clearMatchTestSession,
  MATCH_TEST_DISPLAY_ORDER,
  readMatchTestSession,
  writeMatchTestSession,
  type MatchTestSessionState,
} from '@/lib/match-test/session';
import type { DomainId, LikertValue, MatchTestQuestion, QuestionId } from '@/lib/match-test/types';

type AuthState = 'checking' | 'anonymous' | 'authenticated' | 'error';

type MatchTestAction =
  | { readonly type: 'answer'; readonly value: LikertValue }
  | { readonly type: 'next' }
  | { readonly type: 'previous' }
  | { readonly type: 'restart' };

const DOMAIN_LABELS = Object.fromEntries(
  MATCH_TEST_DOMAINS.map(({ id, label }) => [id, label]),
) as Readonly<Record<DomainId, string>>;

const QUESTION_BY_ID = new Map<QuestionId, MatchTestQuestion>(
  MATCH_TEST_QUESTIONS.map((question) => [question.id, question]),
);

const MATCH_TEST_DISPLAY_QUESTIONS = MATCH_TEST_DISPLAY_ORDER.map((questionId) => {
  const question = QUESTION_BY_ID.get(questionId);
  if (!question) throw new Error(`Missing match-test question: ${questionId}`);
  return question;
});

const createInitialMatchTestState = (): MatchTestSessionState => ({
  schemaVersion: 1,
  testVersion: '2.0',
  phase: 'questions',
  currentQuestionId: MATCH_TEST_DISPLAY_ORDER[0],
  answers: {},
});

const hasAllAnswers = (answers: MatchTestSessionState['answers']) => (
  MATCH_TEST_DISPLAY_ORDER.every((questionId) => answers[questionId] !== undefined)
);

const reduceMatchTestState = (
  state: MatchTestSessionState,
  action: MatchTestAction,
): MatchTestSessionState => {
  if (action.type === 'restart') return createInitialMatchTestState();

  if (action.type === 'answer') {
    return {
      ...state,
      answers: { ...state.answers, [state.currentQuestionId]: action.value },
    };
  }

  const currentIndex = MATCH_TEST_DISPLAY_ORDER.indexOf(state.currentQuestionId);
  if (action.type === 'previous') {
    if (currentIndex <= 0) return state;
    return {
      ...state,
      phase: 'questions',
      currentQuestionId: MATCH_TEST_DISPLAY_ORDER[currentIndex - 1],
    };
  }

  if (state.answers[state.currentQuestionId] === undefined) return state;
  if (currentIndex < MATCH_TEST_DISPLAY_ORDER.length - 1) {
    return { ...state, currentQuestionId: MATCH_TEST_DISPLAY_ORDER[currentIndex + 1] };
  }
  if (!hasAllAnswers(state.answers)) return state;
  return { ...state, phase: 'result' };
};

const createMatchTestResult = (answers: unknown): MatchTestAnalysis | null => {
  const scoringResult = scoreMatchTest(answers);
  if (!scoringResult.ok) return null;
  return analyzeMatchTest(scoringResult);
};

type QuestionScreenProps = {
  readonly question: MatchTestQuestion;
  readonly questionNumber: number;
  readonly selectedAnswer: LikertValue | undefined;
  readonly onAnswer: (value: LikertValue) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly headingRef?: React.RefObject<HTMLLegendElement | null>;
};

function QuestionScreen({
  question,
  questionNumber,
  selectedAnswer,
  onAnswer,
  onPrevious,
  onNext,
  headingRef,
}: QuestionScreenProps) {
  const isLastQuestion = questionNumber === MATCH_TEST_DISPLAY_QUESTIONS.length;
  const progress = (questionNumber / MATCH_TEST_DISPLAY_QUESTIONS.length) * 100;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-10">
        <header className="mb-8">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#806B26]">Relationship Test</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <h1 className="text-2xl font-black text-[#183B1B] sm:text-3xl">관계 성향 테스트</h1>
            <span className="shrink-0 text-base font-black text-gray-700 sm:text-lg">
              {questionNumber} / {MATCH_TEST_DISPLAY_QUESTIONS.length}
            </span>
          </div>
          <progress
            className="mt-5 h-3 w-full overflow-hidden rounded-full accent-[#C8A951]"
            value={progress}
            max={100}
            aria-label={`테스트 진행률 ${questionNumber} / ${MATCH_TEST_DISPLAY_QUESTIONS.length}`}
          />
        </header>

        <fieldset>
          <legend ref={headingRef} tabIndex={-1} className="w-full outline-none">
            <span className="inline-flex rounded-full bg-[#F4F8F4] px-3 py-1.5 text-sm font-black text-[#2E7D32]">
              {DOMAIN_LABELS[question.domainId]}
            </span>
            <span className="mt-4 block text-2xl font-black leading-9 text-[#183B1B] sm:text-3xl sm:leading-[1.4]">
              {question.prompt}
            </span>
          </legend>

          <div className="mt-8 space-y-3">
            {LIKERT_OPTIONS.map((option) => {
              const inputId = `match-test-${question.id}-${option.value}`;
              const isSelected = selectedAnswer === option.value;
              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  className={`flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border-2 px-4 py-3.5 text-left text-base font-bold transition-colors sm:min-h-16 sm:px-6 sm:text-lg ${
                    isSelected
                      ? 'border-[#2E7D32] bg-[#F4F8F4] text-[#183B1B]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-[#2E7D32]/45 hover:bg-gray-50'
                  }`}
                >
                  <span>{option.label}</span>
                  <input
                    id={inputId}
                    name="match-test-answer"
                    type="radio"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => onAnswer(option.value)}
                    className="h-5 w-5 shrink-0 accent-[#2E7D32] sm:h-6 sm:w-6"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onPrevious}
            disabled={questionNumber === 1}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-4 text-lg font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft aria-hidden="true" size={21} />
            이전 질문
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={selectedAnswer === undefined}
            className="min-h-14 rounded-xl bg-[#2E7D32] px-8 py-4 text-lg font-bold text-white hover:bg-[#256729] focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/20 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isLastQuestion ? '결과 보기' : '다음 질문'}
          </button>
        </div>
      </div>
    </div>
  );
}

type ResultScreenProps = {
  readonly analysis: MatchTestAnalysis;
  readonly authState: AuthState;
  readonly onRestart: () => void;
  readonly headingRef?: React.RefObject<HTMLHeadingElement | null>;
};

const getDomainLabel = (domainId: DomainId) => DOMAIN_LABELS[domainId];

function ResultCta({ authState }: { readonly authState: AuthState }) {
  if (authState === 'authenticated') {
    return (
      <div className="text-center">
        <p className="text-base leading-7 text-gray-700">테스트 결과는 회원 추천에 자동 반영되지 않습니다. 기존 회원 기능은 마이페이지에서 계속 이용할 수 있습니다.</p>
        <Link href="/dashboard" className="mt-5 inline-flex min-h-14 items-center justify-center rounded-xl bg-[#2E7D32] px-7 py-4 text-lg font-bold text-white hover:bg-[#256729]">
          마이페이지로 이동
        </Link>
      </div>
    );
  }

  if (authState === 'anonymous') {
    return (
      <div className="text-center">
        <p className="text-base leading-7 text-gray-700">결과는 회원가입 없이 확인할 수 있습니다. ComMatch의 회원 기능을 이용하려면 가입하거나 로그인해 주세요.</p>
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#2E7D32] px-7 py-4 text-lg font-bold text-white hover:bg-[#256729]">회원가입</Link>
          <Link href="/login" className="inline-flex min-h-14 items-center justify-center rounded-xl border border-[#2E7D32] bg-white px-7 py-4 text-lg font-bold text-[#2E7D32] hover:bg-green-50">로그인</Link>
        </div>
      </div>
    );
  }

  if (authState === 'checking') {
    return <p className="text-center text-base text-gray-600" role="status">회원 상태를 확인하고 있습니다.</p>;
  }

  return (
    <div className="text-center">
      <p className="text-base leading-7 text-gray-700">회원 상태를 확인하지 못했습니다. 테스트 결과는 현재 화면에서 계속 확인할 수 있습니다.</p>
      <Link href="/" className="mt-5 inline-flex min-h-14 items-center justify-center rounded-xl border border-[#2E7D32] bg-white px-7 py-4 text-lg font-bold text-[#2E7D32] hover:bg-green-50">ComMatch 홈으로</Link>
    </div>
  );
}

function ResultScreen({ analysis, authState, onRestart, headingRef }: ResultScreenProps) {
  const highlightedDomains = analysis.hasSimilarScores
    ? []
    : analysis.highestDomainIds.map(getDomainLabel);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#806B26]">Relationship Test Result</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-3xl font-black tracking-tight text-[#183B1B] outline-none sm:text-4xl">나의 관계 성향 요약</h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-gray-700 sm:text-lg sm:leading-8">{analysis.summary}</p>
        </header>

        <section aria-labelledby="scores-heading" className="mt-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 id="scores-heading" className="text-2xl font-black text-[#183B1B]">6가지 관계 성향</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">각 점수는 우열이나 궁합 확률이 아니라 응답이 해당 성향 방향에 가까운 정도를 나타냅니다.</p>
          <div className="mt-7 space-y-6">
            {analysis.domainResults.map((domain) => (
              <div key={domain.domainId}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="font-bold text-gray-800">{getDomainLabel(domain.domainId)}</span>
                  <span className="shrink-0 font-black text-[#2E7D32]">{domain.displayScore} / 100</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${getDomainLabel(domain.domainId)} ${domain.displayScore}점`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={domain.displayScore}
                  className="h-3 overflow-hidden rounded-full bg-gray-100"
                >
                  <div className="h-full rounded-full bg-[#C8A951]" style={{ width: `${domain.displayScore}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="details-heading" className="mt-8">
          <h2 id="details-heading" className="text-2xl font-black text-[#183B1B]">영역별 상세 분석</h2>
          <div className="mt-5 space-y-4">
            {analysis.domainResults.map((domain, index) => (
              <details key={domain.domainId} open={index === 0} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-black text-gray-900">
                  <span>
                    <span className="block text-sm text-[#806B26]">{getDomainLabel(domain.domainId)}</span>
                    <span className="mt-1 block text-lg sm:text-xl">{domain.title}</span>
                  </span>
                  <ChevronDown aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" size={22} />
                </summary>
                <div className="mt-5 border-t border-gray-100 pt-5 text-base leading-7 text-gray-700">
                  <p>{domain.description}</p>
                  {domain.mixedDescription ? (
                    <p className="mt-4 rounded-xl bg-[#F4F8F4] p-4 text-[#245F28]">
                      <span className="font-black">응답 안에서 함께 나타난 모습</span><br />
                      {domain.mixedDescription}
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#C8A951]/35 bg-white p-6 sm:p-8" aria-labelledby="highlight-heading">
          <h2 id="highlight-heading" className="text-2xl font-black text-[#183B1B]">응답에서 상대적으로 두드러진 영역</h2>
          {analysis.hasSimilarScores ? (
            <p className="mt-4 text-base leading-7 text-gray-700">전체 영역의 점수가 비슷해 특정 영역 하나를 강조하지 않았습니다. 여섯 영역의 설명을 함께 살펴보세요.</p>
          ) : (
            <>
              <ul className="mt-4 flex flex-wrap gap-2">
                {highlightedDomains.map((label) => <li key={label} className="rounded-full bg-[#F4F8F4] px-4 py-2 font-bold text-[#245F28]">{label}</li>)}
              </ul>
              <p className="mt-4 text-sm leading-6 text-gray-600">상대적으로 높은 점수는 더 좋은 성향이나 우월함을 의미하지 않습니다.</p>
            </>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-[#183B1B] p-6 text-white sm:p-8" aria-labelledby="conversation-heading">
          <h2 id="conversation-heading" className="text-2xl font-black">상대방과 이야기해 볼 질문</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {analysis.domainResults.map((domain) => (
              <li key={domain.domainId} className="rounded-xl bg-white/10 p-4">
                <span className="text-sm font-black text-[#E0C872]">{getDomainLabel(domain.domainId)}</span>
                <p className="mt-2 leading-7 text-white/90">{domain.conversationQuestion}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" aria-label="다음 행동 안내">
          <ResultCta authState={authState} />
        </section>

        <aside className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-6 text-gray-600 sm:p-6" aria-labelledby="limitation-heading">
          <h2 id="limitation-heading" className="font-black text-gray-800">결과를 볼 때 참고해 주세요</h2>
          <p className="mt-2">{analysis.limitation}</p>
        </aside>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#2E7D32] bg-white px-7 py-4 text-lg font-bold text-[#2E7D32] hover:bg-green-50"
          >
            <RotateCcw aria-hidden="true" size={20} />
            다시 테스트하기
          </button>
        </div>
      </div>
    </div>
  );
}

// Analytics loads separately; loading/transport errors cannot stop a test interaction.
function trackTestEvent(name: 'match_test_start' | 'match_test_complete') {
  void import('@/lib/analytics/promotion')
    .then(({ trackPromotionEvent }) => trackPromotionEvent(name))
    .catch(() => {});
}

export default function MatchTestPage() {
  const [testState, setTestState] = useState<MatchTestSessionState>(createInitialMatchTestState);
  const [isRestored, setIsRestored] = useState(false);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const questionHeadingRef = useRef<HTMLLegendElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const analyticsAttempt = useRef({ started: false, completed: false });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = readMatchTestSession(window.sessionStorage);
      if (restored) {
        // Existing progress represents an existing attempt, not a new interaction.
        analyticsAttempt.current = {
          started: Object.keys(restored.answers).length > 0,
          completed: restored.phase === 'result',
        };
        setTestState(restored);
      }
      setIsRestored(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    writeMatchTestSession(window.sessionStorage, testState, true);
  }, [isRestored, testState]);

  useEffect(() => {
    let active = true;
    void getCurrentUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthState('error');
          return;
        }
        setAuthState(data.user ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (active) setAuthState('error');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const frame = window.requestAnimationFrame(() => {
      if (testState.phase === 'result') resultHeadingRef.current?.focus();
      else questionHeadingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isRestored, testState.currentQuestionId, testState.phase]);

  const currentIndex = MATCH_TEST_DISPLAY_ORDER.indexOf(testState.currentQuestionId);
  const currentQuestion = MATCH_TEST_DISPLAY_QUESTIONS[currentIndex] ?? MATCH_TEST_DISPLAY_QUESTIONS[0];
  const analysis = useMemo(
    () => (testState.phase === 'result' ? createMatchTestResult(testState.answers) : null),
    [testState.answers, testState.phase],
  );

  useEffect(() => {
    if (!isRestored || !analysis || analyticsAttempt.current.completed) return;
    analyticsAttempt.current.completed = true;
    trackTestEvent('match_test_complete');
  }, [isRestored, analysis]);

  const dispatch = (action: MatchTestAction) => {
    setTestState((current) => reduceMatchTestState(current, action));
  };

  const restart = () => {
    clearMatchTestSession(window.sessionStorage);
    analyticsAttempt.current = { started: false, completed: false };
    dispatch({ type: 'restart' });
  };

  if (!isRestored) {
    return <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4]" aria-label="테스트 진행 상태 불러오는 중" />;
  }

  if (testState.phase === 'result' && analysis) {
    return <ResultScreen analysis={analysis} authState={authState} onRestart={restart} headingRef={resultHeadingRef} />;
  }

  return (
    <QuestionScreen
      question={currentQuestion}
      questionNumber={currentIndex + 1}
      selectedAnswer={testState.answers[currentQuestion.id]}
      onAnswer={(value) => {
        if (!analyticsAttempt.current.started && Number.isInteger(value) && value >= 1 && value <= 5) {
          analyticsAttempt.current.started = true;
          trackTestEvent('match_test_start');
        }
        dispatch({ type: 'answer', value });
      }}
      onPrevious={() => dispatch({ type: 'previous' })}
      onNext={() => dispatch({ type: 'next' })}
      headingRef={questionHeadingRef}
    />
  );
}
