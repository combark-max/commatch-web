'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
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
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { STANDARD_JOB_VALUES } from '@/constants/jobs';

type Profile = {
  id: string;
  nickname: string | null;
  birth_date: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  religion: string | null;
  hobby: string | null;
  drinking: string | null;
  smoking: string | null;
  introduction: string | null;
  marriage_values: string | null;
  profile_image: string | null;
  profile_images: string[] | null;
};

type Preference = {
  age_min: number | null;
  age_max: number | null;
  height_min: number | null;
  height_max: number | null;
  preferred_region: string | null;
  preferred_job: string | null;
};

type RecommendedMember = Profile & {
  age: number | null;
  score: number;
  reasons: string[];
  completeness: number;
};

type SetupTarget = 'profile' | 'profile-incomplete' | 'preference' | null;
type Notice = { message: string; type: 'info' | 'success' | 'error' } | null;

const DEFAULT_RECOMMENDATION_LIMIT = 10;
const EXPANDED_RECOMMENDATION_LIMIT = 20;

const calculateAge = (birthDate: string | null) => {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
};

const calculateProfileCompleteness = (profile: Profile) => {
  const hasProfilePhoto = Boolean(profile.profile_image?.trim())
    || Boolean(profile.profile_images?.some((image) => typeof image === 'string' && image.trim()));
  const completedFields = [
    hasProfilePhoto,
    Boolean(profile.nickname?.trim()),
    Boolean(profile.gender?.trim()),
    Boolean(profile.birth_date?.trim()),
    typeof profile.height === 'number' && Number.isFinite(profile.height) && profile.height > 0,
    Boolean(profile.region?.trim()),
    Boolean(profile.job?.trim()),
    Boolean(profile.education?.trim()),
    Boolean(profile.religion?.trim()),
    Boolean(profile.hobby?.trim()),
    Boolean(profile.drinking?.trim()),
    Boolean(profile.smoking?.trim()),
    (profile.introduction?.trim().length ?? 0) >= 10,
    (profile.marriage_values?.trim().length ?? 0) >= 10,
  ].filter(Boolean).length;

  return Math.round((completedFields / 14) * 100);
};

const isSpecified = (value: string | null) => Boolean(value && value !== '상관없음');

const matchesPreferredJob = (job: string | null, preferredJob: string | null) => {
  if (!isSpecified(preferredJob) || !job) return false;
  if (preferredJob === '기타') {
    return !(STANDARD_JOB_VALUES as readonly string[]).includes(job);
  }
  return job === preferredJob;
};

