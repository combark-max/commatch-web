'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createAdminAccountAction } from '@/app/admin/(protected)/admins/actions';
import Button from '@/components/ui/Button';
import {
  ADMIN_ACCOUNT_ROLES,
  isAdminAccountRole,
  isAdminAccountUuid,
  type AdminAccountActionState,
  type AdminAccountRole,
} from '@/lib/admin/admin-accounts';
import { getAdminRoleLabel } from '@/lib/admin/presentation';

const initialState: AdminAccountActionState = { kind: 'idle', message: '' };

export default function AdminAccountCreateForm() {
  const [targetUserId, setTargetUserId] = useState('');
  const [role, setRole] = useState<AdminAccountRole>('admin');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const [dismissedStateRequestId, setDismissedStateRequestId] = useState<string | null>(null);
  const initializedRequestId = useRef(false);

  const actionWithClientResult = async (
    previousState: AdminAccountActionState,
    formData: FormData,
  ): Promise<AdminAccountActionState> => {
    const result = await createAdminAccountAction(previousState, formData);
    setDismissedStateRequestId(null);
    if (result.kind === 'error') setConfirming(false);
    if (result.kind === 'success' || result.requestIdConflict) setRequestId(crypto.randomUUID());
    if (result.kind === 'success') {
      setTargetUserId('');
      setReason('');
      setConfirming(false);
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(actionWithClientResult, initialState);

  useEffect(() => {
    if (initializedRequestId.current) return;
    initializedRequestId.current = true;
    setRequestId(crypto.randomUUID());
  }, []);

  const resetForFieldChange = () => {
    setRequestId(crypto.randomUUID());
    setConfirming(false);
    setClientError('');
    setDismissedStateRequestId(state.requestId ?? null);
  };

  const validateForConfirmation = () => {
    const normalizedTargetUserId = targetUserId.trim();
    if (!isAdminAccountUuid(normalizedTargetUserId)) {
      setClientError('올바른 대상 사용자 UUID를 입력해 주세요.');
      return;
    }
    if (!isAdminAccountRole(role)) {
      setClientError('생성할 관리자 역할을 확인해 주세요.');
      return;
    }
    if (reason.trim().length > 500) {
      setClientError('사유는 500자 이하로 입력해 주세요.');
      return;
    }
    if (!isAdminAccountUuid(requestId)) {
      setClientError('요청을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setTargetUserId(normalizedTargetUserId);
    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />

      <div>
        <label htmlFor="admin-account-target-user-id" className="mb-2 block text-sm font-semibold text-gray-800">대상 사용자 UUID</label>
        <input
          id="admin-account-target-user-id"
          name="targetUserId"
          type="text"
          required
          maxLength={36}
          value={targetUserId}
          disabled={pending}
          onChange={(event) => {
            setTargetUserId(event.target.value);
            resetForFieldChange();
          }}
          placeholder="00000000-0000-0000-0000-000000000000"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 font-mono text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
        <p className="mt-2 text-xs text-gray-500">현재 생성 대상 검색 API가 없어 사용자 UUID를 직접 입력해야 합니다.</p>
      </div>

      <div>
        <label htmlFor="admin-account-create-role" className="mb-2 block text-sm font-semibold text-gray-800">역할</label>
        <select
          id="admin-account-create-role"
          name="role"
          value={role}
          disabled={pending}
          onChange={(event) => {
            setRole(event.target.value as AdminAccountRole);
            resetForFieldChange();
          }}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        >
          {ADMIN_ACCOUNT_ROLES.map((adminRole) => (
            <option key={adminRole} value={adminRole}>{getAdminRoleLabel(adminRole)}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="admin-account-create-reason" className="text-sm font-semibold text-gray-800">생성 사유 <span className="font-medium text-gray-500">(선택)</span></label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="admin-account-create-reason"
          name="reason"
          value={reason}
          maxLength={500}
          rows={4}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetForFieldChange();
          }}
          placeholder="관리자 계정 생성 근거를 입력할 수 있습니다."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
      </div>

      {confirming ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h3 className="font-black text-green-950">다음 관리자 계정을 생성합니다.</h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-green-800">대상 사용자 UUID</dt>
              <dd className="mt-1 break-all font-mono text-gray-900">{targetUserId}</dd>
            </div>
            <div>
              <dt className="font-semibold text-green-800">부여 역할</dt>
              <dd className="mt-1 text-gray-900">{getAdminRoleLabel(role)}</dd>
            </div>
            {reason.trim() ? (
              <div className="sm:col-span-2">
                <dt className="font-semibold text-green-800">생성 사유</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-gray-900">{reason.trim()}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !requestId} className="min-w-44 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />생성 중...</> : '관리자 계정 생성'}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || !requestId} onClick={validateForConfirmation}>생성 내용 확인</Button>
      )}

      {clientError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{clientError}</p>
      ) : null}
      {state.kind !== 'idle' && state.requestId !== dismissedStateRequestId ? (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${state.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          <p>{state.message}</p>
          {state.kind === 'success' && state.targetUserId ? (
            <Link href={`/admin/admins/${state.targetUserId}`} className="mt-2 inline-block font-bold underline underline-offset-4">생성된 관리자 상세 보기</Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
