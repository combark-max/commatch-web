'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isAdminAccountRole,
  isAdminAccountStatus,
  isAdminAccountTimestamp,
  isAdminAccountUuid,
  parseAdminAccountWriteResult,
  type AdminAccountActionState,
} from '@/lib/admin/admin-accounts';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type MutationKind = 'create' | 'role' | 'status';

const errorState = (
  message: string,
  requestId?: string,
  requestIdConflict = false,
): AdminAccountActionState => ({
  kind: 'error',
  message,
  requestId,
  requestIdConflict,
});

const readReason = (value: FormDataEntryValue | null): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const reason = value.trim();
  if (reason.length > 500) return undefined;
  return reason || null;
};

const mapAdminAccountError = (
  kind: MutationKind,
  code: string | undefined,
): { message: string; requestIdConflict?: boolean } => {
  if (code === '42501') return { message: '관리자 계정을 관리할 권한이 없습니다.' };
  if (code === 'A1001') return { message: '다른 관리자에 의해 계정 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.' };
  if (code === 'A1002') return {
    message: '요청 식별자가 다른 작업과 충돌했습니다. 변경 내용을 확인한 뒤 다시 시도해 주세요.',
    requestIdConflict: true,
  };
  if (code === 'A1003') return { message: '회수된 관리자 계정은 더 이상 변경할 수 없습니다.' };
  if (code === 'A1004') return { message: '자신의 관리자 역할이나 상태는 변경할 수 없습니다.' };
  if (code === 'A1005') return {
    message: kind === 'create' ? '대상 사용자를 찾을 수 없습니다.' : '대상 관리자 계정을 찾을 수 없습니다.',
  };
  if (code === 'A1006') return { message: '마지막 활성 최고 관리자는 역할을 낮추거나 계정을 정지·회수할 수 없습니다.' };
  if (code === 'A1007') return {
    message: kind === 'create' ? '이미 관리자 계정으로 등록된 사용자입니다.' : '현재 값과 같아 변경할 내용이 없습니다.',
  };
  if (code === '22023') return { message: '입력한 관리자 계정 관리 내용을 확인해 주세요.' };
  return { message: '관리자 계정 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
};

const revalidateAdminAccountPaths = (targetUserId: string) => {
  revalidatePath('/admin');
  revalidatePath('/admin/admins');
  revalidatePath(`/admin/admins/${targetUserId}`);
};

export async function createAdminAccountAction(
  _previousState: AdminAccountActionState,
  formData: FormData,
): Promise<AdminAccountActionState> {
  await requireAdminAccess('admin_accounts_manage');

  const targetUserIdValue = formData.get('targetUserId');
  const roleValue = formData.get('role');
  const requestIdValue = formData.get('requestId');
  const reason = readReason(formData.get('reason'));
  const targetUserId = typeof targetUserIdValue === 'string' ? targetUserIdValue.trim() : '';
  const requestId = isAdminAccountUuid(requestIdValue) ? requestIdValue : undefined;
  if (!isAdminAccountUuid(targetUserId) || !isAdminAccountRole(roleValue) || !requestId || reason === undefined) {
    return errorState('대상 사용자 UUID, 역할, 사유를 확인해 주세요.', requestId);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('create_admin_account', {
    p_target_user_id: targetUserId,
    p_role: roleValue,
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    const mapped = mapAdminAccountError('create', error.code);
    return errorState(mapped.message, requestId, mapped.requestIdConflict);
  }
  const result = parseAdminAccountWriteResult(data, targetUserId);
  if (!result) return errorState('관리자 계정 생성 결과를 확인하지 못했습니다.', requestId);

  revalidateAdminAccountPaths(targetUserId);
  return {
    kind: 'success',
    message: '관리자 계정을 생성했습니다.',
    requestId,
    targetUserId,
  };
}

export async function changeAdminAccountRoleAction(
  targetUserId: string,
  expectedUpdatedAt: string,
  _previousState: AdminAccountActionState,
  formData: FormData,
): Promise<AdminAccountActionState> {
  await requireAdminAccess('admin_accounts_manage');

  const roleValue = formData.get('role');
  const requestIdValue = formData.get('requestId');
  const reason = readReason(formData.get('reason'));
  const requestId = isAdminAccountUuid(requestIdValue) ? requestIdValue : undefined;
  if (
    !isAdminAccountUuid(targetUserId)
    || !isAdminAccountTimestamp(expectedUpdatedAt)
    || !isAdminAccountRole(roleValue)
    || !requestId
    || reason === undefined
  ) return errorState('역할 변경 내용을 확인해 주세요.', requestId);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('change_admin_account_role', {
    p_target_user_id: targetUserId,
    p_new_role: roleValue,
    p_expected_updated_at: expectedUpdatedAt,
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    const mapped = mapAdminAccountError('role', error.code);
    return errorState(mapped.message, requestId, mapped.requestIdConflict);
  }
  const result = parseAdminAccountWriteResult(data, targetUserId);
  if (!result) return errorState('역할 변경 결과를 확인하지 못했습니다.', requestId);

  revalidateAdminAccountPaths(targetUserId);
  return { kind: 'success', message: '관리자 역할을 변경했습니다.', requestId, targetUserId };
}

export async function changeAdminAccountStatusAction(
  targetUserId: string,
  expectedUpdatedAt: string,
  _previousState: AdminAccountActionState,
  formData: FormData,
): Promise<AdminAccountActionState> {
  await requireAdminAccess('admin_accounts_manage');

  const statusValue = formData.get('status');
  const requestIdValue = formData.get('requestId');
  const reason = readReason(formData.get('reason'));
  const requestId = isAdminAccountUuid(requestIdValue) ? requestIdValue : undefined;
  if (
    !isAdminAccountUuid(targetUserId)
    || !isAdminAccountTimestamp(expectedUpdatedAt)
    || !isAdminAccountStatus(statusValue)
    || !requestId
    || reason === undefined
  ) return errorState('상태 변경 내용을 확인해 주세요.', requestId);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('change_admin_account_status', {
    p_target_user_id: targetUserId,
    p_new_status: statusValue,
    p_expected_updated_at: expectedUpdatedAt,
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) {
    const mapped = mapAdminAccountError('status', error.code);
    return errorState(mapped.message, requestId, mapped.requestIdConflict);
  }
  const result = parseAdminAccountWriteResult(data, targetUserId);
  if (!result) return errorState('상태 변경 결과를 확인하지 못했습니다.', requestId);

  revalidateAdminAccountPaths(targetUserId);
  return { kind: 'success', message: '관리자 계정 상태를 변경했습니다.', requestId, targetUserId };
}
