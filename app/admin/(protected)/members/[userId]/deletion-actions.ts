'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAdminAccess } from '@/lib/admin/access';
import { deleteAdminMember } from '@/lib/admin/member-deletion-service';
import {
  ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH,
  isAdminMemberDeletionUuid,
  parseAdminMemberDeletionRequestResult,
  type AdminMemberDeletionActionState,
} from '@/lib/admin/member-deletions';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const errorState = (
  message: string,
  requestId?: string,
  resetRequestId = false,
): AdminMemberDeletionActionState => ({
  kind: 'error',
  message,
  requestId,
  resetRequestId,
});

const mapRequestError = (
  code: string | undefined,
  message: string | undefined,
): { message: string; resetRequestId?: boolean } => {
  if (code === '42501') {
    if (message?.includes('themselves')) return { message: '자기 자신의 계정은 강제탈퇴시킬 수 없습니다.' };
    if (message?.includes('Administrator accounts')) return { message: '관리자 계정은 강제탈퇴시킬 수 없습니다.' };
    return { message: '강제탈퇴는 active super_admin만 실행할 수 있습니다.' };
  }
  if (code === 'P0002') return { message: '강제탈퇴 대상 회원을 찾을 수 없습니다.' };
  if (code === 'P0001' && message?.includes('ALREADY_REQUESTED')) {
    return { message: '이 회원의 강제탈퇴 요청이 이미 처리 중입니다.' };
  }
  if (code === '22023') {
    if (message?.includes('REQUEST_ID_CONFLICT')) {
      return { message: '요청 식별자가 다른 강제탈퇴 요청과 충돌했습니다. 다시 시도해 주세요.', resetRequestId: true };
    }
    if (message?.includes('Related report')) return { message: '관련 신고와 강제탈퇴 대상 회원이 일치하지 않습니다.' };
    if (message?.includes('reason')) return { message: '강제탈퇴 사유는 1자 이상 500자 이하로 입력해 주세요.' };
  }
  return { message: '강제탈퇴 요청을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
};

export async function deleteAdminMemberAction(
  targetUserId: string,
  relatedReportId: string | null,
  _previousState: AdminMemberDeletionActionState,
  formData: FormData,
): Promise<AdminMemberDeletionActionState> {
  const requestIdValue = formData.get('requestId');
  const reasonValue = formData.get('reason');
  const confirmationValue = formData.get('confirmation');
  const requestId = isAdminMemberDeletionUuid(requestIdValue) ? requestIdValue : undefined;

  const accessLookup = await getCurrentAdminAccess();
  if (
    accessLookup.kind !== 'valid'
    || !accessLookup.access.isAdmin
    || accessLookup.access.status !== 'active'
    || accessLookup.access.role !== 'super_admin'
  ) return errorState('강제탈퇴는 active super_admin만 실행할 수 있습니다.', requestId);

  if (
    !requestId
    || !isAdminMemberDeletionUuid(targetUserId)
    || !(relatedReportId === null || isAdminMemberDeletionUuid(relatedReportId))
    || typeof reasonValue !== 'string'
    || confirmationValue !== '강제탈퇴'
  ) return errorState('강제탈퇴 입력 내용과 확인 문구를 확인해 주세요.', requestId);

  const reason = reasonValue.trim();
  if (reason.length < 1 || reason.length > ADMIN_MEMBER_DELETION_REASON_MAX_LENGTH) {
    return errorState('강제탈퇴 사유는 1자 이상 500자 이하로 입력해 주세요.', requestId);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('request_admin_member_deletion', {
    p_request_id: requestId,
    p_target_user_id: targetUserId,
    p_reason: reason,
    p_related_report_id: relatedReportId,
  });
  if (error) {
    const mapped = mapRequestError(error.code, error.message);
    return errorState(mapped.message, requestId, mapped.resetRequestId);
  }

  const request = parseAdminMemberDeletionRequestResult(data);
  if (
    !request
    || request.requestId.toLowerCase() !== requestId.toLowerCase()
    || request.targetUserId.toLowerCase() !== targetUserId.toLowerCase()
  ) {
    return errorState('강제탈퇴 감사 요청 결과를 확인하지 못했습니다.', requestId);
  }
  if (request.isDuplicate) {
    if (request.status === 'completed') {
      return { kind: 'success', message: '이미 완료된 강제탈퇴 요청입니다.', requestId };
    }
    if (request.status === 'requested') {
      return errorState('동일한 강제탈퇴 요청이 이미 처리 중입니다.', requestId);
    }
    return errorState('이전 강제탈퇴 요청이 실패했습니다. 새 요청으로 다시 시도해 주세요.', requestId, true);
  }

  const deletion = await deleteAdminMember({ requestId, targetUserId });
  if (deletion.kind === 'error') {
    const auditNote = deletion.auditRecorded
      ? ' 실패 단계가 감사기록에 저장되었습니다.'
      : ' 감사기록 실패 상태도 저장하지 못했으므로 운영 확인이 필요합니다.';
    return errorState(`${deletion.message}${auditNote}`, requestId, true);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return {
    kind: 'success',
    message: '회원 강제탈퇴가 완료되었습니다. 감사기록은 계속 보존됩니다.',
    requestId,
  };
}
