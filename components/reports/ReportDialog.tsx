'use client';

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

const REPORT_REASONS = [
  { code: 'inappropriate_content', label: '부적절한 내용' },
  { code: 'harassment', label: '괴롭힘·모욕' },
  { code: 'fake_profile', label: '허위 프로필' },
  { code: 'spam', label: '광고·스팸' },
  { code: 'privacy_violation', label: '개인정보 침해' },
  { code: 'other', label: '기타' },
] as const;

type ReportReasonCode = (typeof REPORT_REASONS)[number]['code'];

export type ReportTarget =
  | { type: 'profile'; targetUserId: string; targetLabel?: string }
  | { type: 'message'; targetMessageId: string; targetLabel?: string };

type ReportDialogProps = {
  open: boolean;
  target: ReportTarget | null;
  onClose: () => void;
  onSuccess?: (reportId: string) => void;
};

const MAX_DETAIL_LENGTH = 1000;

const getReportErrorDetails = (error: unknown) => {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : '';
  const status = typeof error === 'object' && error && 'status' in error
    ? String(error.status)
    : '';
  const message = typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : error instanceof Error
      ? error.message
      : '';

  return { code, status, message, normalizedMessage: message.toLowerCase() };
};

const getReportErrorMessage = (error: unknown, targetType: ReportTarget['type']) => {
  const { code, status, normalizedMessage } = getReportErrorDetails(error);

  if (
    code === '23505'
    || status === '409'
    || normalizedMessage.includes('already been reported')
    || normalizedMessage.includes('duplicate key')
  ) {
    return targetType === 'profile' ? '이미 신고한 회원입니다.' : '이미 신고한 메시지입니다.';
  }

  if (normalizedMessage.includes('authentication required') || normalizedMessage.includes('permission denied for function')) {
    return '로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.';
  }
  if (normalizedMessage.includes('you cannot report your own profile')) return '본인의 프로필은 신고할 수 없습니다.';
  if (normalizedMessage.includes('target profile is required')) return '신고할 프로필을 확인할 수 없습니다.';
  if (normalizedMessage.includes('profile not found')) return '신고 대상 프로필을 찾을 수 없습니다.';
  if (normalizedMessage.includes('invalid report reason')) return '올바른 신고 사유를 선택해 주세요.';
  if (normalizedMessage.includes('reason detail is required when reason is other')) return '기타 사유의 상세 내용을 입력해 주세요.';
  if (normalizedMessage.includes('reason detail must be 1000 characters or fewer')) return '상세 내용은 1,000자 이하로 입력해 주세요.';
  if (normalizedMessage.includes('target message is required')) return '신고할 메시지를 확인할 수 없습니다.';
  if (normalizedMessage.includes('message not found')) return '신고 대상 메시지를 찾을 수 없습니다.';
  if (normalizedMessage.includes('match not found')) return '해당 매칭을 찾을 수 없습니다.';
  if (normalizedMessage.includes('not a participant in this match')) return '참여한 매칭의 메시지만 신고할 수 있습니다.';
  if (normalizedMessage.includes('you cannot report your own message')) return '본인이 보낸 메시지는 신고할 수 없습니다.';
  if (normalizedMessage.includes('message sender is not a participant in this match')) return '메시지 발신자 정보를 확인할 수 없습니다.';

  return '신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};

export default function ReportDialog({ open, target, onClose, onSuccess }: ReportDialogProps) {
  if (!open || !target) return null;

  return <ReportDialogContent target={target} onClose={onClose} onSuccess={onSuccess} />;
}

type ReportDialogContentProps = Omit<ReportDialogProps, 'open' | 'target'> & {
  target: ReportTarget;
};

function ReportDialogContent({ target, onClose, onSuccess }: ReportDialogContentProps) {
  const supabase = useMemo(() => createClient(), []);
  const titleId = useId();
  const descriptionId = useId();
  const detailId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstReasonRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onSuccessRef = useRef(onSuccess);
  const isSubmittingRef = useRef(false);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const [reasonCode, setReasonCode] = useState<ReportReasonCode | ''>('');
  const [reasonDetail, setReasonDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const visibleReasons = useMemo(
    () => REPORT_REASONS.filter((reason) => target.type === 'profile' || reason.code !== 'fake_profile'),
    [target.type],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => firstReasonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isSubmittingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute('hidden'));

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
      requestIdRef.current += 1;
    };
  }, []);

  const closeDialog = () => {
    if (!isSubmittingRef.current) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedDetail = reasonDetail.trim();
    if (!reasonCode) {
      setErrorMessage('신고 사유를 선택해 주세요.');
      return;
    }
    if (reasonCode === 'other' && !normalizedDetail) {
      setErrorMessage('기타 사유의 상세 내용을 입력해 주세요.');
      return;
    }
    if (normalizedDetail.length > MAX_DETAIL_LENGTH) {
      setErrorMessage('상세 내용은 1,000자 이하로 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    isSubmittingRef.current = true;
    setErrorMessage('');
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    let reportId: string;

    try {
      const { data, error } = target.type === 'profile'
        ? await supabase.rpc('submit_profile_report', {
            p_target_user_id: target.targetUserId,
            p_reason_code: reasonCode,
            p_reason_detail: normalizedDetail || null,
          })
        : await supabase.rpc('submit_message_report', {
            p_target_message_id: target.targetMessageId,
            p_reason_code: reasonCode,
            p_reason_detail: normalizedDetail || null,
          });

      if (error) throw error;
      if (typeof data !== 'string') throw new Error('Unexpected report response');

      reportId = data;
    } catch (error) {
      isSubmittingRef.current = false;

      if (isMountedRef.current && requestIdRef.current === requestId) {
        const { code, message } = getReportErrorDetails(error);
        console.error('신고 접수 실패:', {
          code: code || null,
          message: message || 'Unexpected report response',
        });
        setIsSubmitting(false);
        setErrorMessage(getReportErrorMessage(error, target.type));
      }
      return;
    } finally {
      isSubmittingRef.current = false;

      if (isMountedRef.current && requestIdRef.current === requestId) {
        setIsSubmitting(false);
      }
    }

    if (!isMountedRef.current || requestIdRef.current !== requestId) return;

    setErrorMessage('');
    onSuccessRef.current?.(reportId);
    onCloseRef.current();
  };

  const targetDescription = target.targetLabel
    ? `신고 대상: ${target.targetLabel}. 신고 사유를 선택해 주세요.`
    : target.type === 'profile'
      ? '이 회원의 프로필을 신고합니다. 신고 사유를 선택해 주세요.'
      : '선택한 메시지를 신고합니다. 신고 사유를 선택해 주세요.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={closeDialog}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-green-700">
              <Flag size={20} />
              <h2 id={titleId} className="text-xl font-extrabold text-gray-900">신고하기</h2>
            </div>
            <p id={descriptionId} className="mt-3 text-sm leading-6 text-gray-600">{targetDescription}</p>
          </div>
          <button
            type="button"
            aria-label="신고 창 닫기"
            disabled={isSubmitting}
            onClick={closeDialog}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={22} />
          </button>
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          <fieldset disabled={isSubmitting}>
            <legend className="text-sm font-bold text-gray-800">신고 사유</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {visibleReasons.map((reason, index) => (
                <label
                  key={reason.code}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    reasonCode === reason.code
                      ? 'border-green-600 bg-green-50 text-green-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    ref={index === 0 ? firstReasonRef : undefined}
                    type="radio"
                    name="report-reason"
                    value={reason.code}
                    checked={reasonCode === reason.code}
                    onChange={() => {
                      setReasonCode(reason.code);
                      setErrorMessage('');
                    }}
                    className="h-4 w-4 accent-green-600"
                  />
                  {reason.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-6">
            <label htmlFor={detailId} className="text-sm font-bold text-gray-800">
              상세 내용 {reasonCode === 'other' ? <span className="text-red-600">(필수)</span> : <span className="text-gray-400">(선택)</span>}
            </label>
            <textarea
              id={detailId}
              value={reasonDetail}
              onChange={(event) => {
                setReasonDetail(event.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              disabled={isSubmitting}
              maxLength={MAX_DETAIL_LENGTH}
              rows={5}
              placeholder="신고 내용을 구체적으로 입력해 주세요."
              className="mt-2 w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-right text-xs text-gray-400">{reasonDetail.length} / {MAX_DETAIL_LENGTH}</p>
          </div>

          {errorMessage ? (
            <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeDialog} className="min-h-12 rounded-2xl px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              취소
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-12 rounded-2xl px-6 text-sm disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
              {isSubmitting ? '접수 중...' : '신고 접수'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
