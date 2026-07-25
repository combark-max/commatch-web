'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  Heart,
  HelpCircle,
  Loader2,
  MessageCircle,
  MessagesSquare,
  ReceiptText,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const premiumBenefits = [
  {
    title: '추천 인원 확대',
    description: '기본 추천보다 더 많은 회원을 확인하고 다양한 인연을 탐색할 수 있습니다.',
    status: '테스트 제공 중',
    icon: Users,
    href: '/ai-match?expanded=1',
  },
  {
    title: '고급 맞춤 추천',
    description: '프로필과 이상형 조건을 바탕으로 잘 맞는 점과 확인할 점을 자세히 보여드립니다.',
    status: '테스트 제공 중',
    icon: BrainCircuit,
    href: '/ai-match?analysis=1',
  },
  {
    title: '나에게 관심을 보낸 회원 확인',
    description: '나를 관심회원으로 등록한 회원을 확인하고 서로의 관심을 더 빠르게 연결해 보세요.',
    status: '테스트 제공 중',
    icon: Heart,
    href: '/premium/likes-received?advanced=1',
  },
  {
    title: '고급 회원 검색',
    description: '키, 학력, 종교, 음주 여부와 취미 조건으로 회원을 더 세밀하게 찾아보세요.',
    status: '테스트 제공 중',
    icon: Users,
    href: '/members?advanced=1',
  },
  {
    title: '우선 추천 노출',
    description: '활동 중인 회원의 추천 화면에 내 프로필이 더 자주 소개될 수 있도록 준비하고 있습니다.',
    status: '준비 중',
    icon: Sparkles,
  },
  {
    title: 'Premium 전용 배지',
    description: '프로필에 Premium 회원임을 알 수 있는 전용 표시가 제공될 예정입니다.',
    status: '도입 예정',
    icon: BadgeCheck,
  },
  {
    title: '고급 매칭 관리',
    description: '읽지 않은 메시지와 대화 상태에 따라 매칭 목록을 정리하고 원하는 순서로 확인할 수 있습니다.',
    status: '테스트 제공 중',
    icon: MessageCircle,
    href: '/matches?advanced=1',
  },
];

const supportItems = [
  {
    label: '자주 묻는 질문',
    description: 'Premium 기능과 이용 방법에 대한 자주 묻는 질문을 준비하고 있습니다.',
    status: '준비 중',
    icon: HelpCircle,
  },
  {
    label: '환불 및 해지 정책',
    description: '결제 방식과 이용권 정책이 확정된 후 환불 및 해지 기준을 안내할 예정입니다.',
    status: '정책 준비 중',
    icon: ReceiptText,
  },
  {
    label: '문의하기',
    description: 'Premium 관련 문의 채널을 준비하고 있습니다.',
    status: '준비 중',
    icon: MessagesSquare,
  },
];

export default function PremiumPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuthentication = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          router.replace('/login');
          return;
        }

        if (isMounted) setIsAuthenticated(true);
      } catch (error: unknown) {
        console.error('Premium 화면 인증 확인 실패:', error);
        router.replace('/login');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void checkAuthentication();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">
          {isLoading ? 'Premium 안내를 준비하는 중...' : '로그인 화면으로 이동하는 중...'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
        >
          <ArrowLeft size={19} /> 마이페이지로 돌아가기
        </Link>

        <header className="rounded-[2rem] border border-green-100 bg-white p-8 shadow-sm sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-600">
              <Sparkles size={25} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">Premium</h1>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#806B26]">도입 예정</span>
              </div>
              <p className="mt-2 text-lg font-bold text-green-700">더 좋은 인연을 위한 추가 기능</p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
            기본 매칭과 채팅은 일반 회원도 이용할 수 있습니다. Premium은 더 다양한 추천과 편리한 회원 탐색 기능을 제공하기 위해 준비 중입니다.
          </p>
        </header>

        <section aria-labelledby="premium-benefits-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="premium-benefits-heading" className="text-2xl font-bold text-gray-900">Premium 혜택</h2>
            <span className="text-sm font-medium text-gray-500">모든 항목은 도입 예정 또는 준비 중입니다.</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {premiumBenefits.map((benefit) => {
              const { title, description, status, icon: Icon } = benefit;
              const href = 'href' in benefit && typeof benefit.href === 'string' ? benefit.href : null;
              const content = (
                <>
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <Icon size={21} />
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-[#806B26]">{status}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
                </>
              );

              return href ? (
                <Link
                  key={title}
                  href={href}
                  className="rounded-[1.75rem] border border-gray-100 bg-white p-6 shadow-sm transition hover:border-green-200 hover:shadow-md"
                >
                  {content}
                </Link>
              ) : (
                <article key={title} className="rounded-[1.75rem] border border-gray-100 bg-white p-6 shadow-sm">
                  {content}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9" aria-labelledby="passes-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="passes-heading" className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Ticket className="text-green-600" size={23} /> Premium 이용권
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">이용 기간과 가격은 Premium 기능 및 운영 정책이 확정된 후 안내됩니다.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#806B26]">준비 중</span>
          </div>

          <div className="mt-6 grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-6 sm:grid-cols-2">
            {[
              ['이용요금', '추후 안내'],
              ['이용 기간', '추후 안내'],
              ['결제 방식', '준비 중'],
              ['자동 갱신 여부', '추후 안내'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">{label}</span>
                <span className="text-sm font-bold text-gray-500">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center">
            <button
              type="button"
              disabled
              className="w-full max-w-sm cursor-not-allowed rounded-xl bg-gray-200 px-6 py-3.5 text-sm font-bold text-gray-400"
            >
              Premium 도입 예정
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-green-100 bg-green-50 p-6 sm:p-7" aria-label="현재 이용 가능한 기능 안내">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 shrink-0 text-green-600" size={21} />
            <p className="text-sm font-semibold leading-6 text-green-900">
              Premium 도입 전에도 현재 제공되는 추천, 회원 둘러보기, 관심목록 기능은 계속 이용할 수 있습니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="premium-support-heading">
          <h2 id="premium-support-heading" className="text-2xl font-bold text-gray-900">고객지원</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {supportItems.map(({ label, description, status, icon: Icon }) => (
              <button
                key={label}
                type="button"
                disabled
                className="cursor-not-allowed rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <Icon size={20} />
                </span>
                <span className="mt-4 block font-bold text-gray-700">{label}</span>
                <span className="mt-2 block text-sm leading-6 text-gray-500">{description}</span>
                <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                  {status}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
