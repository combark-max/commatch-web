import Link from 'next/link';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  ADMIN_SERVICE_STATISTIC_LABELS,
  isAdminServiceStatisticMetric,
  normalizeAdminServiceStatisticPage,
  parseAdminServiceStatisticDetails,
  type AdminServiceStatisticDetail,
  type AdminServiceStatisticMetric,
  type AdminServiceStatisticUser,
} from '@/lib/admin/service-statistic-details';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
} from '@/lib/admin/reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ServiceStatisticSearchParams = {
  metric?: string | string[];
  page?: string | string[];
};

const PAGE_SIZE = 10;

const MATCH_STATUS_LABELS = { active: '진행 중', ended: '종료' } as const;
const VISIBILITY_LABELS = { visible: '노출', hidden: '비노출' } as const;
const PROFILE_STATUS_LABELS = { missing: '프로필 없음', in_progress: '작성 중', completed: '작성 완료' } as const;
const PROFILE_VISIBILITY_LABELS = { visible: '노출', hidden: '숨김' } as const;
const ACCOUNT_STATUS_LABELS = { active: '정상', suspended: '정지' } as const;
const PREMIUM_STATUS_LABELS = {
  none: '미보유', not_started: '시작 전', expired: '만료',
  suspended: '정지', revoked: '회수', available: '이용 가능',
} as const;

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Seoul',
});

const firstValue = (value: string | string[] | undefined): string | undefined => (
  Array.isArray(value) ? value[0] : value
);

const formatDateTime = (value: string | null): string => (
  value ? dateTimeFormatter.format(new Date(value)) : '해당 없음'
);

const buildHref = (metric: AdminServiceStatisticMetric, page: number): string => {
  const query = new URLSearchParams({ metric });
  if (page > 1) query.set('page', String(page));
  return `/admin/service-statistics?${query.toString()}`;
};

const UserLink = ({ user }: { user: AdminServiceStatisticUser }) => {
  const label = user.profileExists && user.nickname ? user.nickname : '프로필 정보 없음';
  return user.memberExists ? (
    <Link
      href={`/admin/members/${user.userId}`}
      className="font-semibold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline"
    >
      {label}
      <span className="ml-2 font-mono text-xs font-normal text-gray-500">{user.userId.slice(0, 8)}</span>
    </Link>
  ) : <span className="text-gray-600">탈퇴한 회원 <span className="font-mono text-xs">{user.userId.slice(0, 8)}</span></span>;
};

const tableHeadClassName = 'whitespace-nowrap px-5 py-3 font-semibold';
const tableCellClassName = 'whitespace-nowrap px-5 py-4 text-gray-700';

function MatchTable({ rows }: { rows: Extract<AdminServiceStatisticDetail, { kind: 'match' }>[] }) {
  return <table className="w-full min-w-[1060px] text-left text-sm">
    <thead className="bg-gray-50 text-gray-600"><tr>
      {['매칭 ID', '상태', '매칭 시각', '생성 시각', '종료 시각', '첫 번째 회원', '두 번째 회원'].map((label) => <th key={label} scope="col" className={tableHeadClassName}>{label}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.itemId} className="hover:bg-gray-50/70">
      <td className={`${tableCellClassName} font-mono text-xs`}>{row.itemId.slice(0, 8)}</td>
      <td className={tableCellClassName}>{MATCH_STATUS_LABELS[row.status]}</td>
      <td className={tableCellClassName}>{formatDateTime(row.matchedAt)}</td>
      <td className={tableCellClassName}>{formatDateTime(row.createdAt)}</td>
      <td className={tableCellClassName}>{formatDateTime(row.endedAt)}</td>
      <td className={tableCellClassName}><UserLink user={row.firstUser} /></td>
      <td className={tableCellClassName}><UserLink user={row.secondUser} /></td>
    </tr>)}</tbody>
  </table>;
}

