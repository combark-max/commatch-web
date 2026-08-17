import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS,
  ADMIN_MEMBER_PREMIUM_STATUS_LABELS,
  getAdminMemberPremiumPeriodStateClassName,
  isAdminMemberAccountFilter,
  isAdminMemberProfileFilter,
  isAdminMemberSortDirection,
  isAdminMemberSortKey,
  isAdminMemberVisibilityFilter,
  parseAdminMemberList,
  type AdminMemberAccountFilter,
  type AdminMemberProfileFilter,
  type AdminMemberSortDirection,
  type AdminMemberSortKey,
  type AdminMemberVisibilityFilter,
} from '@/lib/admin/members';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type MemberSearchParams = {
  search?: string | string[];
  account?: string | string[];
  profile?: string | string[];
  visibility?: string | string[];
  sort?: string | string[];
  direction?: string | string[];
  page?: string | string[];
};

type MemberListError = 'forbidden' | 'rpc' | 'parse';

const PAGE_SIZE = 20;
const MAX_PAGE = Math.floor(2_147_483_647 / PAGE_SIZE) + 1;

const displayProfileValue = (value: string | null): string => value?.trim() || '미입력';

const getGenderLabel = (value: string | null): string => {
  if (value === '남성' || value === 'male') return '남성';
  if (value === '여성' || value === 'female') return '여성';
  return '미입력';
};

const getMarriageHistoryLabel = (value: string | null): string => {
  if (value === '초혼' || value === 'first_marriage') return '초혼';
  if (value === '재혼' || value === 'remarriage') return '재혼';
  return '미입력';
};
const shortDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
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
  account,
  profile,
  visibility,
  sort,
  direction,
  page,
}: {
  search: string;
  account: AdminMemberAccountFilter;
  profile: AdminMemberProfileFilter;
  visibility: AdminMemberVisibilityFilter;
  sort: AdminMemberSortKey;
  direction: AdminMemberSortDirection;
  page: number;
}): string => {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (account !== 'all') query.set('account', account);
  if (profile !== 'all') query.set('profile', profile);
  if (visibility !== 'all') query.set('visibility', visibility);
  if (sort !== 'joined_at') query.set('sort', sort);
  if (direction !== 'desc') query.set('direction', direction);
  if (page > 1) query.set('page', String(page));
  const value = query.toString();
  return value ? `/admin/members?${value}` : '/admin/members';
};

const formatShortDate = (value: string | null, emptyLabel: string): string => (
  value ? shortDateFormatter.format(new Date(value)) : emptyLabel
);

