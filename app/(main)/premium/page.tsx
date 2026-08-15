'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookmarkCheck,
  BrainCircuit,
  Heart,
  HelpCircle,
  Loader2,
  MessagesSquare,
  ReceiptText,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const premiumBenefits = [
  {
    title: 'AI Match Premium',
    description: '일반 추천보다 더 넓게 최대 20명의 회원을 확인하고, 선호조건 일치율과 추천 이유·공통점·확인할 점을 함께 살펴보세요.',
    status: '이용 가능',
    icon: BrainCircuit,
    href: '/ai-match?expanded=1',
    cta: 'AI Match 이용하기',
  },
  {
    title: '나에게 좋아요를 보낸 회원',
    description: '나에게 실제 좋아요를 보낸 회원을 확인하고, 마음이 있다면 좋아요로 답해 매칭으로 이어가세요.',
    status: '이용 가능',
    icon: Heart,
    href: '/premium/received-likes',
    cta: '받은 좋아요 보기',
  },
  {
    title: '고급 회원 검색',
    description: '기본 검색 조건에 더해 키·학력·음주·취미까지 설정하고 원하는 회원을 더 세밀하게 찾아보세요.',
    status: '이용 가능',
    icon: Users,
    href: '/members?advanced=1',
    cta: '고급 검색 이용하기',
  },
  {
    title: '나를 관심목록에 저장한 회원',
    description: '나를 관심목록에 저장해 둔 회원을 확인해 보세요.',
    status: '이용 가능',
    icon: BookmarkCheck,
    href: '/premium/likes-received?advanced=1',
    cta: '받은 관심 보기',
  },
  {
    title: '추천에서 먼저 발견될 기회',
    description: 'AI Match의 적합도 기준은 그대로 유지하면서, 비슷하게 잘 맞는 후보들 사이에서 내 프로필이 먼저 소개될 수 있습니다.',
    status: '이용 가능',
    icon: Sparkles,
  },
];

const supportItems = [
  {
    label: '자주 묻는 질문',
    description: 'Premium을 포함한 ComMatch의 현재 기능과 이용 방법을 확인할 수 있습니다.',
    status: 'FAQ 보기',
    icon: HelpCircle,
    href: '/faq',
  },
  {
    label: '환불 및 해지 정책',
    description: '결제 방식과 이용권 정책이 확정된 후 환불 및 해지 기준을 안내할 예정입니다.',
    status: '정책 준비 중',
    icon: ReceiptText,
  },
  {
    label: '문의하기',
    description: 'Premium과 서비스 이용에 관한 문의를 접수하고 답변을 확인할 수 있습니다.',
    status: '1:1 문의',
    icon: MessagesSquare,
    href: '/support/inquiries',
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

  useEffect(() => {
    if (isLoading || !isAuthenticated || window.location.hash !== '#premium-benefits') return;

    const animationFrameId = window.requestAnimationFrame(() => {
      document.getElementById('premium-benefits')?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isAuthenticated, isLoading]);

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
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">무료 제공 중</span>
              </div>
              <p className="mt-2 text-lg font-bold text-green-700">더 많이 보고, 더 자세히 살펴보고, 나에게 온 인연을 놓치지 마세요.</p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
            AI Match 확대 추천과 상세 분석, 받은 반응 확인, 고급 검색, 우선 추천 노출을 Premium 혜택으로 이용할 수 있습니다.
          </p>
        </header>

        <section id="premium-benefits" className="scroll-mt-24" aria-labelledby="premium-benefits-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="premium-benefits-heading" className="text-2xl font-bold text-gray-900">Premium 혜택</h2>
            <span className="text-sm font-medium text-gray-500">현재 무료로 이용할 수 있는 Premium 핵심 혜택입니다.</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {premiumBenefits.map((benefit) => {
              const { title, description, status, icon: Icon } = benefit;
              const href = 'href' in benefit && typeof benefit.href === 'string' ? benefit.href : null;
              const cta = 'cta' in benefit && typeof benefit.cta === 'string' ? benefit.cta : null;
              const content = (
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
                      <Icon size={21} />
                    </span>
                    <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">{status}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-gray-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
                  {cta ? (
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold text-green-700">
                      {cta} <ArrowRight size={16} aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
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
                <Ticket className="text-green-600" size={23} /> Premium 무료 제공
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
                현재 Premium의 주요 혜택을 무료로 이용할 수 있습니다. 정식 이용권과 가격은 추후 안내할 예정입니다.
              </p>
              <p className="mt-1 text-sm font-medium text-gray-500">현재 자동 결제는 없습니다.</p>
            </div>
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">무료 제공 중</span>
          </div>
          <div className="mt-6">
            <a
              href="#premium-benefits"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700"
            >
              Premium 혜택 살펴보기 <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section aria-labelledby="upcoming-premium-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="upcoming-premium-heading" className="text-2xl font-bold text-gray-900">도입 예정</h2>
            <span className="text-sm font-medium text-gray-500">앞으로 추가될 Premium 혜택입니다.</span>
          </div>
          <div className="mt-5 max-w-md rounded-[1.75rem] border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500">
                <BadgeCheck size={21} />
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-[#806B26]">도입 예정</span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-gray-900">Premium 전용 배지</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">프로필에 Premium 회원임을 알 수 있는 전용 표시가 제공될 예정입니다.</p>
          </div>
        </section>

        <section aria-labelledby="premium-support-heading">
          <h2 id="premium-support-heading" className="text-2xl font-bold text-gray-900">이용 안내</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {supportItems.map((item) => {
              const { label, description, status, icon: Icon } = item;
              const content = (
                <>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <Icon size={20} />
                </span>
                <span className="mt-4 block font-bold text-gray-700">{label}</span>
                <span className="mt-2 block text-sm leading-6 text-gray-500">{description}</span>
                <span className="mt-2 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">
                  {status}
                </span>
                </>
              );

              return 'href' in item && item.href ? (
                <Link key={label} href={item.href} className="rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition hover:border-green-200 hover:shadow-md">
                  {content}
                </Link>
              ) : (
                <button key={label} type="button" disabled className="cursor-not-allowed rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm">
                  {content}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
