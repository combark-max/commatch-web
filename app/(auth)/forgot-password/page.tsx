'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const SUCCESS_MESSAGE = '가입된 이메일이라면 비밀번호 재설정 메일을 발송했습니다.';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) console.error('비밀번호 재설정 메일 요청 실패:', error);
      setMessage(SUCCESS_MESSAGE);
    } catch (error) {
      console.error('비밀번호 재설정 메일 요청 실패:', error);
      setMessage(SUCCESS_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        <Mail className="mx-auto mb-4 h-12 w-12 text-green-600" />
        <h1 className="text-center text-2xl font-bold text-gray-900">비밀번호 재설정</h1>
        <p className="mt-2 text-center text-sm text-gray-500">가입 이메일로 비밀번호 재설정 링크를 보내드립니다.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">이메일</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100" />
          </div>
          <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null} 재설정 메일 보내기
          </button>
        </form>
        {message ? <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-700">{message}</p> : null}
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-green-700 hover:underline">로그인으로 돌아가기</Link>
      </div>
    </div>
  );
}
