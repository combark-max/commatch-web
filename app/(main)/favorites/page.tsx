'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, CalendarDays, Loader2, MapPin, Search, Sparkles, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

type FavoriteMember = {
  id: string;
  favoritedAt: string | null;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  religion: string | null;
  hobby: string | null;
  introduction: string | null;
  profile_image: string | null;
  isMutual: boolean | null;
  matchId: string | null;
  matchStatus: MatchStatus | null;
  matchedAt: string | null;
};

type FavoriteProfile = Omit<FavoriteMember, 'favoritedAt' | 'isMutual' | 'matchId' | 'matchStatus' | 'matchedAt'>;
type FavoriteSort = 'default' | 'recent' | 'oldest' | 'younger' | 'older' | 'nickname' | 'mutual-first' | 'matched-first';
type RelationshipFilter = 'all' | 'mutual' | 'matched' | 'not-mutual';
type MatchStatus = 'active' | 'ended';

type ReceivedFavoriteRpcRow = {
  sender_user_id?: unknown;
};

type MatchRpcRow = {
  match_id?: unknown;
  match_status?: unknown;
  matched_at?: unknown;
  other_user_id?: unknown;
};

type FavoriteMatch = {
  matchId: string;
  matchStatus: MatchStatus;
  matchedAt: string | null;
};

const favoriteDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeDateText(value: unknown): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) return null;
  return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
}

function calculateAge(birthDate: string | null | undefined): number | null {
  const normalized = normalizeNullableText(birthDate);
  if (!normalized) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(0);
  birth.setHours(0, 0, 0, 0);
  birth.setFullYear(year, month - 1, day);

  if (
    birth.getFullYear() !== year
    || birth.getMonth() !== month - 1
    || birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (birth.getTime() > today.getTime()) return null;

  let age = today.getFullYear() - year;
  const monthDifference = today.getMonth() - (month - 1);

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < day)) {
    age -= 1;
  }

  return Number.isInteger(age) && age >= 0 ? age : null;
}

