import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

const Toast = ({ message, type, onClose, duration = 3000 }: ToastProps) => {
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
    <div className={`fixed bottom-4 right-4 flex items-center p-4 rounded-lg border ${bgColor} ${borderColor} ${textColor} shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4`}>
      <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
      <span className="text-sm font-medium mr-8">{message}</span>
      <button
        onClick={onClose}
        className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
