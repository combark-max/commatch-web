import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  FileWarning,
  MessageSquareWarning,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import AdminMemberRestrictionForm from '@/components/admin/AdminMemberRestrictionForm';
import AdminReportStatusForm from '@/components/admin/AdminReportStatusForm';
import { type AdminRole, requireAdminAccess } from '@/lib/admin/access';
import {
  isMemberCurrentlyAllowed,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  MEMBER_RESTRICTION_ACTION_LABELS,
  parseAdminMemberRestriction,
  parseAdminMemberRestrictionActions,
  type AdminMemberRestriction,
  type AdminMemberRestrictionAction,
} from '@/lib/admin/member-restrictions';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import {
  getReportStatusClassName,
  isReportStatus,
  isReportTargetType,
  isUuid,
  parseAdminReportActions,
  parseAdminReportDetail,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type AdminReportProfile,
} from '@/lib/admin/reports';
import { normalizeProfileImagePath } from '@/lib/profile-image';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type DetailSearchParams = {
  status?: string | string[];
  type?: string | string[];
  page?: string | string[];
};

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

const firstValue = (value: string | string[] | undefined): string | undefined => (
  Array.isArray(value) ? value[0] : value
);

const buildBackHref = (query: DetailSearchParams): string => {
  const params = new URLSearchParams();
  const status = firstValue(query.status);
  const type = firstValue(query.type);
  const page = firstValue(query.page);
  if (isReportStatus(status)) params.set('status', status);
  if (isReportTargetType(type)) params.set('type', type);
  if (page && /^[1-9]\d*$/.test(page) && page !== '1') params.set('page', page);
  const value = params.toString();
  return value ? `/admin/reports?${value}` : '/admin/reports';
};

