import Link from 'next/link';
import { AlertCircle, ArrowLeft, Crown, Images, ShieldCheck, UserRound } from 'lucide-react';
import AdminMemberProfileImages from '@/components/admin/AdminMemberProfileImages';
import AdminMemberRestrictionForm from '@/components/admin/AdminMemberRestrictionForm';
import { type AdminRole, requireAdminAccess } from '@/lib/admin/access';
import {
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  MEMBER_RESTRICTION_ACTION_LABELS,
  parseAdminMemberRestriction,
  parseAdminMemberRestrictionActions,
  type AdminMemberRestrictionAction,
  type MemberAccountStatus,
} from '@/lib/admin/member-restrictions';
import {
  ADMIN_MEMBER_ACCOUNT_STATUS_LABELS,
  ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS,
  ADMIN_MEMBER_PREMIUM_STATUS_LABELS,
  ADMIN_MEMBER_PROFILE_STATUS_LABELS,
  ADMIN_MEMBER_PROFILE_VISIBILITY_LABELS,
  getAdminMemberAccountStatusClassName,
  getAdminMemberPremiumPeriodStateClassName,
  getAdminMemberProfileStatusClassName,
  isAdminMemberUuid,
  parseAdminMemberDetail,
  type AdminMemberDetail,
} from '@/lib/admin/members';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { normalizeProfileImagePath } from '@/lib/profile-image';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type MemberDetailError = 'invalid_uuid' | 'not_found' | 'admin_target' | 'forbidden' | 'rpc' | 'parse';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Seoul',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
});

const formatDateTime = (value: string | null, emptyLabel = '해당 없음'): string => (
  value ? dateTimeFormatter.format(new Date(value)) : emptyLabel
);

const formatSuspensionEnd = (
  accountStatus: MemberAccountStatus,
  suspendedUntil: string | null,
): string => {
  if (suspendedUntil) return dateTimeFormatter.format(new Date(suspendedUntil));
  return accountStatus === 'suspended' ? '무기한' : '정지 없음';
};

const formatBirthDate = (value: string | null): string => (
  value ? dateFormatter.format(new Date(`${value}T00:00:00+09:00`)) : '미입력'
);

