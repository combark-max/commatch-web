'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Heart,
  Loader2,
  MessageCircle,
  Sparkles,
  User,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';

const upcomingFeatures = [
  { title: '새로운 매칭 확인', status: '도입 예정', icon: Heart },
  { title: '상세 프로필', status: '도입 예정', icon: User },
  { title: '채팅 시작', status: '준비 중', icon: MessageCircle },
  { title: '매칭 상태 확인', status: '도입 예정', icon: CircleCheck },
];

export default function MatchesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const checkAuthentication = async () => {
      setIsLoading(true);
      setAuthError(null);

      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error || !user) {
          if (isMounted) setIsAuthenticated(false);
          router.replace('/login');
          return;
        }

        if (isMounted) setIsAuthenticated(true);
      } catch (error: unknown) {
        console.error('매칭 화면 인증 확인 실패:', error);
        if (isMounted) {
          setIsAuthenticated(false);
          setAuthError('로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void checkAuthentication();

    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">로그인 정보를 확인하는 중...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <p className="font-semibold leading-6 text-red-600">{authError}</p>
          <Button
            className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold"
            onClick={() => setRetryKey((key) => key + 1)}
          >
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">로그인 화면으로 이동하는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
          >
            <ArrowLeft size={19} /> 뒤로가기
          </button>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">매칭</h1>
              <p className="mt-2 text-gray-600">새로운 인연을 확인하고 대화를 시작할 수 있도록 준비하고 있습니다.</p>
            </div>
            <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
              매칭 준비 중
            </span>
          </div>
        </header>

        <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
          <div className="px-6 py-10 text-center sm:px-10 sm:py-14">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-[#16a34a]">
              <Sparkles size={30} />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-gray-900">매칭 기능을 준비하고 있습니다.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">
              서로 좋아요를 보낸 회원을 확인하고 대화를 시작할 수 있는 기능이 도입될 예정입니다.
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              좋아요와 채팅 기능이 준비되면 이 화면에서 새로운 인연을 확인할 수 있습니다.
            </p>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-6 py-8 sm:px-10">
            <h3 className="text-sm font-bold text-gray-900">향후 제공 기능</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {upcomingFeatures.map(({ title, status, icon: Icon }) => (
                <div
                  key={title}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4"
                >
                  <span className="flex items-center gap-3 text-sm font-semibold text-gray-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-600">
                      <Icon size={18} />
                    </span>
                    {title}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-[#806B26]">
                    {status}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <Button
                className="min-h-12 rounded-2xl px-6 py-3 text-sm font-bold"
                onClick={() => router.push('/ai-match')}
              >
                오늘의 추천 보기 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
