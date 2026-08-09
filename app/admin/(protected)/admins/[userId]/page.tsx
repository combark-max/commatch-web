import Link from 'next/link';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import AdminAccountManagementForms from '@/components/admin/AdminAccountManagementForms';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  ADMIN_ACCOUNT_ACTION_LABELS,
  ADMIN_ACCOUNT_STATUS_LABELS,
  getAdminAccountActionClassName,
  getAdminAccountRoleClassName,
  getAdminAccountStatusClassName,
  isAdminAccountUuid,
  parseAdminAccountActions,
  parseAdminAccountDetail,
  type AdminAccountAction,
  type AdminAccountRole,
  type AdminAccountStatus,
} from '@/lib/admin/admin-accounts';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DetailSearchParams = { actionPage?: string | string[] };

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

const firstValue = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;

const normalizePage = (value: string | undefined): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_PAGE ? page : 1;
};

const buildDetailHref = (userId: string, page: number): string => (
  page > 1 ? `/admin/admins/${userId}?actionPage=${page}` : `/admin/admins/${userId}`
);

const formatDateTime = (value: string | null, emptyLabel = '해당 없음'): string => (
  value ? dateTimeFormatter.format(new Date(value)) : emptyLabel
);

function ErrorPanel({ message }: { message: string }) {
  return (
    <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-semibold">{message}</p>
          <Link href="/admin/admins" className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"><ArrowLeft size={16} aria-hidden="true" /> 관리자 계정 목록으로 돌아가기</Link>
        </div>
      </div>
    </section>
  );
}

const roleLabel = (role: AdminAccountRole | null): string => role ? getAdminRoleLabel(role) : '없음';
const statusLabel = (status: AdminAccountStatus | null): string => status ? ADMIN_ACCOUNT_STATUS_LABELS[status] : '없음';

const getActorLabel = (action: AdminAccountAction): string => (
  action.actorSnapshot.nickname
  || action.actorSnapshot.email
  || action.actorUserId
  || '삭제된 관리자'
);

function ChangeSummary({ action }: { action: AdminAccountAction }) {
  const hasRoleChange = action.previousRole !== action.newRole
    && (action.previousRole !== null || action.newRole !== null);
  const hasStatusChange = action.previousStatus !== action.newStatus
    && (action.previousStatus !== null || action.newStatus !== null);
  if (!hasRoleChange && !hasStatusChange) return <span className="text-gray-500">변경 정보 없음</span>;
  return (
    <div className="space-y-1.5">
      {hasRoleChange ? <p><span className="font-semibold text-gray-500">역할</span> {roleLabel(action.previousRole)} → {roleLabel(action.newRole)}</p> : null}
      {hasStatusChange ? <p><span className="font-semibold text-gray-500">상태</span> {statusLabel(action.previousStatus)} → {statusLabel(action.newStatus)}</p> : null}
    </div>
  );
}