function MessageTable({ rows }: { rows: Extract<AdminServiceStatisticDetail, { kind: 'message' }>[] }) {
  return <table className="w-full min-w-[820px] text-left text-sm">
    <thead className="bg-gray-50 text-gray-600"><tr>
      {['메시지 ID', '생성 시각', '매칭 ID', '발신 회원', '노출 상태'].map((label) => <th key={label} scope="col" className={tableHeadClassName}>{label}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.itemId} className="hover:bg-gray-50/70">
      <td className={`${tableCellClassName} font-mono text-xs`}>{row.itemId.slice(0, 8)}</td>
      <td className={tableCellClassName}>{formatDateTime(row.createdAt)}</td>
      <td className={`${tableCellClassName} font-mono text-xs`}>{row.matchId.slice(0, 8)}</td>
      <td className={tableCellClassName}><UserLink user={row.sender} /></td>
      <td className={tableCellClassName}>{VISIBILITY_LABELS[row.moderationVisibility]}</td>
    </tr>)}</tbody>
  </table>;
}

function MemberTable({ rows }: { rows: Extract<AdminServiceStatisticDetail, { kind: 'member' }>[] }) {
  return <table className="w-full min-w-[980px] text-left text-sm">
    <thead className="bg-gray-50 text-gray-600"><tr>
      {['회원', '가입일', '계정 상태', '프로필 상태', '프로필 노출', 'Premium', '상세'].map((label) => <th key={label} scope="col" className={tableHeadClassName}>{label}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.itemId} className="hover:bg-gray-50/70">
      <td className={tableCellClassName}><Link href={`/admin/members/${row.itemId}`} className="font-semibold text-gray-900 hover:text-green-700 hover:underline">{row.profileExists && row.nickname ? row.nickname : '프로필 정보 없음'}<span className="ml-2 font-mono text-xs font-normal text-gray-500">{row.itemId.slice(0, 8)}</span></Link></td>
      <td className={tableCellClassName}>{formatDateTime(row.joinedAt)}</td>
      <td className={tableCellClassName}>{ACCOUNT_STATUS_LABELS[row.accountStatus]}</td>
      <td className={tableCellClassName}>{PROFILE_STATUS_LABELS[row.profileStatus]}</td>
      <td className={tableCellClassName}>{row.profileVisibility ? PROFILE_VISIBILITY_LABELS[row.profileVisibility] : '해당 없음'}</td>
      <td className={tableCellClassName}>{PREMIUM_STATUS_LABELS[row.premiumStatus]}</td>
      <td className={tableCellClassName}><Link href={`/admin/members/${row.itemId}`} className="font-bold text-green-700 hover:underline">상세 보기</Link></td>
    </tr>)}</tbody>
  </table>;
}

function ReportTable({ rows }: { rows: Extract<AdminServiceStatisticDetail, { kind: 'report' }>[] }) {
  return <table className="w-full min-w-[1060px] text-left text-sm">
    <thead className="bg-gray-50 text-gray-600"><tr>
      {['신고 ID', '접수일', '대상', '사유', '신고자', '신고 대상', '상태', '상세'].map((label) => <th key={label} scope="col" className={tableHeadClassName}>{label}</th>)}
    </tr></thead>
    <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.itemId} className="hover:bg-gray-50/70">
      <td className={`${tableCellClassName} font-mono text-xs`}><Link href={`/admin/reports/${row.itemId}`} className="font-bold text-green-700">{row.itemId.slice(0, 8)}</Link></td>
      <td className={tableCellClassName}>{formatDateTime(row.createdAt)}</td>
      <td className={tableCellClassName}>{REPORT_TARGET_LABELS[row.targetType]}</td>
      <td className={tableCellClassName}>{REPORT_REASON_LABELS[row.reason]}</td>
      <td className={tableCellClassName}><UserLink user={row.reporter} /></td>
      <td className={tableCellClassName}><UserLink user={row.target} /></td>
      <td className={tableCellClassName}>{REPORT_STATUS_LABELS[row.status]}</td>
      <td className={tableCellClassName}><Link href={`/admin/reports/${row.itemId}`} className="font-bold text-green-700 hover:underline">상세 보기</Link></td>
    </tr>)}</tbody>
  </table>;
}

