import { NextRequest, NextResponse } from 'next/server';
import { STANDARD_JOB_VALUES } from '@/constants/jobs';
import {
  parseRecommendationApiSearchParams,
  selectRecommendationCandidates,
  type BaseRecommendedMember,
  type PreferenceMatchResult,
  type PremiumRecommendedMember,
  type RecommendationApiResponse,
} from '@/lib/ai-match/recommendation-contract';
import { getPremiumFeatureAccess } from '@/lib/premium/server';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentMemberServiceAccess } from '@/lib/member/access';

type Profile = {
  id: string;
  nickname: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  education: string | null;
  hobby: string | null;
  drinking: string | null;
  smoking: string | null;
  marriage_history: string | null;
  introduction: string | null;
  marriage_values: string | null;
  profile_image: string | null;
  profile_images: string[] | null;
};

type CurrentProfile = Profile & {
  birth_date: string | null;
};

type CandidateProfile = Profile & {
  age: number | null;
  is_priority_recommendation?: boolean;
};

type Preference = {
  age_min: number | null;
  age_max: number | null;
  height_min: number | null;
  height_max: number | null;
  preferred_region: string | null;
  preferred_job: string | null;
};

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

const UNAVAILABLE_COMPARISON_VALUES = new Set([
  '',
  '미입력',
  '미설정',
  '미공개',
  '비공개',
  '선택하지 않음',
  '공개하지 않음',
  '알 수 없음',
  '알수없음',
  '정보 없음',
  '상관없음',
]);

const calculateProfileCompleteness = (profile: Profile, hasAgeInformation: boolean) => {
  const hasProfilePhoto = Boolean(profile.profile_image?.trim())
    || Boolean(profile.profile_images?.some((image) => typeof image === 'string' && image.trim()));
  const completedFields = [
    hasProfilePhoto,
    Boolean(profile.nickname?.trim()),
    Boolean(profile.gender?.trim()),
    hasAgeInformation,
    typeof profile.height === 'number' && Number.isFinite(profile.height) && profile.height > 0,
    Boolean(profile.region?.trim()),
    Boolean(profile.job?.trim()),
    Boolean(profile.education?.trim()),
    Boolean(profile.hobby?.trim()),
    Boolean(profile.drinking?.trim()),
    Boolean(profile.smoking?.trim()),
    Boolean(profile.marriage_history?.trim()),
    (profile.introduction?.trim().length ?? 0) >= 10,
    (profile.marriage_values?.trim().length ?? 0) >= 10,
  ].filter(Boolean).length;

  return Math.round((completedFields / 14) * 100);
};

const isSpecified = (value: string | null) => Boolean(value && value !== '상관없음');

const normalizeComparableText = (value: string | null) => (
  value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR') ?? ''
);

const getComparableText = (value: string | null, excludeOther = false) => {
  const normalizedValue = normalizeComparableText(value);
  return UNAVAILABLE_COMPARISON_VALUES.has(normalizedValue) || (excludeOther && normalizedValue === '기타')
    ? ''
    : normalizedValue;
};

const formatRange = (min: number | null, max: number | null, unit: string) => {
  if (min !== null && max !== null) return `${min}~${max}${unit}`;
  if (min !== null) return `${min}${unit} 이상`;
  if (max !== null) return `${max}${unit} 이하`;
  return '';
};

const matchesPreferredJob = (job: string | null, preferredJob: string | null) => {
  if (!isSpecified(preferredJob) || !job) return false;
  if (preferredJob === '기타') {
    return !(STANDARD_JOB_VALUES as readonly string[]).includes(job);
  }
  return job === preferredJob;
};

