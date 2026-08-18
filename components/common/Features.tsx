'use client';

import { useRef, useState } from 'react';
import {
  HeartHandshake,
  LockKeyhole,
  MailCheck,
  MessagesSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

const detailPanelId = 'commatch-feature-detail';

const trustItems = [
  {
    title: '이메일 인증·성인 확인',
    summary: '이메일 인증과 필수 확인 절차를 거쳐 서비스를 시작합니다.',
    detail:
      '가입자는 이메일 인증을 완료하고 필수 약관 동의와 만 19세 이상 여부를 직접 확인합니다. PASS 휴대폰 본인인증은 현재 도입 전입니다.',
    icon: MailCheck,
  },
  {
    title: '프로필·선호조건 맞춤 추천',
    summary: '프로필과 원하는 조건을 바탕으로 잘 맞는 회원을 찾아드립니다.',
    detail:
      '희망 연령·키·지역·직업 등의 조건 일치도를 기준으로 추천 이유를 제공합니다. Premium 확대 추천에서는 더 많은 후보와 상세 일치 정보를 확인할 수 있습니다.',
    icon: Sparkles,
  },
  {
    title: '상호 호감 매칭',
    summary: '서로 좋아요를 보낸 회원끼리 매칭됩니다.',
    detail:
      '관심목록 저장과 좋아요는 서로 다른 기능입니다. 두 회원이 서로 좋아요를 보내면 매칭이 생성되고 대화를 시작할 수 있습니다.',
    icon: HeartHandshake,
  },
  {
    title: '매칭 알림과 실시간 채팅',
    summary: '새로운 매칭을 확인하고 바로 대화를 이어갈 수 있습니다.',
    detail:
      '새 매칭은 서비스 내 알림에서 확인할 수 있으며, 매칭된 회원끼리 실시간 채팅과 메시지 읽음 상태를 이용할 수 있습니다.',
    icon: MessagesSquare,
  },
  {
    title: '개인정보 보호',
    summary: '인증과 접근 권한을 통해 정보 이용 범위를 관리합니다.',
    detail:
      '회원 정보는 서비스 목적에 필요한 범위에서 처리하며, 프로필·매칭·메시지·신고 데이터 접근을 인증 및 권한 정책으로 제한합니다.',
    icon: LockKeyhole,
  },
  {
    title: '신고와 운영자 조치',
    summary: '문제가 생기면 신고하고 처리 상태를 확인할 수 있습니다.',
    detail:
      '프로필이나 메시지를 신고할 수 있으며, 운영자는 신고를 확인해 처리 상태를 관리하고 필요한 경우 회원 이용 제한이나 프로필 노출 숨김 등의 조치를 할 수 있습니다.',
    icon: ShieldAlert,
  },
];

const Features = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const selectedItem = trustItems[selectedIndex];
  const SelectedIcon = selectedItem.icon;

  const handleSelect = (index: number) => {
    setSelectedIndex(index);

    window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      detailPanelRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <section aria-label="ComMatch 신뢰 서비스" className="border-y border-gray-100 bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trustItems.map(({ title, summary, icon: Icon }, index) => {
            const isSelected = selectedIndex === index;
            const cardId = `commatch-feature-${index}`;

            return (
              <button
                key={title}
                id={cardId}
                type="button"
                aria-expanded={isSelected}
                aria-controls={detailPanelId}
                onClick={() => handleSelect(index)}
                className={`flex h-full min-h-52 flex-col items-start rounded-2xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2E7D32] focus-visible:ring-offset-2 ${
                  isSelected
                    ? 'border-[#2E7D32] bg-[#F4F8F4] shadow-sm'
                    : 'border-gray-200 bg-white hover:border-[#8BB78D] hover:bg-[#FAFCFA]'
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                    isSelected
                      ? 'border-[#2E7D32] bg-white text-[#2E7D32]'
                      : 'border-transparent bg-[#F4F8F4] text-[#2E7D32]'
                  }`}
                >
                  <Icon aria-hidden="true" size={27} strokeWidth={1.8} />
                </span>
                <span className="mt-4 text-base font-bold leading-6 text-gray-900 sm:text-lg">{title}</span>
                <span className="mt-2 flex-1 text-sm leading-6 text-gray-600">{summary}</span>
                <span
                  className={`mt-4 text-sm font-bold ${isSelected ? 'text-[#2E7D32]' : 'text-gray-500'}`}
                  aria-hidden="true"
                >
                  {isSelected ? '선택됨' : '자세히 보기'}
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={detailPanelRef}
          id={detailPanelId}
          role="region"
          aria-labelledby={`commatch-feature-${selectedIndex}`}
          className="mt-6 flex scroll-mt-24 items-start gap-4 rounded-2xl border border-[#CFE1D0] bg-[#F4F8F4] p-5 sm:p-6"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#2E7D32] shadow-sm">
            <SelectedIcon aria-hidden="true" size={25} strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">{selectedItem.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-700 sm:text-base sm:leading-7">{selectedItem.detail}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