const DetailTable = ({ rows }: { rows: AdminServiceStatisticDetail[] }) => {
  const first = rows[0];
  if (!first) return null;
  if (first.kind === 'match') return <MatchTable rows={rows as Extract<AdminServiceStatisticDetail, { kind: 'match' }>[]} />;
  if (first.kind === 'message') return <MessageTable rows={rows as Extract<AdminServiceStatisticDetail, { kind: 'message' }>[]} />;
  if (first.kind === 'member') return <MemberTable rows={rows as Extract<AdminServiceStatisticDetail, { kind: 'member' }>[]} />;
  return <ReportTable rows={rows as Extract<AdminServiceStatisticDetail, { kind: 'report' }>[]} />;
};

export default async function AdminServiceStatisticsPage({
  searchParams,
}: {
  searchParams: Promise<ServiceStatisticSearchParams>;
}) {
  await requireAdminAccess('admin_dashboard_view');
  const query = await searchParams;
  const rawMetric = firstValue(query.metric);

  if (!isAdminServiceStatisticMetric(rawMetric)) {
    return <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" />대시보드로 돌아가기</Link>
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-black">유효하지 않은 서비스 통계입니다.</h1>
        <p className="mt-2 text-sm">대시보드의 서비스 통계 숫자를 다시 선택해 주세요.</p>
      </section>
    </div>;
  }

  const metric = rawMetric;
  const page = normalizeAdminServiceStatisticPage(firstValue(query.page), PAGE_SIZE);
  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc('get_admin_service_statistic_details', {
    p_metric: metric,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const details = rpcError ? null : parseAdminServiceStatisticDetails(data, metric);
  const error = rpcError ? (rpcError.code === '42501' ? 'forbidden' : 'rpc') : details === null ? 'parse' : null;
  const totalCount = details?.[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return <div className="space-y-6">
    <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900"><ArrowLeft size={16} aria-hidden="true" />대시보드로 돌아가기</Link>
    <header>
      <p className="text-sm font-bold text-green-700">서비스 통계 상세</p>
      <h1 className="mt-2 text-3xl font-black text-gray-900">{ADMIN_SERVICE_STATISTIC_LABELS[metric]}</h1>
      <p className="mt-3 text-gray-600">조건에 해당하는 내역 {totalCount.toLocaleString('ko-KR')}건</p>
    </header>

    {error ? <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div>
        <p className="font-semibold">{error === 'forbidden' ? '서비스 통계 상세 조회 권한이 없습니다.' : error === 'parse' ? '서비스 통계 상세 응답을 확인하지 못했습니다.' : '서비스 통계 상세를 불러오지 못했습니다.'}</p>
        <Link href={buildHref(metric, page)} className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</Link>
      </div></div>
    </section> : details && details.length === 0 ? <section className="rounded-3xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm"><p className="text-sm font-semibold text-gray-500">해당하는 상세 내역이 없습니다.</p></section> : details ? <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"><div className="overflow-x-auto"><DetailTable rows={details} /></div></section> : null}

    {!error && details && totalPages > 1 ? <nav aria-label="서비스 통계 상세 목록 페이지" className="flex items-center justify-center gap-3">
      {page > 1 ? <Link href={buildHref(metric, page - 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} aria-hidden="true" />이전</Link> : <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} aria-hidden="true" />이전</span>}
      <span className="text-sm font-semibold text-gray-700">{page} / {totalPages}</span>
      {page < totalPages ? <Link href={buildHref(metric, page + 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} aria-hidden="true" /></Link> : <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} aria-hidden="true" /></span>}
    </nav> : null}
  </div>;
}
