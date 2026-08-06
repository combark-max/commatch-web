import Link from 'next/link';
import { AlertCircle, ArrowLeft, Crown, History, UserRound } from 'lucide-react';
import AdminPremiumMembershipForm from '@/components/admin/AdminPremiumMembershipForm';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  getPremiumPeriodState,
  getPremiumPeriodStateClassName,
  getPremiumStatusClassName,
  isUuid,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  parseAdminPremiumMembershipDetail,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_MEMBERSHIP_ACTION_LABELS,
  PREMIUM_PERIOD_STATE_LABELS,
  PREMIUM_STATUS_LABELS,
  type AdminPremiumMembershipAction,
  type PremiumFeatureKey,
  type PremiumPeriodState,
} from '@/lib/admin/premium-memberships';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type PremiumDetailError =
  | 'invalid_uuid'
  | 'not_found'
  | 'admin_target'
  | 'forbidden'
  | 'rpc'
  | 'parse';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

const formatDateTime = (value: string | null, emptyLabel = '해당 없음'): string => (
  value ? dateTimeFormatter.format(new Date(value)) : emptyLabel
);

const formatPeriod = (startedAt: string | null, expiresAt: string | null): string => (
  startedAt
    ? `${formatDateTime(startedAt)} ~ ${formatDateTime(expiresAt, '무기한')}`
    : '해당 없음'
);

const getErrorMessage = (error: PremiumDetailError): string => {
  if (error === 'invalid_uuid') return '올바르지 않은 회원 UUID입니다.';
  if (error === 'not_found') return '회원 정보를 찾을 수 없습니다.';
  if (error === 'admin_target') return '관리자 계정은 회원 Premium 관리 대상이 아닙니다.';
  if (error === 'forbidden') return 'Premium 상세 정보를 조회할 권한이 없습니다.';
  if (error === 'parse') return 'Premium 상세 응답을 확인하지 못했습니다.';
  return 'Premium 상세 정보를 불러오지 못했습니다.';
};

const getStatusMessage = (state: PremiumPeriodState): string => {
  if (state === 'none') return '현재 Premium이 부여되지 않은 회원입니다.';
  if (state === 'not_started') return 'Premium 시작일 전입니다.';
  if (state === 'expired') return 'Premium 이용 기간이 만료되었습니다.';
  if (state === 'suspended') return 'Premium 저장 상태가 정지입니다.';
  if (state === 'revoked') return 'Premium 권한이 회수된 상태입니다.';
  if (state === 'available') return 'Premium 상태와 기간 기준으로 이용 가능합니다.';
  return 'Premium 상태와 기간 기준으로 이용할 수 없습니다.';
};

