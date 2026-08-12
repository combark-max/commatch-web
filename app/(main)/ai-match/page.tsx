'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  MapPin,
  Ruler,
  Sparkles,
  User,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  introduction: string | null;
  profile_image: string | null;
};

type PreferenceMatchStatus = 'match' | 'mismatch' | 'preference-missing' | 'member-missing';

type PreferenceMatchResult = {
  label: '희망 연령' | '희망 키' | '선호 지역' | '선호 직업';
  status: PreferenceMatchStatus;
  detail: string;
};

type RecommendedMember = Profile & {
  age: number | null;
  score: number;
  reasons: string[];
  preferenceMatches: PreferenceMatchResult[];
  preferenceMatchRate: number | null;
  matchedPreferenceCount: number;
  enteredPreferenceCount: number;
  commonPoints: string[];
  recommendationReason: string | null;
  considerations: string[];
  dataNote?: string;
  completeness: number;
};

type SetupTarget = 'profile' | 'profile-incomplete' | 'preference' | null;
type Notice = { message: string; type: 'info' | 'success' | 'error' } | null;

type RecommendationApiResponse = {
  status: 'ready';
  currentUserId: string;
  hasEnteredPreference: boolean;
  recommendations: RecommendedMember[];
} | {
  status: 'setup';
  currentUserId: string;
  hasEnteredPreference: boolean;
  setupTarget: Exclude<SetupTarget, null>;
};

const PREFERENCE_STATUS_LABELS: Record<PreferenceMatchStatus, string> = {
  match: '일치',
  mismatch: '조건과 다름',
  'preference-missing': '선호조건 미입력',
  'member-missing': '상대방 정보 부족',
};

const PREFERENCE_STATUS_CLASSES: Record<PreferenceMatchStatus, string> = {
  match: 'bg-green-100 text-green-700',
  mismatch: 'bg-amber-100 text-amber-700',
  'preference-missing': 'bg-gray-100 text-gray-500',
  'member-missing': 'bg-gray-100 text-gray-500',
};

