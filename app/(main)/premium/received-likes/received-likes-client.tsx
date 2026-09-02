'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  CalendarDays,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  UserRound,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { createClient } from '@/lib/supabase/client';

type MatchStatus = 'active' | 'ended';
type LikeResult = 'liked' | 'already_liked' | 'matched' | 'already_matched';
type PageState = 'loading' | 'ready' | 'error';

type ReceivedLikeRpcRow = {
  like_id?: unknown;
  sender_user_id?: unknown;
  liked_at?: unknown;
  nickname?: unknown;
  age?: unknown;
  region?: unknown;
  job?: unknown;
  profile_image?: unknown;
  profile_images?: unknown;
  has_liked?: unknown;
  is_mutual_like?: unknown;
  match_id?: unknown;
  match_status?: unknown;
  matched_at?: unknown;
};

type SendLikeWithMatchRow = {
  like_result?: unknown;
  match_id?: unknown;
};

type ReceivedLike = {
  likeId: string;
  senderUserId: string;
  likedAt: string;
  nickname: string;
  age: number | null;
  region: string | null;
  job: string | null;
  profileImageUrl: string | null;
  hasLiked: boolean;
  isMutualLike: boolean;
  matchId: string | null;
  matchStatus: MatchStatus | null;
  matchedAt: string | null;
};

type ToastState = {
  message: string;
  type: 'success' | 'error';
  matchId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const receivedAtFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function normalizeRequiredText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Unexpected ${fieldName}`);
  }
  return value.trim();
}

function normalizeNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Unexpected ${fieldName}`);
  return value.trim() || null;
}

function normalizeNullableAge(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Unexpected age');
  }
  return value;
}

function normalizeUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredText(value, fieldName);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`Unexpected ${fieldName}`);
  return normalized;
}

function normalizeNullableUuid(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return normalizeUuid(value, fieldName);
}

function normalizeTimestamp(value: unknown, fieldName: string): string {
  const normalized = normalizeRequiredText(value, fieldName);
  if (Number.isNaN(new Date(normalized).getTime())) throw new Error(`Unexpected ${fieldName}`);
  return normalized;
}

function normalizeNullableTimestamp(value: unknown, fieldName: string): string | null {
  if (value === null) return null;
  return normalizeTimestamp(value, fieldName);
}

function normalizeProfileImages(value: unknown): string[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('Unexpected profile_images');

  return value.map((image) => {
    if (typeof image !== 'string') throw new Error('Unexpected profile_images');
    return image.trim();
  }).filter(Boolean);
}

function normalizeReceivedLikes(value: unknown): ReceivedLike[] {
  if (!Array.isArray(value)) throw new Error('Unexpected received likes response');

  return value.map((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object') {
      throw new Error('Unexpected received likes row');
    }

    const row = rawRow as ReceivedLikeRpcRow;
    const likeId = normalizeUuid(row.like_id, 'like_id');
    const senderUserId = normalizeUuid(row.sender_user_id, 'sender_user_id');
    const likedAt = normalizeTimestamp(row.liked_at, 'liked_at');
    const nickname = normalizeNullableText(row.nickname, 'nickname') ?? '익명';
    const age = normalizeNullableAge(row.age);
    const region = normalizeNullableText(row.region, 'region');
    const job = normalizeNullableText(row.job, 'job');
    const profileImage = normalizeNullableText(row.profile_image, 'profile_image');
    const profileImages = normalizeProfileImages(row.profile_images);

    if (typeof row.has_liked !== 'boolean' || typeof row.is_mutual_like !== 'boolean') {
      throw new Error('Unexpected received like relationship state');
    }
    if (row.has_liked !== row.is_mutual_like) {
      throw new Error('Inconsistent received like relationship state');
    }

    const matchId = normalizeNullableUuid(row.match_id, 'match_id');
    const rawMatchStatus = normalizeNullableText(row.match_status, 'match_status');
    const matchStatus: MatchStatus | null = rawMatchStatus === 'active' || rawMatchStatus === 'ended'
      ? rawMatchStatus
      : rawMatchStatus === null
        ? null
        : (() => { throw new Error('Unexpected match_status'); })();
    const matchedAt = normalizeNullableTimestamp(row.matched_at, 'matched_at');

    if (
      (matchId === null && (matchStatus !== null || matchedAt !== null))
      || (matchId !== null && (matchStatus === null || matchedAt === null))
      || (matchId !== null && row.is_mutual_like !== true)
    ) {
      throw new Error('Inconsistent received like match state');
    }

    return {
      likeId,
      senderUserId,
      likedAt,
      nickname,
      age,
      region,
      job,
      profileImageUrl: resolveProfileImageUrl(profileImage ?? profileImages[0] ?? null),
      hasLiked: row.has_liked,
      isMutualLike: row.is_mutual_like,
      matchId,
      matchStatus,
      matchedAt,
    };
  });
}

