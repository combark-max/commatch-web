'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminAccess } from '@/lib/admin/access';
import {
  isReportStatus,
  isUuid,
  parseStatusUpdateResult,
  REPORT_STATUS_TRANSITIONS,
  type ReportStatusActionState,
} from '@/lib/admin/reports';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function updateAdminReportStatusAction(
  reportId: string,
  _previousState: ReportStatusActionState,
  formData: FormData,
): Promise<ReportStatusActionState> {
  await requireAdminAccess('reports_manage');

  const statusValue = formData.get('status');
  const noteValue = formData.get('note');
  if (!isUuid(reportId) || !isReportStatus(statusValue) || typeof noteValue !== 'string') {
    return { kind: 'error', message: '신고 처리 상태를 변경하지 못했습니다.' };
  }

  const currentStatusValue = formData.get('currentStatus');
  if (
    !isReportStatus(currentStatusValue)
    || !REPORT_STATUS_TRANSITIONS[currentStatusValue].includes(statusValue)
  ) {
    return { kind: 'error', message: '선택할 수 없는 상태입니다. 페이지를 새로고침해 주세요.' };
  }

  if (noteValue.trim().length > 2000) {
    return { kind: 'error', message: '관리자 처리 메모는 2,000자 이하로 입력해 주세요.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('update_admin_report_status', {
    p_report_id: reportId,
    p_new_status: statusValue,
    p_note: noteValue,
  });

  if (error || !parseStatusUpdateResult(data)) {
    return { kind: 'error', message: '신고 처리 상태를 변경하지 못했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/reports');
  revalidatePath(`/admin/reports/${reportId}`);
  return { kind: 'success', message: '신고 처리 상태가 변경되었습니다.' };
}
