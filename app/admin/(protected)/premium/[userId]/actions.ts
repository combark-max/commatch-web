'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isPremiumFeatureKey,
  isPremiumMembershipStatus,
  isTimestamptzString,
  isUuid,
  parsePremiumMembershipUpdateResult,
  parseSeoulDateTimeLocal,
  type PremiumMembershipActionType,
  type PremiumMembershipUpdateActionState,
} from '@/lib/admin/premium-memberships';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CHANGED_MESSAGES: Record<PremiumMembershipActionType, string> = {
  granted: 'Premium을 부여했습니다.',
  updated: 'Premium 정보를 변경했습니다.',
  suspended: 'Premium을 정지했습니다.',
  reactivated: 'Premium을 재활성화했습니다.',
  revoked: 'Premium을 회수했습니다.',
  regranted: 'Premium을 재부여했습니다.',
};

const errorState = (
  message: string,
  requestId?: string,
  requestIdConflict = false,
): PremiumMembershipUpdateActionState => ({
  kind: 'error',
  message,
  requestId,
  requestIdConflict,
});

const mapPremiumUpdateError = (
  code: string | undefined,
  message: string | undefined,
): { message: string; requestIdConflict?: boolean } => {
  if (code === '42501') return { message: 'Premium 정보를 변경할 권한이 없습니다.' };
  if (code === 'P0002') return { message: '대상 회원을 찾을 수 없습니다.' };
  if (code === 'P0001' && message?.includes('PREMIUM_STALE_VERSION')) {
    return { message: '다른 관리자가 먼저 Premium 정보를 변경했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.' };
  }
  if (code === '22023') {
    if (message?.includes('PREMIUM_REQUEST_ID_CONFLICT')) {
      return {
        message: '요청 식별자가 다른 작업과 충돌했습니다. 입력 내용을 확인한 뒤 다시 제출하세요.',
        requestIdConflict: true,
      };
    }
    if (message?.includes('Administrator accounts')) {
      return { message: '관리자 계정에는 회원 Premium 권한을 부여할 수 없습니다.' };
    }
    if (message?.includes('status') || message?.includes('Revoked Premium')) {
      return { message: '선택할 수 없는 Premium 상태입니다. 페이지를 새로고침한 뒤 다시 시도하세요.' };
    }
    if (message?.includes('start time')) return { message: 'Premium 시작일을 입력해 주세요.' };
    if (message?.includes('end time')) return { message: '만료일은 시작일보다 뒤여야 합니다.' };
    if (message?.includes('feature')) return { message: 'Premium 기능을 1개 이상 선택해 주세요.' };
    if (message?.includes('reason')) return { message: '변경 사유는 1자 이상 500자 이하로 입력해 주세요.' };
  }
  return { message: 'Premium 정보를 변경하지 못했습니다. 잠시 후 다시 시도하세요.' };
};

export async function updateAdminPremiumMembershipAction(
  subjectUserId: string,
  membershipExists: boolean,
  expectedUpdatedAt: string | null,
  _previousState: PremiumMembershipUpdateActionState,
  formData: FormData,
): Promise<PremiumMembershipUpdateActionState> {
  await requireAdminAccess('premium_memberships_manage');

  const requestIdValue = formData.get('requestId');
  const requestId = isUuid(requestIdValue) ? requestIdValue : undefined;
  if (!isUuid(subjectUserId) || typeof membershipExists !== 'boolean') {
    return errorState('Premium 변경 대상을 확인하지 못했습니다.', requestId);
  }
  if (
    membershipExists
      ? !isTimestamptzString(expectedUpdatedAt)
      : expectedUpdatedAt !== null
  ) {
    return errorState('Premium 변경 기준 시점을 확인하지 못했습니다. 페이지를 새로고침해 주세요.', requestId);
  }

  const statusValue = formData.get('status');
  const startedAtValue = formData.get('startedAt');
  const expiresAtValue = formData.get('expiresAt');
  const isIndefiniteValue = formData.get('isIndefinite');
  const reasonValue = formData.get('reason');
  const featureKeyValues = formData.getAll('featureKeys');
  if (
    !isPremiumMembershipStatus(statusValue)
    || typeof startedAtValue !== 'string'
    || typeof expiresAtValue !== 'string'
    || !(isIndefiniteValue === null || isIndefiniteValue === 'true')
    || typeof reasonValue !== 'string'
    || !requestId
  ) return errorState('입력한 Premium 변경 내용을 확인해 주세요.', requestId);

  if (!membershipExists && statusValue !== 'active') {
    return errorState('신규 Premium은 활성 상태로만 부여할 수 있습니다.', requestId);
  }

  const startedAt = parseSeoulDateTimeLocal(startedAtValue);
  if (!startedAt) return errorState('Premium 시작일을 올바르게 입력해 주세요.', requestId);

  const isIndefinite = isIndefiniteValue === 'true';
  const expiresAt = isIndefinite ? null : parseSeoulDateTimeLocal(expiresAtValue);
  if (!isIndefinite && !expiresAt) {
    return errorState('만료일을 입력하거나 무기한을 선택해 주세요.', requestId);
  }
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(startedAt)) {
    return errorState('만료일은 시작일보다 뒤여야 합니다.', requestId);
  }

  if (
    featureKeyValues.length < 1
    || featureKeyValues.length > 4
    || !featureKeyValues.every(isPremiumFeatureKey)
    || new Set(featureKeyValues).size !== featureKeyValues.length
  ) return errorState('Premium 기능을 1개 이상 선택해 주세요.', requestId);

  const reason = reasonValue.trim();
  if (reason.length < 1 || reason.length > 500) {
    return errorState('변경 사유는 1자 이상 500자 이하로 입력해 주세요.', requestId);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('update_admin_premium_membership', {
    p_subject_user_id: subjectUserId,
    p_expected_updated_at: expectedUpdatedAt,
    p_new_status: statusValue,
    p_started_at: startedAt,
    p_expires_at: expiresAt,
    p_feature_keys: featureKeyValues,
    p_reason: reason,
    p_request_id: requestId,
  });
  if (error) {
    const mapped = mapPremiumUpdateError(error.code, error.message);
    return errorState(mapped.message, requestId, mapped.requestIdConflict);
  }

  const result = parsePremiumMembershipUpdateResult(data, subjectUserId);
  if (!result) {
    return errorState('Premium 변경 결과를 확인하지 못했습니다.', requestId);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/premium');
  revalidatePath(`/admin/premium/${subjectUserId}`);

  if (result.isDuplicateRequest) {
    return {
      kind: 'success',
      message: '이미 처리된 요청입니다. 기존 처리 결과를 표시합니다.',
      requestId,
      resultType: 'duplicate',
    };
  }
  if (result.isNoop) {
    return {
      kind: 'success',
      message: '변경된 내용이 없어 기존 Premium 정보를 유지했습니다.',
      requestId,
      resultType: 'noop',
    };
  }
  if (!result.actionType) {
    return errorState('Premium 변경 결과를 확인하지 못했습니다.', requestId);
  }
  return {
    kind: 'success',
    message: CHANGED_MESSAGES[result.actionType],
    requestId,
    resultType: 'changed',
  };
}