function ErrorPanel({ error }: { error: PremiumDetailError }) {
  return (
    <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-semibold">{getErrorMessage(error)}</p>
          <Link href="/admin/premium" className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
            <ArrowLeft size={16} aria-hidden="true" /> Premium 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeatureBadges({ featureKeys }: { featureKeys: PremiumFeatureKey[] | null }) {
  if (!featureKeys || featureKeys.length === 0) return <span className="text-gray-500">해당 없음</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {featureKeys.map((featureKey) => (
        <span key={featureKey} className="inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800">
          {PREMIUM_FEATURE_LABELS[featureKey]}
        </span>
      ))}
    </div>
  );
}

function ActionHistory({ actions }: { actions: AdminPremiumMembershipAction[] }) {
  if (actions.length === 0) {
    return <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">Premium 변경 이력이 없습니다.</p>;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[17%]" />
          <col className="w-[24%]" />
          <col className="w-[21%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            {['처리 시각·작업', '상태 변경', '기간 변경', '기능 변경', '사유·수행 관리자'].map((label) => (
              <th key={label} scope="col" className="px-4 py-3 font-semibold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {actions.map((action) => (
            <tr key={action.actionId} className="align-top">
              <td className="px-4 py-4 text-gray-600">
                <time dateTime={action.createdAt}>{formatDateTime(action.createdAt)}</time>
                <p className="mt-2 font-bold text-gray-900">{PREMIUM_MEMBERSHIP_ACTION_LABELS[action.actionType]}</p>
              </td>
              <td className="px-4 py-4 text-gray-700">
                <p><span className="font-semibold text-gray-500">이전:</span> {action.previousStatus ? PREMIUM_STATUS_LABELS[action.previousStatus] : '해당 없음'}</p>
                <p className="mt-2"><span className="font-semibold text-gray-500">신규:</span> {PREMIUM_STATUS_LABELS[action.newStatus]}</p>
              </td>
              <td className="px-4 py-4 text-gray-700">
                <p><span className="font-semibold text-gray-500">이전:</span> {formatPeriod(action.previousStartedAt, action.previousExpiresAt)}</p>
                <p className="mt-2"><span className="font-semibold text-gray-500">신규:</span> {formatPeriod(action.newStartedAt, action.newExpiresAt)}</p>
              </td>
              <td className="px-4 py-4">
                <div>
                  <p className="mb-1.5 font-semibold text-gray-500">이전</p>
                  <FeatureBadges featureKeys={action.previousFeatureKeys} />
                </div>
                <div className="mt-3">
                  <p className="mb-1.5 font-semibold text-gray-500">신규</p>
                  <FeatureBadges featureKeys={action.newFeatureKeys} />
                </div>
              </td>
              <td className="px-4 py-4 text-gray-700">
                <p className="whitespace-pre-wrap break-words">{action.reason}</p>
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500">수행 관리자 UUID</p>
                  <p className="mt-1 break-all font-mono text-xs text-gray-600">{action.performedBy}</p>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminPremiumMembershipDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const adminAccess = await requireAdminAccess('premium_memberships_view');
  const { userId } = await params;

  if (!isUuid(userId)) return <ErrorPanel error="invalid_uuid" />;

  const supabase = await createServerSupabaseClient();
  const { data, error: rpcError } = await supabase.rpc('get_admin_premium_membership', {
    p_subject_user_id: userId,
    p_action_limit: 50,
  });

  if (rpcError) {
    const error: PremiumDetailError = rpcError.code === 'P0002'
      ? 'not_found'
      : rpcError.code === '22023'
        ? 'admin_target'
        : rpcError.code === '42501'
          ? 'forbidden'
          : 'rpc';
    return <ErrorPanel error={error} />;
  }

  const membership = parseAdminPremiumMembershipDetail(data);
  if (
    !membership
    || membership.subjectUserId.toLowerCase() !== userId.toLowerCase()
  ) return <ErrorPanel error="parse" />;

  const storedStatus = membership.storedStatus ?? 'none';
  const periodState = getPremiumPeriodState(membership);
  const canManage = adminAccess.permissions.includes('premium_memberships_manage');

  return (
    <div className="space-y-6">
      <Link href="/admin/premium" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> Premium 목록
      </Link>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <Crown className="mt-1 shrink-0 text-green-700" size={26} aria-hidden="true" />
          <div>
            <h1 className="text-3xl font-black text-gray-900">Premium 상세</h1>
            <p className="mt-2 max-w-3xl text-gray-600">
              회원의 Premium 저장 상태, 기간, 기능 권한과 변경 이력을 조회하는 화면입니다.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="premium-member-information" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <UserRound className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="premium-member-information" className="text-xl font-black text-gray-900">회원 정보</h2>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <div><dt className="font-semibold text-gray-500">닉네임</dt><dd className="mt-1 text-gray-900">{membership.nickname ?? '닉네임 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">회원 UUID</dt><dd className="mt-1 break-all text-gray-900">{membership.subjectUserId}</dd></div>
          <div><dt className="font-semibold text-gray-500">프로필</dt><dd className="mt-1 text-gray-900">{membership.profileExists ? '프로필 있음' : '프로필 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">저장된 회원 상태</dt><dd className="mt-1 text-gray-900">{MEMBER_ACCOUNT_STATUS_LABELS[membership.accountStatus]}</dd></div>
          <div><dt className="font-semibold text-gray-500">프로필 노출 상태</dt><dd className="mt-1 text-gray-900">{MEMBER_PROFILE_VISIBILITY_LABELS[membership.profileVisibility]}</dd></div>
        </dl>
        {membership.profileExists && membership.profileVisibility === 'visible' ? (
          <Link
            href={`/members/${membership.subjectUserId}`}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <UserRound size={16} aria-hidden="true" /> 회원 프로필 보기
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="premium-current-status" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="premium-current-status" className="text-xl font-black text-gray-900">Premium 현재 상태</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPremiumStatusClassName(storedStatus)}`}>
            {PREMIUM_STATUS_LABELS[storedStatus]}
          </span>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getPremiumPeriodStateClassName(periodState)}`}>
            {PREMIUM_PERIOD_STATE_LABELS[periodState]}
          </span>
        </div>
        <p className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-700">{getStatusMessage(periodState)}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="font-semibold text-gray-500">Premium 보유 여부</dt><dd className="mt-1 text-gray-900">{membership.membershipExists ? '보유' : '미보유'}</dd></div>
          <div><dt className="font-semibold text-gray-500">Membership ID</dt><dd className="mt-1 break-all text-gray-900">{membership.membershipId ?? '해당 없음'}</dd></div>
          <div><dt className="font-semibold text-gray-500">저장 상태</dt><dd className="mt-1 text-gray-900">{membership.membershipExists ? PREMIUM_STATUS_LABELS[storedStatus] : '해당 없음'}</dd></div>
          <div>
            <dt className="font-semibold text-gray-500">기간 상태</dt>
            <dd className="mt-1 text-gray-900">{PREMIUM_PERIOD_STATE_LABELS[periodState]}</dd>
            <dd className="mt-1 text-xs text-gray-500">Premium 상태·기간 기준</dd>
          </div>
          <div><dt className="font-semibold text-gray-500">시작일</dt><dd className="mt-1 text-gray-900">{formatDateTime(membership.startedAt)}</dd></div>
          <div><dt className="font-semibold text-gray-500">만료일</dt><dd className="mt-1 text-gray-900">{formatDateTime(membership.expiresAt, membership.membershipExists ? '무기한' : '해당 없음')}</dd></div>
          <div className="sm:col-span-2 xl:col-span-1"><dt className="font-semibold text-gray-500">기능 권한</dt><dd className="mt-2"><FeatureBadges featureKeys={membership.featureKeys} /></dd></div>
          <div><dt className="font-semibold text-gray-500">최근 변경 시각</dt><dd className="mt-1 text-gray-900">{formatDateTime(membership.membershipUpdatedAt)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="premium-action-history" className="overflow-hidden rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="premium-action-history" className="text-xl font-black text-gray-900">최근 변경 이력</h2>
        </div>
        <ActionHistory actions={membership.recentActions} />
      </section>

      <section aria-labelledby="premium-membership-management" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="premium-membership-management" className="text-xl font-black text-gray-900">Premium 수동 관리</h2>
        <p className="mt-2 text-sm text-gray-500">변경 내용은 관리자 사유와 함께 Premium 변경 이력에 기록됩니다.</p>
        <div className="mt-5">
          {canManage ? (
            <AdminPremiumMembershipForm
              subjectUserId={membership.subjectUserId}
              membershipExists={membership.membershipExists}
              storedStatus={membership.storedStatus}
              startedAt={membership.startedAt}
              expiresAt={membership.expiresAt}
              featureKeys={membership.featureKeys}
              membershipUpdatedAt={membership.membershipUpdatedAt}
            />
          ) : (
            <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
              Premium 정보를 조회할 수 있지만 변경 권한은 없습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
