import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '..');

const loadModule = (relativePath, requireOverrides = {}, globals = {}, exposedNames = []) => {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, 'utf8');
  const testSource = exposedNames.length > 0
    ? `${source}\nexport { ${exposedNames.join(', ')} };\n`
    : source;
  const compiled = ts.transpileModule(testSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  const context = vm.createContext({
    ...globals,
    console: globals.console ?? console,
    exports: loadedModule.exports,
    module: loadedModule,
    require: (specifier) => {
      if (specifier in requireOverrides) return requireOverrides[specifier];
      throw new Error(`Unexpected require: ${specifier}`);
    },
  });
  const wrapper = new vm.Script(`(function (exports, require, module, __filename, __dirname) { ${compiled}\n})`, {
    filename,
  }).runInContext(context);
  wrapper(loadedModule.exports, context.require, loadedModule, filename, dirname(filename));
  return loadedModule.exports;
};

const icon = () => null;
const jsx = (type, props) => ({ type, props: props ?? {} });
const reactStub = {
  default: {},
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
};
const uiStubs = {
  react: reactStub,
  'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
  'next/link': { __esModule: true, default: icon },
  'next/navigation': { usePathname: () => '/', useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
  'react-hook-form': { useForm: () => ({}) },
  '@hookform/resolvers/zod': { zodResolver: (schema) => schema },
  zod: await import('zod'),
  'lucide-react': new Proxy({}, { get: () => icon }),
  '@/components/ui/Button': { __esModule: true, default: icon },
  '@/components/ui/Toast': { __esModule: true, default: icon },
  '@/components/common/ImageModal': { __esModule: true, default: icon },
  '@/components/common/profile-image-interaction': {
    PROFILE_IMAGE_INTERACTION_CLASS: '',
    preventProfileImageContextMenu() {},
    profileImageInteractionProps: {},
  },
  '@/lib/supabase/client': { createClient: () => ({}) },
  '@/lib/profile-image': {
    getProfileImageUrl: (value) => value,
    normalizeProfileImagePath: (value) => value,
    resolveProfileImageUrl: (value) => value,
  },
  '@/constants/regions': { normalizeRegion: (value) => value ?? '', PROFILE_REGIONS: [] },
  '@/constants/jobs': { PROFILE_JOBS: [], STANDARD_JOB_VALUES: [] },
  '@/lib/auth/auth': { signOut: async () => ({ error: null }) },
};

const profileModule = loadModule('app/(main)/profile/create/page.tsx', uiStubs, {
  Blob,
  Date,
  File: class File {},
  URL,
  setTimeout,
}, ['profileSchema', 'buildProfilePayload', 'calculateProfileFormCompleteness']);

const minimalForm = {
  nickname: '테스터',
  gender: '남성',
  birth_date: '1990-01-01',
  height: '',
  region: '',
  job: '',
  job_other: '',
  education: '',
  hobby: '',
  drinking: '',
  smoking: '',
  marriage_history: '',
  marriage_values: '',
  introduction: '',
};

test('profile schema accepts only the three required fields and validates optional values when supplied', () => {
  const { profileSchema } = profileModule;
  assert.ok(profileSchema, 'profileSchema must be exported for behavior verification');

  assert.equal(profileSchema.safeParse(minimalForm).success, true);
  assert.equal(profileSchema.safeParse({ ...minimalForm, height: '170' }).success, true);
  assert.equal(profileSchema.safeParse({ ...minimalForm, height: '0' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, height: '-1' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, height: '170.5' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, job_other: '' }).success, true);
  assert.equal(profileSchema.safeParse({ ...minimalForm, job: '기타', job_other: '' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, job: '기타', job_other: '연구원' }).success, true);
  assert.equal(profileSchema.safeParse({ ...minimalForm, introduction: '123456789' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, introduction: '1234567890' }).success, true);
  assert.equal(profileSchema.safeParse({ ...minimalForm, marriage_values: '123456789' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, marriage_values: '1234567890' }).success, true);
});

test('profile schema keeps nickname, gender, birth date, and adult validation required', () => {
  const { profileSchema } = profileModule;
  assert.ok(profileSchema);
  assert.equal(profileSchema.safeParse({ ...minimalForm, nickname: '' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, gender: undefined }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, birth_date: '' }).success, false);
  assert.equal(profileSchema.safeParse({ ...minimalForm, birth_date: '2015-01-01' }).success, false);
});

test('profile payload stores empty optional values as explicit nulls and preserves the empty photo structure', () => {
  const { buildProfilePayload } = profileModule;
  assert.equal(typeof buildProfilePayload, 'function');

  const payload = buildProfilePayload('user-1', minimalForm, []);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    id: 'user-1',
    nickname: '테스터',
    gender: '남성',
    birth_date: '1990-01-01',
    height: null,
    region: null,
    job: null,
    education: null,
    hobby: null,
    drinking: null,
    smoking: null,
    marriage_history: null,
    marriage_values: null,
    introduction: null,
    profile_image: null,
    profile_images: [],
  });
});

