'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { updateAdminMessageVisibilityAction } from '@/app/admin/(protected)/reports/[id]/message-actions';
import Button from '@/components/ui/Button';
import {
  MESSAGE_MODERATION_VISIBILITY_LABELS,
  type MessageModerationActionState,
  type MessageModerationVisibility,
} from '@/lib/admin/reports';

type AdminMessageModerationFormProps = {
  reportId: string;
  messageId: string;
  visibility: MessageModerationVisibility;
  canManage: boolean;
};

const initialState: MessageModerationActionState = { kind: 'idle', message: '' };

export default function AdminMessageModerationForm({
  reportId,
  messageId,
  visibility,
  canManage,
}: AdminMessageModerationFormProps) {
  const [reason, setReason] = useState('');
  const action = updateAdminMessageVisibilityAction.bind(null, reportId, messageId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const isHiding = visibility === 'visible';
  const nextVisibility: MessageModerationVisibility = isHiding ? 'hidden' : 'visible';

  if (!canManage) {
    return (
      <p className="rounded-2xl bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
        메시지 비노출 처리 권한이 없습니다.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="expectedVisibility" value={visibility} />
      <input type="hidden" name="newVisibility" value={nextVisibility} />

      <div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500">현재 메시지 상태</p>
          <p className="mt-1 font-black text-gray-900">
            {MESSAGE_MODERATION_VISIBILITY_LABELS[visibility]}
          </p>
        </div>
        <span className={`inline-flex self-start rounded-full px-3 py-1 text-xs font-bold ${
          visibility === 'visible'
            ? 'bg-green-100 text-green-800'
            : 'bg-gray-200 text-gray-700'
        }`}>
          {visibility === 'visible' ? <Eye className="mr-1" size={14} /> : <EyeOff className="mr-1" size={14} />}
          {MESSAGE_MODERATION_VISIBILITY_LABELS[visibility]}
        </span>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="message-moderation-reason" className="text-sm font-semibold text-gray-800">
            {isHiding ? '비노출 사유' : '복원 사유 (선택)'}
          </label>
          <span className="text-xs font-medium text-gray-500">{reason.length.toLocaleString('ko-KR')} / 500</span>
        </div>
        <textarea
          id="message-moderation-reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required={isHiding}
          maxLength={500}
          rows={4}
          disabled={pending}
          placeholder={isHiding ? '비노출 처리 근거를 입력해 주세요.' : '복원 사유를 입력할 수 있습니다.'}
          className="w-full resize-y rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:bg-gray-100"
        />
      </div>

      {state.kind !== 'idle' ? (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            state.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending || (isHiding && !reason.trim())}
        className="min-w-40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <><Loader2 className="mr-2 animate-spin" size={18} />처리 중...</>
        ) : isHiding ? (
          <><EyeOff className="mr-2" size={18} />비노출 처리</>
        ) : (
          <><Eye className="mr-2" size={18} />복원</>
        )}
      </Button>
    </form>
  );
}
