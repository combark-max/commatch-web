import Link from 'next/link';
import { AlertCircle, Crown } from 'lucide-react';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import {
  getPremiumStatusClassName,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_MEMBERSHIP_ACTION_LABELS,
  PREMIUM_STATUS_LABELS,
  type PremiumFeatureKey,
} from '@/lib/admin/premium-memberships';
import {
  type RecentActivityResult,
  type RecentPremiumMembershipAction,
} from '@/lib/admin/recent-admin-activities';

const formatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Seoul',
});
const formatDate = (value: string | null, empty = '해당 없음') => value ? formatter.format(new Date(value)) : empty;
const formatPeriod = (start: string | null, end: string | null) => start ? `${formatDate(start)} ~ ${formatDate(end, '무기한')}` : '해당 없음';
const formatFeatures = (features: PremiumFeatureKey[] | null) => features?.length ? features.map((key) => PREMIUM_FEATURE_LABELS[key]).join(', ') : '해당 없음';
const errorMessage = (kind: Exclude<RecentActivityResult<never>['kind'], 'success'>) => {
  if (kind === 'forbidden') return 'Premium 변경 이력 조회 권한이 없습니다.';
  if (kind === 'parse_error') return '최근 Premium 변경 응답을 확인하지 못했습니다.';
  return '최근 Premium 변경 내역을 불러오지 못했습니다.';
};

export default function AdminRecentPremiumChanges({
  result,
}: {
  result: RecentActivityResult<RecentPremiumMembershipAction[]>;
}) {
  return (
    <section aria-labelledby="recent-premium-changes-heading" className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
        <div><h2 id="recent-premium-changes-heading" className="text-xl font-black text-gray-900">최근 Premium 변경</h2><p className="mt-1 text-sm text-gray-500">최근 처리된 Premium 변경을 최대 5건 표시합니다.</p></div>
        <Crown className="shrink-0 text-gray-400" size={22} aria-hidden="true" />
      </div>
      {result.kind !== 'success' ? (
        <div className="m-5 rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800 sm:m-6"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div><p className="font-semibold">{errorMessage(result.kind)}</p><Link href="/admin/premium" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</Link></div></div></div>
      ) : result.data.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">최근 Premium 변경 내역이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] table-fixed text-left text-sm">
          <colgroup><col className="w-[18%]" /><col className="w-[19%]" /><col className="w-[23%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
          <thead className="bg-gray-50 text-gray-600"><tr>{['회원', '조치·상태 변경', '기간 변경', '기능 변경', '사유·관리자·처리 시각'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">{result.data.map((action) => {
            const memberLabel = action.nickname ?? (action.memberExists ? '닉네임 정보 없음' : '탈퇴한 회원');
            return <tr key={action.actionId} className="align-top">
              <td className="px-4 py-4">{action.memberExists ? <Link href={`/admin/members/${action.subjectUserId}`} className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">{action.profileExists ? memberLabel : '프로필 정보 없음'}</Link> : <p className="font-bold text-gray-700">탈퇴한 회원</p>}<p className="mt-1 font-mono text-xs text-gray-500">{action.subjectUserId.slice(0, 8)}</p><div className="mt-2 flex flex-wrap gap-3">{action.memberExists ? <><Link href={`/admin/members/${action.subjectUserId}`} className="text-xs font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">회원 상세</Link><Link href={`/admin/premium/${action.subjectUserId}`} className="text-xs font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">Premium 상세</Link></> : null}</div></td>
              <td className="px-4 py-4 text-gray-700"><p className="font-bold text-gray-900">{PREMIUM_MEMBERSHIP_ACTION_LABELS[action.actionType]}</p><div className="mt-2 flex flex-wrap items-center gap-1.5">{action.previousStatus ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumStatusClassName(action.previousStatus)}`}>{PREMIUM_STATUS_LABELS[action.previousStatus]}</span> : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">해당 없음</span>}<span aria-hidden="true">→</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getPremiumStatusClassName(action.newStatus)}`}>{PREMIUM_STATUS_LABELS[action.newStatus]}</span></div></td>
              <td className="px-4 py-4 text-gray-700"><p><span className="font-semibold text-gray-500">이전:</span> {formatPeriod(action.previousStartedAt, action.previousExpiresAt)}</p><p className="mt-2"><span className="font-semibold text-gray-500">신규:</span> {formatPeriod(action.newStartedAt, action.newExpiresAt)}</p></td>
              <td className="px-4 py-4 text-gray-700"><p className="break-words"><span className="font-semibold text-gray-500">이전:</span> {formatFeatures(action.previousFeatureKeys)}</p><p className="mt-2 break-words"><span className="font-semibold text-gray-500">신규:</span> {formatFeatures(action.newFeatureKeys)}</p></td>
              <td className="px-4 py-4 text-gray-700"><p className="line-clamp-3 break-words"><span className="font-semibold text-gray-500">사유:</span> {action.reason}</p><p className="mt-2 font-semibold text-gray-900">{action.adminRole ? getAdminRoleLabel(action.adminRole) : '관리자 계정 연결 없음'}</p><p className="mt-1 font-mono text-xs text-gray-500">{action.performedBy.slice(0, 8)}</p><time dateTime={action.createdAt} className="mt-2 block text-xs text-gray-600">{formatDate(action.createdAt)}</time></td>
            </tr>;
          })}</tbody>
        </table></div>
      )}
    </section>
  );
}
