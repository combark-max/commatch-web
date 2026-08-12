import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

const Toast = ({
  message,
  type,
  onClose,
  duration = 3000,
  actionLabel,
  onAction,
}: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgColor = type === 'success' ? 'bg-green-50' : 'bg-red-50';
  const borderColor = type === 'success' ? 'border-green-200' : 'border-red-200';
  const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center rounded-lg border p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4 ${bgColor} ${borderColor} ${textColor}`} role="status">
      <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
      <span className="text-sm font-medium">{message}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="ml-4 shrink-0 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="ml-4 shrink-0 text-gray-400 transition-colors hover:text-gray-600"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
