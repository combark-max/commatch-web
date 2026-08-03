'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { updateAdminPremiumMembershipAction } from '@/app/admin/(protected)/premium/[userId]/actions';
import Button from '@/components/ui/Button';
import {
  isUuid,
  parseSeoulDateTimeLocal,
  PREMIUM_FEATURE_KEYS,
  PREMIUM_FEATURE_LABELS,
  PREMIUM_STATUS_LABELS,
  toSeoulDateTimeLocal,
  type PremiumFeatureKey,
  type PremiumMembershipStatus,
  type PremiumMembershipUpdateActionState,
} from '@/lib/admin/premium-memberships';

type AdminPremiumMembershipFormProps = {
  subjectUserId: string;
  membershipExists: boolean;
  storedStatus: PremiumMembershipStatus | null;
  startedAt: string | null;
  expiresAt: string | null;
  featureKeys: PremiumFeatureKey[];
  membershipUpdatedAt: string | null;
};

const initialState: PremiumMembershipUpdateActionState = { kind: 'idle', message: '' };

const getAvailableStatuses = (
  membershipExists: boolean,
  storedStatus: PremiumMembershipStatus | null,
): PremiumMembershipStatus[] => {
  if (!membershipExists) return ['active'];
  if (storedStatus === 'revoked') return ['revoked', 'active'];
  if (storedStatus === 'suspended') return ['suspended', 'active', 'revoked'];
  return ['active', 'suspended', 'revoked'];
};

