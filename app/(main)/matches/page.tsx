'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarDays,
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import ImageModal from '@/components/common/ImageModal';
import Button from '@/components/ui/Button';

type MatchRpcRow = {
  match_id: string | null;
  match_status: string | null;
  matched_at: string | null;
  ended_at: string | null;
  last_message_at: string | null;
  other_user_id: string | null;
  other_nickname: string | null;
  other_profile_image: string | null;
  other_region: string | null;
  other_job: string | null;
  latest_message_content: string | null;
  latest_message_at: string | null;
  latest_message_sender_id: string | null;
  unread_count: number | string | null;
};

type MatchStatus = 'active' | 'ended' | 'unknown';

type MatchListItem = {
  matchId: string;
  status: MatchStatus;
  matchedAt: string | null;
  otherUserId: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
  region: string | null;
  job: string | null;
  latestMessage: string | null;
  latestMessageAt: string | null;
  unreadCount: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const matchDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

const messageDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const messageTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
});

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeUnreadCount(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : 0;

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeMatchRows(value: unknown): MatchListItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object') return [];

    const row = rawRow as Partial<MatchRpcRow>;
    const matchId = normalizeNullableText(row.match_id);

    if (!matchId || !UUID_PATTERN.test(matchId)) return [];

    const rawStatus = normalizeNullableText(row.match_status);
    const status: MatchStatus = rawStatus === 'active'
      ? 'active'
      : rawStatus === 'ended'
        ? 'ended'
        : 'unknown';
    const storedProfileImage = normalizeNullableText(row.other_profile_image);

    return [{
      matchId,
      status,
      matchedAt: normalizeNullableText(row.matched_at),
      otherUserId: normalizeNullableText(row.other_user_id),
      nickname: normalizeNullableText(row.other_nickname),
      profileImageUrl: resolveProfileImageUrl(storedProfileImage),
      region: normalizeNullableText(row.other_region),
      job: normalizeNullableText(row.other_job),
      latestMessage: normalizeNullableText(row.latest_message_content),
      latestMessageAt: normalizeNullableText(row.latest_message_at)
        ?? normalizeNullableText(row.last_message_at),
      unreadCount: normalizeUnreadCount(row.unread_count),
    }];
  });
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMatchDate(value: string | null): string {
  const date = parseDate(value);
  return date ? matchDateFormatter.format(date) : '날짜 정보 없음';
}

function formatMessageDate(value: string | null): string | null {
  const date = parseDate(value);
  if (!date) return null;

  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();

  return isToday ? messageTimeFormatter.format(date) : messageDateFormatter.format(date);
}

