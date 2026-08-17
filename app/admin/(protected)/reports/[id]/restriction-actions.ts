'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAdminAccess, requireAdminAccess } from '@/lib/admin/access';
import {
  getMemberAccountMode,
  isMemberAccountMode,
  isMemberProfileVisibility,
  parseAdminMemberRestriction,
  parseMemberRestrictionUpdateResult,
  parseSeoulDateTimeLocal,
  toSeoulDateTimeLocal,
  type MemberRestrictionActionState,
} from '@/lib/admin/member-restrictions';
import { isUuid, parseAdminReportDetail } from '@/lib/admin/reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const errorState = (message: string): MemberRestrictionActionState => ({
  kind: 'error',
  message,
});

const mapRestrictionError = (code: string | undefined, message: string | undefined): string => {
  if (code === '42501') {
    if (message?.includes('themselves')) return '자기 자신의 회원 상태는 변경할 수 없습니다.';
    if (message?.includes('Administrator accounts')) return '관리자 계정은 회원 제재 기능으로 처리할 수 없습니다.';
    return '회원 제재 변경 권한이 없습니다.';
  }
  if (code === 'P0002') return '제재 대상 회원을 찾을 수 없습니다.';
  if (code === '22023') {
    if (message?.includes('Related report')) return '현재 신고와 제재 대상 회원 정보가 일치하지 않습니다.';
    if (message?.includes('future') || message?.includes('suspension start')) {
      return '정지 종료일은 현재 시각보다 이후여야 합니다.';
    }
    if (message?.includes('unchanged')) return '변경된 내용이 없습니다.';
    if (message?.includes('reason')) return '제재 사유는 500자 이하로 입력해 주세요.';
    if (message?.includes('note')) return '관리자 메모는 2,000자 이하로 입력해 주세요.';
  }
  return '회원 제재 상태를 변경하지 못했습니다.';
};

export async function updateAdminMemberRestrictionAction(
  reportId: string | null,
  targetUserId: string,
  _previousState: MemberRestrictionActionState,
  formData: FormData,
): Promise<MemberRestrictionActionState> {
  const accessLookup = await getCurrentAdminAccess();
  if (
    accessLookup.kind === 'valid'
    && accessLookup.access.isAdmin
    && accessLookup.access.status === 'active'
    && accessLookup.access.role
    && !accessLookup.access.permissions.includes('member_restrictions_manage')
  ) {
    return errorState('회원 제재 변경 권한이 없습니다.');
  }
  await requireAdminAccess('member_restrictions_manage');

  const accountMode = formData.get('accountMode');
  const profileVisibility = formData.get('profileVisibility');
  const suspendedUntilValue = formData.get('suspendedUntil');
  const reasonValue = formData.get('reason');
  const adminNoteValue = formData.get('adminNote');
  if (
    (reportId !== null && !isUuid(reportId))
    || !isUuid(targetUserId)
    || !isMemberAccountMode(accountMode)
    || !isMemberProfileVisibility(profileVisibility)
    || typeof suspendedUntilValue !== 'string'
    || typeof reasonValue !== 'string'
    || typeof adminNoteValue !== 'string'
  ) return errorState('회원 제재 상태를 변경하지 못했습니다.');

  const reason = reasonValue.trim() || null;
  const adminNote = adminNoteValue.trim() || null;
  if (reason && reason.length > 500) return errorState('제재 사유는 500자 이하로 입력해 주세요.');
  if (adminNote && adminNote.length > 2000) return errorState('관리자 메모는 2,000자 이하로 입력해 주세요.');

  let suspendedUntil: string | null = null;
  if (accountMode === 'suspended_until') {
    suspendedUntil = parseSeoulDateTimeLocal(suspendedUntilValue);
    if (!suspendedUntil || Date.parse(suspendedUntil) <= Date.now()) {
      return errorState('정지 종료일은 현재 시각보다 이후여야 합니다.');
    }
  }

  const supabase = await createServerSupabaseClient();
  if (reportId !== null) {
    const detailResult = await supabase.rpc('get_admin_report_detail', { p_report_id: reportId });
    const detail = detailResult.error ? null : parseAdminReportDetail(detailResult.data);
    if (!detail) return errorState('현재 신고와 제재 대상 회원 정보를 확인하지 못했습니다.');
    if (detail.reportedUserId !== targetUserId) {
      return errorState('현재 신고와 제재 대상 회원 정보가 일치하지 않습니다.');
    }
    if (
      detail.targetType === 'message'
      && detail.message.senderId !== detail.reportedUserId
    ) {
      return errorState('신고 대상 회원과 메시지 작성자 정보가 일치하지 않아 제재를 적용할 수 없습니다.');
    }
  }

  const currentResult = await supabase.rpc('get_admin_member_restriction', {
    p_target_user_id: targetUserId,
  });
  const current = currentResult.error ? null : parseAdminMemberRestriction(currentResult.data);
  if (!current) return errorState('회원 제재 정보를 불러오지 못했습니다.');

  const currentMode = getMemberAccountMode(current.accountStatus, current.suspendedUntil);
  const currentSuspendedUntil = currentMode === 'suspended_until'
    ? toSeoulDateTimeLocal(current.suspendedUntil)
    : '';
  if (
    currentMode === accountMode
    && current.profileVisibility === profileVisibility
    && currentSuspendedUntil === (accountMode === 'suspended_until' ? suspendedUntilValue : '')
    && current.reason === reason
    && current.adminNote === adminNote
  ) return errorState('변경된 내용이 없습니다.');

  const { data, error } = await supabase.rpc('update_admin_member_restriction', {
    p_target_user_id: targetUserId,
    p_new_account_status: accountMode === 'active' ? 'active' : 'suspended',
    p_new_profile_visibility: profileVisibility,
    p_new_suspended_until: suspendedUntil,
    p_related_report_id: reportId,
    p_restriction_reason: reason,
    p_admin_note: adminNote,
  });
  if (error) return errorState(mapRestrictionError(error.code, error.message));
  if (!parseMemberRestrictionUpdateResult(data)) {
    return errorState('회원 제재 상태를 변경하지 못했습니다.');
  }

  revalidatePath('/admin');
  if (reportId === null) {
    revalidatePath('/admin/members');
    revalidatePath(`/admin/members/${targetUserId}`);
  } else {
    revalidatePath('/admin/reports');
    revalidatePath(`/admin/reports/${reportId}`);
  }
  return { kind: 'success', message: '회원 제재 상태가 변경되었습니다.' };
}
