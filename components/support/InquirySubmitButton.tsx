'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

export default function InquirySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center rounded-full bg-green-600 px-7 text-sm font-bold text-white shadow-lg shadow-green-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? <><Loader2 className="mr-2 animate-spin" size={18} />접수 중...</> : '문의 접수'}
    </button>
  );
}