function normalizeLikeResult(value: unknown): { likeResult: LikeResult; matchId: string | null } {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object') {
    throw new Error('Unexpected send-like response');
  }

  const row = value[0] as SendLikeWithMatchRow;
  const likeResult = normalizeRequiredText(row.like_result, 'like_result');
  const matchId = normalizeNullableUuid(row.match_id, 'match_id');

  if (
    likeResult !== 'liked'
    && likeResult !== 'already_liked'
    && likeResult !== 'matched'
    && likeResult !== 'already_matched'
  ) {
    throw new Error('Unexpected send-like result');
  }
  if ((likeResult === 'matched' || likeResult === 'already_matched') && matchId === null) {
    throw new Error('Matched response did not include a match id');
  }
  if ((likeResult === 'liked' || likeResult === 'already_liked') && matchId !== null) {
    throw new Error('Non-match response unexpectedly included a match id');
  }

  return { likeResult, matchId };
}

function getRelationshipStatus(receivedLike: ReceivedLike) {
  if (receivedLike.matchId && receivedLike.matchStatus === 'active') {
    return { label: '매칭됨', className: 'bg-green-100 text-green-700' };
  }
  if (receivedLike.matchId && receivedLike.matchStatus === 'ended') {
    return { label: '종료된 매칭', className: 'bg-gray-100 text-gray-600' };
  }
  if (receivedLike.isMutualLike) {
    return { label: '서로 좋아요 확인 중', className: 'bg-amber-50 text-[#806B26]' };
  }
  return { label: '나에게 좋아요', className: 'bg-rose-50 text-rose-600' };
}

