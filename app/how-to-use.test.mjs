import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const projectRoot = resolve(import.meta.dirname, '..');

const jsx = (type, props) => ({ type, props: props ?? {} });

const loadModule = (relativePath, requireOverrides = {}, globals = {}) => {
  const filename = resolve(projectRoot, relativePath);
  const source = readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
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
    console,
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

const walk = (value, visit) => {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  walk(value.props?.children, visit);
};

const collectText = (value) => {
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return collectText(value.props?.children);
};

const publicPageStubs = {
  'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
  'next/link': { __esModule: true, default: 'a' },
  'lucide-react': new Proxy({}, { get: () => 'svg' }),
  '@/components/common/Hero': { __esModule: true, default: 'hero' },
  '@/components/common/Features': { __esModule: true, default: 'features' },
  '@/components/common/Footer': { __esModule: true, default: 'footer' },
};

test('home keeps the approved eight-step sequence and links to the detailed guide', () => {
  const home = loadModule('app/(main)/page.tsx', publicPageStubs);
  const tree = home.default();
  const text = collectText(tree);
  const hrefs = [];
  walk(tree, (node) => {
    if (typeof node.props?.href === 'string') hrefs.push(node.props.href);
  });

  const titles = ['회원가입', '프로필 작성', 'AI 분석', '추천 받기', '좋아요', '매칭', '채팅', '만남'];
  let lastIndex = -1;
  for (const title of titles) {
    const index = text.indexOf(title, lastIndex + 1);
    assert.ok(index > lastIndex, `${title} 단계가 승인된 순서에 있어야 합니다.`);
    lastIndex = index;
  }
  assert.ok(hrefs.includes('/how-to-use'));
  assert.match(text, /이용방법 자세히 보기/);
});

test('desktop and mobile navigation both open the dedicated how-to-use page', () => {
  const stateValues = [false, null, null, 0, false, true];
  let stateIndex = 0;
  const appShell = loadModule('components/common/AppShell.tsx', {
    react: {
      createContext: (value) => ({ value }),
      useContext: (context) => context.value,
      useEffect: () => {},
      useRef: (value) => ({ current: value }),
      useState: (initialValue) => [stateValues[stateIndex++] ?? initialValue, () => {}],
    },
    'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': {
      usePathname: () => '/',
      useRouter: () => ({ push() {}, refresh() {} }),
    },
    'lucide-react': new Proxy({}, { get: () => 'svg' }),
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/auth/auth': { getCurrentUser: async () => ({ data: { user: null } }), signOut: async () => ({ error: null }) },
  });
  const tree = appShell.default({ children: null });
  const howToUseHrefs = [];
  walk(tree, (node) => {
    if (collectText(node) === '이용방법') howToUseHrefs.push(node.props?.href);
  });

  assert.deepEqual(howToUseHrefs, ['/how-to-use', '/how-to-use']);
});

test('how-to-use is a canonical public page with all eight user steps', () => {
  const page = loadModule('app/how-to-use/page.tsx', publicPageStubs);
  const tree = page.default();
  const headings = [];
  walk(tree, (node) => {
    if (node.type === 'h2') headings.push(collectText(node));
  });

  assert.equal(page.metadata.title, 'ComMatch 이용방법');
  assert.equal(page.metadata.alternates.canonical, '/how-to-use');
  assert.deepEqual(headings, [
    '회원가입',
    '프로필 작성',
    'AI 분석',
    '추천 받기',
    '좋아요',
    '매칭',
    '채팅',
    '만남',
  ]);
});

test('the public sitemap contains the how-to-use page', () => {
  const sitemap = loadModule('app/sitemap.ts').default();
  assert.ok(sitemap.some(({ url }) => url === 'https://www.commatch.net/how-to-use'));
});

test('admin service statistics render five cards without a total-message card or link', async () => {
  const statistics = {
    totalMatchCount: 12,
    activeMatchCount: 7,
    endedMatchCount: 5,
    totalMessageCount: 99,
    newMemberLast7DaysCount: 3,
    reportLast7DaysCount: 2,
  };
  const client = {
    rpc: async (name) => {
      if (name === 'get_admin_report_summary') {
        return { data: [{ total_count: 0, pending_count: 0, reviewing_count: 0, resolved_count: 0, dismissed_count: 0 }], error: null };
      }
      if (name === 'get_admin_dashboard_operational_summary') {
        return {
          data: [{
            total_member_count: 0, active_member_count: 0, suspended_member_count: 0,
            hidden_profile_count: 0, missing_profile_count: 0, completed_profile_count: 0,
            premium_available_count: 0, premium_not_started_count: 0, premium_expired_count: 0,
            premium_suspended_count: 0, premium_revoked_count: 0, premium_expiring_soon_count: 0,
            expiration_window_days: 30,
          }],
          error: null,
        };
      }
      if (name === 'get_admin_service_statistics') return { data: statistics, error: null };
      if (name === 'get_admin_premium_memberships') return { data: [], error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const page = loadModule('app/admin/(protected)/page.tsx', {
    'react/jsx-runtime': { Fragment: Symbol('Fragment'), jsx, jsxs: jsx },
    'next/link': { __esModule: true, default: 'a' },
    'lucide-react': new Proxy({}, { get: () => 'svg' }),
    '@/components/admin/dashboard/AdminDashboardSection': { __esModule: true, default: 'section-component' },
    '@/components/admin/dashboard/AdminMetricCard': { __esModule: true, default: 'metric-card' },
    '@/lib/admin/access': { requireAdminAccess: async () => ({ role: 'super_admin', permissions: [] }) },
    '@/lib/admin/premium-memberships': { parseAdminPremiumMembershipList: () => [] },
    '@/lib/admin/service-statistics': { parseAdminServiceStatistics: () => statistics },
    '@/lib/admin/presentation': { getAdminRoleLabel: () => '최고 관리자' },
    '@/lib/support/inquiries': { parseAdminSupportInquiryList: () => [] },
    '@/lib/supabase/server': { createServerSupabaseClient: async () => client },
  });
  const tree = await page.default();
  const serviceSection = [];
  walk(tree, (node) => {
    if (node.type === 'section-component' && node.props?.title === '서비스 통계') serviceSection.push(node);
  });
  assert.equal(serviceSection.length, 1);

  const cards = [];
  walk(serviceSection[0].props.children, (node) => {
    if (node.type === 'metric-card') cards.push(node.props);
  });
  assert.equal(cards.length, 5);
  assert.equal(cards.some(({ label }) => label === '전체 메시지'), false);
  assert.equal(cards.some(({ countHref }) => countHref?.includes('total_messages')), false);
  assert.doesNotMatch(serviceSection[0].props.description, /메시지/);
});
