import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import AdminRecentPremiumChanges from '@/components/admin/premium/AdminRecentPremiumChanges';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getPremiumPeriodState,
  getPremiumPeriodStateClassName,
  getPremiumStatusClassName,
  isPremiumMembershipFilter,
  isPremiumMembershipSortDirection,
  isPremiumMembershipSortKey,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  parseAdminPremiumMembershipList,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_PERIOD_STATE_LABELS,
  PREMIUM_STATUS_LABELS,
  type PremiumMembershipFilter,
  type PremiumMembershipSortDirection,
  type PremiumMembershipSortKey,
} from '@/lib/admin/premium-memberships';
import {
  parseRecentPremiumMembershipActions,
  type RecentActivityResult,
  type RecentPremiumMembershipAction,
} from '@/lib/admin/recent-admin-activities';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type PremiumSearchParams = {
  search?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
};

type PremiumListError = 'forbidden' | 'rpc' | 'parse';

const PAGE_SIZE = 10;
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

const normalizeSearch = (value: string | undefined): string => (
  value?.trim().slice(0, 100) ?? ''
);

const normalizePage = (value: string | undefined): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
};

const buildListHref = ({
  search,
  status,
  sort,
  direction,
  page,
}: {
  search: string;
  status: PremiumMembershipFilter;
  sort: PremiumMembershipSortKey;
  direction: PremiumMembershipSortDirection;
  page: number;
}): string => {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (status !== 'all') query.set('status', status);
  if (sort !== 'updated_at') query.set('sort', sort);
  if (direction !== 'desc') query.set('direction', direction);
  if (page > 1) query.set('page', String(page));
  const value = query.toString();
  return value ? `/admin/premium?${value}` : '/admin/premium';
};

const formatDateTime = (value: string | null, emptyLabel: string): string => (
  value ? dateTimeFormatter.format(new Date(value)) : emptyLabel
);

const getErrorMessage = (error: PremiumListError): string => {
  if (error === 'forbidden') return 'Premium 회원 목록을 조회할 권한이 없습니다.';
  if (error === 'parse') return 'Premium 회원 목록 응답을 확인하지 못했습니다.';
  return 'Premium 회원 목록을 불러오지 못했습니다.';
};

