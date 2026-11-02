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

const onboardingTitle = '프로필을 작성하고 새로운 인연을 만나보세요';
const onboardingDescription = '아직 프로필이 등록되지 않았습니다. 닉네임, 성별, 생년월일 등 기본 정보부터 입력해 보세요.';
const walkElements = (value, predicate, found = []) => {
  if (Array.isArray(value)) value.forEach((child) => walkElements(child, predicate, found));
  else if (value && typeof value === 'object') {
    if (typeof value.type === 'function') walkElements(value.type(value.props), predicate, found);
    else {
      if (predicate(value)) found.push(value);
      walkElements(value.props?.children, predicate, found);
    }
  }
  return found;
};
const pageText = (value) => {
  if (Array.isArray(value)) return value.map(pageText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return typeof value.type === 'function' ? pageText(value.type(value.props)) : pageText(value.props?.children);
};

// Exercise the actual page effects and re-render their state using isolated,
// in-memory Supabase responses. No real auth, database or timers are used.
const createPageHarness = (page, {
  profile = null, profileError = null, profileThrows = false, profilePromise,
  members = [], listError = null, advancedError = null, advancedThrows = false,
  advancedMembers = [], canUseAdvancedSearch = true, user = { id: 'fixture-user' },
} = {}) => {
  const states = [], dependencies = [], cleanups = [], pendingEffects = [], calls = [], redirects = [];
  const timers = new Map();
  let slot = 0, timerId = 0;
  const hooks = {
    ...reactStub,
    default: {},
    useState(initial) {
      const index = slot++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = slot++;
      return states[index] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const index = slot++;
      if (!dependencies[index] || deps.some((dep, i) => !Object.is(dep, dependencies[index][i]))) {
        dependencies[index] = deps;
        pendingEffects.push(() => { cleanups[index]?.(); cleanups[index] = effect(); });
      }
    },
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      calls.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          if (profileThrows) throw new Error('profile network failure');
          return profilePromise ? await profilePromise : { data: profile, error: profileError };
        },
        then: (resolveResult) => Promise.resolve({ data: [], count: 0, error: null }).then(resolveResult),
      };
      return query;
    },
    async rpc(name) {
      calls.push(name);
      if (name === 'get_visible_member_summaries') return { data: members, error: listError };
      if (name === 'search_members_advanced') {
        if (advancedThrows) throw new Error('advanced network failure');
        return { data: advancedMembers, error: advancedError };
      }
      return { data: name === 'get_my_premium_access' ? [{ is_available: false }] : [], error: null };
    },
  };
  const pageModule = loadModule(page === 'dashboard' ? 'app/(main)/dashboard/page.tsx' : 'app/(main)/members/members-client.tsx', {
    ...uiStubs,
    react: hooks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => router },
    '@/components/ui/Button': { __esModule: true, default: ({ children, ...props }) => jsx('button', { ...props, children }) },
    '@/lib/supabase/client': { createClient: () => supabase },
    '@/lib/profile-image': { ...uiStubs['@/lib/profile-image'], resolveProfileImagePath: (value) => value },
    '@/lib/profile-image-batch': { getProfileImageDisplayUrl: () => null },
    '@/lib/use-profile-image-batch': { useProfileImageBatchUrls: () => null },
    '@/lib/member/advanced-search-parser': loadModule('lib/member/advanced-search-parser.ts', {
      '@/lib/profile-image': loadModule('lib/profile-image.ts', {}, { process: { env: {} } }),
    }),
    '@/constants/regions': { REGIONS: ['상관없음'] },
    '@/constants/jobs': { JOBS: ['상관없음'], STANDARD_JOB_VALUES: [] },
  }, {
    console: { error() {} },
    window: { setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); } },
  });
  let router = { replace: (path) => redirects.push(path), push: (path) => redirects.push(path) };
  let tree;
  const render = () => { slot = 0; tree = pageModule.default({ canUseAdvancedSearch, initialAdvancedOpen: true }); return tree; };
  const flush = async () => {
    for (const effect of pendingEffects.splice(0)) effect();
    await new Promise((resolveTurn) => setImmediate(resolveTurn));
    render();
  };
  const change = (placeholder, value) => {
    const input = walkElements(tree, (node) => node.props?.placeholder === placeholder)[0];
    assert.ok(input, placeholder + ' input');
    input.props.onChange({ target: { value } });
    render();
  };
  return { render, flush, change, calls, redirects, get tree() { return tree; },
    async recheckProfile(promise) { profilePromise = promise; router = { ...router }; render(); await flush(); await flush(); },
    async runTimers() {
    for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    await new Promise((resolveTurn) => setImmediate(resolveTurn));
    render();
  } };
};

