import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, Plus, RotateCcw, Search } from 'lucide-react';
import AdminMetricCard, { type AdminMetric } from '@/components/admin/dashboard/AdminMetricCard';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  ADMIN_ACCOUNT_STATUS_LABELS,
  getAdminAccountRoleClassName,
  getAdminAccountStatusClassName,
  isAdminAccountRoleFilter,
  isAdminAccountSortDirection,
  isAdminAccountSortKey,
  isAdminAccountStatusFilter,
  parseAdminAccountList,
  parseAdminAccountSummary,
  type AdminAccountRoleFilter,
  type AdminAccountSortDirection,
  type AdminAccountSortKey,
  type AdminAccountStatusFilter,
} from '@/lib/admin/admin-accounts';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type AdminAccountSearchParams = {
  search?: string | string[];
  role?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
};

const PAGE_SIZE = 20;
const FETCH_SIZE = PAGE_SIZE + 1;
const MAX_PAGE = Math.floor(2_147_483_647 / PAGE_SIZE) + 1;
const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

const firstValue = (value: string | string[] | undefined): string | undefined => (
  Array.isArray(value) ? value[0] : value
);

const normalizeSearch = (value: string | undefined): string => value?.trim().slice(0, 100) ?? '';

const normalizePage = (value: string | undefined): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
};

