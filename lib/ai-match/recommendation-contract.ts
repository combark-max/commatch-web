export type RecommendationMode = 'base' | 'premium-expanded';

export const BASE_RECOMMENDATION_LIMIT = 10;
export const PREMIUM_RECOMMENDATION_LIMIT = 20;

export type PreferenceMatchStatus =
  | 'match'
  | 'mismatch'
  | 'preference-missing'
  | 'member-missing';

export type PreferenceMatchResult = {
  label: '희망 연령' | '희망 키' | '선호 지역' | '선호 직업';
  status: PreferenceMatchStatus;
  detail: string;
};

export type BaseRecommendedMember = {
  id: string;
  nickname: string | null;
  gender: string | null;
  height: number | null;
  region: string | null;
  job: string | null;
  introduction: string | null;
  profile_image: string | null;
  age: number | null;
  score: number;
  reasons: string[];
  completeness: number;
};

export type PremiumRecommendationAnalysis = {
  preferenceMatches: PreferenceMatchResult[];
  preferenceMatchRate: number | null;
  matchedPreferenceCount: number;
  enteredPreferenceCount: number;
  commonPoints: string[];
  recommendationReason: string | null;
  considerations: string[];
  dataNote?: string;
};

export type PremiumRecommendedMember = BaseRecommendedMember & PremiumRecommendationAnalysis;

type RecommendationSetupResponse = {
  status: 'setup';
  mode: RecommendationMode;
  currentUserId: string;
  hasEnteredPreference: boolean;
  setupTarget: 'profile' | 'profile-incomplete' | 'preference';
};

type BaseRecommendationReadyResponse = {
  status: 'ready';
  mode: 'base';
  currentUserId: string;
  hasEnteredPreference: boolean;
  recommendations: BaseRecommendedMember[];
};

type PremiumRecommendationReadyResponse = {
  status: 'ready';
  mode: 'premium-expanded';
  currentUserId: string;
  hasEnteredPreference: boolean;
  recommendations: PremiumRecommendedMember[];
};

export type RecommendationApiResponse =
  | RecommendationSetupResponse
  | BaseRecommendationReadyResponse
  | PremiumRecommendationReadyResponse;

export type RecommendationRequest =
  | { mode: 'base'; expandedRequested: false }
  | { mode: 'premium-expanded'; expandedRequested: true };

type ScoredRecommendationCandidate = {
  id: string;
  score: number;
  isPriorityRecommendation: boolean;
};

export const selectRecommendationCandidates = <Candidate extends ScoredRecommendationCandidate>(
  candidates: Candidate[],
  mode: RecommendationMode,
): Candidate[] => [...candidates]
  .filter((candidate) => candidate.score > 0)
  .sort((a, b) => (
    b.score - a.score
    || Number(b.isPriorityRecommendation) - Number(a.isPriorityRecommendation)
    || a.id.localeCompare(b.id)
  ))
  .slice(0, mode === 'premium-expanded'
    ? PREMIUM_RECOMMENDATION_LIMIT
    : BASE_RECOMMENDATION_LIMIT);