export default function AdminPremiumMembershipForm({
  subjectUserId,
  membershipExists,
  storedStatus,
  startedAt: storedStartedAt,
  expiresAt: storedExpiresAt,
  featureKeys: storedFeatureKeys,
  membershipUpdatedAt,
}: AdminPremiumMembershipFormProps) {
  const initialStatus = membershipExists && storedStatus ? storedStatus : 'active';
  const availableStatuses = getAvailableStatuses(membershipExists, storedStatus);
  const [status, setStatus] = useState<PremiumMembershipStatus>(initialStatus);
  const [startedAt, setStartedAt] = useState(toSeoulDateTimeLocal(storedStartedAt));
  const [expiresAt, setExpiresAt] = useState(toSeoulDateTimeLocal(storedExpiresAt));
  const [isIndefinite, setIsIndefinite] = useState(membershipExists && storedExpiresAt === null);
  const [featureKeys, setFeatureKeys] = useState<PremiumFeatureKey[]>(storedFeatureKeys);
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [clientError, setClientError] = useState('');
  const [dismissedStateRequestId, setDismissedStateRequestId] = useState<string | null>(null);
  const initializedRequestId = useRef(false);
  const initializedNewStart = useRef(false);
  const action = updateAdminPremiumMembershipAction.bind(
    null,
    subjectUserId,
    membershipExists,
    membershipUpdatedAt,
  );
  const actionWithClientResult = async (
    previousState: PremiumMembershipUpdateActionState,
    formData: FormData,
  ): Promise<PremiumMembershipUpdateActionState> => {
    const result = await action(previousState, formData);
    setDismissedStateRequestId(null);
    if (result.kind === 'success' || result.requestIdConflict) {
      setRequestId(crypto.randomUUID());
      setConfirming(false);
    }
    if (result.kind === 'success') setReason('');
    return result;
  };
  const [state, formAction, pending] = useActionState(actionWithClientResult, initialState);

  useEffect(() => {
    if (initializedRequestId.current) return;
    initializedRequestId.current = true;
    setRequestId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (membershipExists || initializedNewStart.current) return;
    initializedNewStart.current = true;
    setStartedAt(toSeoulDateTimeLocal(new Date().toISOString()));
  }, [membershipExists]);

  const resetForFieldChange = () => {
    setRequestId(crypto.randomUUID());
    setConfirming(false);
    setClientError('');
    setDismissedStateRequestId(state.requestId ?? null);
  };

  const toggleFeature = (featureKey: PremiumFeatureKey, checked: boolean) => {
    setFeatureKeys((current) => (
      checked
        ? [...current, featureKey]
        : current.filter((currentKey) => currentKey !== featureKey)
    ));
    resetForFieldChange();
  };

  const validateForConfirmation = () => {
    if (!isUuid(requestId)) {
      setClientError('요청을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!availableStatuses.includes(status)) {
      setClientError('선택할 수 없는 Premium 상태입니다.');
      return;
    }
    const parsedStartedAt = parseSeoulDateTimeLocal(startedAt);
    if (!parsedStartedAt) {
      setClientError('Premium 시작일을 올바르게 입력해 주세요.');
      return;
    }
    if (!isIndefinite) {
      const parsedExpiresAt = parseSeoulDateTimeLocal(expiresAt);
      if (!parsedExpiresAt) {
        setClientError('만료일을 입력하거나 무기한을 선택해 주세요.');
        return;
      }
      if (Date.parse(parsedExpiresAt) <= Date.parse(parsedStartedAt)) {
        setClientError('만료일은 시작일보다 뒤여야 합니다.');
        return;
      }
    }
    if (featureKeys.length < 1 || featureKeys.length > 3) {
      setClientError('Premium 기능을 1개 이상 선택해 주세요.');
      return;
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 1 || normalizedReason.length > 500) {
      setClientError('변경 사유는 1자 이상 500자 이하로 입력해 주세요.');
      return;
    }

    setClientError('');
    setConfirming(true);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      {membershipExists ? null : <input type="hidden" name="status" value="active" />}
      {isIndefinite ? (
        <>
          <input type="hidden" name="isIndefinite" value="true" />
          <input type="hidden" name="expiresAt" value="" />
        </>
      ) : null}

      <div className="rounded-2xl bg-gray-50 p-5">
        <p className="text-xs font-semibold text-gray-500">Premium 대상 회원</p>
        <p className="mt-1 break-all text-sm font-black text-gray-900">{subjectUserId}</p>
        <p className="mt-2 text-sm text-gray-600">
          {membershipExists ? '현재 Premium 정보를 변경합니다.' : '새 Premium을 활성 상태로 부여합니다.'}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label htmlFor="premium-membership-status" className="mb-2 block text-sm font-semibold text-gray-800">저장 상태</label>
          <select
            id="premium-membership-status"
            name={membershipExists ? 'status' : undefined}
            value={status}
            disabled={pending || !membershipExists}
            onChange={(event) => {
              setStatus(event.target.value as PremiumMembershipStatus);
              resetForFieldChange();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          >
            {availableStatuses.map((availableStatus) => (
              <option key={availableStatus} value={availableStatus}>{PREMIUM_STATUS_LABELS[availableStatus]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="premium-started-at" className="mb-2 block text-sm font-semibold text-gray-800">
            시작일 <span className="font-medium text-gray-500">(한국 시간)</span>
          </label>
          <input
            id="premium-started-at"
            name="startedAt"
            type="datetime-local"
            required
            value={startedAt}
            disabled={pending}
            onChange={(event) => {
              setStartedAt(event.target.value);
              resetForFieldChange();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label htmlFor="premium-expires-at" className="mb-2 block text-sm font-semibold text-gray-800">
            만료일 <span className="font-medium text-gray-500">(한국 시간)</span>
          </label>
          <input
            id="premium-expires-at"
            name={isIndefinite ? undefined : 'expiresAt'}
            type="datetime-local"
            required={!isIndefinite}
            value={expiresAt}
            disabled={pending || isIndefinite}
            onChange={(event) => {
              setExpiresAt(event.target.value);
              resetForFieldChange();
            }}
            className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
          />
        </div>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-800">
          <input
            type="checkbox"
            checked={isIndefinite}
            disabled={pending}
            onChange={(event) => {
              setIsIndefinite(event.target.checked);
              resetForFieldChange();
            }}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          무기한
        </label>
      </div>
      {!membershipExists ? (
        <p className="text-xs font-medium text-gray-500">신규 부여 시 만료일을 입력하거나 무기한을 명시적으로 선택해 주세요.</p>
      ) : null}

      <fieldset disabled={pending}>
        <legend className="text-sm font-semibold text-gray-800">기능 권한</legend>
        <p className="mt-1 text-xs text-gray-500">최소 1개를 선택해 주세요.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PREMIUM_FEATURE_KEYS.map((featureKey) => (
            <label key={featureKey} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                name="featureKeys"
                value={featureKey}
                checked={featureKeys.includes(featureKey)}
                onChange={(event) => toggleFeature(featureKey, event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              {PREMIUM_FEATURE_LABELS[featureKey]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="premium-change-reason" className="text-sm font-semibold text-gray-800">변경 사유</label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="premium-change-reason"
          name="reason"
          required
          value={reason}
          maxLength={500}
          rows={4}
          disabled={pending}
          onChange={(event) => {
            setReason(event.target.value);
            resetForFieldChange();
          }}
          placeholder="부여 또는 변경 근거를 입력해 주세요."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
        <p className="mt-2 text-xs text-gray-500">민감한 개인정보를 과도하게 입력하지 마세요.</p>
      </div>

      {confirming ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h3 className="font-black text-green-950">다음 Premium 변경을 적용합니다.</h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-green-800">대상 회원 UUID</dt><dd className="mt-1 break-all text-gray-900">{subjectUserId}</dd></div>
            <div><dt className="font-semibold text-green-800">새 저장 상태</dt><dd className="mt-1 text-gray-900">{PREMIUM_STATUS_LABELS[status]}</dd></div>
            <div><dt className="font-semibold text-green-800">시작일</dt><dd className="mt-1 text-gray-900">{startedAt.replace('T', ' ')}</dd></div>
            <div><dt className="font-semibold text-green-800">만료일</dt><dd className="mt-1 text-gray-900">{isIndefinite ? '무기한' : expiresAt.replace('T', ' ')}</dd></div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-green-800">선택 기능</dt>
              <dd className="mt-1 text-gray-900">{featureKeys.map((featureKey) => PREMIUM_FEATURE_LABELS[featureKey]).join(', ')}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-green-800">변경 사유</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-gray-900">{reason.trim()}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !requestId} className="min-w-44 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />적용 중...</> : membershipExists ? 'Premium 변경 적용' : 'Premium 신규 부여'}
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
        <Button type="button" disabled={pending || !requestId} onClick={validateForConfirmation}>
          변경 내용 확인
        </Button>
      )}

      {clientError ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{clientError}</p>
      ) : null}
      {state.kind !== 'idle' && state.requestId !== dismissedStateRequestId ? (
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