const getRecommendationReasons = (member: CandidateProfile, preference: Preference, age: number | null) => {
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

const getAdvancedRecommendationAnalysis = (
  currentProfile: CurrentProfile,
  candidateProfile: CandidateProfile,
  preference: Preference,
  candidateAge: number | null,
) => {
  const hasAgePreference = preference.age_min !== null || preference.age_max !== null;
  const hasHeightPreference = preference.height_min !== null || preference.height_max !== null;
  const hasRegionPreference = isSpecified(preference.preferred_region);
  const hasJobPreference = isSpecified(preference.preferred_job);
  const candidateRegion = getComparableText(candidateProfile.region);
  const candidateJob = getComparableText(candidateProfile.job);

  const preferenceMatches: PreferenceMatchResult[] = [
    !hasAgePreference
      ? { label: '희망 연령', status: 'preference-missing', detail: '희망 연령을 입력하지 않았습니다.' }
      : candidateAge === null
        ? { label: '희망 연령', status: 'member-missing', detail: '상대방의 생년월일 정보가 없습니다.' }
        : {
            label: '희망 연령',
            status: (preference.age_min === null || candidateAge >= preference.age_min)
              && (preference.age_max === null || candidateAge <= preference.age_max)
              ? 'match'
              : 'mismatch',
            detail: `희망 ${formatRange(preference.age_min, preference.age_max, '세')} · 상대 만 ${candidateAge}세`,
          },
    !hasHeightPreference
      ? { label: '희망 키', status: 'preference-missing', detail: '희망 키를 입력하지 않았습니다.' }
      : candidateProfile.height === null
        ? { label: '희망 키', status: 'member-missing', detail: '상대방의 키 정보가 없습니다.' }
        : {
            label: '희망 키',
            status: (preference.height_min === null || candidateProfile.height >= preference.height_min)
              && (preference.height_max === null || candidateProfile.height <= preference.height_max)
              ? 'match'
              : 'mismatch',
            detail: `희망 ${formatRange(preference.height_min, preference.height_max, 'cm')} · 상대 ${candidateProfile.height}cm`,
          },
    !hasRegionPreference
      ? { label: '선호 지역', status: 'preference-missing', detail: '선호 지역을 입력하지 않았습니다.' }
      : !candidateRegion
        ? { label: '선호 지역', status: 'member-missing', detail: '상대방의 지역 정보가 없습니다.' }
        : {
            label: '선호 지역',
            status: candidateProfile.region === preference.preferred_region ? 'match' : 'mismatch',
            detail: `선호 ${preference.preferred_region} · 상대 ${candidateProfile.region}`,
          },
    !hasJobPreference
      ? { label: '선호 직업', status: 'preference-missing', detail: '선호 직업을 입력하지 않았습니다.' }
      : !candidateJob
        ? { label: '선호 직업', status: 'member-missing', detail: '상대방의 직업 정보가 없습니다.' }
        : {
            label: '선호 직업',
            status: matchesPreferredJob(candidateProfile.job, preference.preferred_job) ? 'match' : 'mismatch',
            detail: `선호 ${preference.preferred_job} · 상대 ${candidateProfile.job}`,
          },
  ];

  const enteredPreferenceMatches = preferenceMatches.filter(({ status }) => status !== 'preference-missing');
  const matchedPreferenceMatches = enteredPreferenceMatches.filter(({ status }) => status === 'match');
  const preferenceMatchRate = enteredPreferenceMatches.length > 0
    ? Math.round((matchedPreferenceMatches.length / enteredPreferenceMatches.length) * 100)
    : null;
  const matchedPreferenceLabels = matchedPreferenceMatches.map(({ label }) => label);
  const recommendationReason = matchedPreferenceLabels.length > 0
    ? `${matchedPreferenceLabels.join('·')} 조건이 일치하여 추천되었습니다.`
    : null;

  const commonPoints: string[] = [];
  const lifestyleDifferences: string[] = [];
  let hasUnavailableProfileComparison = false;

  const compareSelectedValue = (
    label: '음주' | '흡연',
    currentValue: string | null,
    candidateValue: string | null,
  ) => {
    const normalizedCurrentValue = getComparableText(currentValue);
    const normalizedCandidateValue = getComparableText(candidateValue);

    if (!normalizedCurrentValue || !normalizedCandidateValue) {
      hasUnavailableProfileComparison = true;
      return;
    }

    if (normalizedCurrentValue === normalizedCandidateValue) {
      commonPoints.push(`${label} 정보가 같습니다: ${candidateValue?.trim()}`);
    } else {
      lifestyleDifferences.push(`${label} 정보가 서로 다릅니다. 대화로 확인해 보세요.`);
    }
  };

  compareSelectedValue('음주', currentProfile.drinking, candidateProfile.drinking);
  compareSelectedValue('흡연', currentProfile.smoking, candidateProfile.smoking);

  const currentHobby = getComparableText(currentProfile.hobby, true);
  const candidateHobby = getComparableText(candidateProfile.hobby, true);
  if (currentHobby && candidateHobby) {
    if (currentHobby === candidateHobby) {
      commonPoints.push(`취미로 입력한 내용이 같습니다: ${candidateProfile.hobby?.trim()}`);
    }
  } else {
    hasUnavailableProfileComparison = true;
  }

  const preferenceDifferences = preferenceMatches
    .filter(({ status }) => status === 'mismatch')
    .map(({ label }) => `${label} 조건과 상대방 정보가 다릅니다. 프로필과 대화로 확인해 보세요.`);
  const hasMissingPreferredMemberData = preferenceMatches.some(({ status }) => status === 'member-missing');
  const considerations = [...preferenceDifferences, ...lifestyleDifferences];
  const dataNote = hasMissingPreferredMemberData || hasUnavailableProfileComparison
    ? '미입력·비공개 등 확인할 수 없는 프로필 값은 공통점과 차이점 판단에서 제외했습니다.'
    : undefined;

  return {
    preferenceMatches,
    preferenceMatchRate,
    matchedPreferenceCount: matchedPreferenceMatches.length,
    enteredPreferenceCount: enteredPreferenceMatches.length,
    commonPoints,
    recommendationReason,
    considerations,
    dataNote,
  };
};

const jsonResponse = (body: RecommendationApiResponse | { error: string }, status = 200) => (
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
);

export async function GET(request: NextRequest) {
  const recommendationRequest = parseRecommendationApiSearchParams(request.nextUrl.searchParams);
  if (!recommendationRequest) {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
  const { expandedRequested, mode } = recommendationRequest;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return jsonResponse({ error: 'Authentication required.' }, 401);
    }

    const serviceAccess = await getCurrentMemberServiceAccess();
    if (serviceAccess.kind === 'anonymous') {
      return jsonResponse({ error: 'Authentication required.' }, 401);
    }
    if (serviceAccess.kind === 'error') {
      return jsonResponse({ error: 'Member service access could not be verified.' }, 500);
    }
    if (serviceAccess.kind === 'suspended') {
      return jsonResponse({ error: 'Member service access is suspended.' }, 403);
    }
    if (serviceAccess.kind === 'consent_required') {
      return jsonResponse({ error: 'Required consent is incomplete.' }, 403);
    }

    if (expandedRequested) {
      const access = await getPremiumFeatureAccess('expanded_recommendations');

      if (access.status === 'unauthenticated') {
        return jsonResponse({ error: 'Authentication required.' }, 401);
      }

      if (!access.allowed) {
        return jsonResponse({ error: 'Premium feature access required.' }, 403);
      }
    }

    const [profileResult, preferenceResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, nickname, birth_date, gender, height, region, job, education, hobby, drinking, smoking, marriage_history, introduction, marriage_values, profile_image, profile_images')
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

    const currentProfile = profileResult.data as CurrentProfile | null;
    const preference = preferenceResult.data as Preference | null;
    const hasEnteredPreference = Boolean(preference && (
      preference.age_min !== null
        || preference.age_max !== null
        || preference.height_min !== null
        || preference.height_max !== null
        || isSpecified(preference.preferred_region)
        || isSpecified(preference.preferred_job)
    ));

    if (!currentProfile?.gender || !['남성', '여성'].includes(currentProfile.gender)) {
      return jsonResponse({
        status: 'setup',
        mode,
        currentUserId: user.id,
        hasEnteredPreference,
        setupTarget: 'profile',
      });
    }

    if (calculateProfileCompleteness(currentProfile, Boolean(currentProfile.birth_date?.trim())) < 80) {
      return jsonResponse({
        status: 'setup',
        mode,
        currentUserId: user.id,
        hasEnteredPreference,
        setupTarget: 'profile-incomplete',
      });
    }

    if (!preference) {
      return jsonResponse({
        status: 'setup',
        mode,
        currentUserId: user.id,
        hasEnteredPreference,
        setupTarget: 'preference',
      });
    }

    const { data, error: membersError } = await supabase.rpc('get_ai_match_candidates');

    if (membersError) throw membersError;

    const scoredCandidates = ((data as CandidateProfile[]) ?? [])
      .map((member) => {
        const age = member.age;
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

        const reasons = getRecommendationReasons(member, preference, age);
        return {
          ...member,
          age,
          score,
          isPriorityRecommendation: member.is_priority_recommendation === true,
          reasons,
          completeness: calculateProfileCompleteness(member, age !== null),
          profile_image: resolveProfileImageUrl(member.profile_image),
        };
      })
    const selectedCandidates = selectRecommendationCandidates(scoredCandidates, mode);

    const toBaseRecommendation = (member: typeof selectedCandidates[number]): BaseRecommendedMember => ({
      id: member.id,
      nickname: member.nickname,
      gender: member.gender,
      height: member.height,
      region: member.region,
      job: member.job,
      introduction: member.introduction,
      profile_image: member.profile_image,
      age: member.age,
      score: member.score,
      reasons: member.reasons,
      completeness: member.completeness,
    });

    if (expandedRequested) {
      const recommendations: PremiumRecommendedMember[] = selectedCandidates.map((member) => ({
        ...toBaseRecommendation(member),
        ...getAdvancedRecommendationAnalysis(currentProfile, member, preference, member.age),
      }));

      return jsonResponse({
        status: 'ready',
        mode: 'premium-expanded',
        currentUserId: user.id,
        hasEnteredPreference,
        recommendations,
      });
    }

    const recommendations = selectedCandidates.map(toBaseRecommendation);

    return jsonResponse({
      status: 'ready',
      mode: 'base',
      currentUserId: user.id,
      hasEnteredPreference,
      recommendations,
    });
  } catch (error: unknown) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : null;
    console.error('AI 추천 API 처리 실패:', { code: errorCode });
    return jsonResponse({ error: 'Unable to load recommendations.' }, 500);
  }
}