const getErrorMessage = (error: MemberListError): string => {
  if (error === 'forbidden') return '회원 관리 목록을 조회할 권한이 없습니다.';
  if (error === 'parse') return '회원 관리 목록 응답 형식을 확인하지 못했습니다.';
  return '회원 관리 목록을 불러오지 못했습니다.';
};

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<MemberSearchParams>;
}) {
  await requireAdminAccess('member_restrictions_view');
  const query = await searchParams;
  const search = normalizeSearch(firstValue(query.search));
  const rawAccount = firstValue(query.account);
  const rawProfile = firstValue(query.profile);
  const rawVisibility = firstValue(query.visibility);
  const rawSort = firstValue(query.sort);
  const rawDirection = firstValue(query.direction);
  const account = isAdminMemberAccountFilter(rawAccount) ? rawAccount : 'all';
  const profile = isAdminMemberProfileFilter(rawProfile) ? rawProfile : 'all';
  const visibility = isAdminMemberVisibilityFilter(rawVisibility) ? rawVisibility : 'all';
  const sort = isAdminMemberSortKey(rawSort) ? rawSort : 'joined_at';
  const direction = isAdminMemberSortDirection(rawDirection) ? rawDirection : 'desc';
  const page = normalizePage(firstValue(query.page));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc('get_admin_members', {
    p_search: search || null,
    p_account: account,
    p_profile: profile,
    p_visibility: visibility,
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_sort_key: sort,
    p_sort_direction: direction,
  });
  const members = rpcError ? null : parseAdminMemberList(data);
  const error: MemberListError | null = rpcError
    ? rpcError.code === '42501' ? 'forbidden' : 'rpc'
    : members === null ? 'parse' : null;
  const totalCount = members && members.length > 0
    ? members[0].totalCount
    : page === 1 ? 0 : null;
  const totalPages = totalCount === null ? null : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasResultFilters = search !== ''
    || account !== 'all'
    || profile !== 'all'
    || visibility !== 'all';
  const currentHref = buildListHref({
    search,
    account,
    profile,
    visibility,
    sort,
    direction,
    page,
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-black text-gray-900">회원 관리</h1>
        <p className="mt-3 max-w-3xl text-gray-600">
          일반 회원의 프로필 작성 상태, 현재 계정 상태와 Premium 요약을 조회합니다.
        </p>
        <p className="mt-2 text-sm font-semibold text-gray-500">
          {totalCount === null
            ? '현재 페이지에서는 전체 결과 수를 확인할 수 없습니다.'
            : `조건에 맞는 회원 ${totalCount.toLocaleString('ko-KR')}명`}
        </p>
      </section>

      <form method="get" action="/admin/members" className="grid gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 lg:grid-cols-8 lg:items-end">
        <div className="lg:col-span-2">
          <label htmlFor="member-search" className="mb-2 block text-sm font-semibold text-gray-700">회원 검색</label>
          <input
            id="member-search"
            name="search"
            type="search"
            maxLength={100}
            defaultValue={search}
            placeholder="닉네임 또는 회원 UUID"
            className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <div>
          <label htmlFor="member-account-filter" className="mb-2 block text-sm font-semibold text-gray-700">계정 상태</label>
          <select id="member-account-filter" name="account" defaultValue={account} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
          </select>
        </div>
        <div>
          <label htmlFor="member-profile-filter" className="mb-2 block text-sm font-semibold text-gray-700">프로필 상태</label>
          <select id="member-profile-filter" name="profile" defaultValue={profile} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="missing">프로필 없음</option>
            <option value="in_progress">작성 중</option>
            <option value="completed">작성 완료</option>
          </select>
        </div>
        <div>
          <label htmlFor="member-visibility-filter" className="mb-2 block text-sm font-semibold text-gray-700">프로필 공개</label>
          <select id="member-visibility-filter" name="visibility" defaultValue={visibility} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="all">전체</option>
            <option value="visible">공개</option>
            <option value="hidden">숨김</option>
          </select>
        </div>
        <div>
          <label htmlFor="member-sort" className="mb-2 block text-sm font-semibold text-gray-700">정렬</label>
          <select id="member-sort" name="sort" defaultValue={sort} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="joined_at">가입일</option>
            <option value="nickname">닉네임</option>
          </select>
        </div>
        <div>
          <label htmlFor="member-direction" className="mb-2 block text-sm font-semibold text-gray-700">방향</label>
          <select id="member-direction" name="direction" defaultValue={direction} className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20">
            <option value="desc">내림차순</option>
            <option value="asc">오름차순</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-5 text-sm font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700">
            <Search className="shrink-0" size={16} aria-hidden="true" /> 조회
          </button>
          <Link href="/admin/members" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 border-gray-300 px-5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
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
      ) : members && members.length === 0 ? (
        <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-500">
            {page > 1
              ? '현재 페이지에서 결과를 찾을 수 없습니다.'
              : hasResultFilters
                ? '검색·필터 조건에 맞는 회원이 없습니다.'
                : '조회할 회원 데이터가 없습니다.'}
          </p>
          {(hasResultFilters || page > 1) ? (
            <Link href="/admin/members" className="mt-3 inline-block text-sm font-bold text-green-700 hover:text-green-800">검색·필터 초기화</Link>
          ) : null}
        </section>
      ) : members ? (
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1360px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[15%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {['회원', '성별', '나이', '지역', '직업', '결혼이력', '가입일', 'Premium 및 관리'].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                    <tr key={member.memberUserId} className="align-top hover:bg-gray-50/70">
                      <td className="px-4 py-4">
                        <p className="truncate font-bold text-gray-900" title={member.nickname ?? undefined}>{member.nickname ?? '닉네임 정보 없음'}</p>
                        <p className="mt-1 font-mono text-xs text-gray-500" title={member.memberUserId}>{member.memberUserId.slice(0, 8)}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {getGenderLabel(member.gender)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {member.age === null ? '미입력' : `만 ${member.age}세`}
                      </td>
                      <td className="px-4 py-4">
                        <p className="truncate text-gray-600" title={member.region?.trim() || undefined}>{displayProfileValue(member.region)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="truncate text-gray-600" title={member.job?.trim() || undefined}>{displayProfileValue(member.job)}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        {getMarriageHistoryLabel(member.marriageHistory)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-gray-600">
                        <time dateTime={member.joinedAt}>{formatShortDate(member.joinedAt, '확인 불가')}</time>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getAdminMemberPremiumPeriodStateClassName(member.premiumPeriodState)}`}>
                            {ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS[member.premiumPeriodState]}
                          </span>
                          {member.premiumStoredStatus ? (
                            <span className="text-xs text-gray-500">저장 {ADMIN_MEMBER_PREMIUM_STATUS_LABELS[member.premiumStoredStatus]}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          <Link href={`/admin/members/${member.memberUserId}`} className="text-sm font-bold text-green-700 hover:text-green-800 hover:underline">
                            회원 상세
                          </Link>
                          <Link href={`/admin/premium/${member.memberUserId}`} className="text-sm font-bold text-green-700 hover:text-green-800 hover:underline">
                            Premium 상세
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!error && members && (members.length > 0 || page > 1) ? (
        <nav aria-label="관리자 회원 목록 페이지" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={buildListHref({ search, account, profile, visibility, sort, direction, page: page - 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} aria-hidden="true" />이전</Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} aria-hidden="true" />이전</span>
          )}
          <span className="text-sm font-semibold text-gray-700">
            {totalPages === null ? `${page}페이지` : `${page} / ${totalPages}`}
          </span>
          {totalPages !== null && page < totalPages ? (
            <Link href={buildListHref({ search, account, profile, visibility, sort, direction, page: page + 1 })} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} aria-hidden="true" /></Link>
          ) : (
            <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} aria-hidden="true" /></span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