export default function MatchesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<'auth' | 'matches'>('auth');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let loadingPhase: 'auth' | 'matches' = 'auth';

    const loadMatches = async () => {
      setIsLoading(true);
      setLoadingStage('auth');
      setIsAuthenticated(false);
      setAuthError(null);
      setMatchesError(null);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (isMounted) setMatches([]);
          router.replace('/login');
          return;
        }

        if (isMounted) {
          setIsAuthenticated(true);
          setLoadingStage('matches');
        }
        loadingPhase = 'matches';

        const { data, error: matchesQueryError } = await supabase.rpc('get_my_matches');

        if (matchesQueryError) throw matchesQueryError;

        if (isMounted) {
          setMatches(normalizeMatchRows(data));
          setFailedImageIds(new Set());
        }
      } catch (error: unknown) {
        if (loadingPhase === 'auth') {
          console.error('매칭목록 인증 확인 실패:', error);
          if (isMounted) {
            setAuthError('로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
          }
          return;
        }

        console.error('매칭목록 조회 실패:', error);
        if (isMounted) {
          setMatches([]);
          setMatchesError('매칭목록을 불러오지 못했습니다.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadMatches();

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
        <p className="font-medium text-gray-500">
          {loadingStage === 'auth' ? '로그인 정보를 확인하는 중...' : '매칭목록을 불러오는 중...'}
        </p>
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
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">매칭목록</h1>
              <p className="mt-2 text-gray-600">서로 관심을 표현해 매칭된 회원을 확인할 수 있습니다.</p>
            </div>
            {!matchesError ? (
              <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
                매칭 {matches.length}명
              </span>
            ) : null}
          </div>
        </header>

        {matchesError ? (
          <section className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm sm:p-12" aria-live="polite">
            <p className="font-semibold text-red-600">{matchesError}</p>
            <p className="mt-2 text-sm leading-6 text-gray-500">잠시 후 다시 시도해 주세요.</p>
            <Button
              className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              다시 시도
            </Button>
          </section>
        ) : matches.length === 0 ? (
          <section className="rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-800">아직 성립된 매칭이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">서로 관심을 표현하면 매칭이 성립됩니다.</p>
            <Link
              href="/members"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-green-200 transition hover:bg-green-700"
            >
              회원 둘러보기 <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-2" aria-label="매칭 회원 목록">
            {matches.map((match) => {
              const hasImage = Boolean(match.profileImageUrl) && !failedImageIds.has(match.matchId);
              const latestMessageDate = formatMessageDate(match.latestMessageAt);
              const isActive = match.status === 'active';
              const statusLabel = isActive
                ? '매칭 중'
                : match.status === 'ended'
                  ? '종료된 매칭'
                  : '상태 확인 필요';

              return (
                <article
                  key={match.matchId}
                  className={`overflow-hidden rounded-[2rem] border bg-white shadow-sm transition hover:shadow-lg ${
                    isActive ? 'border-gray-100' : 'border-gray-200 bg-gray-50/70'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className={`flex h-52 items-center justify-center overflow-hidden p-4 sm:h-auto sm:w-44 sm:shrink-0 ${
                      isActive ? 'bg-[#f0fdf4]' : 'bg-gray-100'
                    }`}>
                      {hasImage ? (
                        <button
                          type="button"
                          aria-label={`${match.nickname ?? '매칭 상대'}님의 사진 크게 보기`}
                          onClick={() => setSelectedImage({
                            url: match.profileImageUrl ?? '',
                            alt: `${match.nickname ?? '매칭 상대'} 프로필 사진`,
                          })}
                          className="h-full w-full cursor-zoom-in rounded-2xl transition hover:opacity-95 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-green-300"
                        >
                          <Image
                            src={match.profileImageUrl ?? ''}
                            alt={`${match.nickname ?? '매칭 상대'} 프로필 사진`}
                            width={480}
                            height={560}
                            unoptimized
                            onError={() => setFailedImageIds((current) => new Set(current).add(match.matchId))}
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-sm">
                          <UserRound size={48} strokeWidth={1.5} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-xl font-bold text-gray-900">{match.nickname ?? '익명'}</h2>
                          <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                            <MapPin size={15} className="shrink-0 text-gray-400" />
                            <span className="truncate">{match.region ?? '지역 정보 미입력'}</span>
                          </p>
                          <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                            <Briefcase size={15} className="shrink-0 text-gray-400" />
                            <span className="truncate">{match.job ?? '직업 정보 미입력'}</span>
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          isActive ? 'bg-green-50 text-green-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {statusLabel}
                        </span>
                      </div>

                      <p className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
                        <CalendarDays size={15} className="text-gray-400" />
                        매칭일 {formatMatchDate(match.matchedAt)}
                      </p>
                    </div>
                  </div>

                  <div className={`border-t px-6 py-5 ${isActive ? 'border-gray-100' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-xs font-bold text-gray-500">
                          <MessageCircle size={15} /> 최근 메시지
                        </p>
                        <p className={`mt-2 text-sm leading-6 ${match.latestMessage ? 'line-clamp-2 text-gray-700' : 'text-gray-500'}`}>
                          {match.latestMessage ?? '아직 대화를 시작하지 않았습니다.'}
                        </p>
                      </div>
                      {match.unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-green-600 px-3 py-1.5 text-xs font-bold text-white" aria-label={`읽지 않은 메시지 ${match.unreadCount}개`}>
                          새 메시지 {match.unreadCount}
                        </span>
                      ) : null}
                    </div>

                    {latestMessageDate ? (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock3 size={13} /> {latestMessageDate}
                      </p>
                    ) : null}

                    <Link
                      href={`/matches/${match.matchId}/chat`}
                      className={`mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold transition ${
                        isActive
                          ? 'bg-green-600 text-white shadow-md shadow-green-100 hover:bg-green-700'
                          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {isActive ? '대화하기' : '대화 내용 보기'}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {selectedImage ? (
        <ImageModal
          key={selectedImage.url}
          isOpen
          imageUrl={selectedImage.url}
          alt={selectedImage.alt}
          onClose={() => setSelectedImage(null)}
        />
      ) : null}
    </div>
  );
}
