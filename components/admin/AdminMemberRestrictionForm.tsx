'use client';

import { useActionState, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { updateAdminMemberRestrictionAction } from '@/app/admin/(protected)/reports/[id]/restriction-actions';
import Button from '@/components/ui/Button';
import {
  getMemberAccountMode,
  MEMBER_ACCOUNT_MODE_LABELS,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_PROFILE_VISIBILITY_LABELS,
  parseSeoulDateTimeLocal,
  toSeoulDateTimeLocal,
  type AdminMemberRestriction,
  type MemberAccountMode,
  type MemberProfileVisibility,
  type MemberRestrictionActionState,
} from '@/lib/admin/member-restrictions';

type AdminMemberRestrictionFormProps = {
  reportId: string | null;
  targetUserId: string;
  targetLabel: string;
  restriction: AdminMemberRestriction;
  canManage: boolean;
  canApply: boolean;
};

const initialState: MemberRestrictionActionState = { kind: 'idle', message: '' };

export default function AdminMemberRestrictionForm({
  reportId,
  targetUserId,
  targetLabel,
  restriction,
  canManage,
  canApply,
}: AdminMemberRestrictionFormProps) {
  const isReportContext = reportId !== null;
  const initialMode = getMemberAccountMode(
    restriction.accountStatus,
    restriction.suspendedUntil,
  );
  const initialSuspendedUntil = toSeoulDateTimeLocal(restriction.suspendedUntil);
  const [accountMode, setAccountMode] = useState<MemberAccountMode>(initialMode);
  const [profileVisibility, setProfileVisibility] = useState<MemberProfileVisibility>(
    restriction.profileVisibility,
  );
  const [suspendedUntil, setSuspendedUntil] = useState(initialSuspendedUntil);
  const [reason, setReason] = useState(restriction.reason ?? '');
  const [adminNote, setAdminNote] = useState(restriction.adminNote ?? '');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const action = updateAdminMemberRestrictionAction.bind(null, reportId, targetUserId);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!canManage) {
    return (
      <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
        회원 제재 변경 권한이 없습니다.
      </p>
    );
  }

  if (!canApply) {
    return (
      <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
        신고 대상 회원과 메시지 작성자 정보가 일치하지 않아 제재를 적용할 수 없습니다.
      </p>
    );
  }

  const resetConfirmation = () => {
    setConfirming(false);
    setClientError('');
  };

  const validateForConfirmation = () => {
    const normalizedReason = reason.trim() || null;
    const normalizedNote = adminNote.trim() || null;
    if (reason.length > 500) {
      setClientError('제재 사유는 500자 이하로 입력해 주세요.');
      return;
    }
    if (adminNote.length > 2000) {
      setClientError('관리자 메모는 2,000자 이하로 입력해 주세요.');
      return;
    }
    if (accountMode === 'suspended_until') {
      const parsed = parseSeoulDateTimeLocal(suspendedUntil);
      if (!parsed || Date.parse(parsed) <= Date.now()) {
        setClientError('정지 종료일은 현재 시각보다 이후여야 합니다.');
        return;
      }
    }

    const comparableSuspendedUntil = accountMode === 'suspended_until' ? suspendedUntil : '';
    const unchanged = accountMode === initialMode
      && profileVisibility === restriction.profileVisibility
      && comparableSuspendedUntil === (initialMode === 'suspended_until' ? initialSuspendedUntil : '')
      && normalizedReason === restriction.reason
      && normalizedNote === restriction.adminNote;
    if (unchanged) {
      setClientError('변경된 내용이 없습니다.');
      return;
    }

    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-2xl bg-gray-50 p-5">
        <p className="text-xs font-semibold text-gray-500">제재 대상 회원</p>
        <p className="mt-1 font-black text-gray-900">{targetLabel}</p>
        <p className="mt-1 break-all text-xs text-gray-500">{targetUserId}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label htmlFor="member-account-mode" className="mb-2 block text-sm font-semibold text-gray-800">
            이용 상태 변경
          </label>
          <select
            id="member-account-mode"
            name="accountMode"
            value={accountMode}
            disabled={pending}
            onChange={(event) => {
              setAccountMode(event.target.value as MemberAccountMode);
              resetConfirmation();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          >
            <option value="active">정상 이용</option>
            <option value="suspended_indefinite">무기한 정지</option>
            <option value="suspended_until">기간 정지</option>
          </select>
        </div>

        <div>
          <label htmlFor="member-profile-visibility" className="mb-2 block text-sm font-semibold text-gray-800">
            프로필 노출 상태
          </label>
          <select
            id="member-profile-visibility"
            name="profileVisibility"
            value={profileVisibility}
            disabled={pending}
            onChange={(event) => {
              setProfileVisibility(event.target.value as MemberProfileVisibility);
              resetConfirmation();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          >
            <option value="visible">프로필 노출</option>
            <option value="hidden">프로필 숨김</option>
          </select>
        </div>
      </div>

      {accountMode === 'suspended_until' ? (
        <div>
          <label htmlFor="member-suspended-until" className="mb-2 block text-sm font-semibold text-gray-800">
            정지 종료 날짜·시각 <span className="font-medium text-gray-500">(한국 시간)</span>
          </label>
          <input
            id="member-suspended-until"
            name="suspendedUntil"
            type="datetime-local"
            required
            value={suspendedUntil}
            disabled={pending}
            onChange={(event) => {
              setSuspendedUntil(event.target.value);
              resetConfirmation();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          />
        </div>
      ) : (
        <input type="hidden" name="suspendedUntil" value="" />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="member-restriction-reason" className="text-sm font-semibold text-gray-800">제재 사유</label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="member-restriction-reason"
          name="reason"
          value={reason}
          maxLength={500}
          rows={4}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetConfirmation();
          }}
          placeholder="회원에게 공개될 수 있는 제재 사유를 입력할 수 있습니다."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
        <p className="mt-2 text-xs text-gray-500">향후 일반 회원 정지 안내 화면에 공개될 수 있는 문구입니다.</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="member-restriction-note" className="text-sm font-semibold text-gray-800">관리자 메모</label>
          <span className="text-xs font-medium text-gray-500">{adminNote.length.toLocaleString('ko-KR')} / 2,000</span>
        </div>
        <textarea
          id="member-restriction-note"
          name="adminNote"
          value={adminNote}
          maxLength={2000}
          rows={5}
          disabled={pending}
          onChange={(event) => {
            setAdminNote(event.target.value);
            resetConfirmation();
          }}
          placeholder="처리 근거나 확인 내용을 입력할 수 있습니다."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
        <p className="mt-2 text-xs text-gray-500">관리자만 확인할 수 있는 내부 기록입니다.</p>
      </div>

      {!restriction.profileExists ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          현재 프로필 정보가 없습니다. 설정한 노출 상태는 향후 프로필 생성 시에도 유지됩니다.
        </p>
      ) : null}

      {confirming ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h3 className="font-black text-green-950">다음 변경을 적용합니다.</h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-green-800">회원 이용 상태</dt>
              <dd className="mt-1 text-gray-900">
                {MEMBER_ACCOUNT_STATUS_LABELS[restriction.accountStatus]} → {MEMBER_ACCOUNT_MODE_LABELS[accountMode]}
              </dd>
            </div>
            {accountMode === 'suspended_until' ? (
              <div>
                <dt className="font-semibold text-green-800">정지 종료</dt>
                <dd className="mt-1 text-gray-900">{suspendedUntil.replace('T', ' ')}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-green-800">프로필 노출</dt>
              <dd className="mt-1 text-gray-900">
                {MEMBER_PROFILE_VISIBILITY_LABELS[restriction.profileVisibility]} → {MEMBER_PROFILE_VISIBILITY_LABELS[profileVisibility]}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-green-800">관련 신고</dt>
              <dd className="mt-1 text-gray-900">
                {isReportContext ? '현재 신고' : '관리자 직접 처리'}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending} className="min-w-44 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />적용 중...</> : '제재 변경 적용'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending} onClick={validateForConfirmation}>
          변경 내용 확인
        </Button>
      )}

      {clientError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {clientError}
        </p>
      ) : null}
      {state.kind !== 'idle' ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${state.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