test('profile payload converts valid height and other job while treating legacy missing sentinels as null', () => {
  const { buildProfilePayload } = profileModule;
  assert.equal(typeof buildProfilePayload, 'function');

  const payload = buildProfilePayload('user-1', {
    ...minimalForm,
    height: '171',
    job: '기타',
    job_other: '연구원',
    drinking: '미입력',
    smoking: '공개하지 않음',
  }, ['user-1/main.jpg']);

  assert.equal(payload.height, 171);
  assert.equal(payload.job, '연구원');
  assert.equal(payload.drinking, null);
  assert.equal(payload.smoking, '공개하지 않음');
  assert.equal(payload.profile_image, 'user-1/main.jpg');
  assert.deepEqual(Array.from(payload.profile_images), ['user-1/main.jpg']);
});

test('profile-create completeness stays at 14 fields, excludes legacy missing, and counts explicit privacy', () => {
  const { calculateProfileFormCompleteness } = profileModule;
  assert.equal(typeof calculateProfileFormCompleteness, 'function');

  const complete = calculateProfileFormCompleteness({
    ...minimalForm,
    height: '171',
    region: '서울',
    job: '연구원',
    education: '대졸',
    hobby: '산책',
    drinking: '가끔 함',
    smoking: '공개하지 않음',
    marriage_history: 'first_marriage',
    marriage_values: '1234567890',
    introduction: '1234567890',
  }, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(complete)), { completedFieldCount: 14, profileCompletion: 100 });

  const incomplete = calculateProfileFormCompleteness({ ...minimalForm, smoking: '미입력' }, 0);
  assert.ok(incomplete.profileCompletion < 100);
  assert.equal(incomplete.completedFieldCount, 3);
});

const dashboardModule = loadModule(
  'app/(main)/dashboard/page.tsx',
  uiStubs,
  {},
  ['calculateProfileCompleteness'],
);

test('dashboard completeness excludes legacy missing but counts explicit privacy', () => {
  const { calculateProfileCompleteness } = dashboardModule;
  assert.equal(typeof calculateProfileCompleteness, 'function');
  const base = {
    nickname: '테스터', gender: '남성', birth_date: '1990-01-01', height: 171,
    region: '서울', job: '연구원', education: '대졸', hobby: '산책', drinking: '가끔 함',
    smoking: '공개하지 않음', marriage_history: 'first_marriage', introduction: '1234567890',
    marriage_values: '1234567890', profile_image: 'main.jpg', profile_images: ['main.jpg'],
  };
  assert.equal(calculateProfileCompleteness(base), 100);
  assert.equal(calculateProfileCompleteness({ ...base, smoking: '미입력' }), 93);
});

const detailModule = loadModule('app/(main)/members/[id]/page.tsx', {
  ...uiStubs,
  '@/components/reports/ReportDialog': { __esModule: true, default: icon },
}, {}, ['getProfileDisplayValue']);

test('member detail displays missing values and explicit privacy distinctly', () => {
  const { getProfileDisplayValue } = detailModule;
  assert.equal(typeof getProfileDisplayValue, 'function');
  assert.equal(getProfileDisplayValue(null), '미입력');
  assert.equal(getProfileDisplayValue(''), '미입력');
  assert.equal(getProfileDisplayValue('미입력'), '미입력');
  assert.equal(getProfileDisplayValue('공개하지 않음'), '공개하지 않음');
  assert.equal(getProfileDisplayValue('  비흡연  '), '비흡연');
});

const createAiHarness = ({
  profile,
  candidates = [],
  expandedRequested = false,
  premiumAccess = { status: 'allowed', allowed: true },
  preference = {
    age_min: null,
    age_max: null,
    height_min: null,
    height_max: null,
    preferred_region: null,
    preferred_job: null,
  },
}) => {
  const rpcCalls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === 'profiles'
            ? { data: profile, error: null }
            : { data: preference, error: null },
        }),
      }),
    }),
    rpc: async (name) => {
      rpcCalls.push(name);
      return { data: candidates, error: null };
    },
  };
  const routeModule = loadModule('app/api/ai-match/recommendations/route.ts', {
    'next/server': {
      NextResponse: {
        json: (body, init) => new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: init?.headers,
        }),
      },
    },
    '@/constants/jobs': { STANDARD_JOB_VALUES: [] },
    '@/lib/ai-match/recommendation-contract': {
      parseRecommendationApiSearchParams: () => ({
        expandedRequested,
        mode: expandedRequested ? 'premium-expanded' : 'base',
      }),
      selectRecommendationCandidates: (members) => members,
    },
    '@/lib/premium/server': { getPremiumFeatureAccess: async () => premiumAccess },
    '@/lib/profile-image': { resolveProfileImageUrl: (value) => value },
    '@/lib/supabase/server': { createServerSupabaseClient: async () => supabase },
    '@/lib/member/access': { getCurrentMemberServiceAccess: async () => ({ kind: 'allowed', access: {} }) },
  }, { Response, URL, console: { error() {} } }, [
    'calculateProfileCompleteness',
    'hasMinimumAiProfile',
  ]);
  return { module: routeModule, rpcCalls };
};