const getProfileImageUrl = (storedValue: string): string | null => {
  const path = normalizeProfileImagePath(storedValue.trim());
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !baseUrl) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/public/profile_images/${encodedPath}`;
};

const getProfileImageUrls = (member: AdminMemberDetail): string[] => {
  const storedValues = [member.profileImage, ...(member.profileImages ?? [])];
  const urls = storedValues.flatMap((value) => {
    if (typeof value !== 'string' || value.trim() === '') return [];
    const url = getProfileImageUrl(value);
    return url ? [url] : [];
  });
  return [...new Set(urls)];
};

const getGenderLabel = (value: string | null): string => {
  if (value === 'male') return '남성';
  if (value === 'female') return '여성';
  return value?.trim() || '미입력';
};

const getMarriageHistoryLabel = (value: string | null): string => {
  if (value === 'first_marriage') return '초혼';
  if (value === 'remarriage') return '재혼';
  return value?.trim() || '미입력';
};

const displayText = (value: string | null): string => value?.trim() || '미입력';

const isAdminRole = (value: string | null): value is AdminRole => (
  value === 'super_admin' || value === 'admin' || value === 'moderator'
);

const getErrorMessage = (error: MemberDetailError): string => {
  if (error === 'invalid_uuid') return '올바르지 않은 회원 UUID입니다.';
  if (error === 'not_found') return '회원 정보를 찾을 수 없습니다.';
  if (error === 'admin_target') return '관리자 계정은 회원 상세 조회 대상이 아닙니다.';
  if (error === 'forbidden') return '회원 상세 정보를 조회할 권한이 없습니다.';
  if (error === 'parse') return '회원 상세 응답 형식을 확인하지 못했습니다.';
  return '회원 상세 정보를 불러오지 못했습니다.';
};

function ErrorPanel({ error }: { error: MemberDetailError }) {
  return (
    <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
        <div>
          <p className="font-semibold">{getErrorMessage(error)}</p>
          <Link href="/admin/members" className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4">
            <ArrowLeft size={16} aria-hidden="true" /> 회원 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </section>
  );
}

function InformationItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-gray-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-gray-900">{value}</dd>
    </div>
  );
}

export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const adminAccess = await requireAdminAccess('member_restrictions_view');
  const { userId } = await params;
  if (!isAdminMemberUuid(userId)) return <ErrorPanel error="invalid_uuid" />;

  const supabase = await createServerSupabaseClient();
  const [memberResult, restrictionResult, restrictionActionsResult] = await Promise.all([
    supabase.rpc('get_admin_member_detail', { p_target_user_id: userId }),
    supabase.rpc('get_admin_member_restriction', { p_target_user_id: userId }),
    supabase.rpc('get_admin_member_restriction_actions', { p_target_user_id: userId }),
  ]);
  const { data, error: rpcError } = memberResult;
  if (rpcError) {
    const error: MemberDetailError = rpcError.code === 'P0002'
      ? 'not_found'
      : rpcError.code === '22023'
        ? 'admin_target'
        : rpcError.code === '42501'
          ? 'forbidden'
          : 'rpc';
    return <ErrorPanel error={error} />;
  }

  const member = parseAdminMemberDetail(data);
  if (!member || member.memberUserId.toLowerCase() !== userId.toLowerCase()) {
    return <ErrorPanel error="parse" />;
  }

  const restriction = restrictionResult.error
    ? null
    : parseAdminMemberRestriction(restrictionResult.data);
  const restrictionActions: AdminMemberRestrictionAction[] | null = restrictionActionsResult.error
    ? null
    : parseAdminMemberRestrictionActions(restrictionActionsResult.data);
  const restrictionLoadFailed = restriction === null
    || restriction.userId.toLowerCase() !== userId.toLowerCase();
  const canManageRestrictions = adminAccess.permissions.includes('member_restrictions_manage');
  const imageUrls = getProfileImageUrls(member);

  return (
    <div className="space-y-6">
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> 회원 목록
      </Link>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <UserRound className="mt-1 shrink-0 text-green-700" size={27} aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="text-3xl font-black text-gray-900">{member.nickname ?? '닉네임 정보 없음'}</h1>
              <p className="mt-2 break-all font-mono text-xs text-gray-500">{member.memberUserId}</p>
              <p className="mt-3 text-sm text-gray-600">숨김 여부와 관계없이 관리자 권한으로 조회한 회원 정보입니다.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {member.profileExists && member.profileVisibility === 'visible' ? (
              <Link href={`/members/${member.memberUserId}`} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                <UserRound size={16} aria-hidden="true" /> 일반 회원 화면
              </Link>
            ) : null}
            <Link href={`/admin/premium/${member.memberUserId}`} className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 transition hover:bg-green-100">
              <Crown size={16} aria-hidden="true" /> Premium 상세
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="member-account-summary" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="member-account-summary" className="text-xl font-black text-gray-900">회원 및 계정 상태</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getAdminMemberProfileStatusClassName(member.profileStatus)}`}>
            {ADMIN_MEMBER_PROFILE_STATUS_LABELS[member.profileStatus]}
          </span>
          {member.profileVisibility ? (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${member.profileVisibility === 'visible' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {ADMIN_MEMBER_PROFILE_VISIBILITY_LABELS[member.profileVisibility]}
            </span>
          ) : null}
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getAdminMemberAccountStatusClassName(member.currentAccountStatus)}`}>
            계정 {ADMIN_MEMBER_ACCOUNT_STATUS_LABELS[member.currentAccountStatus]}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <InformationItem label="가입일" value={formatDateTime(member.joinedAt)} />
          <InformationItem label="프로필 존재 여부" value={member.profileExists ? '있음' : '없음'} />
          <InformationItem label="저장된 계정 상태" value={ADMIN_MEMBER_ACCOUNT_STATUS_LABELS[member.storedAccountStatus]} />
          <InformationItem label="현재 계정 상태" value={ADMIN_MEMBER_ACCOUNT_STATUS_LABELS[member.currentAccountStatus]} />
          <InformationItem label="정지 시작" value={formatDateTime(member.suspendedAt)} />
          <InformationItem label="정지 종료" value={formatDateTime(member.suspendedUntil, member.suspendedAt ? '무기한' : '해당 없음')} />
        </dl>
      </section>

      <section aria-labelledby="member-restriction-management" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-green-700" size={22} aria-hidden="true" />
          <h2 id="member-restriction-management" className="text-xl font-black text-gray-900">회원 제재 관리</h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          신고 연결 없이 이 회원의 이용 상태와 프로필 노출 상태를 직접 변경합니다. 모든 변경은 회원 제재 이력에 기록됩니다.
        </p>
        {restrictionLoadFailed || !restriction ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">
            회원 제재 정보를 불러오지 못했습니다.
          </p>
        ) : (
          <div className="mt-6 border-t border-gray-100 pt-6">
            <AdminMemberRestrictionForm
              reportId={null}
              targetUserId={member.memberUserId}
              targetLabel={member.nickname ?? '닉네임 정보 없음'}
              restriction={restriction}
              canManage={canManageRestrictions}
              canApply
            />
          </div>
        )}
      </section>

      <section aria-labelledby="member-profile-detail" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Images className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="member-profile-detail" className="text-xl font-black text-gray-900">프로필 정보</h2>
        </div>
        {!member.profileExists ? (
          <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">작성된 프로필이 없습니다.</p>
        ) : (
          <>
            <AdminMemberProfileImages
              imageUrls={imageUrls}
              memberLabel={member.nickname ?? '회원'}
            />
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <InformationItem label="닉네임" value={displayText(member.nickname)} />
              <InformationItem label="성별" value={getGenderLabel(member.gender)} />
              <InformationItem label="생년월일" value={formatBirthDate(member.birthDate)} />
              <InformationItem label="키" value={member.height === null ? '미입력' : `${member.height}cm`} />
              <InformationItem label="지역" value={displayText(member.region)} />
              <InformationItem label="직업" value={displayText(member.job)} />
              <InformationItem label="학력" value={displayText(member.education)} />
              <InformationItem label="취미" value={displayText(member.hobby)} />
              <InformationItem label="음주" value={displayText(member.drinking)} />
              <InformationItem label="흡연" value={displayText(member.smoking)} />
              <InformationItem label="결혼 이력" value={getMarriageHistoryLabel(member.marriageHistory)} />
              <div className="sm:col-span-2 xl:col-span-4">
                <InformationItem label="자기소개" value={displayText(member.introduction)} />
              </div>
              <div className="sm:col-span-2 xl:col-span-4">
                <InformationItem label="결혼 가치관" value={displayText(member.marriageValues)} />
              </div>
            </dl>
          </>
        )}
      </section>

      <section aria-labelledby="member-premium-summary" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Crown className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="member-premium-summary" className="text-xl font-black text-gray-900">Premium 요약</h2>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getAdminMemberPremiumPeriodStateClassName(member.premiumPeriodState)}`}>
            {ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS[member.premiumPeriodState]}
          </span>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <InformationItem label="Membership 보유" value={member.premiumMembershipExists ? '보유' : '미보유'} />
          <InformationItem label="저장 상태" value={member.premiumStoredStatus ? ADMIN_MEMBER_PREMIUM_STATUS_LABELS[member.premiumStoredStatus] : '해당 없음'} />
          <InformationItem label="현재 이용 가능" value={member.premiumIsAvailable ? '가능' : '불가'} />
          <InformationItem label="기간 상태" value={ADMIN_MEMBER_PREMIUM_PERIOD_STATE_LABELS[member.premiumPeriodState]} />
          <InformationItem label="시작일" value={formatDateTime(member.premiumStartedAt)} />
          <InformationItem label="만료일" value={formatDateTime(member.premiumExpiresAt, member.premiumMembershipExists ? '무기한' : '해당 없음')} />
        </dl>
      </section>

      <section aria-labelledby="member-restriction-history" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="member-restriction-history" className="text-xl font-black text-gray-900">회원 제재 이력</h2>
        </div>
        {restrictionActions === null ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">
            회원 제재 이력을 불러오지 못했습니다.
          </p>
        ) : restrictionActions.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">
            아직 회원 제재 이력이 없습니다.
          </p>
        ) : (
          <ol className="mt-5 space-y-4">
            {restrictionActions.map((action) => (
              <li key={action.actionId} className="rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-gray-900">{MEMBER_RESTRICTION_ACTION_LABELS[action.actionType]}</p>
                  <time className="text-xs font-medium text-gray-500" dateTime={action.createdAt}>
                    {dateTimeFormatter.format(new Date(action.createdAt))}
                  </time>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-gray-500">이용 상태</dt>
                    <dd className="mt-1 text-gray-900">
                      {MEMBER_ACCOUNT_STATUS_LABELS[action.previousAccountStatus]} → {MEMBER_ACCOUNT_STATUS_LABELS[action.newAccountStatus]}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">프로필 상태</dt>
                    <dd className="mt-1 text-gray-900">
                      {MEMBER_PROFILE_VISIBILITY_LABELS[action.previousProfileVisibility]} → {MEMBER_PROFILE_VISIBILITY_LABELS[action.newProfileVisibility]}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">정지 종료</dt>
                    <dd className="mt-1 text-gray-900">
                      {formatSuspensionEnd(action.previousAccountStatus, action.previousSuspendedUntil)}
                      {' → '}
                      {formatSuspensionEnd(action.newAccountStatus, action.newSuspendedUntil)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">처리 관리자 UUID</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-gray-900">
                      {action.adminUserId ?? '처리 관리자 정보 없음'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">관리자 역할</dt>
                    <dd className="mt-1 text-gray-900">
                      {isAdminRole(action.adminRole) ? getAdminRoleLabel(action.adminRole) : '처리 관리자 정보 없음'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">관련 신고</dt>
                    <dd className="mt-1 text-gray-900">
                      {action.reportId ? (
                        <Link href={`/admin/reports/${action.reportId}`} className="font-bold text-green-700 hover:underline">
                          신고 {action.reportId.slice(0, 8)}
                        </Link>
                      ) : '관련 신고 없음'}
                    </dd>
                  </div>
                </dl>
                {action.reason ? (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm text-gray-700">
                    <strong className="text-gray-900">제재 사유:</strong> {action.reason}
                  </p>
                ) : null}
                {action.note ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">
                    <strong className="text-gray-900">관리자 메모:</strong> {action.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