export default async function AdminAccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<DetailSearchParams>;
}) {
  await requireAdminAccess('admin_accounts_manage');
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  if (!isAdminAccountUuid(userId)) return <ErrorPanel message="올바르지 않은 관리자 계정 UUID입니다." />;
  const actionPage = normalizePage(firstValue(query.actionPage));
  const actionOffset = (actionPage - 1) * PAGE_SIZE;

  const supabase = await createServerSupabaseClient();
  const [detailResult, actionsResult, authResult] = await Promise.all([
    supabase.rpc('get_admin_account_detail', { p_target_user_id: userId }),
    supabase.rpc('get_admin_account_actions', {
      p_target_user_id: userId,
      p_limit: FETCH_SIZE,
      p_offset: actionOffset,
    }),
    supabase.auth.getUser(),
  ]);

  if (detailResult.error) {
    return <ErrorPanel message={detailResult.error.code === '42501' ? '관리자 계정 상세 정보를 조회할 권한이 없습니다.' : '관리자 계정 상세 정보를 불러오지 못했습니다.'} />;
  }
  if (Array.isArray(detailResult.data) && detailResult.data.length === 0) {
    return <ErrorPanel message="관리자 계정을 찾을 수 없습니다." />;
  }
  const account = parseAdminAccountDetail(detailResult.data);
  if (!account || account.userId.toLowerCase() !== userId.toLowerCase()) {
    return <ErrorPanel message="관리자 계정 상세 응답 형식을 확인하지 못했습니다." />;
  }

  const actionsWithLookahead = actionsResult.error ? null : parseAdminAccountActions(actionsResult.data);
  const actions = actionsWithLookahead?.slice(0, PAGE_SIZE) ?? null;
  const hasNextActionPage = actionsWithLookahead !== null && actionsWithLookahead.length > PAGE_SIZE;
  const currentUserId = authResult.error ? null : authResult.data.user?.id ?? null;
  const isSelf = currentUserId?.toLowerCase() === account.userId.toLowerCase();

  return (
    <div className="space-y-6">
      <Link href="/admin/admins" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> 관리자 계정 목록
      </Link>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-green-700" size={27} aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-3xl font-black text-gray-900">{account.nickname ?? '닉네임 정보 없음'}</h1>
              <p className="mt-2 break-all text-sm text-gray-600">{account.email ?? '이메일 정보 없음'}</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-500">{account.userId}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getAdminAccountRoleClassName(account.role)}`}>{getAdminRoleLabel(account.role)}</span>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getAdminAccountStatusClassName(account.status)}`}>{ADMIN_ACCOUNT_STATUS_LABELS[account.status]}</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="admin-account-information" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="admin-account-information" className="text-xl font-black text-gray-900">기본 정보</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="font-semibold text-gray-500">역할</dt><dd className="mt-1 text-gray-900">{getAdminRoleLabel(account.role)}</dd></div>
          <div><dt className="font-semibold text-gray-500">상태</dt><dd className="mt-1 text-gray-900">{ADMIN_ACCOUNT_STATUS_LABELS[account.status]}</dd></div>
          <div><dt className="font-semibold text-gray-500">생성 관리자 UUID</dt><dd className="mt-1 break-all font-mono text-xs text-gray-900">{account.createdBy ?? '확인할 수 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">생성일</dt><dd className="mt-1 text-gray-900"><time dateTime={account.createdAt}>{formatDateTime(account.createdAt)}</time></dd></div>
          <div><dt className="font-semibold text-gray-500">수정일</dt><dd className="mt-1 text-gray-900"><time dateTime={account.updatedAt}>{formatDateTime(account.updatedAt)}</time></dd></div>
          <div><dt className="font-semibold text-gray-500">정지일</dt><dd className="mt-1 text-gray-900">{account.suspendedAt ? <time dateTime={account.suspendedAt}>{formatDateTime(account.suspendedAt)}</time> : '해당 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">회수일</dt><dd className="mt-1 text-gray-900">{account.revokedAt ? <time dateTime={account.revokedAt}>{formatDateTime(account.revokedAt)}</time> : '해당 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">전체 UUID</dt><dd className="mt-1 break-all font-mono text-xs text-gray-900">{account.userId}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="admin-account-action-history" className="overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div>
          <h2 id="admin-account-action-history" className="text-xl font-black text-gray-900">최근 감사 이력</h2>
          <p className="mt-2 text-sm text-gray-600">관리자 계정 생성과 역할·상태 변경 기록입니다. 현재 {actionPage}페이지입니다.</p>
        </div>
        {actions === null ? (
          <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-800">
            감사 이력을 불러오지 못했습니다. <a href={buildDetailHref(account.userId, actionPage)} className="ml-1 underline underline-offset-4">다시 시도</a>
          </div>
        ) : actions.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-gray-50 px-5 py-10 text-center text-sm font-semibold text-gray-500">
            {actionPage > 1 ? '현재 페이지에 감사 이력이 없습니다.' : '기록된 감사 이력이 없습니다.'}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>{['작업', '변경 내용', '실행 관리자', '사유', '실행 시각'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actions.map((action) => (
                  <tr key={action.id} className="align-top">
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${getAdminAccountActionClassName(action.actionType)}`}>{ADMIN_ACCOUNT_ACTION_LABELS[action.actionType]}</span></td>
                    <td className="px-4 py-4 text-gray-700"><ChangeSummary action={action} /></td>
                    <td className="px-4 py-4 text-gray-700">
                      <p className="max-w-56 break-all font-semibold text-gray-900">{getActorLabel(action)}</p>
                      {action.actorUserId && getActorLabel(action) !== action.actorUserId ? <p className="mt-1 font-mono text-xs text-gray-500">{action.actorUserId.slice(0, 8)}</p> : null}
                    </td>
                    <td className="max-w-72 px-4 py-4 whitespace-pre-wrap break-words text-gray-700">{action.reason ?? '입력 없음'}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-gray-600"><time dateTime={action.createdAt}>{formatDateTime(action.createdAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {actions !== null && (actions.length > 0 || actionPage > 1) ? (
          <nav aria-label="관리자 계정 감사 이력 페이지" className="mt-5 flex items-center justify-center gap-3">
            {actionPage > 1 ? <Link href={buildDetailHref(account.userId, actionPage - 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><ChevronLeft size={16} aria-hidden="true" />이전</Link> : <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400"><ChevronLeft size={16} aria-hidden="true" />이전</span>}
            <span className="text-sm font-semibold text-gray-700">{actionPage}페이지</span>
            {hasNextActionPage ? <Link href={buildDetailHref(account.userId, actionPage + 1)} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">다음<ChevronRight size={16} aria-hidden="true" /></Link> : <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">다음<ChevronRight size={16} aria-hidden="true" /></span>}
          </nav>
        ) : null}
      </section>

      <section aria-labelledby="admin-account-management" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="admin-account-management" className="text-xl font-black text-gray-900">관리자 계정 변경</h2>
        <p className="mt-2 text-sm text-gray-600">변경 시 조회한 수정 시각을 기준으로 동시 변경 여부를 확인합니다.</p>
        <div className="mt-6">
          {currentUserId === null ? (
            <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">현재 로그인한 관리자 정보를 확인하지 못해 변경 기능을 표시하지 않습니다.</p>
          ) : isSelf ? (
            <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">자신의 관리자 역할과 상태는 변경할 수 없습니다.</p>
          ) : account.status === 'revoked' ? (
            <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">회수된 관리자 계정은 terminal 상태이며 더 이상 역할이나 상태를 변경할 수 없습니다.</p>
          ) : (
            <AdminAccountManagementForms
              targetUserId={account.userId}
              currentRole={account.role}
              currentStatus={account.status}
              expectedUpdatedAt={account.updatedAt}
            />
          )}
        </div>
      </section>
    </div>
  );
}