export default function ReceivedLikesClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [receivedLikes, setReceivedLikes] = useState<ReceivedLike[]>([]);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [retryKey, setRetryKey] = useState(0);
  const [sendingLikeId, setSendingLikeId] = useState<string | null>(null);
  const [refreshingLikeId, setRefreshingLikeId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const fetchReceivedLikes = useCallback(async (): Promise<ReceivedLike[] | null> => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace('/login');
      return null;
    }

    const { data, error } = await supabase.rpc('get_received_likes');
    if (error) {
      if (error.code === '42501') {
        router.replace('/premium');
        return null;
      }
      throw error;
    }

    return normalizeReceivedLikes(data);
  }, [router, supabase]);

  useEffect(() => {
    let isMounted = true;

    const loadReceivedLikes = async () => {
      setPageState('loading');

      try {
        const normalized = await fetchReceivedLikes();
        if (isMounted && normalized) {
          setReceivedLikes(normalized);
          setFailedImageIds(new Set());
          setPageState('ready');
        }
      } catch (error: unknown) {
        const supabaseError = error as { code?: string; message?: string };
        console.error('받은 좋아요 목록 조회 실패:', supabaseError.code ?? null, supabaseError.message ?? error);
        if (isMounted) setPageState('error');
      }
    };

    void loadReceivedLikes();

    return () => {
      isMounted = false;
    };
  }, [fetchReceivedLikes, retryKey]);

  const refreshReceivedLikes = async (likeId: string) => {
    if (refreshingLikeId) return;

    setRefreshingLikeId(likeId);
    try {
      const normalized = await fetchReceivedLikes();
      if (normalized) setReceivedLikes(normalized);
    } catch (error: unknown) {
      const supabaseError = error as { code?: string; message?: string };
      console.error('받은 좋아요 상태 갱신 실패:', supabaseError.code ?? null, supabaseError.message ?? error);
      setToast({ message: '최신 매칭 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', type: 'error' });
    } finally {
      setRefreshingLikeId(null);
    }
  };

  const handleSendLike = async (receivedLike: ReceivedLike) => {
    if (sendingLikeId || receivedLike.hasLiked) return;

    setSendingLikeId(receivedLike.likeId);
    try {
      const { data, error } = await supabase.rpc('send_member_like_with_match', {
        target_user_id: receivedLike.senderUserId,
      });
      if (error) throw error;

      const { likeResult, matchId } = normalizeLikeResult(data);
      const isMatchResult = likeResult === 'matched' || likeResult === 'already_matched';

      setReceivedLikes((current) => current.map((item) => (
        item.likeId === receivedLike.likeId
          ? {
              ...item,
              hasLiked: true,
              isMutualLike: true,
              matchId: isMatchResult ? matchId : item.matchId,
              matchStatus: isMatchResult ? 'active' : item.matchStatus,
              matchedAt: isMatchResult ? item.matchedAt ?? new Date().toISOString() : item.matchedAt,
            }
          : item
      )));

      if (likeResult === 'matched') {
        window.dispatchEvent(new Event('commatch:notifications-changed'));
      }

      setToast({
        message: likeResult === 'matched'
          ? '서로 좋아요가 확인되어 매칭되었습니다.'
          : likeResult === 'already_matched'
            ? '이미 매칭된 회원입니다.'
            : likeResult === 'already_liked'
              ? '이미 좋아요를 보낸 회원입니다. 최신 상태를 확인했습니다.'
              : '좋아요를 보냈습니다.',
        type: 'success',
        matchId: isMatchResult ? matchId ?? undefined : undefined,
      });

      try {
        const normalized = await fetchReceivedLikes();
        if (normalized) setReceivedLikes(normalized);
      } catch (refreshError: unknown) {
        const supabaseError = refreshError as { code?: string; message?: string };
        console.error('좋아요 전송 후 받은 좋아요 상태 갱신 실패:', supabaseError.code ?? null, supabaseError.message ?? refreshError);
      }
    } catch (error: unknown) {
      const supabaseError = error as { code?: string; message?: string };
      console.error('받은 좋아요 회원에게 좋아요 전송 실패:', supabaseError.code ?? null, supabaseError.message ?? error);
      setToast({ message: '좋아요를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', type: 'error' });
    } finally {
      setSendingLikeId(null);
    }
  };

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <p className="font-medium text-gray-500">받은 좋아요 목록을 불러오는 중...</p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <Heart className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">받은 좋아요 목록을 불러오지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">잠시 후 다시 시도해 주세요.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-12 flex-1 rounded-2xl px-5 text-sm" onClick={() => setRetryKey((key) => key + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
            </Button>
            <Link
              href="/premium"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              Premium으로 돌아가기
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/premium"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
        >
          <ArrowLeft size={19} /> Premium으로 돌아가기
        </Link>

        <header className="mt-6 rounded-[2rem] border border-rose-100 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">나에게 좋아요를 보낸 회원</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
                나에게 실제 좋아요를 보낸 회원을 확인할 수 있습니다. 마음에 드는 회원에게 좋아요로 답하면 서로 좋아요가 되어 매칭으로 이어집니다.
              </p>
              <p className="mt-2 text-sm font-medium text-gray-500">
                관심목록 저장과 좋아요는 서로 다른 기능입니다.
              </p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600">
              Premium 기능
            </span>
          </div>
        </header>

        <p className="mt-6 text-sm font-bold text-gray-600" aria-live="polite">
          받은 좋아요 {receivedLikes.length}명
        </p>

        {receivedLikes.length === 0 ? (
          <section className="mt-5 rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Heart className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-5 text-xl font-bold text-gray-800">아직 받은 좋아요가 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              회원이 나에게 좋아요를 보내면 이곳에서 확인하고 좋아요로 답할 수 있습니다.
            </p>
          </section>
        ) : (
          <section className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="나에게 좋아요를 보낸 회원 목록">
            {receivedLikes.map((receivedLike) => {
              const age = receivedLike.age;
              const relationship = getRelationshipStatus(receivedLike);
              const hasImage = Boolean(receivedLike.profileImageUrl) && !failedImageIds.has(receivedLike.likeId);
              const isSending = sendingLikeId === receivedLike.likeId;
              const isRefreshing = refreshingLikeId === receivedLike.likeId;
              const chatHref = receivedLike.matchId ? `/matches/${receivedLike.matchId}/chat` : null;

              return (
                <article
                  key={receivedLike.likeId}
                  className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm transition hover:border-rose-100 hover:shadow-lg"
                >
                  <div className="relative flex h-56 items-center justify-center overflow-hidden bg-rose-50/60 p-4">
                    {hasImage ? (
                      <Image
                        src={receivedLike.profileImageUrl ?? ''}
                        alt={`${receivedLike.nickname} 프로필 사진`}
                        width={480}
                        height={560}
                        unoptimized
                        onError={() => setFailedImageIds((current) => new Set(current).add(receivedLike.likeId))}
                        className="h-full w-full rounded-2xl object-contain"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-sm">
                        <UserRound size={48} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-bold text-gray-900">{receivedLike.nickname}</h2>
                        <p className="mt-1 text-sm font-semibold text-green-600">
                          {age !== null ? `만 ${age}세` : '나이 정보 미입력'}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${relationship.className}`}>
                        {relationship.label}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                      <p className="flex items-center gap-2">
                        <MapPin size={15} className="shrink-0 text-gray-400" />
                        <span className="truncate">{receivedLike.region ?? '지역 정보 미입력'}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Briefcase size={15} className="shrink-0 text-gray-400" />
                        <span className="truncate">{receivedLike.job ?? '직업 정보 미입력'}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <CalendarDays size={15} className="shrink-0 text-gray-400" />
                        {receivedAtFormatter.format(new Date(receivedLike.likedAt))} 좋아요
                      </p>
                    </div>

                    <div className="mt-6 grid gap-2">
                      <Link
                        href={`/members/${receivedLike.senderUserId}`}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                      >
                        프로필 보기
                      </Link>

                      {chatHref && receivedLike.matchStatus ? (
                        <Link
                          href={chatHref}
                          className={`inline-flex min-h-11 w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold transition ${
                            receivedLike.matchStatus === 'active'
                              ? 'bg-green-600 text-white shadow-md shadow-green-100 hover:bg-green-700'
                              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          {receivedLike.matchStatus === 'active' ? '채팅하기' : '대화 기록 보기'}
                        </Link>
                      ) : receivedLike.hasLiked ? (
                        <button
                          type="button"
                          onClick={() => void refreshReceivedLikes(receivedLike.likeId)}
                          disabled={isRefreshing}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-[#806B26] transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          {isRefreshing ? '매칭 정보 확인 중...' : '매칭 상태 새로고침'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendLike(receivedLike)}
                          disabled={isSending || sendingLikeId !== null}
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-rose-100 transition hover:bg-rose-600 disabled:cursor-wait disabled:bg-gray-300 disabled:shadow-none"
                        >
                          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          {isSending ? '좋아요 보내는 중...' : '좋아요 보내기'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.matchId ? 8000 : undefined}
          actionLabel={toast.matchId ? '채팅하기' : undefined}
          onAction={toast.matchId ? () => {
            const matchId = toast.matchId;
            setToast(null);
            router.push(`/matches/${matchId}/chat`);
          } : undefined}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
