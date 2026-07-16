'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Heart, House, RotateCcw, Users } from 'lucide-react';

type Category = 'values' | 'partner' | 'marriage';

type Question = {
  category: Category;
  categoryLabel: string;
  prompt: string;
  options: Array<{
    label: string;
    trait: string;
  }>;
};

type ResultProfile = {
  title: string;
  description: string[];
};

const questions: Question[] = [
  {
    category: 'values',
    categoryLabel: '가치관',
    prompt: '결혼생활에서 가장 중요하다고 생각하는 것은?',
    options: [
      { label: '신뢰와 정직', trait: 'stability' },
      { label: '경제적 안정', trait: 'stability' },
      { label: '대화와 공감', trait: 'communication' },
      { label: '개인의 자유 존중', trait: 'balance' },
    ],
  },
  {
    category: 'values',
    categoryLabel: '가치관',
    prompt: '배우자와 의견이 다를 때 선호하는 방식은?',
    options: [
      { label: '충분히 대화한다', trait: 'communication' },
      { label: '서로 시간을 가진다', trait: 'balance' },
      { label: '빠르게 타협한다', trait: 'stability' },
      { label: '한쪽이 양보한다', trait: 'stability' },
    ],
  },
  {
    category: 'partner',
    categoryLabel: '이성관',
    prompt: '이상적인 배우자의 성향은?',
    options: [
      { label: '따뜻하고 다정한 사람', trait: 'warmth' },
      { label: '책임감 있고 안정적인 사람', trait: 'reality' },
      { label: '활발하고 긍정적인 사람', trait: 'energy' },
      { label: '지적이고 대화가 잘 통하는 사람', trait: 'warmth' },
    ],
  },
  {
    category: 'partner',
    categoryLabel: '이성관',
    prompt: '배우자의 직업이나 경제력에 대한 생각은?',
    options: [
      { label: '매우 중요하다', trait: 'reality' },
      { label: '어느 정도 중요하다', trait: 'reality' },
      { label: '성실함이 더 중요하다', trait: 'warmth' },
      { label: '크게 중요하지 않다', trait: 'energy' },
    ],
  },
  {
    category: 'marriage',
    categoryLabel: '결혼관',
    prompt: '결혼 후 개인 시간에 대한 생각은?',
    options: [
      { label: '서로 충분히 존중해야 한다', trait: 'partnership' },
      { label: '대부분의 시간을 함께 보내고 싶다', trait: 'family' },
      { label: '상황에 따라 조절해야 한다', trait: 'practical' },
      { label: '크게 생각해보지 않았다', trait: 'practical' },
    ],
  },
  {
    category: 'marriage',
    categoryLabel: '결혼관',
    prompt: '자녀 계획에 대한 생각은?',
    options: [
      { label: '꼭 원한다', trait: 'family' },
      { label: '가능하면 원한다', trait: 'family' },
      { label: '배우자와 상의하고 싶다', trait: 'partnership' },
      { label: '원하지 않는다', trait: 'practical' },
    ],
  },
  {
    category: 'marriage',
    categoryLabel: '결혼관',
    prompt: '부모님이나 가족과의 관계는 어느 정도가 적당한가?',
    options: [
      { label: '자주 교류하고 가깝게 지낸다', trait: 'family' },
      { label: '필요할 때 서로 돕는다', trait: 'partnership' },
      { label: '일정한 거리를 유지한다', trait: 'practical' },
      { label: '부부 중심의 생활이 중요하다', trait: 'partnership' },
    ],
  },
  {
    category: 'values',
    categoryLabel: '가치관',
    prompt: '갈등이 생겼을 때 가장 중요한 것은?',
    options: [
      { label: '솔직한 대화', trait: 'communication' },
      { label: '감정 진정', trait: 'balance' },
      { label: '빠른 해결', trait: 'stability' },
      { label: '서로의 입장 존중', trait: 'communication' },
    ],
  },
  {
    category: 'partner',
    categoryLabel: '이성관',
    prompt: '데이트나 여가생활에서 선호하는 방식은?',
    options: [
      { label: '여행과 야외 활동', trait: 'energy' },
      { label: '문화생활과 취미', trait: 'warmth' },
      { label: '집에서 편안하게 보내기', trait: 'reality' },
      { label: '다양한 경험을 함께하기', trait: 'energy' },
    ],
  },
  {
    category: 'marriage',
    categoryLabel: '결혼관',
    prompt: '결혼을 결정할 때 가장 중요한 기준은?',
    options: [
      { label: '사랑과 정서적 교감', trait: 'partnership' },
      { label: '가치관의 일치', trait: 'partnership' },
      { label: '경제적 안정', trait: 'practical' },
      { label: '책임감과 신뢰', trait: 'family' },
    ],
  },
];

