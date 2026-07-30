'use client';

import { useActionState, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { updateAdminReportStatusAction } from '@/app/admin/(protected)/reports/[id]/actions';
import Button from '@/components/ui/Button';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_TRANSITIONS,
  type ReportStatus,
  type ReportStatusActionState,
} from '@/lib/admin/reports';

type AdminReportStatusFormProps = {
  reportId: string;
  currentStatus: ReportStatus;
  canManage: boolean;
};

const initialState: ReportStatusActionState = { kind: 'idle', message: '' };

export default function AdminReportStatusForm({
  reportId,
  currentStatus,
  canManage,
}: AdminReportStatusFormProps) {
  const [note, setNote] = useState('');
  const action = updateAdminReportStatusAction.bind(null, reportId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const nextStatuses = REPORT_STATUS_TRANSITIONS[currentStatus];

  if (!canManage) {
    return (
      <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
        신고 처리 권한이 없습니다.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="currentStatus" value={currentStatus} />
      <p className="text-sm text-gray-600">
        현재 상태: <strong className="text-gray-900">{REPORT_STATUS_LABELS[currentStatus]}</strong>
      </p>
      <div>
        <label htmlFor="report-status" className="mb-2 block text-sm font-semibold text-gray-800">변경할 상태</label>
        <select
          id="report-status"
          name="status"
          required
          disabled={pending}
          defaultValue=""
          className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        >
          <option value="" disabled>상태를 선택해 주세요.</option>
          {nextStatuses.map((status) => (
            <option key={status} value={status}>{REPORT_STATUS_LABELS[status]}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="admin-report-note" className="text-sm font-semibold text-gray-800">관리자 처리 메모</label>
          <span className="text-xs font-medium text-gray-500">{note.length.toLocaleString('ko-KR')} / 2,000</span>
        </div>
        <textarea
          id="admin-report-note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={5}
          disabled={pending}
          placeholder="처리 근거나 확인 내용을 입력할 수 있습니다."
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
      </div>

      {state.kind !== 'idle' ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${state.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="min-w-40 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />저장 중...</> : '처리 상태 저장'}
      </Button>
    </form>
  );
}
