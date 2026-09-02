import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecommendationApiUrlForPage,
  parseRecommendationApiResponse,
  parseRecommendationApiSearchParams,
  selectRecommendationCandidates,
} from './recommendation-contract.ts';

const CURRENT_USER_ID = '2ee0ea37-8c76-43d5-9c7e-4741b730d485';
const MEMBER_ID = '8c07687f-7b41-4777-a7ae-e0a6b0fc1380';

const baseMember = {
  id: MEMBER_ID,
  nickname: '테스트 회원',
  gender: '여성',
  height: 165,
  region: '서울',
  job: '회사원',
  introduction: null,
  profile_image: null,
  age: 36,
  score: 2,
  reasons: ['선호 지역과 일치해요', '선호 직업과 일치해요'],
  completeness: 90,
};

const premiumAnalysis = {
  preferenceMatches: [
    { label: '희망 연령', status: 'match', detail: '희망 연령 범위에 들어옵니다.' },
    { label: '희망 키', status: 'preference-missing', detail: '희망 키를 입력하지 않았습니다.' },
    { label: '선호 지역', status: 'match', detail: '선호 지역과 같습니다.' },
    { label: '선호 직업', status: 'mismatch', detail: '선호 직업과 다릅니다.' },
  ],
  preferenceMatchRate: 67,
  matchedPreferenceCount: 2,
  enteredPreferenceCount: 3,
  commonPoints: ['같은 지역입니다.'],
  recommendationReason: '입력한 선호조건 3개 중 2개가 일치합니다.',
  considerations: ['직업 조건은 직접 확인해 주세요.'],
  dataNote: '입력된 정보만 비교했습니다.',
};

test('base response accepts only the compact recommendation contract', () => {
  const parsed = parseRecommendationApiResponse({
    status: 'ready',
    mode: 'base',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: [baseMember],
  });

  assert.equal(parsed?.status, 'ready');
  assert.equal(parsed?.mode, 'base');
  assert.deepEqual(parsed?.recommendations, [baseMember]);
  assert.equal(Object.hasOwn(parsed?.recommendations[0] ?? {}, 'birth_date'), false);
});

test('base response fails closed if a Premium analysis field leaks into a row', () => {
  const parsed = parseRecommendationApiResponse({
    status: 'ready',
    mode: 'base',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: [{ ...baseMember, ...premiumAnalysis }],
  });

  assert.equal(parsed, null);
});

test('Premium response validates every detailed analysis field', () => {
  const parsed = parseRecommendationApiResponse({
    status: 'ready',
    mode: 'premium-expanded',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: [{ ...baseMember, ...premiumAnalysis }],
  });

  assert.equal(parsed?.status, 'ready');
  assert.equal(parsed?.mode, 'premium-expanded');
  assert.equal(parsed?.recommendations[0].preferenceMatchRate, 67);
});

test('one malformed Premium row rejects the complete response', () => {
  const malformedMember = {
    ...baseMember,
    ...premiumAnalysis,
    preferenceMatchRate: 66,
  };
  const parsed = parseRecommendationApiResponse({
    status: 'ready',
    mode: 'premium-expanded',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: [{ ...baseMember, ...premiumAnalysis }, malformedMember],
  });

  assert.equal(parsed, null);
});

test('response parser enforces the base and Premium result limits', () => {
  assert.equal(parseRecommendationApiResponse({
    status: 'ready',
    mode: 'base',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: Array.from({ length: 11 }, () => baseMember),
  }), null);

  assert.equal(parseRecommendationApiResponse({
    status: 'ready',
    mode: 'premium-expanded',
    currentUserId: CURRENT_USER_ID,
    hasEnteredPreference: true,
    recommendations: Array.from(
      { length: 21 },
      () => ({ ...baseMember, ...premiumAnalysis }),
    ),
  }), null);
});

test('API query contract allows only an absent flag or one expanded=1', () => {
  assert.deepEqual(
    parseRecommendationApiSearchParams(new URLSearchParams()),
    { mode: 'base', expandedRequested: false },
  );
  assert.deepEqual(
    parseRecommendationApiSearchParams(new URLSearchParams('expanded=1')),
    { mode: 'premium-expanded', expandedRequested: true },
  );

  for (const query of [
    'analysis=1',
    'expanded=0',
    'expanded=1&expanded=1',
    'expanded=1&limit=100',
    'count=20',
    'page=2',
  ]) {
    assert.equal(parseRecommendationApiSearchParams(new URLSearchParams(query)), null, query);
  }
});

test('page URL forwarding ignores the retired analysis flag', () => {
  assert.equal(
    getRecommendationApiUrlForPage(new URLSearchParams('analysis=1')),
    '/api/ai-match/recommendations',
  );
  assert.equal(
    getRecommendationApiUrlForPage(new URLSearchParams('expanded=1&analysis=1&member=abc')),
    '/api/ai-match/recommendations?expanded=1',
  );
});

test('candidate selection keeps score ahead of priority and excludes score zero', () => {
  const candidates = [
    { id: '00000000-0000-4000-8000-000000000004', score: 0, isPriorityRecommendation: true },
    { id: '00000000-0000-4000-8000-000000000003', score: 1, isPriorityRecommendation: true },
    { id: '00000000-0000-4000-8000-000000000002', score: 2, isPriorityRecommendation: false },
    { id: '00000000-0000-4000-8000-000000000001', score: 1, isPriorityRecommendation: false },
  ];

  assert.deepEqual(
    selectRecommendationCandidates(candidates, 'base').map(({ id }) => id),
    [candidates[2].id, candidates[1].id, candidates[3].id],
  );
});

test('candidate selection preserves base 10 and Premium 20 limits', () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    score: 1,
    isPriorityRecommendation: false,
  }));

  assert.equal(selectRecommendationCandidates(candidates, 'base').length, 10);
  assert.equal(selectRecommendationCandidates(candidates, 'premium-expanded').length, 20);
});