const assertOnboarding = (tree) => {
  const text = pageText(tree);
  assert.ok(text.includes(onboardingTitle));
  assert.ok(text.includes(onboardingDescription));
  const link = walkElements(tree, (node) => node.type === 'a' && pageText(node).trim() === '프로필 작성 시작하기');
  assert.equal(link.length, 1);
  assert.equal(link[0].props.href, '/profile/create');
};

test('dashboard shows onboarding only after a successful missing-profile response and preserves activity links', async () => {
  const h = createPageHarness('dashboard');
  assert.ok(!pageText(h.render()).includes(onboardingTitle));
  await h.flush();
  assertOnboarding(h.tree);
  for (const href of ['/ai-match', '/favorites', '/matches', '/members', '/preference']) {
    assert.ok(walkElements(h.tree, (node) => node.type === 'a' && node.props.href === href).length, href);
  }
  assert.equal(h.calls.filter((name) => name === 'profiles').length, 1);
});

test('dashboard preserves low and zero completeness profiles and never labels a failed lookup as missing', async () => {
  for (const profile of [{}, { nickname: '기존회원', gender: '남성', birth_date: '1990-01-01' }]) {
    const h = createPageHarness('dashboard', { profile }); h.render(); await h.flush();
    assert.ok(!pageText(h.tree).includes(onboardingTitle));
    assert.ok(pageText(h.tree).includes('프로필을 조금만 더 작성하면 더 좋은 추천을 받을 수 있습니다.'));
  }
  for (const options of [{ profileError: { message: 'offline' } }, { profileThrows: true }]) {
    const h = createPageHarness('dashboard', options); h.render(); await h.flush();
    assert.ok(!pageText(h.tree).includes(onboardingTitle));
    assert.ok(pageText(h.tree).includes('프로필 정보를 확인할 수 없습니다.'));
  }
});

test('members missing-profile onboarding skips list, favorites and advanced requests', async () => {
  const h = createPageHarness('members'); h.render(); await h.flush();
  assertOnboarding(h.tree);
  assert.ok(pageText(h.tree).includes('회원 둘러보기'));
  assert.equal(walkElements(h.tree, (node) => node.type === 'input').length, 0);
  await h.runTimers();
  assert.deepEqual(h.calls, ['profiles']);
});

const memberFixture = { id: '00000000-0000-4000-8000-000000000002', nickname: '후보회원', age: 30,
  gender: '여성', region: '서울', job: '연구원', introduction: '', profile_image: null };

test('members preserve normal cards, filters, favorites and advanced search for an existing profile', async () => {
  const h = createPageHarness('members', { profile: { gender: '남성' }, members: [memberFixture], advancedMembers: [memberFixture] });
  h.render(); await h.flush();
  assert.ok(pageText(h.tree).includes('후보회원'));
  assert.ok(h.calls.includes('favorites'));
  h.change('닉네임으로 검색하세요', '없는이름');
  assert.ok(pageText(h.tree).includes('검색 결과가 없습니다.'));
  h.change('닉네임으로 검색하세요', '');
  h.change('최소 키', '160'); await h.flush(); await h.runTimers();
  assert.ok(h.calls.includes('search_members_advanced'));
  assert.ok(pageText(h.tree).includes('후보회원'));
  assert.ok(!pageText(h.tree).includes(onboardingTitle));
});

test('members distinguish a missing profile from an existing null-gender profile and an empty member list', async () => {
  for (const profile of [{ gender: null }, { gender: '남성' }]) {
    const h = createPageHarness('members', { profile }); h.render(); await h.flush();
    assert.ok(!pageText(h.tree).includes(onboardingTitle));
    assert.ok(h.calls.includes('get_visible_member_summaries'));
    assert.ok(pageText(h.tree).includes('아직 등록된 회원이 없습니다.'));
  }
});