const getRecommendationReasons = (member: Profile, preference: Preference, age: number | null) => {
  const reasons: string[] = [];
  const hasAgePreference = preference.age_min !== null || preference.age_max !== null;
  const matchesAge = age !== null
    && (preference.age_min === null || age >= preference.age_min)
    && (preference.age_max === null || age <= preference.age_max);
  if (hasAgePreference && matchesAge) reasons.push('희망 연령 조건에 잘 맞습니다.');

  const hasHeightPreference = preference.height_min !== null || preference.height_max !== null;
  const matchesHeight = member.height !== null
    && (preference.height_min === null || member.height >= preference.height_min)
    && (preference.height_max === null || member.height <= preference.height_max);
  if (hasHeightPreference && matchesHeight) reasons.push('키 조건에 잘 맞습니다.');

  if (isSpecified(preference.preferred_region) && member.region === preference.preferred_region) {
    reasons.push('선호 지역과 일치합니다.');
  }

  if (matchesPreferredJob(member.job, preference.preferred_job)) {
    reasons.push('선호 직업 조건과 잘 맞습니다.');
  }

  return reasons.slice(0, 3);
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
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadRecommendations = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const expandedMode = searchParams.get('expanded') === '1';
      const recommendationLimit = expandedMode
        ? EXPANDED_RECOMMENDATION_LIMIT
        : DEFAULT_RECOMMENDATION_LIMIT;

      setIsLoading(true);
      setError(null);
      setNotice(null);
      setCurrentIndex(0);
      setIsExpandedMode(expandedMode);

      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user?.id) {
          router.replace('/login');
          return;
        }

        if (isMounted) setCurrentUserId(user.id);

        const [profileResult, preferenceResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, nickname, birth_date, gender, height, region, job, education, religion, hobby, drinking, smoking, introduction, marriage_values, profile_image, profile_images')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('preferences')
            .select('age_min, age_max, height_min, height_max, preferred_region, preferred_job')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (profileResult.error) throw profileResult.error;
        if (preferenceResult.error) throw preferenceResult.error;

        const currentProfile = profileResult.data as Profile | null;
        const preference = preferenceResult.data as Preference | null;

        if (!currentProfile?.gender || !['남성', '여성'].includes(currentProfile.gender)) {
          if (isMounted) setSetupTarget('profile');
          return;
        }

        if (calculateProfileCompleteness(currentProfile) < 80) {
          if (isMounted) setSetupTarget('profile-incomplete');
          return;
        }

        if (!preference) {
          if (isMounted) setSetupTarget('preference');
          return;
        }

        const oppositeGender = currentProfile.gender === '남성' ? '여성' : '남성';
        const { data, error: membersError } = await supabase
          .from('profiles')
          .select('id, nickname, birth_date, gender, height, region, job, education, religion, hobby, drinking, smoking, introduction, marriage_values, profile_image, profile_images')
          .eq('gender', oppositeGender)
          .neq('id', user.id);

        if (membersError) throw membersError;

        const scoredMembers = ((data as Profile[]) ?? [])
          .map((member) => {
            const age = calculateAge(member.birth_date);
            let score = 0;

            const hasAgePreference = preference.age_min !== null || preference.age_max !== null;
            const matchesAge = age !== null
              && (preference.age_min === null || age >= preference.age_min)
              && (preference.age_max === null || age <= preference.age_max);
            if (hasAgePreference && matchesAge) score += 1;

            const hasHeightPreference = preference.height_min !== null || preference.height_max !== null;
            const matchesHeight = member.height !== null
              && (preference.height_min === null || member.height >= preference.height_min)
              && (preference.height_max === null || member.height <= preference.height_max);
            if (hasHeightPreference && matchesHeight) score += 1;

            if (isSpecified(preference.preferred_region) && member.region === preference.preferred_region) {
              score += 1;
            }

            if (matchesPreferredJob(member.job, preference.preferred_job)) {
              score += 1;
            }

            return {
              ...member,
              age,
              score,
              reasons: getRecommendationReasons(member, preference, age),
              completeness: calculateProfileCompleteness(member),
              profile_image: resolveProfileImageUrl(member.profile_image),
            };
          })
          .filter((member) => member.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, recommendationLimit);

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
          .eq('user_id', user.id);

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
        if (isMounted) setIsLoading(false);
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

  const showComingSoonNotice = (feature: 'like' | 'notification') => {
    setNotice({
      message: feature === 'like' ? '좋아요 기능은 도입 예정입니다.' : '알림 기능은 현재 준비 중입니다.',
      type: 'info',
    });
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
          <button
            type="button"
            onClick={() => showComingSoonNotice('notification')}
            className="shrink-0 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-gray-400 shadow-sm transition hover:bg-gray-50"
            aria-label="알림 기능 준비 중"
          >
            <Bell className="mx-auto h-5 w-5" />
            <span className="mt-1 block text-[10px] font-bold">준비 중</span>
          </button>
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
            <h2 className="text-xl font-bold text-gray-900">현재 조건에 맞는 추천 회원을 준비 중입니다.</h2>
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
              <button
                type="button"
                onClick={() => showComingSoonNotice('like')}
                className="min-h-12 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-500 transition hover:bg-gray-100"
              >
                좋아요 · 도입 예정
              </button>
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