export default function FavoritesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [favorites, setFavorites] = useState<FavoriteMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [likeNoticeMemberId, setLikeNoticeMemberId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [isMutualInfoAvailable, setIsMutualInfoAvailable] = useState(false);
  const [isMatchInfoAvailable, setIsMatchInfoAvailable] = useState(false);
  const [nicknameSearch, setNicknameSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedJob, setSelectedJob] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all');
  const [favoriteSort, setFavoriteSort] = useState<FavoriteSort>('recent');

  useEffect(() => {
    let isMounted = true;

    const fetchFavorites = async () => {
      const advancedMode = new URLSearchParams(window.location.search).get('advanced') === '1';

      setIsLoading(true);
      setError(null);
      setIsAdvancedMode(advancedMode);
      setIsMutualInfoAvailable(false);
      setIsMatchInfoAvailable(false);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (isMounted) setFavorites([]);
          router.replace('/login');
          return;
        }

        let receivedFavoriteIds: Set<string> | null = null;
        let matchesByMemberId: Map<string, FavoriteMatch> | null = null;

        if (advancedMode) {
          const [receivedFavoritesOutcome, matchesOutcome] = await Promise.allSettled([
            supabase.rpc('get_received_favorites'),
            supabase.rpc('get_my_matches'),
          ]);

          if (receivedFavoritesOutcome.status === 'rejected') {
            console.error('상호 관심 정보 조회 중 예기치 않은 오류가 발생했습니다.');
          } else if (receivedFavoritesOutcome.value.error) {
            const receivedFavoritesResult = receivedFavoritesOutcome.value;
            if (receivedFavoritesResult.error.code !== '42501') {
              console.error('상호 관심 정보 조회 실패:', receivedFavoritesResult.error.code, receivedFavoritesResult.error.message);
            }
          } else if (!Array.isArray(receivedFavoritesOutcome.value.data)) {
            console.error('상호 관심 정보 응답 형식이 올바르지 않습니다.');
          } else {
            receivedFavoriteIds = new Set(
              (receivedFavoritesOutcome.value.data as ReceivedFavoriteRpcRow[]).flatMap((row) => {
                if (!row || typeof row !== 'object') return [];
                const senderUserId = normalizeNullableText(row.sender_user_id);
                return senderUserId ? [senderUserId] : [];
              }),
            );
          }

          if (matchesOutcome.status === 'rejected') {
            console.error('관심회원 매칭 정보 조회 중 예기치 않은 오류가 발생했습니다.');
          } else if (matchesOutcome.value.error) {
            const matchesResult = matchesOutcome.value;
            console.error('관심회원 매칭 정보 조회 실패:', matchesResult.error.code, matchesResult.error.message);
          } else if (!Array.isArray(matchesOutcome.value.data)) {
            console.error('관심회원 매칭 정보 응답 형식이 올바르지 않습니다.');
          } else {
            matchesByMemberId = new Map(
              (matchesOutcome.value.data as MatchRpcRow[]).flatMap((row) => {
                if (!row || typeof row !== 'object') return [];
                const otherUserId = normalizeNullableText(row.other_user_id);
                const matchId = normalizeNullableText(row.match_id);
                const normalizedStatus = normalizeNullableText(row.match_status);
                const matchStatus: MatchStatus | null = normalizedStatus === 'active' || normalizedStatus === 'ended'
                  ? normalizedStatus
                  : null;

                if (!otherUserId || !matchId || !matchStatus) return [];

                return [[otherUserId, {
                  matchId,
                  matchStatus,
                  matchedAt: normalizeDateText(row.matched_at),
                }] as const];
              }),
            );
          }
        }

        const { data: favoriteRows, error: favoriteError } = await supabase
          .from('favorites')
          .select('favorite_user_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (favoriteError) throw favoriteError;

        const normalizedFavoriteRows = (favoriteRows ?? []).flatMap((row) => {
          const favoriteUserId = normalizeNullableText(row.favorite_user_id);
          if (!favoriteUserId) return [];

          return [{
            favoriteUserId,
            favoritedAt: normalizeDateText(row.created_at),
          }];
        });
        const favoriteIds = normalizedFavoriteRows.map((row) => row.favoriteUserId);

        if (favoriteIds.length === 0) {
          if (isMounted) {
            setFavorites([]);
            setIsMutualInfoAvailable(receivedFavoriteIds !== null);
            setIsMatchInfoAvailable(matchesByMemberId !== null);
          }
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, gender, birth_date, height, region, job, education, religion, hobby, introduction, profile_image')
          .in('id', favoriteIds);

        if (profilesError) throw profilesError;

        const profilesById = new Map(
          ((profiles as FavoriteProfile[]) ?? []).map((profile) => [profile.id, {
            ...profile,
            profile_image: resolveProfileImageUrl(profile.profile_image),
          }]),
        );

        if (isMounted) {
          setFavorites(normalizedFavoriteRows.flatMap(({ favoriteUserId, favoritedAt }) => {
            const profile = profilesById.get(favoriteUserId);
            if (!profile) return [];

            const match = matchesByMemberId?.get(favoriteUserId) ?? null;
            return [{
              ...profile,
              favoritedAt,
              isMutual: receivedFavoriteIds ? receivedFavoriteIds.has(favoriteUserId) : null,
              matchId: match?.matchId ?? null,
              matchStatus: match?.matchStatus ?? null,
              matchedAt: match?.matchedAt ?? null,
            }];
          }));
          setIsMutualInfoAvailable(receivedFavoriteIds !== null);
          setIsMatchInfoAvailable(matchesByMemberId !== null);
        }
      } catch (err: unknown) {
        const supabaseError = err as { code?: string; message?: string; details?: string; hint?: string };
        console.error('관심회원 조회 실패:', {
          code: supabaseError.code ?? null,
          message: supabaseError.message ?? null,
          details: supabaseError.details ?? null,
          hint: supabaseError.hint ?? null,
        });
        if (isMounted) {
          setError('관심목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchFavorites();

    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  const regionOptions = useMemo(() => Array.from(new Set(
    favorites.flatMap((member) => {
      const region = normalizeNullableText(member.region);
      return region ? [region] : [];
    }),
  )).sort((left, right) => left.localeCompare(right, 'ko-KR')), [favorites]);

  const jobOptions = useMemo(() => Array.from(new Set(
    favorites.flatMap((member) => {
      const job = normalizeNullableText(member.job);
      return job ? [job] : [];
    }),
  )).sort((left, right) => left.localeCompare(right, 'ko-KR')), [favorites]);

  const ageFilterError = useMemo(() => {
    const normalizedMin = ageMin.trim();
    const normalizedMax = ageMax.trim();
    const parsedMin = normalizedMin === '' ? null : Number(normalizedMin);
    const parsedMax = normalizedMax === '' ? null : Number(normalizedMax);

    if (
      (parsedMin !== null && (!Number.isInteger(parsedMin) || parsedMin < 0))
      || (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 0))
    ) {
      return '나이 범위를 올바르게 입력해 주세요.';
    }

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      return '최소 나이는 최대 나이보다 클 수 없습니다.';
    }

    return null;
  }, [ageMax, ageMin]);

  const visibleFavorites = useMemo(() => {
    if (!isAdvancedMode) return favorites;
    if (ageFilterError !== null) return favorites;

    const normalizedNicknameSearch = nicknameSearch.trim().toLocaleLowerCase('ko-KR');
    const parsedMin = ageMin.trim() === '' ? null : Number(ageMin);
    const parsedMax = ageMax.trim() === '' ? null : Number(ageMax);
    const hasAgeCondition = parsedMin !== null || parsedMax !== null;
    const filteredFavorites = favorites
      .map((member, originalIndex) => ({ member, originalIndex }))
      .filter(({ member }) => {
        const nickname = normalizeNullableText(member.nickname)?.toLocaleLowerCase('ko-KR') ?? '';
        const region = normalizeNullableText(member.region);
        const job = normalizeNullableText(member.job);

        if (normalizedNicknameSearch && !nickname.includes(normalizedNicknameSearch)) return false;
        if (selectedRegion && region !== selectedRegion) return false;
        if (selectedJob && job !== selectedJob) return false;

        if (hasAgeCondition) {
          const age = calculateAge(member.birth_date);
          if (age === null) return false;
          if (parsedMin !== null && age < parsedMin) return false;
          if (parsedMax !== null && age > parsedMax) return false;
        }

        if (relationshipFilter === 'mutual' && member.isMutual !== true) return false;
        if (
          relationshipFilter === 'matched'
          && !(member.matchId && (member.matchStatus === 'active' || member.matchStatus === 'ended'))
        ) return false;
        if (relationshipFilter === 'not-mutual' && member.isMutual !== false) return false;

        return true;
      });

    if (favoriteSort === 'default') {
      return filteredFavorites.map(({ member }) => member);
    }

    const sortedFavorites = [...filteredFavorites].sort((leftItem, rightItem) => {
      const preserveOriginalOrder = () => leftItem.originalIndex - rightItem.originalIndex;

      if (favoriteSort === 'recent' || favoriteSort === 'oldest') {
        const leftTimestamp = leftItem.member.favoritedAt
          ? new Date(leftItem.member.favoritedAt).getTime()
          : null;
        const rightTimestamp = rightItem.member.favoritedAt
          ? new Date(rightItem.member.favoritedAt).getTime()
          : null;

        if (leftTimestamp === null && rightTimestamp === null) return preserveOriginalOrder();
        if (leftTimestamp === null) return 1;
        if (rightTimestamp === null) return -1;

        const timestampDifference = favoriteSort === 'oldest'
          ? leftTimestamp - rightTimestamp
          : rightTimestamp - leftTimestamp;

        return timestampDifference || preserveOriginalOrder();
      }

      if (favoriteSort === 'nickname') {
        const leftNickname = normalizeNullableText(leftItem.member.nickname);
        const rightNickname = normalizeNullableText(rightItem.member.nickname);

        if (leftNickname === null && rightNickname === null) return preserveOriginalOrder();
        if (leftNickname === null) return 1;
        if (rightNickname === null) return -1;

        return leftNickname.localeCompare(rightNickname, 'ko-KR') || preserveOriginalOrder();
      }

      const compareRecentFavorite = () => {
        const leftTimestamp = leftItem.member.favoritedAt
          ? new Date(leftItem.member.favoritedAt).getTime()
          : null;
        const rightTimestamp = rightItem.member.favoritedAt
          ? new Date(rightItem.member.favoritedAt).getTime()
          : null;

        if (leftTimestamp === null && rightTimestamp === null) return preserveOriginalOrder();
        if (leftTimestamp === null) return 1;
        if (rightTimestamp === null) return -1;
        return rightTimestamp - leftTimestamp || preserveOriginalOrder();
      };

      if (favoriteSort === 'mutual-first') {
        const mutualDifference = Number(rightItem.member.isMutual === true) - Number(leftItem.member.isMutual === true);
        return mutualDifference || compareRecentFavorite();
      }

      if (favoriteSort === 'matched-first') {
        const getMatchRank = (member: FavoriteMember) => member.matchStatus === 'active'
          ? 2
          : member.matchStatus === 'ended'
            ? 1
            : 0;
        const matchDifference = getMatchRank(rightItem.member) - getMatchRank(leftItem.member);
        return matchDifference || compareRecentFavorite();
      }

      const leftAge = calculateAge(leftItem.member.birth_date);
      const rightAge = calculateAge(rightItem.member.birth_date);

      if (leftAge === null && rightAge === null) return preserveOriginalOrder();
      if (leftAge === null) return 1;
      if (rightAge === null) return -1;

      const ageDifference = favoriteSort === 'older'
        ? rightAge - leftAge
        : leftAge - rightAge;

      return ageDifference || preserveOriginalOrder();
    });

    return sortedFavorites.map(({ member }) => member);
  }, [ageFilterError, ageMax, ageMin, favoriteSort, favorites, isAdvancedMode, nicknameSearch, relationshipFilter, selectedJob, selectedRegion]);

  const advancedCounts = useMemo(() => ({
    total: favorites.length,
    mutual: isMutualInfoAvailable ? favorites.filter((member) => member.isMutual === true).length : null,
    matched: isMatchInfoAvailable
      ? favorites.filter((member) => member.matchId && (member.matchStatus === 'active' || member.matchStatus === 'ended')).length
      : null,
    notMutual: isMutualInfoAvailable ? favorites.filter((member) => member.isMutual === false).length : null,
  }), [favorites, isMatchInfoAvailable, isMutualInfoAvailable]);

  const advancedInfoNotice = useMemo(() => {
    if (!isAdvancedMode || (isMutualInfoAvailable && isMatchInfoAvailable)) return null;
    if (!isMutualInfoAvailable && !isMatchInfoAvailable) return '상호 관심과 매칭 정보를 불러오지 못했습니다. 기존 관심목록 기능은 계속 이용할 수 있습니다.';
    if (!isMutualInfoAvailable) return '상호 관심 정보를 불러오지 못해 관련 요약, 필터와 정렬을 사용할 수 없습니다.';
    return '매칭 정보를 불러오지 못해 관련 요약, 필터와 정렬을 사용할 수 없습니다.';
  }, [isAdvancedMode, isMatchInfoAvailable, isMutualInfoAvailable]);

  const resetAdvancedFilters = () => {
    setNicknameSearch('');
    setSelectedRegion('');
    setSelectedJob('');
    setAgeMin('');
    setAgeMax('');
    setRelationshipFilter('all');
    setFavoriteSort('recent');
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/dashboard');
  };

  const handleDeleteFavorite = async (favoriteUserId: string) => {
    if (isDeletingId) return;
    if (!window.confirm('관심목록에서 삭제하시겠습니까?')) return;

    const removedIndex = favorites.findIndex((member) => member.id === favoriteUserId);
    const removedMember = favorites[removedIndex];
    setIsDeletingId(favoriteUserId);
    setLikeNoticeMemberId((current) => current === favoriteUserId ? null : current);
    setFavorites((current) => current.filter((member) => member.id !== favoriteUserId));

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (removedMember) {
          setFavorites((current) => {
            const next = [...current];
            next.splice(removedIndex, 0, removedMember);
            return next;
          });
        }
        router.replace('/login');
        return;
      }

      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('favorite_user_id', favoriteUserId);

      if (error) throw error;

      setToast({ message: '관심회원에서 해제했습니다.', type: 'success' });
    } catch (err: unknown) {
      if (removedMember) {
        setFavorites((current) => {
          const next = [...current];
          next.splice(removedIndex, 0, removedMember);
          return next;
        });
      }
      const supabaseError = err as { code?: string; message?: string; details?: string; hint?: string };
      console.error('관심회원 삭제 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setToast({ message: '관심회원 해제에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
        <p className="font-medium text-gray-500">관심목록을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
          >
            <ArrowLeft size={19} /> 뒤로가기
          </button>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">관심목록</h1>
              <p className="mt-2 text-gray-600">관심 등록한 회원의 프로필을 다시 확인해 보세요.</p>
            </div>
            <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-700">
              관심 {favorites.length}명
            </span>
          </div>
        </div>

        {isAdvancedMode ? (
          <>
            <section className="mb-5 rounded-[2rem] border border-green-100 bg-green-50 p-6 sm:p-7">
              <p className="text-sm font-bold text-green-800">Premium 도입 전 테스트 제공 기능입니다.</p>
              <p className="mt-2 text-sm leading-6 text-green-900">
                관심회원 목록을 지역, 직업, 나이와 등록 순서에 따라 정리할 수 있습니다.
              </p>
            </section>

            <section className="mb-5" aria-label="관심회원 상태 요약">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: '전체', value: advancedCounts.total },
                  { label: '상호 관심', value: advancedCounts.mutual },
                  { label: '매칭', value: advancedCounts.matched },
                  { label: '상대 관심 없음', value: advancedCounts.notMutual },
                ].map(({ label, value }) => (
                  <article key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-500">{label}</p>
                    <p className="mt-2 text-2xl font-black text-gray-900">
                      {value === null ? '확인 불가' : `${value}명`}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                상호 관심과 매칭은 서로 독립적으로 집계되어 같은 회원이 두 항목에 모두 포함될 수 있습니다.
              </p>
              {advancedInfoNotice ? (
                <p role="status" className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-[#806B26]">
                  {advancedInfoNotice}
                </p>
              ) : null}
            </section>

            <section className="mb-6 rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm sm:p-7" aria-label="관심목록 고급 관리">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="min-w-0 text-sm font-bold text-gray-700">
                  닉네임 검색
                  <input
                    type="search"
                    value={nicknameSearch}
                    onChange={(event) => setNicknameSearch(event.target.value)}
                    placeholder="닉네임을 입력하세요"
                    className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  />
                </label>

                <label className="min-w-0 text-sm font-bold text-gray-700">
                  지역
                  <select
                    value={selectedRegion}
                    onChange={(event) => setSelectedRegion(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  >
                    <option value="">전체 지역</option>
                    {regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                  </select>
                </label>

                <label className="min-w-0 text-sm font-bold text-gray-700">
                  직업
                  <select
                    value={selectedJob}
                    onChange={(event) => setSelectedJob(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  >
                    <option value="">전체 직업</option>
                    {jobOptions.map((job) => <option key={job} value={job}>{job}</option>)}
                  </select>
                </label>

                <fieldset className="min-w-0">
                  <legend className="text-sm font-bold text-gray-700">나이</legend>
                  <div className="mt-2 flex min-w-0 items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={ageMin}
                      onChange={(event) => setAgeMin(event.target.value)}
                      placeholder="최소"
                      aria-label="최소 나이"
                      className="min-h-12 min-w-0 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                    />
                    <span className="shrink-0 text-gray-400">~</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={ageMax}
                      onChange={(event) => setAgeMax(event.target.value)}
                      placeholder="최대"
                      aria-label="최대 나이"
                      className="min-h-12 min-w-0 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                    />
                  </div>
                </fieldset>

                <label className="min-w-0 text-sm font-bold text-gray-700">
                  관계 상태
                  <select
                    value={relationshipFilter}
                    onChange={(event) => setRelationshipFilter(event.target.value as RelationshipFilter)}
                    disabled={!isMutualInfoAvailable || !isMatchInfoAvailable}
                    className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="all">전체</option>
                    <option value="mutual">상호 관심</option>
                    <option value="matched">매칭</option>
                    <option value="not-mutual">상대 관심 없음</option>
                  </select>
                </label>

                <label className="min-w-0 text-sm font-bold text-gray-700">
                  정렬
                  <select
                    value={favoriteSort}
                    onChange={(event) => setFavoriteSort(event.target.value as FavoriteSort)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 outline-none transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                  >
                    <option value="default">기본 순서</option>
                    <option value="recent">최근 관심 등록순</option>
                    <option value="oldest">오래된 관심 등록순</option>
                    <option value="younger">나이 어린 순</option>
                    <option value="older">나이 많은 순</option>
                    <option value="nickname">닉네임순</option>
                    <option value="mutual-first" disabled={!isMutualInfoAvailable}>상호 관심 우선</option>
                    <option value="matched-first" disabled={!isMatchInfoAvailable}>매칭된 회원 우선</option>
                  </select>
                </label>
              </div>

              {ageFilterError ? (
                <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{ageFilterError}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-500">
                  전체 {favorites.length}명 중 {visibleFavorites.length}명을 표시하고 있습니다.
                </p>
                <button
                  type="button"
                  onClick={resetAdvancedFilters}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  필터 초기화
                </button>
              </div>
            </section>
          </>
        ) : null}

        {error ? (
          <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-red-600">{error}</p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => setRetryKey((key) => key + 1)}>
              다시 시도
            </Button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-800">관심 회원이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              오늘의 추천에서 마음에 드는 회원을 관심목록에 추가해 보세요.
            </p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => router.push('/ai-match')}>
              오늘의 추천 보기
            </Button>
          </div>
        ) : isAdvancedMode && visibleFavorites.length === 0 && ageFilterError === null ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-16">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-800">선택한 조건에 해당하는 관심회원이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">다른 조건을 선택하거나 필터를 초기화해 보세요.</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleFavorites.map((member) => {
              const age = calculateAge(member.birth_date);
              const hasImage = Boolean(member.profile_image) && !failedImageIds.has(member.id);

              return (
                <article key={member.id} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm transition hover:shadow-lg">
                  <div className="relative flex h-56 items-center justify-center overflow-hidden bg-[#f0fdf4] p-4">
                    {hasImage ? (
                      <img
                        src={member.profile_image ?? ''}
                        alt={member.nickname ?? '프로필 이미지'}
                        onError={() => setFailedImageIds((current) => new Set(current).add(member.id))}
                        className="h-full w-full rounded-2xl object-contain"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-sm">
                        <User size={48} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{member.nickname || '익명'}</h2>
                        <p className="mt-1 text-sm font-semibold text-[#16a34a]">
                          {age !== null ? `만 ${age}세` : '나이 정보 미입력'}
                        </p>
                      </div>
                    </div>

                    {isAdvancedMode && (member.isMutual === true || member.matchStatus) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {member.isMutual === true ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-[#806B26]">상호 관심</span>
                        ) : null}
                        {member.matchStatus === 'active' ? (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">진행 중 매칭</span>
                        ) : member.matchStatus === 'ended' ? (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">종료된 매칭</span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                      <p className="flex items-center gap-2">
                        <MapPin size={15} className="text-gray-400" />
                        {member.region || '지역 정보 미입력'}
                      </p>
                      <p className="flex items-center gap-2">
                        <Briefcase size={15} className="text-gray-400" />
                        {member.job || '직업 정보 미입력'}
                      </p>
                      {isAdvancedMode && member.favoritedAt ? (
                        <p className="flex items-center gap-2">
                          <CalendarDays size={15} className="text-gray-400" />
                          {favoriteDateFormatter.format(new Date(member.favoritedAt))} 관심 등록
                        </p>
                      ) : null}
                    </div>

                    <section className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-gray-500">
                          <Sparkles size={15} /> AI 추천 이유
                        </h3>
                        <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-500">도입 예정</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">AI 추천 이유 기능은 도입 예정입니다.</p>
                    </section>

                    {likeNoticeMemberId === member.id ? (
                      <p role="status" className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                        좋아요 기능은 도입 예정입니다.
                      </p>
                    ) : null}

                    <div className="mt-6 grid gap-2 sm:grid-cols-2">
                      <Button
                        className="min-h-11 rounded-2xl px-4 py-3 text-sm font-bold"
                        onClick={() => member.id && router.push(`/members/${member.id}`)}
                      >
                        상세보기
                      </Button>
                      <button
                        type="button"
                        onClick={() => setLikeNoticeMemberId(member.id)}
                        className="min-h-11 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500 transition hover:bg-gray-100"
                      >
                        좋아요 · 도입 예정
                      </button>
                      {isAdvancedMode && member.matchId && member.matchStatus ? (
                        <Button
                          variant="outline"
                          className="min-h-11 rounded-2xl px-4 py-3 text-sm font-bold sm:col-span-2"
                          onClick={() => router.push(`/matches/${member.matchId}/chat`)}
                        >
                          {member.matchStatus === 'active' ? '채팅하기' : '대화 기록 보기'}
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDeleteFavorite(member.id)}
                        disabled={isDeletingId === member.id}
                        className="min-h-11 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-60 sm:col-span-2"
                      >
                        {isDeletingId === member.id ? '삭제 중...' : '삭제'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
