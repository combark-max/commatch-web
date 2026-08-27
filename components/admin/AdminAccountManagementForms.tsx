'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  changeAdminAccountRoleAction,
  changeAdminAccountStatusAction,
} from '@/app/admin/(protected)/admins/actions';
import Button from '@/components/ui/Button';
import {
  ADMIN_ACCOUNT_ROLES,
  ADMIN_ACCOUNT_STATUSES,
  ADMIN_ACCOUNT_STATUS_LABELS,
  isAdminAccountUuid,
  type AdminAccountActionState,
  type AdminAccountRole,
  type AdminAccountStatus,
} from '@/lib/admin/admin-accounts';
import { getAdminRoleLabel } from '@/lib/admin/presentation';
import { createBrowserUuidV4 } from '@/lib/utils/browser-uuid';

type AdminAccountManagementFormsProps = {
  targetUserId: string;
  currentRole: AdminAccountRole;
  currentStatus: AdminAccountStatus;
  expectedUpdatedAt: string;
};

const initialState: AdminAccountActionState = { kind: 'idle', message: '' };

function ResultMessage({ state, dismissedRequestId }: { state: AdminAccountActionState; dismissedRequestId: string | null }) {
  if (state.kind === 'idle' || state.requestId === dismissedRequestId) return null;
  return (
    <p
      role="status"
      className={`rounded-xl px-4 py-3 text-sm font-semibold ${state.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
    >
      {state.message}
    </p>
  );
}

function RoleChangeForm({
  targetUserId,
  currentRole,
  expectedUpdatedAt,
}: Omit<AdminAccountManagementFormsProps, 'currentStatus'>) {
  const [roleSelection, setRoleSelection] = useState<{ value: AdminAccountRole; expectedUpdatedAt: string } | null>(null);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const initializedRequestId = useRef(false);
  const role = roleSelection?.expectedUpdatedAt === expectedUpdatedAt ? roleSelection.value : currentRole;
  const action = changeAdminAccountRoleAction.bind(null, targetUserId, expectedUpdatedAt);
  const actionWithClientResult = async (previousState: AdminAccountActionState, formData: FormData) => {
    const result = await action(previousState, formData);
    setDismissedRequestId(null);
    if (result.kind === 'error') setConfirming(false);
    if (result.kind === 'success' || result.requestIdConflict) setRequestId(createBrowserUuidV4());
    if (result.kind === 'success') {
      setRoleSelection(null);
      setReason('');
      setConfirming(false);
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(actionWithClientResult, initialState);

  useEffect(() => {
    if (initializedRequestId.current) return;
    initializedRequestId.current = true;
    setRequestId(createBrowserUuidV4());
  }, []);

  const resetForFieldChange = () => {
    setRequestId(createBrowserUuidV4());
    setConfirming(false);
    setClientError('');
    setDismissedRequestId(state.requestId ?? null);
  };

  const validateForConfirmation = () => {
    if (role === currentRole) {
      setClientError('현재 역할과 다른 역할을 선택해 주세요.');
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
    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="admin-account-role" className="mb-2 block text-sm font-semibold text-gray-800">변경할 역할</label>
        <select
          id="admin-account-role"
          name="role"
          value={role}
          disabled={pending}
          onChange={(event) => {
            setRoleSelection({ value: event.target.value as AdminAccountRole, expectedUpdatedAt });
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
          <label htmlFor="admin-account-role-reason" className="text-sm font-semibold text-gray-800">변경 사유 <span className="font-medium text-gray-500">(선택)</span></label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="admin-account-role-reason"
          name="reason"
          value={reason}
          maxLength={500}
          rows={3}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetForFieldChange();
          }}
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          placeholder="역할 변경 근거를 입력할 수 있습니다."
        />
      </div>
      {confirming ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="font-black text-green-950">{getAdminRoleLabel(currentRole)} → {getAdminRoleLabel(role)} 역할 변경을 적용합니다.</p>
          {reason.trim() ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{reason.trim()}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !requestId} className="min-w-36 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />변경 중...</> : '역할 변경'}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>취소</Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || !requestId || role === currentRole} onClick={validateForConfirmation}>역할 변경 확인</Button>
      )}
      {clientError ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{clientError}</p> : null}
      <ResultMessage state={state} dismissedRequestId={dismissedRequestId} />
    </form>
  );
}

function StatusChangeForm({
  targetUserId,
  currentStatus,
  expectedUpdatedAt,
}: Omit<AdminAccountManagementFormsProps, 'currentRole'>) {
  const [statusSelection, setStatusSelection] = useState<{ value: AdminAccountStatus; expectedUpdatedAt: string } | null>(null);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const [dismissedRequestId, setDismissedRequestId] = useState<string | null>(null);
  const initializedRequestId = useRef(false);
  const status = statusSelection?.expectedUpdatedAt === expectedUpdatedAt ? statusSelection.value : currentStatus;
  const action = changeAdminAccountStatusAction.bind(null, targetUserId, expectedUpdatedAt);
  const actionWithClientResult = async (previousState: AdminAccountActionState, formData: FormData) => {
    const result = await action(previousState, formData);
    setDismissedRequestId(null);
    if (result.kind === 'error') setConfirming(false);
    if (result.kind === 'success' || result.requestIdConflict) setRequestId(createBrowserUuidV4());
    if (result.kind === 'success') {
      setStatusSelection(null);
      setReason('');
      setConfirming(false);
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(actionWithClientResult, initialState);

  useEffect(() => {
    if (initializedRequestId.current) return;
    initializedRequestId.current = true;
    setRequestId(createBrowserUuidV4());
  }, []);

  const resetForFieldChange = () => {
    setRequestId(createBrowserUuidV4());
    setConfirming(false);
    setClientError('');
    setDismissedRequestId(state.requestId ?? null);
  };

  const validateForConfirmation = () => {
    if (status === currentStatus) {
      setClientError('현재 상태와 다른 상태를 선택해 주세요.');
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
    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="admin-account-status" className="mb-2 block text-sm font-semibold text-gray-800">변경할 상태</label>
        <select
          id="admin-account-status"
          name="status"
          value={status}
          disabled={pending}
          onChange={(event) => {
            setStatusSelection({ value: event.target.value as AdminAccountStatus, expectedUpdatedAt });
            resetForFieldChange();
          }}
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        >
          {ADMIN_ACCOUNT_STATUSES.map((adminStatus) => (
            <option key={adminStatus} value={adminStatus}>{ADMIN_ACCOUNT_STATUS_LABELS[adminStatus]}</option>
          ))}
        </select>
      </div>
      {status === 'revoked' && status !== currentStatus ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <p>회수된 관리자 계정은 다시 활성화하거나 다른 상태로 변경할 수 없습니다.</p>
        </div>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="admin-account-status-reason" className="text-sm font-semibold text-gray-800">변경 사유 <span className="font-medium text-gray-500">(선택)</span></label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="admin-account-status-reason"
          name="reason"
          value={reason}
          maxLength={500}
          rows={3}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetForFieldChange();
          }}
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          placeholder="상태 변경 근거를 입력할 수 있습니다."
        />
      </div>
      {confirming ? (
        <div className={`rounded-2xl border p-5 ${status === 'revoked' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <p className={`font-black ${status === 'revoked' ? 'text-red-950' : 'text-green-950'}`}>
            {ADMIN_ACCOUNT_STATUS_LABELS[currentStatus]} → {ADMIN_ACCOUNT_STATUS_LABELS[status]} 상태 변경을 적용합니다.
          </p>
          {reason.trim() ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{reason.trim()}</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !requestId} className="min-w-36 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />변경 중...</> : '상태 변경'}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>취소</Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || !requestId || status === currentStatus} onClick={validateForConfirmation}>상태 변경 확인</Button>
      )}
      {clientError ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{clientError}</p> : null}
      <ResultMessage state={state} dismissedRequestId={dismissedRequestId} />
    </form>
  );
}

export default function AdminAccountManagementForms(props: AdminAccountManagementFormsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-labelledby="admin-account-role-management" className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h3 id="admin-account-role-management" className="text-lg font-black text-gray-900">역할 변경</h3>
        <p className="mt-2 text-sm text-gray-600">관리자에게 허용할 운영 역할을 변경합니다.</p>
        <div className="mt-5">
          <RoleChangeForm
            targetUserId={props.targetUserId}
            currentRole={props.currentRole}
            expectedUpdatedAt={props.expectedUpdatedAt}
          />
        </div>
      </section>
      <section aria-labelledby="admin-account-status-management" className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <h3 id="admin-account-status-management" className="text-lg font-black text-gray-900">상태 변경</h3>
        <p className="mt-2 text-sm text-gray-600">정지·재활성화하거나 관리자 권한을 영구 회수합니다.</p>
        <div className="mt-5">
          <StatusChangeForm
            targetUserId={props.targetUserId}
            currentStatus={props.currentStatus}
            expectedUpdatedAt={props.expectedUpdatedAt}
          />
        </div>
      </section>
    </div>
  );
}