export default async function AdminPremiumMembershipsPage({
  searchParams,
}: {
  searchParams: Promise<PremiumSearchParams>;
}) {
  await requireAdminAccess('premium_memberships_view');
  const query = await searchParams;
  const search = normalizeSearch(firstValue(query.search));
  const rawStatus = firstValue(query.status);
  const rawSort = firstValue(query.sort);
  const rawDirection = firstValue(query.direction);
  const status = isPremiumMembershipFilter(rawStatus) ? rawStatus : 'all';
  const sort = isPremiumMembershipSortKey(rawSort) ? rawSort : 'updated_at';
  const direction = isPremiumMembershipSortDirection(rawDirection) ? rawDirection : 'desc';
  const page = normalizePage(firstValue(query.page));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createServerSupabaseClient();
  const [listResult, recentChangesRpc] = await Promise.all([
    supabase.rpc('get_admin_premium_memberships', {
      p_search: search || null,
      p_status: status === 'all' ? null : status,
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_sort_key: sort,
      p_sort_direction: direction,
    }),
    supabase.rpc('get_admin_recent_premium_membership_actions', { p_limit: 5 }),
  ]);
  const { data, error: rpcError } = listResult;
  const memberships = rpcError ? null : parseAdminPremiumMembershipList(data);
  const parsedRecentChanges = recentChangesRpc.error
    ? null : parseRecentPremiumMembershipActions(recentChangesRpc.data);
  const recentChanges: RecentActivityResult<RecentPremiumMembershipAction[]> = recentChangesRpc.error
    ? { kind: recentChangesRpc.error.code === '42501' ? 'forbidden' : 'rpc_error' }
    : parsedRecentChanges === null ? { kind: 'parse_error' } : { kind: 'success', data: parsedRecentChanges };
  const error: PremiumListError | null = rpcError
    ? rpcError.code === '42501' ? 'forbidden' : 'rpc'
    : memberships === null ? 'parse' : null;
  const totalCount = memberships && memberships.length > 0
    ? memberships[0].totalCount
    : page === 1 ? 0 : null;
  const totalPages = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasResultFilters = search !== '' || status !== 'all';
  const currentHref = buildListHref({ search, status, sort, direction, page });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-gray-900">Premium 관리</h1>
        <p className="mt-3 max-w-3xl text-gray-600">
          회원의 Premium 보유 상태와 기간, 기능 권한을 조회합니다. 이 화면은 결제 화면이 아니며 현재 관리자 수동 관리 기반 정보를 표시합니다.
        </p>
        <p className="mt-2 text-sm font-semibold text-gray-500">
          {totalCount === null
            ? '현재 페이지에서는 전체 결과 수를 확인할 수 없습니다.'
            : `조건에 맞는 회원 ${totalCount.toLocaleString('ko-KR')}명`}
        </p>
      </section>

      <form method="get" action="/admin/premium" className="grid gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-6 lg:items-end">
        <div className="lg:col-span-2">
          <label htmlFor="premium-search" className="mb-2 block text-sm font-semibold text-gray-700">회원 검색</label>
          <input
            id="premium-search"
            name="search"
            type="search"
            maxLength={100}
            defaultValue={search}
            placeholder="닉네임 또는 회원 UUID"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <div>
          <label htmlFor="premium-status-filter" className="mb-2 block text-sm font-semibold text-gray-700">Premium 상태</label>
          <select id="premium-status-filter" name="status" defaultValue={status} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="exists">Premium 등록</option>
            <option value="available">이용 가능</option>
            <option value="not_started">시작 전</option>
            <option value="expired">만료</option>
            <option value="suspended">정지</option>
            <option value="revoked">회수</option>
          </select>
        </div>
        <div>
          <label htmlFor="premium-sort" className="mb-2 block text-sm font-semibold text-gray-700">정렬</label>
          <select id="premium-sort" name="sort" defaultValue={sort} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="updated_at">최근 변경</option>
            <option value="nickname">닉네임</option>
            <option value="started_at">시작일</option>
            <option value="expires_at">만료일</option>
          </select>
        </div>
        <div>
          <label htmlFor="premium-direction" className="mb-2 block text-sm font-semibold text-gray-700">방향</label>
          <select id="premium-direction" name="direction" defaultValue={direction} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="desc">내림차순</option>
            <option value="asc">오름차순</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700">
            <Search className="shrink-0" size={16} aria-hidden="true" /> 조회
          </button>
          <Link href="/admin/premium" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-gray-300 px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
            <RotateCcw className="shrink-0" size={16} aria-hidden="true" /> 초기화
          </Link>
        </div>
      </form>

      {error ? (
        <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div>
              <p className="font-semibold">{getErrorMessage(error)}</p>
              <a href={currentHref} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</a>
            </div>
          </div>
        </section>
      ) : memberships && memberships.length === 0 ? (
        <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">
            {page > 1
              ? '현재 페이지에서 결과를 찾을 수 없습니다.'
              : hasResultFilters
                ? '검색·필터 조건에 맞는 회원이 없습니다.'
                : '조회할 회원 데이터가 없습니다.'}
          </p>
          {(hasResultFilters || page > 1) ? (
            <Link href="/admin/premium" className="mt-3 inline-block text-sm font-bold text-green-700 hover:text-green-800">검색·필터 초기화</Link>
          ) : null}
        </section>
      ) : memberships ? (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[17%]" />
                <col className="w-[21%]" />
                <col className="w-[17%]" />
                <col className="w-[14%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {['회원', 'Premium 상태', '이용 기간', '기능 권한', '회원 상태', '관리'].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {memberships.map((membership) => {
                  const storedStatus = membership.storedStatus ?? 'none';
                  const periodState = getPremiumPeriodState(membership);
                  return (
                    <tr key={membership.memberUserId} className="hover:bg-gray-50/70">
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/members/${membership.memberUserId}`}
                          title={membership.nickname ?? undefined}
                          aria-label={`${membership.nickname ?? '프로필 정보 없음'} 관리자 회원 상세 보기`}
                          className="block truncate font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                        >
                          {membership.profileExists && membership.nickname ? membership.nickname : '프로필 정보 없음'}
                        </Link>
                        <p
                          className="mt-1 font-mono text-xs text-gray-500"
                          title={membership.memberUserId}
                          aria-label={`회원 UUID ${membership.memberUserId}`}
                        >
                          {membership.memberUserId.slice(0, 8)}
                        </p>
                        {!membership.profileExists ? <p className="mt-1 text-xs font-semibold text-amber-700">프로필 없음</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumStatusClassName(storedStatus)}`}>
                            {PREMIUM_STATUS_LABELS[storedStatus]}
                          </span>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumPeriodStateClassName(periodState)}`}>
                            {PREMIUM_PERIOD_STATE_LABELS[periodState]}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-gray-500">
                          현재 이용 {membership.isAvailable ? '가능' : '불가'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <p><span className="font-semibold text-gray-500">시작:</span> {formatDateTime(membership.startedAt, '해당 없음')}</p>
                        <p className="mt-1.5"><span className="font-semibold text-gray-500">만료:</span> {formatDateTime(membership.expiresAt, membership.membershipExists ? '무기한' : '해당 없음')}</p>
                      </td>
                      <td className="px-4 py-4">
                        {membership.featureKeys.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {membership.featureKeys.map((featureKey) => (
                              <span key={featureKey} className="inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800">
                                {PREMIUM_FEATURE_LABELS[featureKey]}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-gray-500">해당 없음</span>}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        <p><span className="font-semibold text-gray-500">계정 저장:</span> {MEMBER_ACCOUNT_STATUS_LABELS[membership.accountStatus]}</p>
                        <p className="mt-1.5"><span className="font-semibold text-gray-500">프로필:</span> {membership.profileExists ? MEMBER_PROFILE_VISIBILITY_LABELS[membership.profileVisibility] : '없음'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/members/${membership.memberUserId}`}
                          className="block font-bold text-green-700 underline-offset-4 hover:text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                        >
                          회원 상세
                        </Link>
                        <Link
                          href={`/admin/premium/${membership.memberUserId}`}
                          aria-label={`${membership.nickname ?? '닉네임 정보 없음'} Premium 상세 보기`}
                          className="mt-2 block font-bold text-green-700 underline-offset-4 hover:text-green-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                        >
                          상세 보기
                        </Link>
                        <p className="mt-2 text-xs leading-5 text-gray-500">
                          <span className="font-semibold">최근 변경</span><br />
                          {formatDateTime(membership.membershipUpdatedAt, '해당 없음')}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!error && memberships && totalPages !== null && totalPages > 1 ? (
        <nav aria-label="Premium 회원 목록 페이지" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={buildListHref({ search, status, sort, direction, page: page - 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} />이전</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} />이전</span>
          )}
          <span className="text-sm font-semibold text-gray-700">
            {totalPages === null ? `${page}페이지` : `${page} / ${totalPages}`}
          </span>
          {totalPages !== null && page < totalPages ? (
            <Link href={buildListHref({ search, status, sort, direction, page: page + 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} /></Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} /></span>
          )}
        </nav>
      ) : null}

      <AdminRecentPremiumChanges result={recentChanges} />

      <section className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-5 text-sm font-semibold text-gray-500">
        Premium 수동 부여와 변경 기능은 다음 단계에서 제공됩니다.
      </section>
    </div>
  );
}
