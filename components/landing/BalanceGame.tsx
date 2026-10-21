'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';

const BALANCE_CHOICE_IMAGES = [
  { src: '/images/landing/balance-conversation.webp', alt: '카페에서 대화를 나누는 커플' },
  { src: '/images/landing/balance-stability.webp', alt: '차분한 공간에서 이야기를 나누는 커플' },
] as const;

const BALANCE_GAME_QUESTIONS = [
  {
    question: '결혼 상대를 선택한다면?',
    choices: [
      { label: '소박하지만 나와 대화가 잘 통하는 사람', feedback: '이번 선택에서는 대화가 잘 통하는 관계에 조금 더 마음이 가셨네요.' },
      { label: '경제적으로 안정적이지만 표현이 서툰 사람', feedback: '이번 선택에서는 안정적인 생활 기반에 조금 더 마음이 가셨네요.' },
    ],
  },
  {
    question: '연인이 속상해할 때 나는?',
    choices: [
      { label: '먼저 다가가 대화한다', feedback: '이번에는 감정을 함께 풀어가는 대화를 선택하셨네요.' },
      { label: '혼자 정리할 시간을 준다', feedback: '이번에는 서로의 정리할 시간을 존중하는 방식을 선택하셨네요.' },
    ],
  },
  {
    question: '결혼생활에서 더 끌리는 모습은?',
    choices: [
      { label: '취미와 여가를 함께 즐기는 부부', feedback: '이번에는 함께하는 활동과 시간을 선택하셨네요.' },
      { label: '각자의 시간을 존중하는 부부', feedback: '이번에는 독립적인 시간과 자율성을 선택하셨네요.' },
    ],
  },
] as const;

type ChoiceIndex = 0 | 1;