export default function AiMatchPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendedMember[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(new Set());
  const [setupTarget, setSetupTarget] = useState<SetupTarget>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [isExpandedMode, setIsExpandedMode] = useState(false);
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [hasEnteredPreference, setHasEnteredPreference] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let isRedirecting = false;

    const loadRecommendations = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const expandedValues = searchParams.getAll('expanded');
      const expandedMode = expandedValues.length === 1 && expandedValues[0] === '1';
      const analysisMode = searchParams.get('analysis') === '1';
      const apiSearchParams = new URLSearchParams();
      expandedValues.forEach((value) => apiSearchParams.append('expanded', value));
      const recommendationApiUrl = apiSearchParams.size > 0
        ? `/api/ai-match/recommendations?${apiSearchParams.toString()}`
        : '/api/ai-match/recommendations';

      setIsLoading(true);
      setError(null);
      setNotice(null);
      setCurrentIndex(0);
      setIsExpandedMode(expandedMode);
      setIsAnalysisMode(analysisMode);
      setHasEnteredPreference(false);

      try {
        const response = await fetch(recommendationApiUrl, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (response.status === 401) {
          isRedirecting = true;
          router.replace('/login');
          return;
        }

        if (response.status === 403) {
          isRedirecting = true;
          router.replace('/premium');
          return;
        }

        if (!response.ok) {
          throw new Error(`Recommendation request failed with status ${response.status}`);
        }

        const payload: unknown = await response.json();

        if (!payload || typeof payload !== 'object' || !('status' in payload)) {
          throw new Error('Recommendation response has an invalid format');
        }

        const apiResult = payload as RecommendationApiResponse;

        if (typeof apiResult.currentUserId !== 'string'
          || typeof apiResult.hasEnteredPreference !== 'boolean') {
          throw new Error('Recommendation response has an invalid format');
        }

        if (isMounted) {
          setCurrentUserId(apiResult.currentUserId);
          setHasEnteredPreference(apiResult.hasEnteredPreference);
        }

        if (apiResult.status === 'setup') {
          if (isMounted) {
            setRecommendations([]);
            setSetupTarget(apiResult.setupTarget);
          }
          return;
        }

        if (apiResult.status !== 'ready' || !Array.isArray(apiResult.recommendations)) {
          throw new Error('Recommendation response has an invalid format');
        }

        const scoredMembers = apiResult.recommendations;

        let restoredIndex = 0;

        if (scoredMembers.length > 0 && typeof window !== 'undefined') {
          const requestedMemberId = searchParams.get('member')?.trim() ?? '';
          const requestedMemberIndex = requestedMemberId
            ? scoredMembers.findIndex((recommendation) => recommendation.id === requestedMemberId)
            : -1;

          if (requestedMemberIndex >= 0) {
            restoredIndex = requestedMemberIndex;
          } else {
            const rawIndex = searchParams.get('index');
            const parsedIndex = rawIndex && rawIndex.trim() ? Number(rawIndex) : 0;
            const requestedIndex = Number.isInteger(parsedIndex) ? parsedIndex : 0;
            restoredIndex = Math.min(Math.max(requestedIndex, 0), scoredMembers.length - 1);
          }

          if (searchParams.has('index') || searchParams.has('member')) {
            const restoredMember = scoredMembers[restoredIndex];
            searchParams.set('index', String(restoredIndex));
            searchParams.set('member', restoredMember.id);
            const normalizedUrl = `/ai-match?${searchParams.toString()}`;
            const currentUrl = `${window.location.pathname}${window.location.search}`;

            if (currentUrl !== normalizedUrl) {
              router.replace(normalizedUrl, { scroll: false });
            }
          }
        }

        const { data: favoriteRows, error: favoritesError } = await supabase
          .from('favorites')
          .select('favorite_user_id')
          .eq('user_id', apiResult.currentUserId);

        if (favoritesError) throw favoritesError;

        if (isMounted) {
          setRecommendations(scoredMembers);
          setCurrentIndex(restoredIndex);
          setFavoriteIds(new Set((favoriteRows ?? []).map((row) => row.favorite_user_id)));
          setSetupTarget(null);
        }
      } catch (loadError) {
        console.error('AI 추천 회원 조회 실패:', loadError);
        if (isMounted) {
          setRecommendations([]);
          setError('추천 회원을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
      } finally {
        if (isMounted && !isRedirecting) setIsLoading(false);
      }
    };

    void loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  const currentMember = recommendations[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < recommendations.length - 1;

  const getRecommendationUrl = (index: number, memberId: string) => {
    const searchParams = typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
    searchParams.set('index', String(index));
    searchParams.set('member', memberId);
    return `/ai-match?${searchParams.toString()}`;
  };

  const updateRecommendationUrl = (index: number, memberId: string) => {
    router.replace(getRecommendationUrl(index, memberId), { scroll: false });
  };

  const showPreviousRecommendation = () => {
    setNotice(null);
    const previousIndex = Math.max(0, currentIndex - 1);
    const previousMember = recommendations[previousIndex];
    setCurrentIndex(previousIndex);

    if (previousMember) {
      updateRecommendationUrl(previousIndex, previousMember.id);
    }
  };

  const showNextRecommendation = () => {
    setNotice(null);
    const nextIndex = Math.min(recommendations.length - 1, currentIndex + 1);
    const nextMember = recommendations[nextIndex];
    setCurrentIndex(nextIndex);

    if (nextMember) {
      updateRecommendationUrl(nextIndex, nextMember.id);
    }
  };

  const showMemberDetails = () => {
    if (!currentMember || typeof window === 'undefined') return;

    const recommendationUrl = getRecommendationUrl(currentIndex, currentMember.id);
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== recommendationUrl) {
      window.history.replaceState(null, '', recommendationUrl);
    }

    router.push(`/members/${currentMember.id}`);
  };

  const toggleFavorite = async () => {
    if (!currentUserId || !currentMember || isTogglingFavorite) return;

    const memberId = currentMember.id;
    const wasFavorite = favoriteIds.has(memberId);
    setIsTogglingFavorite(true);
    setNotice(null);

    try {
      const result = wasFavorite
        ? await supabase.from('favorites').delete().eq('user_id', currentUserId).eq('favorite_user_id', memberId)
        : await supabase.from('favorites').insert({ user_id: currentUserId, favorite_user_id: memberId });

      if (result.error) throw result.error;

      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.delete(memberId);
        else next.add(memberId);
        return next;
      });
      setNotice({
        message: wasFavorite ? '관심회원에서 해제했습니다.' : '관심회원으로 추가했습니다.',
        type: 'success',
      });
    } catch (favoriteError: unknown) {
      const supabaseError = favoriteError as { code?: string; message?: string; details?: string; hint?: string };
      if (!wasFavorite && supabaseError.code === '23505') {
        setFavoriteIds((current) => new Set(current).add(memberId));
        setNotice({ message: '이미 관심회원으로 등록되어 있습니다.', type: 'success' });
        return;
      }
      console.error('관심회원 처리 실패:', {
        code: supabaseError.code ?? null,
        message: supabaseError.message ?? null,
        details: supabaseError.details ?? null,
        hint: supabaseError.hint ?? null,
      });
      setNotice({ message: '관심회원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">오늘의 추천</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 sm:text-base">
              회원님의 프로필과 이상형 조건을 바탕으로 추천한 회원입니다.
            </p>
          </div>
        </div>

        {isExpandedMode ? (
          <section className="mb-5 rounded-2xl border border-green-100 bg-green-50 p-5" aria-label="확대 추천 테스트 안내">
            <p className="font-bold text-green-800">Premium 도입 전 테스트 제공</p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              일반 추천은 최대 10명까지 제공되며, 확대 추천에서는 조건에 맞는 회원을 최대 20명까지 확인할 수 있습니다.
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              추천 조건에 맞는 회원 수에 따라 실제 표시 인원은 달라질 수 있습니다.
            </p>
          </section>
        ) : null}

        {isAnalysisMode ? (
          <section className="mb-5 rounded-2xl border border-green-100 bg-green-50 p-5" aria-label="AI 추천 분석 테스트 안내">
            <p className="font-bold text-green-800">Premium 도입 전 테스트 제공 기능입니다.</p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              입력된 프로필과 이상형 조건을 기준으로 잘 맞는 점과 확인할 점을 분석합니다.
            </p>
          </section>
        ) : null}

        {notice ? (
          <div
            role="status"
            className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-medium ${
              notice.type === 'error'
                ? 'border-red-100 bg-red-50 text-red-600'
                : notice.type === 'success'
                  ? 'border-green-100 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-96 flex-col items-center justify-center rounded-[2rem] border border-gray-100 bg-white shadow-sm">
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#16a34a]" />
            <p className="font-medium text-gray-500">추천 회원을 찾는 중...</p>
          </div>
        ) : setupTarget ? (
          <div className="rounded-[2rem] border border-green-100 bg-white p-8 text-center shadow-sm sm:p-12">
            <Sparkles className="mx-auto mb-4 h-10 w-10 text-[#16a34a]" />
            <h2 className="text-xl font-bold text-gray-900">
              {setupTarget === 'profile-incomplete'
                ? '프로필을 80% 이상 작성하면 추천을 받을 수 있습니다.'
                : setupTarget === 'profile'
                  ? '추천을 받으려면 먼저 프로필을 설정해 주세요.'
                  : '추천을 받으려면 먼저 이상형을 설정해 주세요.'}
            </h2>
            <Button
              className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold"
              onClick={() => router.push(setupTarget === 'preference' ? '/preference' : '/profile/create')}
            >
              {setupTarget === 'preference' ? '이상형 설정하기' : '프로필 수정하기'}
            </Button>
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm sm:p-12">
            <p className="font-semibold text-red-600">{error}</p>
            <Button className="mt-6 rounded-2xl px-6 py-3 text-sm font-bold" onClick={() => setRetryKey((key) => key + 1)}>
              다시 시도
            </Button>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-sm sm:p-12">
            <User className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h2 className="text-xl font-bold text-gray-900">
              {isAnalysisMode && !hasEnteredPreference
                ? '선호조건을 입력하면 일치 결과를 확인할 수 있습니다.'
                : '현재 조건에 맞는 추천 회원을 준비 중입니다.'}
            </h2>
            {isAnalysisMode && !hasEnteredPreference ? (
              <p className="mt-3 text-sm leading-6 text-gray-500">
                희망 연령, 희망 키, 선호 지역, 선호 직업 중 한 가지 이상을 설정해 주세요.
              </p>
            ) : null}
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" className="rounded-2xl px-5 py-3 text-sm font-bold" onClick={() => router.push('/preference')}>
                이상형 조건 수정
              </Button>
              <Button variant="outline" className="rounded-2xl px-5 py-3 text-sm font-bold" onClick={() => router.push('/profile/create')}>
                내 프로필 확인
              </Button>
              <Button className="rounded-2xl px-5 py-3 text-sm font-bold" onClick={() => router.push('/dashboard')}>
                대시보드로 이동
              </Button>
            </div>
          </div>
        ) : currentMember ? (
          <article className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
            <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="relative flex h-80 items-center justify-center overflow-hidden bg-[#f0fdf4] md:h-[520px]">
                {currentMember.profile_image && !failedImageIds.has(currentMember.id) ? (
                  <img
                    key={`${currentMember.id}-${currentMember.profile_image ?? 'no-image'}`}
                    src={currentMember.profile_image}
                    alt={`${currentMember.nickname ?? '회원'} 프로필 사진`}
                    onError={() => setFailedImageIds((current) => new Set(current).add(currentMember.id))}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white bg-white text-gray-300 shadow-md">
                    <User size={64} strokeWidth={1.5} />
                  </div>
                )}
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-green-700 shadow-sm">
                  {currentIndex + 1} / {recommendations.length}
                </span>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{currentMember.nickname || '닉네임 미설정'}</h2>
                    <p className="mt-1 font-semibold text-[#16a34a]">
                      {currentMember.age !== null ? `만 ${currentMember.age}세` : '나이 미설정'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                    프로필 완성도 {currentMember.completeness}%
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-2">
                    <MapPin size={15} className="text-gray-400" /> {currentMember.region || '지역 미설정'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-2">
                    <Briefcase size={15} className="text-gray-400" /> {currentMember.job || '직업 미설정'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-2">
                    <Ruler size={15} className="text-gray-400" />
                    {currentMember.height !== null ? `${currentMember.height}cm` : '키 미설정'}
                  </span>
                </div>

                <section className="mt-6 rounded-2xl border border-green-100 bg-green-50 p-5">
                  {isAnalysisMode ? (
                    <>
                      <h3 className="flex items-center gap-2 text-base font-bold text-green-900">
                        <Sparkles size={18} /> 맞춤 분석 요약
                      </h3>
                      {currentMember.preferenceMatchRate !== null ? (
                        <div className="mt-4 rounded-xl border border-green-200 bg-white/80 p-4">
                          <p className="text-sm font-black text-green-800">
                            선호조건 일치율 {currentMember.preferenceMatchRate}%
                          </p>
                          <p className="mt-1 text-xs text-gray-600">
                            입력한 선호조건 {currentMember.enteredPreferenceCount}개 중 {currentMember.matchedPreferenceCount}개 일치
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-gray-200 bg-white/80 p-4">
                          <p className="text-sm font-bold text-gray-700">
                            입력된 선호조건이 없습니다.
                          </p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            이상형 조건을 입력하면 조건별 일치 결과를 확인할 수 있습니다.
                          </p>
                        </div>
                      )}

                      <h4 className="mt-5 text-sm font-bold text-green-800">선호조건 비교</h4>
                      <div className="mt-3 grid gap-2">
                        {currentMember.preferenceMatches.map((result) => (
                          <div key={result.label} className="rounded-xl border border-green-100 bg-white/80 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-bold text-gray-800">{result.label}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PREFERENCE_STATUS_CLASSES[result.status]}`}>
                                {PREFERENCE_STATUS_LABELS[result.status]}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-gray-600">{result.detail}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 border-t border-green-200 pt-4">
                        <h4 className="text-sm font-bold text-gray-800">추천 이유</h4>
                        <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
                          {currentMember.recommendationReason
                            ?? '현재 표시할 수 있는 일치 조건으로는 추천 이유 문장을 생성할 수 없습니다.'}
                        </p>
                      </div>

                      <div className="mt-5 border-t border-green-200 pt-4">
                        <h4 className="text-sm font-bold text-gray-800">공통점</h4>
                        {currentMember.commonPoints.length > 0 ? (
                          <ul className="mt-3 space-y-2 text-sm font-medium text-gray-700">
                            {currentMember.commonPoints.map((commonPoint) => (
                              <li key={commonPoint} className="flex items-start gap-2">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                                {commonPoint}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm leading-6 text-gray-600">
                            음주, 흡연, 취미 중 신뢰할 수 있게 같은 값을 확인하지 못했습니다.
                          </p>
                        )}
                      </div>

                      {currentMember.considerations.length > 0 ? (
                        <div className="mt-5 border-t border-green-200 pt-4">
                          <h4 className="text-sm font-bold text-gray-800">확인할 점</h4>
                          <ul className="mt-3 space-y-2 text-sm font-medium text-gray-700">
                            {currentMember.considerations.map((consideration) => (
                              <li key={consideration} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                {consideration}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {currentMember.dataNote ? (
                        <p className="mt-4 text-xs leading-5 text-gray-500">{currentMember.dataNote}</p>
                      ) : null}
                      <p className="mt-4 rounded-xl border border-gray-200 bg-white/80 p-3 text-xs leading-5 text-gray-600">
                        자기소개와 결혼 가치관은 자유롭게 작성한 내용이므로 현재 테스트 분석 점수에는 포함하지 않습니다. 회원 상세 화면에서 직접 확인해 주세요.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="flex items-center gap-2 text-sm font-bold text-green-800">
                        <Sparkles size={17} /> 추천 이유
                      </h3>
                      {currentMember.reasons.length > 0 ? (
                        <ul className="mt-3 space-y-2 text-sm font-medium text-gray-700">
                          {currentMember.reasons.map((reason) => (
                            <li key={reason} className="flex items-start gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm font-medium leading-6 text-gray-700">
                          회원님의 기본 이상형 조건을 바탕으로 추천한 회원입니다.
                        </p>
                      )}
                    </>
                  )}
                </section>

                <section className="mt-5">
                  <h3 className="text-sm font-bold text-gray-900">한 줄 자기소개</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                    {currentMember.introduction || '아직 자기소개를 작성하지 않았습니다.'}
                  </p>
                </section>
              </div>
            </div>

            <div className="grid gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
              <Button
                variant={favoriteIds.has(currentMember.id) ? 'primary' : 'outline'}
                className="min-h-12 rounded-2xl px-4 py-3 text-sm font-bold"
                onClick={toggleFavorite}
                disabled={isTogglingFavorite}
              >
                <Heart className="mr-2 h-4 w-4" fill={favoriteIds.has(currentMember.id) ? 'currentColor' : 'none'} />
                {isTogglingFavorite ? '처리 중...' : favoriteIds.has(currentMember.id) ? '관심 취소' : '관심'}
              </Button>
              <Button
                variant="outline"
                className="min-h-12 rounded-2xl px-4 py-3 text-sm font-bold"
                onClick={showMemberDetails}
              >
                자세히 보기
              </Button>
              {hasPrevious || hasNext ? (
                <div className={`grid gap-2 ${hasPrevious && hasNext ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {hasPrevious ? (
                    <Button
                      variant="outline"
                      className="min-h-12 rounded-2xl px-3 py-3 text-sm font-bold"
                      onClick={showPreviousRecommendation}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" /> 이전
                    </Button>
                  ) : null}
                  {hasNext ? (
                    <Button
                      className="min-h-12 rounded-2xl px-3 py-3 text-sm font-bold"
                      onClick={showNextRecommendation}
                    >
                      다음 <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