const PREMIUM_ANALYSIS_FIELDS = [
  'preferenceMatches',
  'preferenceMatchRate',
  'matchedPreferenceCount',
  'enteredPreferenceCount',
  'commonPoints',
  'recommendationReason',
  'considerations',
  'dataNote',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFERENCE_LABELS = ['희망 연령', '희망 키', '선호 지역', '선호 직업'] as const;
const PREFERENCE_STATUSES = ['match', 'mismatch', 'preference-missing', 'member-missing'] as const;
const SETUP_TARGETS = ['profile', 'profile-incomplete', 'preference'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isUuid = (value: unknown): value is string => (
  typeof value === 'string' && UUID_PATTERN.test(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isNullableNumber = (value: unknown): value is number | null => (
  value === null || (typeof value === 'number' && Number.isFinite(value))
);

const isIntegerInRange = (value: unknown, minimum: number, maximum: number): value is number => (
  typeof value === 'number'
  && Number.isInteger(value)
  && value >= minimum
  && value <= maximum
);

const parseStringArray = (value: unknown, maximumLength?: number): string[] | null => {
  if (!Array.isArray(value) || (maximumLength !== undefined && value.length > maximumLength)) return null;
  return value.every((entry) => typeof entry === 'string') ? [...value] : null;
};

const hasOwn = (value: Record<string, unknown>, key: string) => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const parseBaseRecommendedMember = (
  value: unknown,
  rejectPremiumFields: boolean,
): BaseRecommendedMember | null => {
  if (!isRecord(value)) return null;
  if (rejectPremiumFields && PREMIUM_ANALYSIS_FIELDS.some((field) => hasOwn(value, field))) return null;

  const reasons = parseStringArray(value.reasons, 3);
  if (
    !isUuid(value.id)
    || !isNullableString(value.nickname)
    || !isNullableString(value.gender)
    || !isNullableNumber(value.height)
    || !isNullableString(value.region)
    || !isNullableString(value.job)
    || !isNullableString(value.introduction)
    || !isNullableString(value.profile_image)
    || !isNullableNumber(value.age)
    || !isIntegerInRange(value.score, 1, 4)
    || reasons === null
    || !isIntegerInRange(value.completeness, 0, 100)
  ) return null;

  return {
    id: value.id,
    nickname: value.nickname,
    gender: value.gender,
    height: value.height,
    region: value.region,
    job: value.job,
    introduction: value.introduction,
    profile_image: value.profile_image,
    age: value.age,
    score: value.score,
    reasons,
    completeness: value.completeness,
  };
};

const parsePreferenceMatches = (value: unknown): PreferenceMatchResult[] | null => {
  if (!Array.isArray(value) || value.length !== PREFERENCE_LABELS.length) return null;

  const matches: PreferenceMatchResult[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry)
      || !PREFERENCE_LABELS.includes(entry.label as PreferenceMatchResult['label'])
      || !PREFERENCE_STATUSES.includes(entry.status as PreferenceMatchStatus)
      || typeof entry.detail !== 'string'
    ) return null;

    matches.push({
      label: entry.label as PreferenceMatchResult['label'],
      status: entry.status as PreferenceMatchStatus,
      detail: entry.detail,
    });
  }

  return new Set(matches.map(({ label }) => label)).size === PREFERENCE_LABELS.length
    ? matches
    : null;
};

const parsePremiumRecommendedMember = (value: unknown): PremiumRecommendedMember | null => {
  const baseMember = parseBaseRecommendedMember(value, false);
  if (!baseMember || !isRecord(value)) return null;

  const preferenceMatches = parsePreferenceMatches(value.preferenceMatches);
  const commonPoints = parseStringArray(value.commonPoints);
  const considerations = parseStringArray(value.considerations);
  if (
    preferenceMatches === null
    || commonPoints === null
    || considerations === null
    || !(value.preferenceMatchRate === null
      || isIntegerInRange(value.preferenceMatchRate, 0, 100))
    || !isIntegerInRange(value.matchedPreferenceCount, 0, PREFERENCE_LABELS.length)
    || !isIntegerInRange(value.enteredPreferenceCount, 0, PREFERENCE_LABELS.length)
    || value.matchedPreferenceCount > value.enteredPreferenceCount
    || !isNullableString(value.recommendationReason)
    || !(value.dataNote === undefined || typeof value.dataNote === 'string')
  ) return null;

  const enteredCount = preferenceMatches.filter(({ status }) => status !== 'preference-missing').length;
  const matchedCount = preferenceMatches.filter(({ status }) => status === 'match').length;
  const expectedRate = enteredCount > 0 ? Math.round((matchedCount / enteredCount) * 100) : null;
  if (
    value.enteredPreferenceCount !== enteredCount
    || value.matchedPreferenceCount !== matchedCount
    || value.preferenceMatchRate !== expectedRate
  ) return null;

  return {
    ...baseMember,
    preferenceMatches,
    preferenceMatchRate: value.preferenceMatchRate,
    matchedPreferenceCount: value.matchedPreferenceCount,
    enteredPreferenceCount: value.enteredPreferenceCount,
    commonPoints,
    recommendationReason: value.recommendationReason,
    considerations,
    ...(value.dataNote === undefined ? {} : { dataNote: value.dataNote }),
  };
};

export const parseRecommendationApiResponse = (value: unknown): RecommendationApiResponse | null => {
  if (
    !isRecord(value)
    || !isUuid(value.currentUserId)
    || typeof value.hasEnteredPreference !== 'boolean'
    || (value.mode !== 'base' && value.mode !== 'premium-expanded')
  ) return null;

  if (value.status === 'setup') {
    if (!SETUP_TARGETS.includes(value.setupTarget as RecommendationSetupResponse['setupTarget'])) return null;
    return {
      status: 'setup',
      mode: value.mode,
      currentUserId: value.currentUserId,
      hasEnteredPreference: value.hasEnteredPreference,
      setupTarget: value.setupTarget as RecommendationSetupResponse['setupTarget'],
    };
  }

  if (value.status !== 'ready' || !Array.isArray(value.recommendations)) return null;

  if (value.mode === 'base') {
    if (value.recommendations.length > BASE_RECOMMENDATION_LIMIT) return null;
    const recommendations: BaseRecommendedMember[] = [];
    for (const member of value.recommendations) {
      const parsedMember = parseBaseRecommendedMember(member, true);
      if (!parsedMember) return null;
      recommendations.push(parsedMember);
    }
    return {
      status: 'ready',
      mode: 'base',
      currentUserId: value.currentUserId,
      hasEnteredPreference: value.hasEnteredPreference,
      recommendations,
    };
  }

  if (value.recommendations.length > PREMIUM_RECOMMENDATION_LIMIT) return null;
  const recommendations: PremiumRecommendedMember[] = [];
  for (const member of value.recommendations) {
    const parsedMember = parsePremiumRecommendedMember(member);
    if (!parsedMember) return null;
    recommendations.push(parsedMember);
  }
  return {
    status: 'ready',
    mode: 'premium-expanded',
    currentUserId: value.currentUserId,
    hasEnteredPreference: value.hasEnteredPreference,
    recommendations,
  };
};

export const parseRecommendationApiSearchParams = (
  searchParams: URLSearchParams,
): RecommendationRequest | null => {
  if ([...searchParams.keys()].some((key) => key !== 'expanded')) return null;

  const expandedValues = searchParams.getAll('expanded');
  if (expandedValues.length === 0) return { mode: 'base', expandedRequested: false };
  if (expandedValues.length === 1 && expandedValues[0] === '1') {
    return { mode: 'premium-expanded', expandedRequested: true };
  }
  return null;
};

export const getRecommendationApiUrlForPage = (searchParams: URLSearchParams): string => {
  const expandedValues = searchParams.getAll('expanded');
  if (expandedValues.length === 0) return '/api/ai-match/recommendations';

  const apiSearchParams = new URLSearchParams();
  expandedValues.forEach((value) => apiSearchParams.append('expanded', value));
  return `/api/ai-match/recommendations?${apiSearchParams.toString()}`;
};
