import Link from 'next/link';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import {
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  MEMBER_RESTRICTION_ACTION_LABELS,
  type MemberAccountStatus,
} from '@/lib/admin/member-restrictions';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import {
  type RecentActivityResult,
  type RecentMemberRestrictionAction,
} from '@/lib/admin/recent-admin-activities';

const formatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Seoul',
});
const formatDate = (value: string | null, empty = '없음·무기한') => (
  value ? formatter.format(new Date(value)) : empty
);
const statusClass = (status: MemberAccountStatus) => (
  status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
);
const adminLabel = (action: RecentMemberRestrictionAction) => (
  action.adminRole ? getAdminRoleLabel(action.adminRole)
    : action.adminUserId ? '관리자 계정 연결 없음' : '처리 관리자 정보 없음'
);
const errorMessage = (kind: Exclude<RecentActivityResult<never>['kind'], 'success'>) => {
  if (kind === 'forbidden') return '회원 제재 이력 조회 권한이 없습니다.';
  if (kind === 'parse_error') return '최근 회원 제재 응답을 확인하지 못했습니다.';
  return '최근 회원 제재 내역을 불러오지 못했습니다.';
};

export default function AdminRecentRestrictions({
  result,
}: {
  result: RecentActivityResult<RecentMemberRestrictionAction[]>;
}) {
  return (
    <section aria-labelledby="recent-restrictions-heading" className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
        <div>
          <h2 id="recent-restrictions-heading" className="text-xl font-black text-gray-900">최근 회원 제재</h2>
          <p className="mt-1 text-sm text-gray-500">신고 처리와 관련해 최근 적용되거나 변경된 회원 제재를 확인합니다.</p>
        </div>
        <ShieldCheck className="shrink-0 text-gray-400" size={22} aria-hidden="true" />
      </div>
      {result.kind !== 'success' ? (
        <div className="m-5 rounded-2xl border border-red-100 bg-red-50 p-5 text-red-800 sm:m-6">
          <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div>
            <p className="font-semibold">{errorMessage(result.kind)}</p>
            <Link href="/admin/reports" className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">다시 시도</Link>
          </div></div>
        </div>
      ) : result.data.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm font-medium text-gray-500">최근 회원 제재 내역이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] table-fixed text-left text-sm">
            <colgroup><col className="w-[18%]" /><col className="w-[25%]" /><col className="w-[18%]" /><col className="w-[23%]" /><col className="w-[16%]" /></colgroup>
            <thead className="bg-gray-50 text-gray-600"><tr>
              {['회원', '조치·상태 변경', '정지 기간', '사유·메모·관련 신고', '관리자·처리 시각'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {result.data.map((action) => {
                const label = action.nickname ?? (action.memberExists ? '닉네임 정보 없음' : '탈퇴한 회원');
                return <tr key={action.actionId} className="align-top">
                  <td className="px-4 py-4">
                    {action.memberExists ? <Link href={`/admin/members/${action.subjectUserId}`} className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">{action.profileExists ? label : '프로필 정보 없음'}</Link> : <p className="font-bold text-gray-700">탈퇴한 회원</p>}
                    <p className="mt-1 font-mono text-xs text-gray-500">{action.subjectUserId.slice(0, 8)}</p>
                  </td>
                  <td className="px-4 py-4 text-gray-700">
                    <p className="font-bold text-gray-900">{MEMBER_RESTRICTION_ACTION_LABELS[action.actionType]}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(action.previousAccountStatus)}`}>{MEMBER_ACCOUNT_STATUS_LABELS[action.previousAccountStatus]}</span><span aria-hidden="true">→</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(action.newAccountStatus)}`}>{MEMBER_ACCOUNT_STATUS_LABELS[action.newAccountStatus]}</span></div>
                    <p className="mt-2 text-xs text-gray-500">프로필 {MEMBER_PROFILE_VISIBILITY_LABELS[action.previousProfileVisibility]} → {MEMBER_PROFILE_VISIBILITY_LABELS[action.newProfileVisibility]}</p>
                  </td>
                  <td className="px-4 py-4 text-gray-700">{action.previousSuspendedUntil !== action.newSuspendedUntil ? <><p><span className="font-semibold text-gray-500">이전:</span> {formatDate(action.previousSuspendedUntil)}</p><p className="mt-1.5"><span className="font-semibold text-gray-500">신규:</span> {formatDate(action.newSuspendedUntil)}</p></> : '변경 없음'}</td>
                  <td className="px-4 py-4 text-gray-700"><p className="line-clamp-2 break-words"><span className="font-semibold text-gray-500">사유:</span> {action.reason ?? '해당 없음'}</p><p className="mt-1.5 line-clamp-2 break-words"><span className="font-semibold text-gray-500">메모:</span> {action.note ?? '해당 없음'}</p><div className="mt-2">{action.reportId && action.reportExists ? <Link href={`/admin/reports/${action.reportId}`} className="font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">신고 {action.reportId.slice(0, 8)}</Link> : <span className="text-gray-500">연결된 신고 없음</span>}</div></td>
                  <td className="px-4 py-4 text-gray-700"><p className="font-semibold text-gray-900">{adminLabel(action)}</p>{action.adminUserId ? <p className="mt-1 font-mono text-xs text-gray-500">{action.adminUserId.slice(0, 8)}</p> : null}<time dateTime={action.createdAt} className="mt-2 block text-xs text-gray-600">{formatDate(action.createdAt)}</time></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