test('AI recommendations allow a low-completeness profile that meets the minimum profile contract', async () => {
  const harness = createAiHarness({
    profile: {
      id: 'user-1', nickname: '테스터', gender: '남성', birth_date: '1990-01-01',
      height: null, region: null, job: null, education: null, hobby: null, drinking: null,
      smoking: null, marriage_history: null, introduction: null, marriage_values: null,
      profile_image: null, profile_images: [],
    },
  });

  const response = await harness.module.GET({ nextUrl: new URL('https://example.com/api/ai-match/recommendations') });
  const body = JSON.parse(await response.text());
  assert.equal(body.status, 'ready');
  assert.deepEqual(harness.rpcCalls, ['get_ai_match_candidates']);
});

test('AI recommendations retain an adult score-zero candidate and reject invalid candidate profiles', async () => {
  const candidateBase = {
    height: null,
    region: null,
    job: null,
    education: null,
    hobby: null,
    drinking: null,
    smoking: null,
    marriage_history: null,
    introduction: null,
    marriage_values: null,
    profile_image: null,
    profile_images: [],
    is_priority_recommendation: false,
  };
  const harness = createAiHarness({
    profile: {
      id: 'user-1', nickname: '테스트', gender: '남성', birth_date: '1990-01-01',
      ...candidateBase,
    },
    candidates: [
      { ...candidateBase, id: '00000000-0000-4000-8000-000000000001', nickname: '성인', gender: '여성', age: 30 },
      { ...candidateBase, id: '00000000-0000-4000-8000-000000000002', nickname: '', gender: '여성', age: 30 },
      { ...candidateBase, id: '00000000-0000-4000-8000-000000000003', nickname: '성별오류', gender: '기타', age: 30 },
      { ...candidateBase, id: '00000000-0000-4000-8000-000000000004', nickname: '나이없음', gender: '여성', age: null },
      { ...candidateBase, id: '00000000-0000-4000-8000-000000000005', nickname: '미성년', gender: '여성', age: 18 },
    ],
  });

  const response = await harness.module.GET({ nextUrl: new URL('https://example.com/api/ai-match/recommendations') });
  const body = JSON.parse(await response.text());
  assert.equal(body.status, 'ready');
  assert.deepEqual(body.recommendations.map(({ id }) => id), [
    '00000000-0000-4000-8000-000000000001',
  ]);
  assert.equal(body.recommendations[0].score, 0);
});

test('Premium recommendation access still requires the expanded recommendations entitlement', async () => {
  const harness = createAiHarness({
    profile: null,
    expandedRequested: true,
    premiumAccess: { status: 'forbidden', allowed: false },
  });

  const response = await harness.module.GET({ nextUrl: new URL('https://example.com/api/ai-match/recommendations?expanded=1') });
  assert.equal(response.status, 403);
  assert.deepEqual(harness.rpcCalls, []);
});

test('AI minimum profile contract rejects missing or invalid required profile data', () => {
  const harness = createAiHarness({ profile: null });
  const { hasMinimumAiProfile } = harness.module;
  assert.equal(typeof hasMinimumAiProfile, 'function');
  const valid = { id: 'user-1', nickname: '테스터', gender: '남성', birth_date: '1990-01-01' };
  assert.equal(hasMinimumAiProfile(valid), true);
  assert.equal(hasMinimumAiProfile(null), false);
  assert.equal(hasMinimumAiProfile({ ...valid, nickname: '' }), false);
  assert.equal(hasMinimumAiProfile({ ...valid, gender: null }), false);
  assert.equal(hasMinimumAiProfile({ ...valid, gender: '기타' }), false);
  assert.equal(hasMinimumAiProfile({ ...valid, birth_date: null }), false);
  assert.equal(hasMinimumAiProfile({ ...valid, birth_date: '2015-01-01' }), false);
});

test('AI completeness excludes legacy missing but counts explicit privacy', () => {
  const harness = createAiHarness({ profile: null });
  const { calculateProfileCompleteness } = harness.module;
  assert.equal(typeof calculateProfileCompleteness, 'function');
  const profile = {
    id: 'candidate-1', nickname: '상대', gender: '여성', height: 165, region: '서울', job: '연구원',
    education: '대졸', hobby: '산책', drinking: '가끔 함', smoking: '공개하지 않음',
    marriage_history: 'first_marriage', introduction: '1234567890', marriage_values: '1234567890',
    profile_image: 'main.jpg', profile_images: ['main.jpg'],
  };
  assert.equal(calculateProfileCompleteness(profile, true), 100);
  assert.equal(calculateProfileCompleteness({ ...profile, drinking: '미입력' }, true), 93);
});
