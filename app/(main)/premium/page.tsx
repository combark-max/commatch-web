'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  BrainCircuit,
  Clock3,
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
    description: '더 다양한 추천 회원을 확인할 수 있도록 준비하고 있습니다.',
    status: '도입 예정',
    icon: Users,
  },
  {
    title: '더 세분화된 AI 추천 분석',
    description: '현재 제공되는 추천 이유보다 더 자세한 분석 기능을 준비하고 있습니다.',
    status: '도입 예정',
    icon: BrainCircuit,
  },
  {
    title: '좋아요 사용 범위 확대',
    description: '향후 좋아요 기능 도입 시 더 넓은 이용 범위를 제공할 예정입니다.',
    status: '준비 중',
    icon: Heart,
  },
  {
    title: '새로운 기능 우선 제공',
    description: '채팅 등 새로운 기능이 도입될 경우 Premium 회원에게 우선 제공하는 방안을 준비하고 있습니다.',
    status: '도입 예정',
    icon: MessageCircle,
  },
  {
    title: 'Premium 전용 배지',
    description: '향후 회원 등급 기능이 도입되면 닉네임 옆에 전용 배지가 표시될 예정입니다.',
    status: '도입 예정',
    icon: BadgeCheck,
  },
];

const passes = ['월 이용권', '3개월 이용권', '12개월 이용권'];

const supportItems = [
  { label: '자주 묻는 질문', status: '준비 중', icon: HelpCircle },
  { label: '환불 정책', status: '정책 준비 중', icon: ReceiptText },
  { label: '문의하기', status: '준비 중', icon: MessagesSquare },
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
            ComMatch를 더 편리하게 이용할 수 있는 Premium 기능을 준비하고 있습니다.
            현재 제공되는 서비스는 그대로 이용할 수 있으며, 아래 내용은 향후 제공 방향입니다.
          </p>
        </header>

        <section aria-labelledby="premium-benefits-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="premium-benefits-heading" className="text-2xl font-bold text-gray-900">Premium 혜택</h2>
            <span className="text-sm font-medium text-gray-500">모든 항목은 준비 중입니다.</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {premiumBenefits.map(({ title, description, status, icon: Icon }) => (
              <article key={title} className="rounded-[1.75rem] border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <Icon size={21} />
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-[#806B26]">{status}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9" aria-labelledby="passes-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="passes-heading" className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Ticket className="text-green-600" size={23} /> 이용권
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">이용권 기간과 가격 정책을 준비하고 있습니다.</p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#806B26]">도입 예정</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {passes.map((pass) => (
              <div key={pass} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="flex items-center gap-2 text-green-700">
                  <Clock3 size={19} />
                  <h3 className="font-bold text-gray-900">{pass}</h3>
                </div>
                <p className="mt-5 text-sm font-bold text-gray-500">가격 추후 안내</p>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-center">
            <button
              type="button"
              disabled
              className="w-full max-w-sm cursor-not-allowed rounded-xl bg-gray-200 px-6 py-3.5 text-sm font-bold text-gray-400"
            >
              Premium 시작하기
            </button>
            <p className="mt-3 text-sm font-semibold text-gray-500">결제 기능 도입 예정</p>
            <p className="mt-2 text-xs leading-5 text-gray-400">
              이용권 상태 확인 기능은 결제 시스템 도입 후 제공될 예정입니다.
            </p>
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
            {supportItems.map(({ label, status, icon: Icon }) => (
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