export default function BalanceGame() {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selections, setSelections] = useState<readonly (ChoiceIndex | null)[]>(() => BALANCE_GAME_QUESTIONS.map(() => null));
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusQuestionRef = useRef(false);

  const currentQuestion = BALANCE_GAME_QUESTIONS[currentQuestionIndex];
  const selectedChoiceIndex = selections[currentQuestionIndex];
  const selectedChoice = selectedChoiceIndex === null ? null : currentQuestion.choices[selectedChoiceIndex];
  const isLastQuestion = currentQuestionIndex === BALANCE_GAME_QUESTIONS.length - 1;

  useEffect(() => {
    if (!shouldFocusQuestionRef.current) return;
    shouldFocusQuestionRef.current = false;
    questionHeadingRef.current?.focus();
  }, [currentQuestionIndex]);

  const selectChoice = (choiceIndex: ChoiceIndex) => {
    setSelections((current) => current.map((selection, index) => (
      index === currentQuestionIndex ? choiceIndex : selection
    )));
  };

  const moveNext = () => {
    if (selectedChoiceIndex === null) return;
    shouldFocusQuestionRef.current = true;

    if (isLastQuestion) {
      setSelections(BALANCE_GAME_QUESTIONS.map(() => null));
      setCurrentQuestionIndex(0);
      return;
    }

    setCurrentQuestionIndex((current) => current + 1);
  };

  return (
    <section className="bg-[#FCEDEA] py-8 sm:py-10" aria-labelledby="balance-game-heading">
      <div className="mx-auto grid max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-[0.34fr_1fr] lg:items-center lg:gap-6 lg:px-8">
        <div className="lg:pr-3">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#E05D61]">Balance Game</p>
          <h2 id="balance-game-heading" className="mt-3 text-3xl font-black leading-tight tracking-[-0.03em] text-[#175B35] sm:text-4xl">결혼 상대를 선택한다면?</h2>
          <p className="mt-4 font-bold text-[#495E50] sm:text-lg">당신의 선택은 어떤가요?</p>
          <p className="mt-1.5 text-sm leading-6 text-[#65756B] sm:text-base">가볍게 선택해 보세요.</p>
          <p className="mt-3 inline-flex rounded-full bg-white/75 px-3.5 py-2 text-sm font-black text-[#C64F55]">회원가입 없이 참여할 수 있습니다.</p>
        </div>

        <div className="rounded-[1.5rem] bg-[#FFFDF8] p-4 text-[#175B35] shadow-xl shadow-[#C64F55]/10 sm:p-5">
          <div className="flex items-center justify-between gap-4 text-sm font-black text-[#C64F55]">
            <span>연애·결혼 밸런스 게임</span>
            <span aria-label={`전체 3문항 중 ${currentQuestionIndex + 1}번째`}>{currentQuestionIndex + 1} / 3</span>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_0.38fr]">
            <div role="group" aria-labelledby="balance-question">
              <h3 id="balance-question" ref={questionHeadingRef} tabIndex={-1} className="text-2xl font-black leading-8 text-[#175B35] outline-none sm:text-[1.7rem] sm:leading-9">
                {currentQuestion.question}
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {currentQuestion.choices.map((choice, index) => {
                  const choiceIndex = index as ChoiceIndex;
                  const isSelected = selectedChoiceIndex === choiceIndex;
                  const image = BALANCE_CHOICE_IMAGES[choiceIndex];
                  return (
                    <button
                      key={choice.label}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectChoice(choiceIndex)}
                      className={`group min-h-12 overflow-hidden rounded-2xl border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E77678]/25 ${
                        isSelected
                          ? 'border-[#E77678] bg-[#E77678] text-white'
                          : 'border-[#E7DAD5] bg-white text-[#175B35] hover:border-[#E77678] hover:bg-[#FFF8F6]'
                      }`}
                    >
                      <span className="relative block aspect-[3/2] overflow-hidden bg-[#F0F6ED] md:aspect-[16/9] lg:aspect-[2/1]">
                        <Image
                          src={image.src}
                          alt={image.alt}
                          fill
                          sizes="(min-width: 1024px) 22vw, (min-width: 768px) 42vw, 100vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      </span>
                      <span className="flex min-h-20 items-start justify-between gap-3 px-4 py-3">
                        <span className="block">
                          <span className={`block text-xs font-black tracking-[0.16em] ${isSelected ? 'text-white/80' : 'text-[#E05D61]'}`}>
                            {choiceIndex === 0 ? 'A' : 'B'}
                          </span>
                          <span className="mt-1.5 block text-sm font-black leading-6 sm:text-base">{choice.label}</span>
                        </span>
                        {isSelected ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-white">
                            <Check aria-hidden="true" size={17} strokeWidth={3} /> 선택됨
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div aria-label="선택 안내 및 다음 단계" className="flex flex-col border-t border-[#175B35]/12 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="min-h-20 flex-1 rounded-2xl bg-[#F0F6ED] p-4">
                {selectedChoice ? (
                  <div role="status" aria-live="polite">
                    <p className="font-bold leading-6 text-[#175B35]">{selectedChoice.feedback}</p>
                    <p className="mt-2 text-xs leading-5 text-[#65756B] sm:text-sm">한 번의 선택으로 관계 성향 전체를 판단할 수는 없습니다.</p>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#65756B]">두 선택지 중 지금 더 마음이 가는 쪽을 선택해 주세요.</p>
                )}
              </div>

              <button
                type="button"
                disabled={selectedChoiceIndex === null}
                onClick={moveNext}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#175B35] px-5 py-3 font-black text-white transition-colors hover:bg-[#104628] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#175B35]/20 disabled:cursor-not-allowed disabled:bg-[#175B35]/20 disabled:text-[#175B35]/40"
              >
                {isLastQuestion ? (
                  <><RotateCcw aria-hidden="true" size={18} /> 처음부터 다시 하기</>
                ) : (
                  <>다음 질문 <ArrowRight aria-hidden="true" size={18} /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
