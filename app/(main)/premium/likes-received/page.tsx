'use client';

import { useEffect, useMemo, useState } from 'react';
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
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import Button from '@/components/ui/Button';

type ReceivedFavoriteRpcRow = {
  favorite_id?: unknown;
  sender_user_id?: unknown;
  created_at?: unknown;
  nickname?: unknown;
  birth_date?: unknown;
  region?: unknown;
  job?: unknown;
  profile_image?: unknown;
  profile_images?: unknown;
  is_mutual?: unknown;
  match_id?: unknown;
  match_status?: unknown;
};

type ReceivedFavorite = {
  favoriteId: string;
  senderUserId: string;
  createdAt: string;
  nickname: string;
  birthDate: string | null;
  region: string | null;
  job: string | null;
  profileImageUrl: string | null;
  isMutual: boolean;
  matchId: string | null;
  matchStatus: string | null;
};

type PageState = 'loading' | 'ready' | 'error';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const receivedAtFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}
function normalizeProfileImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image) => {
    const normalized = normalizeText(image);
    return normalized ? [normalized] : [];
  });
}

function normalizeReceivedFavorites(value: unknown): ReceivedFavorite[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected received favorites response');
  }

  return value.flatMap((rawRow) => {
    if (!rawRow || typeof rawRow !== 'object') return [];

    const row = rawRow as ReceivedFavoriteRpcRow;
    const favoriteId = normalizeText(row.favorite_id);
    const senderUserId = normalizeText(row.sender_user_id);
    const createdAt = normalizeText(row.created_at);
    const createdDate = createdAt ? new Date(createdAt) : null;

    if (
      !favoriteId
      || !UUID_PATTERN.test(favoriteId)
      || !senderUserId
      || !UUID_PATTERN.test(senderUserId)
      || !createdAt
      || !createdDate
      || Number.isNaN(createdDate.getTime())
    ) {
      return [];
    }

    const storedProfileImage = normalizeText(row.profile_image)
      ?? normalizeProfileImages(row.profile_images)[0]
      ?? null;
    const matchId = normalizeText(row.match_id);

    return [{
      favoriteId,
      senderUserId,
      createdAt,
      nickname: normalizeText(row.nickname) ?? '익명',
      birthDate: normalizeText(row.birth_date),
      region: normalizeText(row.region),
      job: normalizeText(row.job),
      profileImageUrl: resolveProfileImageUrl(storedProfileImage),
      isMutual: row.is_mutual === true,
      matchId: matchId && UUID_PATTERN.test(matchId) ? matchId : null,
      matchStatus: normalizeText(row.match_status),
    }];
  });
}

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function getRelationshipStatus(favorite: ReceivedFavorite) {
  if (favorite.matchId && favorite.matchStatus === 'active') {
    return { label: '매칭 중', className: 'bg-green-100 text-green-700' };
  }
  if (favorite.matchId && favorite.matchStatus === 'ended') {
    return { label: '매칭 종료', className: 'bg-gray-100 text-gray-600' };
  }
  if (favorite.isMutual) {
    return { label: '서로 관심', className: 'bg-amber-50 text-[#806B26]' };
  }
  return { label: '나에게 관심', className: 'bg-green-50 text-green-700' };
}

export default function LikesReceivedPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [favorites, setFavorites] = useState<ReceivedFavorite[]>([]);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadReceivedFavorites = async () => {
      setPageState('loading');

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace('/login');
          return;
        }

        const { data, error } = await supabase.rpc('get_received_favorites');
        if (error) {
          console.error('받은 관심 목록 조회 실패:', error.code, error.message);
          if (isMounted) setPageState('error');
          return;
        }

        const normalizedFavorites = normalizeReceivedFavorites(data);
        if (isMounted) {
          setFavorites(normalizedFavorites);
          setFailedImageIds(new Set());
          setPageState('ready');
        }
      } catch {
        console.error('받은 관심 목록 응답을 처리하지 못했습니다.');
        if (isMounted) setPageState('error');
      }
    };

    void loadReceivedFavorites();

    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <p className="font-medium text-gray-500">받은 관심 목록을 불러오는 중...</p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <Heart className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">받은 관심 목록을 불러오지 못했습니다.</h1>
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

        <header className="mt-6 rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">나에게 관심을 보낸 회원</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600 sm:text-base">
                Premium 기능 도입에 앞서 받은 관심 목록을 테스트 형태로 제공하고 있습니다. 현재는 별도의 Premium 등급이나 결제 없이 로그인 회원이 이용할 수 있습니다.
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-[#806B26]">
              Premium 도입 전 테스트 제공
            </span>
          </div>
        </header>

        {favorites.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Heart className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-5 text-xl font-bold text-gray-800">아직 나에게 관심을 보낸 회원이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              프로필을 충실하게 작성하고 회원 활동을 이어가면 새로운 관심을 받을 수 있습니다.
            </p>
          </section>
        ) : (
          <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="나에게 관심을 보낸 회원 목록">
            {favorites.map((favorite) => {
              const age = calculateAge(favorite.birthDate);
              const relationship = getRelationshipStatus(favorite);
              const hasImage = Boolean(favorite.profileImageUrl) && !failedImageIds.has(favorite.favoriteId);

              return (
                <Link
                  key={favorite.favoriteId}
                  href={`/members/${favorite.senderUserId}`}
                  className="group overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm transition hover:border-green-200 hover:shadow-lg"
                >
                  <article>
                    <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[#f0fdf4] p-4">
                      {hasImage ? (
                        <Image
                          src={favorite.profileImageUrl ?? ''}
                          alt={`${favorite.nickname} 프로필 사진`}
                          width={480}
                          height={560}
                          unoptimized
                          onError={() => setFailedImageIds((current) => new Set(current).add(favorite.favoriteId))}
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
                          <h2 className="truncate text-xl font-bold text-gray-900 group-hover:text-green-700">{favorite.nickname}</h2>
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
                          <MapPin size={15} className="text-gray-400" />
                          {favorite.region ?? '지역 정보 미입력'}
                        </p>
                        <p className="flex items-center gap-2">
                          <Briefcase size={15} className="text-gray-400" />
                          {favorite.job ?? '직업 정보 미입력'}
                        </p>
                        <p className="flex items-center gap-2">
                          <CalendarDays size={15} className="text-gray-400" />
                          {receivedAtFormatter.format(new Date(favorite.createdAt))} 관심을 보냄
                        </p>
                      </div>

                      <span className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition group-hover:bg-green-700">
                        프로필 보기
                      </span>
                    </div>
                  </article>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
