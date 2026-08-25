'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isMessageModerationVisibility,
  isUuid,
  parseMessageModerationUpdateResult,
  type MessageModerationActionState,
} from '@/lib/admin/reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const errorState = (message: string): MessageModerationActionState => ({
  kind: 'error',
  message,
});

export async function updateAdminMessageVisibilityAction(
  reportId: string,
  messageId: string,
  _previousState: MessageModerationActionState,
  formData: FormData,
): Promise<MessageModerationActionState> {
  await requireAdminAccess('reports_manage');

  const expectedVisibility = formData.get('expectedVisibility');
  const newVisibility = formData.get('newVisibility');
  const reasonValue = formData.get('reason');

  if (
    !isUuid(reportId)
    || !isUuid(messageId)
    || !isMessageModerationVisibility(expectedVisibility)
    || !isMessageModerationVisibility(newVisibility)
    || expectedVisibility === newVisibility
    || typeof reasonValue !== 'string'
  ) {
    return errorState('메시지 노출 상태를 변경하지 못했습니다.');
  }

  const reason = reasonValue.trim();
  if (newVisibility === 'hidden' && !reason) {
    return errorState('비노출 사유를 입력해 주세요.');
  }
  if (reason.length > 500) {
    return errorState('처리 사유는 500자 이하로 입력해 주세요.');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('set_admin_message_visibility', {
    p_report_id: reportId,
    p_message_id: messageId,
    p_expected_visibility: expectedVisibility,
    p_new_visibility: newVisibility,
    p_reason: reason || null,
  });

  if (error?.code === 'P0001' && error.message.includes('MESSAGE_VISIBILITY_STALE')) {
    return errorState('다른 관리자가 먼저 메시지 노출 상태를 변경했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
  }
  if (error?.code === 'P0001' && error.message.includes('MESSAGE_VISIBILITY_UNCHANGED')) {
    return errorState('이미 같은 노출 상태입니다. 페이지를 새로고침해 주세요.');
  }
  if (error?.code === 'P0002') {
    return errorState('신고 또는 원본 메시지를 찾을 수 없습니다.');
  }
  if (error || !parseMessageModerationUpdateResult(data)) {
    return errorState('메시지 노출 상태를 변경하지 못했습니다.');
  }

  revalidatePath('/admin');
  revalidatePath('/admin/reports');
  revalidatePath(`/admin/reports/${reportId}`);

  return {
    kind: 'success',
    message: newVisibility === 'hidden'
      ? '메시지를 비노출 처리했습니다.'
      : '메시지를 복원했습니다.',
  };
}