const resultProfiles: Record<Category, Record<string, ResultProfile>> = {
  values: {
    stability: {
      title: '신뢰와 안정된 관계를 중요하게 생각하는 안정형',
      description: [
        '관계의 기본은 서로에 대한 믿음과 책임감이라고 생각하는 편입니다.',
        '예측 가능한 약속과 차분한 해결 방식에서 편안함을 느낄 가능성이 높습니다.',
      ],
    },
    communication: {
      title: '대화와 공감을 중요하게 생각하는 소통형',
      description: [
        '생각과 감정을 솔직하게 나누는 관계를 중요하게 여기는 편입니다.',
        '서로의 입장을 이해하며 함께 답을 찾아가는 상대와 잘 맞을 수 있습니다.',
      ],
    },
    balance: {
      title: '서로의 자율성을 존중하는 균형형',
      description: [
        '가까운 관계 안에서도 각자의 시간과 감정을 존중하는 편입니다.',
        '서로에게 여유를 주면서 안정적으로 관계를 이어가는 방식을 선호할 수 있습니다.',
      ],
    },
  },
  partner: {
    warmth: {
      title: '따뜻하고 대화가 잘 통하는 상대를 선호하는 교감형',
      description: [
        '조건보다 다정한 태도와 정서적인 교감을 중요하게 보는 편입니다.',
        '일상의 이야기를 편안히 나누고 서로를 격려하는 상대에게 끌릴 수 있습니다.',
      ],
    },
    reality: {
      title: '책임감 있고 안정적인 상대를 선호하는 현실형',
      description: [
        '성실함과 생활의 안정감을 중요한 매력으로 생각하는 편입니다.',
        '미래를 함께 계획하고 약속을 지키는 상대에게 신뢰를 느낄 가능성이 높습니다.',
      ],
    },
    energy: {
      title: '긍정적이고 새로운 경험을 즐기는 상대를 선호하는 활력형',
      description: [
        '함께 다양한 경험을 만들 수 있는 밝고 적극적인 상대를 선호하는 편입니다.',
        '일상에 즐거움과 변화를 더해주는 관계에서 매력을 느낄 수 있습니다.',
      ],
    },
  },
  marriage: {
    partnership: {
      title: '부부가 함께 조율하는 결혼생활을 원하는 동반자형',
      description: [
        '결혼은 두 사람이 대화하며 함께 만들어가는 과정이라고 생각하는 편입니다.',
        '중요한 선택을 함께 의논하고 서로의 삶을 존중하는 관계를 지향합니다.',
      ],
    },
    family: {
      title: '가족의 유대와 미래를 중요하게 생각하는 가족형',
      description: [
        '부부뿐 아니라 가족 간의 책임과 유대도 중요하게 생각하는 편입니다.',
        '안정적인 가정을 함께 만들고 미래를 준비하는 관계를 선호할 수 있습니다.',
      ],
    },
    practical: {
      title: '현실적인 기반과 생활의 균형을 중시하는 실용형',
      description: [
        '정해진 답보다 두 사람의 상황에 맞는 현실적인 선택을 중요하게 여깁니다.',
        '각자의 생활을 존중하면서 무리 없이 지속할 수 있는 결혼을 지향합니다.',
      ],
    },
  },
};

const categoryMeta: Record<Category, { label: string; icon: typeof Heart }> = {
  values: { label: '가치관', icon: Heart },
  partner: { label: '이성관', icon: Users },
  marriage: { label: '결혼관', icon: House },
};

const storageKey = 'commatch-match-test';

function calculateResults(answers: Array<string | null>) {
  const scores: Record<Category, Record<string, number>> = {
    values: { stability: 0, communication: 0, balance: 0 },
    partner: { warmth: 0, reality: 0, energy: 0 },
    marriage: { partnership: 0, family: 0, practical: 0 },
  };

  questions.forEach((question, index) => {
    const selectedOption = question.options.find((option) => option.label === answers[index]);
    if (selectedOption) scores[question.category][selectedOption.trait] += 1;
  });

  return (Object.keys(scores) as Category[]).reduce((results, category) => {
    const traitOrder = Object.keys(resultProfiles[category]);
    const topTrait = traitOrder.reduce((top, trait) => (
      scores[category][trait] > scores[category][top] ? trait : top
    ));
    results[category] = resultProfiles[category][topTrait];
    return results;
  }, {} as Record<Category, ResultProfile>);
}

