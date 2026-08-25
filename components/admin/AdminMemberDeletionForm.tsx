'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { deleteAdminMemberAction } from '@/app/admin/(protected)/members/[userId]/deletion-actions';
import {
  ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH,
  isAdminMemberDeletionUuid,
  type AdminMemberDeletionActionState,
} from '@/lib/admin/member-deletions';

type AdminMemberDeletionFormProps = {
  targetUserId: string;
  targetLabel: string;
};

const initialState: AdminMemberDeletionActionState = { kind: 'idle', message: '' };

export default function AdminMemberDeletionForm({
  targetUserId,
  targetLabel,
}: AdminMemberDeletionFormProps) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [requestId, setRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const initializedRequestId = useRef(false);
  const action = deleteAdminMemberAction.bind(null, targetUserId, null);
  const actionWithClientResult = async (
    previousState: AdminMemberDeletionActionState,
    formData: FormData,
  ): Promise<AdminMemberDeletionActionState> => {
    const result = await action(previousState, formData);
    if (result.kind === 'error') setConfirming(false);
    if (result.resetRequestId) setRequestId(crypto.randomUUID());
    return result;
  };
  const [state, formAction, pending] = useActionState(actionWithClientResult, initialState);

  useEffect(() => {
    if (initializedRequestId.current) return;
    initializedRequestId.current = true;
    setRequestId(crypto.randomUUID());
  }, []);

  if (state.kind === 'success') {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p role="status" className="font-bold text-green-900">{state.message}</p>
        <Link href="/admin/members" className="mt-4 inline-flex font-bold text-green-800 underline underline-offset-4">
          회원 목록으로 이동
        </Link>
      </div>
    );
  }

  const resetConfirmation = () => {
    setConfirming(false);
    setClientError('');
    if (initializedRequestId.current) setRequestId(crypto.randomUUID());
  };

  const validateForConfirmation = () => {
    if (!isAdminMemberDeletionUuid(requestId)) {
      setClientError('요청을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const normalizedReason = reason.trim();
    if (
      normalizedReason.length < 1
      || normalizedReason.length > ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH
    ) {
      setClientError('강제탈퇴 사유는 1자 이상 500자 이하로 입력해 주세요.');
      return;
    }
    if (confirmation !== '강제탈퇴') {
      setClientError('확인란에 “강제탈퇴”를 정확히 입력해 주세요.');
      return;
    }
    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />

      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-700" size={22} aria-hidden="true" />
          <div>
            <p className="font-black text-red-950">복구할 수 없는 영구 조치입니다.</p>
            <p className="mt-2 text-sm leading-6 text-red-800">
              프로필, 매칭, 채팅 및 관련 서비스 데이터가 기존 FK/CASCADE 계약에 따라 삭제됩니다.
              신고 및 승인된 감사기록은 기존 보존 계약을 따릅니다.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-gray-50 p-5">
        <p className="text-xs font-semibold text-gray-500">강제탈퇴 대상 회원</p>
        <p className="mt-1 font-black text-gray-900">{targetLabel}</p>
        <p className="mt-1 break-all font-mono text-xs text-gray-500">{targetUserId}</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="admin-member-deletion-reason" className="text-sm font-semibold text-gray-800">
            강제탈퇴 사유
          </label>
          <span className="text-xs font-medium text-gray-500">
            {reason.length.toLocaleString('ko-KR')} / {ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="admin-member-deletion-reason"
          name="reason"
          value={reason}
          required
          maxLength={ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH}
          rows={5}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetConfirmation();
          }}
          placeholder="영구 보존할 강제탈퇴 근거를 입력해 주세요. 민감한 개인정보는 입력하지 마세요."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/20 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label htmlFor="admin-member-deletion-confirmation" className="text-sm font-semibold text-gray-800">
          확인을 위해 “강제탈퇴”를 입력해 주세요.
        </label>
        <input
          id="admin-member-deletion-confirmation"
          name="confirmation"
          value={confirmation}
          disabled={pending}
          onChange={(event) => {
            setConfirmation(event.target.value);
            resetConfirmation();
          }}
          autoComplete="off"
          className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/20 disabled:bg-gray-100"
        />
      </div>

      {confirming ? (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
          <h3 className="font-black text-red-950">강제탈퇴 최종 확인</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="font-semibold text-red-800">대상 회원 UUID</dt><dd className="mt-1 break-all font-mono text-xs text-gray-900">{targetUserId}</dd></div>
            <div><dt className="font-semibold text-red-800">영구 보존 사유</dt><dd className="mt-1 whitespace-pre-wrap break-words text-gray-900">{reason.trim()}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending || !requestId}
              className="inline-flex min-w-44 items-center justify-center rounded-full bg-red-700 px-5 py-2 font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />삭제 중...</> : <><Trash2 className="mr-2" size={18} />영구 강제탈퇴</>}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-full border-2 border-gray-400 bg-white px-5 py-2 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending || !requestId}
          onClick={validateForConfirmation}
          className="inline-flex items-center justify-center rounded-full bg-red-700 px-5 py-2 font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AlertTriangle className="mr-2" size={18} />강제탈퇴 내용 확인
        </button>
      )}

      {clientError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{clientError}</p>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.message}</p>
      ) : null}
    </form>
  );
}