const buildListHref = ({
  search,
  role,
  status,
  sort,
  direction,
  page,
}: {
  search: string;
  role: AdminAccountRoleFilter;
  status: AdminAccountStatusFilter;
  sort: AdminAccountSortKey;
  direction: AdminAccountSortDirection;
  page: number;
}): string => {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (role !== 'all') query.set('role', role);
  if (status !== 'all') query.set('status', status);
  if (sort !== 'created_at') query.set('sort', sort);
  if (direction !== 'desc') query.set('direction', direction);
  if (page > 1) query.set('page', String(page));
  const value = query.toString();
  return value ? `/admin/admins?${value}` : '/admin/admins';
};

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<AdminAccountSearchParams>;
}) {
  await requireAdminAccess('admin_accounts_manage');
  const query = await searchParams;
  const search = normalizeSearch(firstValue(query.search));
  const rawRole = firstValue(query.role);
  const rawStatus = firstValue(query.status);
  const rawSort = firstValue(query.sort);
  const rawDirection = firstValue(query.direction);
  const role = isAdminAccountRoleFilter(rawRole) ? rawRole : 'all';
  const status = isAdminAccountStatusFilter(rawStatus) ? rawStatus : 'all';
  const sort = isAdminAccountSortKey(rawSort) ? rawSort : 'created_at';
  const direction = isAdminAccountSortDirection(rawDirection) ? rawDirection : 'desc';
  const page = normalizePage(firstValue(query.page));
  const offset = (page - 1) * PAGE_SIZE;
  const currentHref = buildListHref({ search, role, status, sort, direction, page });
  const filterFormKey = JSON.stringify([search, role, status, sort, direction]);

  const supabase = await createServerSupabaseClient();
  const [summaryResult, listResult] = await Promise.all([
    supabase.rpc('get_admin_account_summary'),
    supabase.rpc('get_admin_accounts', {
      p_search: search || null,
      p_role: role,
      p_status: status,
      p_limit: FETCH_SIZE,
      p_offset: offset,
      p_sort_key: sort,
      p_sort_direction: direction,
    }),
  ]);
  const summary = summaryResult.error ? null : parseAdminAccountSummary(summaryResult.data);
  const accountsWithLookahead = listResult.error ? null : parseAdminAccountList(listResult.data);
  const accounts = accountsWithLookahead?.slice(0, PAGE_SIZE) ?? null;
  const hasNext = accountsWithLookahead !== null && accountsWithLookahead.length > PAGE_SIZE;
  const hasFilters = search !== '' || role !== 'all' || status !== 'all';
  const summaryCards: AdminMetric[] = summary ? [
    { label: '전체', count: summary.totalAdminCount, href: '/admin/admins', ariaLabel: '전체 관리자 계정 보기' },
    { label: '활성', count: summary.activeAdminCount, href: '/admin/admins?status=active', ariaLabel: '활성 관리자 계정 보기' },
    { label: '정지', count: summary.suspendedAdminCount, href: '/admin/admins?status=suspended', ariaLabel: '정지 관리자 계정 보기' },
    { label: '회수', count: summary.revokedAdminCount, href: '/admin/admins?status=revoked', ariaLabel: '회수된 관리자 계정 보기' },
    { label: 'super_admin', count: summary.superAdminCount, href: '/admin/admins?role=super_admin', ariaLabel: '최고 관리자 계정 보기' },
    { label: '활성 super_admin', count: summary.activeSuperAdminCount, href: '/admin/admins?role=super_admin&status=active', ariaLabel: '활성 최고 관리자 계정 보기' },
  ] : [];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900">관리자 계정 관리</h1>
          <p className="mt-3 max-w-3xl text-gray-600">관리자 역할과 계정 상태를 조회하고 최고 관리자 권한으로 변경합니다.</p>
          <p className="mt-2 text-sm font-semibold text-gray-500">현재 {page.toLocaleString('ko-KR')}페이지</p>
        </div>
        <Link href="/admin/admins/new" className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">
          <Plus size={17} aria-hidden="true" /> 관리자 계정 생성
        </Link>
      </section>

      {summary ? (
        <section aria-label="관리자 계정 요약" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {summaryCards.map((card) => <AdminMetricCard key={card.label} {...card} />)}
        </section>
      ) : (
        <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div>
              <p className="font-semibold">관리자 계정 요약을 불러오지 못했습니다.</p>
              <a href={currentHref} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a>
            </div>
          </div>
        </section>
      )}

      <form key={filterFormKey} method="get" action="/admin/admins" className="grid gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-8 lg:items-end">
        <div className="lg:col-span-2">
          <label htmlFor="admin-account-search" className="mb-2 block text-sm font-semibold text-gray-700">검색</label>
          <input
            id="admin-account-search"
            name="search"
            type="search"
            maxLength={100}
            defaultValue={search}
            placeholder="닉네임, 이메일 또는 회원 UUID"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <div>
          <label htmlFor="admin-account-role-filter" className="mb-2 block text-sm font-semibold text-gray-700">역할</label>
          <select id="admin-account-role-filter" name="role" defaultValue={role} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="super_admin">최고 관리자</option>
            <option value="admin">관리자</option>
            <option value="moderator">신고 관리자</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-account-status-filter" className="mb-2 block text-sm font-semibold text-gray-700">상태</label>
          <select id="admin-account-status-filter" name="status" defaultValue={status} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="revoked">회수</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-account-sort" className="mb-2 block text-sm font-semibold text-gray-700">정렬</label>
          <select id="admin-account-sort" name="sort" defaultValue={sort} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="created_at">생성일</option>
            <option value="updated_at">수정일</option>
            <option value="role">역할</option>
            <option value="status">상태</option>
          </select>
        </div>
        <div>
          <label htmlFor="admin-account-direction" className="mb-2 block text-sm font-semibold text-gray-700">방향</label>
          <select id="admin-account-direction" name="direction" defaultValue={direction} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="desc">내림차순</option>
            <option value="asc">오름차순</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700">
            <Search size={16} aria-hidden="true" /> 조회
          </button>
          <Link href="/admin/admins" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-gray-300 px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
            <RotateCcw size={16} aria-hidden="true" /> 초기화
          </Link>
        </div>
      </form>

      {accounts === null ? (
        <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div>
              <p className="font-semibold">관리자 계정 목록을 불러오지 못했습니다.</p>
              <a href={currentHref} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a>
            </div>
          </div>
        </section>
      ) : accounts.length === 0 ? (
        <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">
            {page > 1 ? '현재 페이지에서 관리자 계정을 찾을 수 없습니다.' : hasFilters ? '조건에 맞는 관리자 계정이 없습니다.' : '등록된 관리자 계정이 없습니다.'}
          </p>
          {hasFilters || page > 1 ? <Link href="/admin/admins" className="mt-3 inline-block text-sm font-bold text-green-700 hover:text-green-800">검색 조건 초기화</Link> : null}
        </section>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600">
                <tr>{['관리자', '역할', '상태', '생성일', '수정일', '관리'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((account) => (
                  <tr key={account.userId} className="hover:bg-gray-50/70">
                    <td className="px-4 py-4">
                      <p className="truncate font-bold text-gray-900" title={account.nickname ?? undefined}>{account.nickname ?? '닉네임 정보 없음'}</p>
                      <p className="mt-1 truncate text-xs text-gray-600" title={account.email ?? undefined}>{account.email ?? '이메일 정보 없음'}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500" title={account.userId}>{account.userId.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getAdminAccountRoleClassName(account.role)}`}>{getAdminRoleLabel(account.role)}</span></td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getAdminAccountStatusClassName(account.status)}`}>{ADMIN_ACCOUNT_STATUS_LABELS[account.status]}</span></td>
                    <td className="whitespace-nowrap px-4 py-4 text-gray-600"><time dateTime={account.createdAt}>{dateTimeFormatter.format(new Date(account.createdAt))}</time></td>
                    <td className="whitespace-nowrap px-4 py-4 text-gray-600"><time dateTime={account.updatedAt}>{dateTimeFormatter.format(new Date(account.updatedAt))}</time></td>
                    <td className="px-4 py-4"><Link href={`/admin/admins/${account.userId}`} className="font-bold text-green-700 underline-offset-4 hover:text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">상세 보기</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {accounts !== null && (accounts.length > 0 || page > 1) ? (
        <nav aria-label="관리자 계정 목록 페이지" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={buildListHref({ search, role, status, sort, direction, page: page - 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} aria-hidden="true" />이전</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} aria-hidden="true" />이전</span>
          )}
          <span className="text-sm font-semibold text-gray-700">{page}페이지</span>
          {hasNext ? (
            <Link href={buildListHref({ search, role, status, sort, direction, page: page + 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} aria-hidden="true" /></Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} aria-hidden="true" /></span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