export default function MatchTestPage() {
  const [answers, setAnswers] = useState<Array<string | null>>(() => Array(questions.length).fill(null));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isRestored, setIsRestored] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            answers?: unknown;
            currentIndex?: unknown;
            showResult?: unknown;
          };
          const rawAnswers = Array.isArray(parsed.answers) ? parsed.answers : null;
          const savedAnswers = rawAnswers
            ? questions.map((question, index) => (
              question.options.some((option) => option.label === rawAnswers[index])
                ? String(rawAnswers[index])
                : null
            ))
            : Array(questions.length).fill(null);
          const hasAllAnswers = savedAnswers.every((answer) => answer !== null);
          const savedIndex = typeof parsed.currentIndex === 'number'
            ? Math.min(Math.max(Math.trunc(parsed.currentIndex), 0), questions.length - 1)
            : 0;

          setAnswers(savedAnswers);
          setCurrentIndex(savedIndex);
          setShowResult(parsed.showResult === true && hasAllAnswers);
        }
      } catch {
        window.sessionStorage.removeItem(storageKey);
      } finally {
        setIsRestored(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!isRestored) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ answers, currentIndex, showResult }));
  }, [answers, currentIndex, isRestored, showResult]);

  const results = useMemo(() => calculateResults(answers), [answers]);
  const question = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const isLastQuestion = currentIndex === questions.length - 1;

  const selectAnswer = (answer: string) => {
    setAnswers((current) => current.map((value, index) => (index === currentIndex ? answer : value)));
  };

  const goNext = () => {
    if (!answers[currentIndex]) return;
    if (isLastQuestion) {
      setShowResult(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const goPrevious = () => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  };

  const restart = () => {
    setAnswers(Array(questions.length).fill(null));
    setCurrentIndex(0);
    setShowResult(false);
    window.sessionStorage.removeItem(storageKey);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isRestored) {
    return <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4]" />;
  }

  if (showResult) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="mb-3 text-base font-black tracking-[0.16em] text-[#806B26]">MATCH TEST RESULT</p>
            <h1 className="text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">나의 결혼 성향 결과</h1>
          </div>

          <div className="space-y-5">
            {(Object.keys(categoryMeta) as Category[]).map((category) => {
              const Icon = categoryMeta[category].icon;
              const result = results[category];
              return (
                <section key={category} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F4F8F4] text-[#2E7D32]">
                      <Icon size={26} strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="text-base font-black text-[#806B26]">{categoryMeta[category].label}</p>
                      <h2 className="mt-1 text-xl font-black leading-8 text-gray-900 sm:text-2xl">{result.title}</h2>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2 border-t border-gray-100 pt-5 text-base leading-7 text-gray-600 sm:text-lg sm:leading-8">
                    {result.description.map((line) => <p key={line}>{line}</p>)}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-8 rounded-2xl border border-[#C8A951]/35 bg-white p-6 text-center sm:p-8">
            <p className="text-base leading-7 text-gray-700 sm:text-lg sm:leading-8">
              이 결과는 간단한 사전 성향 분석이며,
              <br className="hidden sm:block" />
              회원가입 후 더 자세한 프로필과 이상형 설정을 통해
              <br className="hidden sm:block" />
              더욱 정확한 추천을 받을 수 있습니다.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#2E7D32] px-7 py-4 text-lg font-bold text-white hover:bg-[#256729] focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/20"
              >
                가입하고 매칭 시작하기
              </Link>
              <button
                type="button"
                onClick={restart}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#2E7D32] bg-white px-7 py-4 text-lg font-bold text-[#2E7D32] hover:bg-green-50"
              >
                <RotateCcw size={20} />
                다시 테스트하기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F4F8F4] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="rounded-full bg-[#F4F8F4] px-4 py-2 text-base font-black text-[#2E7D32]">
              {question.categoryLabel}
            </span>
            <span className="text-lg font-black text-gray-700">{currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100" aria-label={`진행률 ${currentIndex + 1} / ${questions.length}`}>
            <div className="h-full rounded-full bg-[#C8A951] transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <h1 className="text-2xl font-black leading-9 text-[#183B1B] sm:text-3xl sm:leading-[1.4]">{question.prompt}</h1>

        <div className="mt-8 space-y-3" role="radiogroup" aria-label={question.prompt}>
          {question.options.map((option) => {
            const isSelected = answers[currentIndex] === option.label;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => selectAnswer(option.label)}
                className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-xl border-2 px-5 py-4 text-left text-lg font-bold transition-colors sm:px-6 ${
                  isSelected
                    ? 'border-[#2E7D32] bg-[#F4F8F4] text-[#183B1B]'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-[#2E7D32]/45 hover:bg-gray-50'
                }`}
              >
                <span>{option.label}</span>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-[#2E7D32] bg-[#2E7D32] text-white' : 'border-gray-300'}`}>
                  {isSelected ? <Check size={17} strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={goPrevious}
            disabled={currentIndex === 0}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 py-4 text-lg font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={21} />
            이전 질문
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!answers[currentIndex]}
            className="min-h-14 rounded-xl bg-[#2E7D32] px-8 py-4 text-lg font-bold text-white hover:bg-[#256729] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isLastQuestion ? '결과 보기' : '다음 질문'}
          </button>
        </div>
      </div>
    </div>
  );
}