test('members keep profile and list errors separate from missing-profile onboarding', async () => {
  for (const options of [{ profileError: { message: 'offline' } }, { profileThrows: true },
    { profile: { gender: '남성' }, listError: { code: '42501' } }]) {
    const h = createPageHarness('members', options); h.render(); await h.flush();
    assert.ok(pageText(h.tree).includes('회원 목록을 불러오는 중 오류가 발생했습니다.'));
    assert.ok(!pageText(h.tree).includes(onboardingTitle));
    if (!options.listError) {
      h.change('최소 키', '160'); await h.flush(); await h.runTimers();
      assert.deepEqual(h.calls, ['profiles']);
    }
  }
});

test('members defer advanced search while the profile lookup is pending', async () => {
  let resolveProfile;
  const h = createPageHarness('members', { profile: { gender: '남성' }, members: [memberFixture] });
  h.render(); await h.flush();
  h.change('최소 키', '160'); await h.flush();
  await h.recheckProfile(new Promise((resolveResult) => { resolveProfile = resolveResult; }));
  await h.runTimers();
  assert.ok(pageText(h.tree).includes('회원 목록을 불러오는 중...'));
  assert.ok(!h.calls.includes('search_members_advanced'));
  resolveProfile({ data: null, error: null }); await h.flush(); await h.runTimers();
  assertOnboarding(h.tree);
  assert.ok(!h.calls.includes('search_members_advanced'));
});

test('members preserve advanced RPC and network errors with retry and the Premium gate', async () => {
  for (const options of [{ advancedError: { code: '42501' } }, { advancedThrows: true }]) {
    const h = createPageHarness('members', { profile: { gender: '남성' }, members: [memberFixture], ...options });
    h.render(); await h.flush(); h.change('최소 키', '160'); await h.flush(); await h.runTimers();
    assert.ok(pageText(h.tree).includes('고급 검색 결과를 불러오지 못했습니다.'));
    const retry = walkElements(h.tree, (node) => node.type === 'button' && pageText(node) === '다시 시도')[0];
    assert.ok(retry); retry.props.onClick(); h.render(); await h.flush(); await h.runTimers();
    assert.equal(h.calls.filter((name) => name === 'search_members_advanced').length, 2);
  }
  const h = createPageHarness('members', { profile: { gender: '남성' }, canUseAdvancedSearch: false });
  h.render(); await h.flush(); h.change('최소 키', '160'); await h.flush(); await h.runTimers();
  assert.ok(!h.calls.includes('search_members_advanced'));
});

test('anonymous pages retain login navigation without onboarding or member queries', async () => {
  for (const page of ['dashboard', 'members']) {
    const h = createPageHarness(page, { user: null }); h.render(); await h.flush();
    assert.deepEqual(h.redirects, ['/login']);
    assert.deepEqual(h.calls, []);
    assert.ok(!pageText(h.tree).includes(onboardingTitle));
  }
});

test('existing server access guards retain login, consent and suspension destinations', async () => {
  for (const [kind, destination] of [['anonymous', '/login'], ['error', '/account-suspended'],
    ['suspended', '/account-suspended'], ['consent_required', '/consent'], ['allowed', null]]) {
    const accessModule = loadModule('lib/member/access.ts', {
      'server-only': {},
      'next/navigation': { redirect: (path) => { throw new Error(path); } },
      '@/lib/supabase/server': { createServerSupabaseClient: async () => ({
        auth: { getUser: async () => ({ data: { user: kind === 'anonymous' ? null : { id: 'fixture-user' } }, error: null }) },
        rpc: async () => ({ data: [], error: kind === 'error' ? {} : null }),
      }) },
      '@/lib/member/access-parser': { parseMemberAccessRpcResponse: () => ({ isAllowed: kind !== 'suspended' }) },
      '@/lib/consent/server': {
        getCurrentConsentStatus: async () => ({ kind: 'valid', user: { createdAt: '' }, latestByType: {} }),
        assessConsentAccess: () => ({ canAccess: kind !== 'consent_required' }),
      },
    });
    if (destination) await assert.rejects(accessModule.requireMemberServiceAccess(), { message: destination });
    else assert.equal((await accessModule.requireMemberServiceAccess()).isAllowed, true);
  }
});