const getProfileImageUrl = (storedValue: string | null): string | null => {
  const path = normalizeProfileImagePath(storedValue);
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/profile_images/${path.split('/').map(encodeURIComponent).join('/')}`;
};

const getGenderLabel = (value: string | null): string => {
  if (value === 'male') return '남성';
  if (value === 'female') return '여성';
  return value ?? '정보 없음';
};

const getMarriageHistoryLabel = (value: string | null): string => {
  if (value === 'first_marriage') return '초혼';
  if (value === 'remarriage') return '재혼';
  return '미입력';
};

const isAdminRole = (value: string | null): value is AdminRole => (
  value === 'super_admin' || value === 'admin' || value === 'moderator'
);

function ProfileCard({
  title,
  userId,
  profile,
  showMarriageHistory = false,
}: {
  title: string;
  userId: string;
  profile: AdminReportProfile & { marriageHistory?: string | null };
  showMarriageHistory?: boolean;
}) {
  const imageUrl = getProfileImageUrl(profile.profileImage);

  return (
    <article className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
      <h3 className="text-sm font-black text-gray-900">{title}</h3>
      <div className="mt-4 flex items-start gap-4">
        {imageUrl ? (
          <div
            role="img"
            aria-label={`${profile.nickname ?? title} 프로필 이미지`}
            className="h-16 w-16 shrink-0 rounded-2xl bg-cover bg-center"
            style={{ backgroundImage: `url("${imageUrl}")` }}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gray-200 text-gray-500">
            <UserRound size={28} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          {profile.memberExists ? (
            <Link
              href={`/admin/members/${userId}`}
              aria-label={`${profile.nickname ?? '프로필 정보 없음'} 관리자 회원 상세 보기`}
              className="font-bold text-gray-900 underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              {profile.profileExists && profile.nickname ? profile.nickname : '프로필 정보 없음'}
            </Link>
          ) : (
            <p className="font-bold text-gray-900">탈퇴한 회원</p>
          )}
          <p className="mt-1 break-all text-xs text-gray-500">{userId}</p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-gray-500">성별</dt><dd className="mt-1 text-gray-800">{getGenderLabel(profile.gender)}</dd></div>
        <div><dt className="font-semibold text-gray-500">생년월일</dt><dd className="mt-1 text-gray-800">{profile.birthDate ? dateFormatter.format(new Date(`${profile.birthDate}T00:00:00+09:00`)) : '정보 없음'}</dd></div>
        <div><dt className="font-semibold text-gray-500">지역</dt><dd className="mt-1 text-gray-800">{profile.region ?? '정보 없음'}</dd></div>
        <div><dt className="font-semibold text-gray-500">직업</dt><dd className="mt-1 text-gray-800">{profile.job ?? '정보 없음'}</dd></div>
        {showMarriageHistory ? (
          <div><dt className="font-semibold text-gray-500">결혼 이력</dt><dd className="mt-1 text-gray-800">{getMarriageHistoryLabel(profile.marriageHistory ?? null)}</dd></div>
        ) : null}
      </dl>
    </article>
  );
}

const DisabledAction = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <span aria-disabled="true" className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-400">
    {icon}{label}
  </span>
);

const MatchParticipant = ({
  userId,
  nickname,
  messageSenderId,
}: {
  userId: string | null;
  nickname: string | null;
  messageSenderId: string | null;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
    <p className="font-semibold text-gray-900">
      {nickname ?? '닉네임 정보 없음'}
      {userId && userId === messageSenderId ? <span className="ml-2 text-xs font-bold text-green-700">· 메시지 작성자</span> : null}
    </p>
    <p className="mt-1 break-all text-xs text-gray-500">{userId ?? '사용자 ID 정보 없음'}</p>
  </div>
);

export default async function AdminReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<DetailSearchParams>;
}) {
  const adminAccess = await requireAdminAccess('reports_view');
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const backHref = buildBackHref(query);

  if (!isUuid(id)) {
    return (
      <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">올바르지 않은 신고 번호입니다.</p>
        <Link href={backHref} className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"><ArrowLeft size={16} /> 목록으로 돌아가기</Link>
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [detailResult, actionsResult] = await Promise.all([
    supabase.rpc('get_admin_report_detail', { p_report_id: id }),
    supabase.rpc('get_admin_report_actions', { p_report_id: id }),
  ]);
  const detail = detailResult.error ? null : parseAdminReportDetail(detailResult.data);
  const actions = actionsResult.error ? null : parseAdminReportActions(actionsResult.data);
  const reportMissing = !detailResult.error && Array.isArray(detailResult.data) && detailResult.data.length === 0;

  if (!detail) {
    return (
      <section className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div>
            <p className="font-semibold">{reportMissing ? '신고 정보를 찾을 수 없습니다.' : '신고 정보를 불러오지 못했습니다.'}</p>
            <Link href={backHref} className="mt-3 inline-flex items-center gap-1 text-sm font-bold underline underline-offset-4"><ArrowLeft size={16} /> 목록으로 돌아가기</Link>
          </div>
        </div>
      </section>
    );
  }

  const canViewRestrictions = adminAccess.permissions.includes('member_restrictions_view');
  const canManageRestrictions = adminAccess.permissions.includes('member_restrictions_manage');
  const messageTargetMatches = detail.targetType !== 'message'
    || detail.message.senderId === detail.reportedUserId;
  let restriction: AdminMemberRestriction | null = null;
  let restrictionActions: AdminMemberRestrictionAction[] | null = null;
  let restrictionLoadFailed = false;
  let restrictionActionsLoadFailed = false;

  if (canViewRestrictions) {
    const [restrictionResult, restrictionActionsResult] = await Promise.all([
      supabase.rpc('get_admin_member_restriction', {
        p_target_user_id: detail.reportedUserId,
      }),
      supabase.rpc('get_admin_member_restriction_actions', {
        p_target_user_id: detail.reportedUserId,
      }),
    ]);
    restriction = restrictionResult.error
      ? null
      : parseAdminMemberRestriction(restrictionResult.data);
    restrictionActions = restrictionActionsResult.error
      ? null
      : parseAdminMemberRestrictionActions(restrictionActionsResult.data);
    restrictionLoadFailed = restriction === null;
    restrictionActionsLoadFailed = restrictionActions === null;
  }

  const restrictionTargetLabel = restriction?.nickname
    ?? detail.reported.nickname
    ?? '닉네임 정보 없음';
  const currentlyAllowed = restriction ? isMemberCurrentlyAllowed(restriction) : null;

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-gray-900">
        <ArrowLeft size={17} aria-hidden="true" /> 신고 목록
      </Link>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold text-green-700">{REPORT_TARGET_LABELS[detail.targetType]}</p>
            <h1 className="mt-2 text-3xl font-black text-gray-900">신고 상세</h1>
            <p className="mt-2 break-all text-xs text-gray-500">{detail.reportId}</p>
          </div>
          <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-bold ${getReportStatusClassName(detail.status)}`}>
            {REPORT_STATUS_LABELS[detail.status]}
          </span>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-gray-100 pt-6 text-sm sm:grid-cols-3">
          <div><dt className="font-semibold text-gray-500">접수일</dt><dd className="mt-1 text-gray-900">{dateTimeFormatter.format(new Date(detail.createdAt))}</dd></div>
          <div><dt className="font-semibold text-gray-500">신고 사유</dt><dd className="mt-1 text-gray-900">{REPORT_REASON_LABELS[detail.reason]}</dd></div>
          <div><dt className="font-semibold text-gray-500">대상 유형</dt><dd className="mt-1 text-gray-900">{REPORT_TARGET_LABELS[detail.targetType]}</dd></div>
        </dl>
        <div className="mt-6 rounded-2xl bg-gray-50 p-5">
          <h2 className="text-sm font-black text-gray-900">신고 상세 내용</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{detail.details ?? '작성된 상세 내용이 없습니다.'}</p>
        </div>
      </section>

      <section aria-labelledby="report-members" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="report-members" className="text-xl font-black text-gray-900">관련 회원</h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <ProfileCard title="신고한 회원" userId={detail.reporterUserId} profile={detail.reporter} />
          <ProfileCard title="신고 대상 회원" userId={detail.reportedUserId} profile={detail.reported} showMarriageHistory />
        </div>
      </section>

      {detail.targetType === 'message' ? (
        <section aria-labelledby="reported-message" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="text-amber-600" size={22} aria-hidden="true" />
            <h2 id="reported-message" className="text-xl font-black text-gray-900">신고된 메시지</h2>
          </div>
          {detail.message.exists ? (
            <div className="mt-5 rounded-2xl bg-gray-50 p-5">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{detail.message.content ?? '내용이 없는 메시지입니다.'}</p>
              <dl className="mt-4 grid gap-3 border-t border-gray-200 pt-4 text-xs text-gray-500 sm:grid-cols-3">
                <div><dt className="font-semibold">메시지 ID</dt><dd className="mt-1 break-all">{detail.messageId}</dd></div>
                <div>
                  <dt className="font-semibold">작성자 ID</dt>
                  <dd className="mt-1 break-all">{detail.message.senderId ?? '정보 없음'}</dd>
                  <dd className="mt-1 font-semibold text-gray-700">
                    닉네임:{' '}
                    {detail.message.senderId && detail.message.senderMemberExists ? (
                      <Link
                        href={`/admin/members/${detail.message.senderId}`}
                        className="underline-offset-4 hover:text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                      >
                        {detail.message.senderProfileExists && detail.message.senderNickname
                          ? detail.message.senderNickname
                          : '프로필 정보 없음'}
                      </Link>
                    ) : '탈퇴한 회원'}
                  </dd>
                </div>
                <div><dt className="font-semibold">작성일</dt><dd className="mt-1">{detail.message.createdAt ? dateTimeFormatter.format(new Date(detail.message.createdAt)) : '정보 없음'}</dd></div>
                <div><dt className="font-semibold">매칭 ID</dt><dd className="mt-1 break-all">{detail.message.matchId ?? '정보 없음'}</dd></div>
              </dl>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <h3 className="text-sm font-black text-gray-900">매칭 참여 회원</h3>
                {detail.message.matchId && detail.message.matchUser1Id && detail.message.matchUser2Id ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <MatchParticipant userId={detail.message.matchUser1Id} nickname={detail.message.matchUser1Nickname} messageSenderId={detail.message.senderId} />
                    <MatchParticipant userId={detail.message.matchUser2Id} nickname={detail.message.matchUser2Nickname} messageSenderId={detail.message.senderId} />
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-amber-700">매칭 정보를 찾을 수 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">신고된 메시지를 찾을 수 없습니다.</p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="report-status-management" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="report-status-management" className="text-xl font-black text-gray-900">처리 상태 관리</h2>
        <p className="mt-2 text-sm text-gray-500">상태 변경과 관리자 메모는 처리 이력에 함께 기록됩니다.</p>
        <div className="mt-5">
          <AdminReportStatusForm reportId={detail.reportId} currentStatus={detail.status} canManage={adminAccess.permissions.includes('reports_manage')} />
        </div>
      </section>

      <section aria-labelledby="member-restriction-management" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-green-700" size={22} aria-hidden="true" />
          <h2 id="member-restriction-management" className="text-xl font-black text-gray-900">회원 제재 관리</h2>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          회원 정지는 일반 회원용 주요 서비스 접근과 DB·프로필 이미지 쓰기를 제한하며, 정지 해제 시 다시 이용할 수 있습니다. 프로필 숨김은 계정을 삭제하지 않고 검색·추천 등 다른 회원에게 노출되는 영역에서 해당 프로필을 제외합니다.
        </p>

        {!canViewRestrictions ? (
          <p className="mt-5 rounded-2xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">
            회원 제재 정보를 조회할 권한이 없습니다.
          </p>
        ) : restrictionLoadFailed || !restriction ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">
            회원 제재 정보를 불러오지 못했습니다.
          </p>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-500">제재 대상 회원</p>
                  <p className="mt-1 font-black text-gray-900">
                    {restrictionTargetLabel}
                    {detail.targetType === 'message' && messageTargetMatches ? (
                      <span className="ml-2 text-xs font-bold text-green-700">· 메시지 작성자</span>
                    ) : null}
                  </p>
                </div>
                <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-bold ${restriction.accountStatus === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                  {MEMBER_ACCOUNT_STATUS_LABELS[restriction.accountStatus]}
                </span>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <dt className="font-semibold text-gray-500">저장된 이용 상태</dt>
                  <dd className="mt-1 text-gray-900">{MEMBER_ACCOUNT_STATUS_LABELS[restriction.accountStatus]}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-500">현재 이용 가능 여부</dt>
                  <dd className="mt-1 text-gray-900">
                    {currentlyAllowed
                      ? restriction.accountStatus === 'suspended'
                        ? '정지 기간 만료로 이용 가능'
                        : '이용 가능'
                      : '이용 불가'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-500">프로필 노출 상태</dt>
                  <dd className="mt-1 text-gray-900">{MEMBER_PROFILE_VISIBILITY_LABELS[restriction.profileVisibility]}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-500">정지 시작</dt>
                  <dd className="mt-1 text-gray-900">
                    {restriction.suspendedAt
                      ? dateTimeFormatter.format(new Date(restriction.suspendedAt))
                      : '해당 없음'}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-500">정지 종료</dt>
                  <dd className="mt-1 text-gray-900">
                    {restriction.accountStatus === 'active'
                      ? '해당 없음'
                      : restriction.suspendedUntil
                        ? dateTimeFormatter.format(new Date(restriction.suspendedUntil))
                        : '무기한'}
                  </dd>
                </div>
              </dl>
              {restriction.reason ? (
                <p className="mt-4 whitespace-pre-wrap break-words border-t border-gray-200 pt-4 text-sm text-gray-700">
                  <strong className="text-gray-900">제재 사유:</strong> {restriction.reason}
                </p>
              ) : null}
              {restriction.adminNote ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700">
                  <strong className="text-gray-900">관리자 메모:</strong> {restriction.adminNote}
                </p>
              ) : null}
              {!restriction.profileExists ? (
                <p className="mt-4 text-sm font-semibold text-amber-700">현재 프로필 정보가 없습니다.</p>
              ) : null}
            </div>

            {!messageTargetMatches ? (
              <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">
                신고 대상 회원과 메시지 작성자 정보가 일치하지 않아 제재를 적용할 수 없습니다.
              </p>
            ) : null}

            <div className="mt-6 border-t border-gray-100 pt-6">
              <AdminMemberRestrictionForm
                reportId={detail.reportId}
                targetUserId={detail.reportedUserId}
                targetLabel={restrictionTargetLabel}
                restriction={restriction}
                canManage={canManageRestrictions}
                canApply={messageTargetMatches}
              />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="member-restriction-history" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="member-restriction-history" className="text-xl font-black text-gray-900">회원 제재 이력</h2>
        </div>
        {!canViewRestrictions ? (
          <p className="mt-5 rounded-2xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">회원 제재 이력을 조회할 권한이 없습니다.</p>
        ) : restrictionActionsLoadFailed || restrictionActions === null ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">회원 제재 이력을 불러오지 못했습니다.</p>
        ) : restrictionActions.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">아직 회원 제재 이력이 없습니다.</p>
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
                      {action.previousSuspendedUntil ? dateTimeFormatter.format(new Date(action.previousSuspendedUntil)) : '없음·무기한'}
                      {' → '}
                      {action.newSuspendedUntil ? dateTimeFormatter.format(new Date(action.newSuspendedUntil)) : '없음·무기한'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">관련 신고</dt>
                    <dd className="mt-1 text-gray-900">
                      {action.reportId === detail.reportId ? '현재 신고' : action.reportId ? '다른 신고' : '연결된 신고 없음'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-gray-500">처리 관리자</dt>
                    <dd className="mt-1 text-gray-900">
                      {isAdminRole(action.adminRole) ? getAdminRoleLabel(action.adminRole) : '처리 관리자 정보 없음'}
                    </dd>
                  </div>
                </dl>
                {action.reason ? <p className="mt-4 whitespace-pre-wrap break-words text-sm text-gray-700"><strong className="text-gray-900">제재 사유:</strong> {action.reason}</p> : null}
                {action.note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700"><strong className="text-gray-900">관리자 메모:</strong> {action.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="member-actions" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 id="member-actions" className="text-xl font-black text-gray-900">추가 회원·콘텐츠 조치</h2>
        <p className="mt-2 text-sm text-gray-500">아래 기능은 아직 실제 조치와 연결되지 않았습니다.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <DisabledAction icon={<Trash2 size={16} />} label="회원 강제 탈퇴 — 준비 중" />
          {detail.targetType === 'message' ? (
            <DisabledAction icon={<MessageSquareWarning size={16} />} label="채팅 메시지 비노출 — 준비 중" />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="report-action-history" className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <FileWarning className="text-gray-500" size={22} aria-hidden="true" />
          <h2 id="report-action-history" className="text-xl font-black text-gray-900">처리 이력</h2>
        </div>
        {actions === null ? (
          <p className="mt-5 rounded-2xl bg-red-50 p-5 text-sm font-semibold text-red-700">처리 이력을 불러오지 못했습니다.</p>
        ) : actions.length === 0 ? (
          <p className="mt-5 rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">아직 관리자 처리 이력이 없습니다.</p>
        ) : (
          <ol className="mt-5 space-y-4">
            {actions.map((action) => (
              <li key={action.actionId} className="rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold text-gray-900">
                    {REPORT_STATUS_LABELS[action.previousStatus]} → {REPORT_STATUS_LABELS[action.newStatus]}
                  </p>
                  <time className="text-xs font-medium text-gray-500" dateTime={action.createdAt}>{dateTimeFormatter.format(new Date(action.createdAt))}</time>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  처리 관리자: {isAdminRole(action.adminRole) ? getAdminRoleLabel(action.adminRole) : '처리 관리자 정보 없음'}
                </p>
                {action.note ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">메모: {action.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
