'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Mail, RotateCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const getWebmailUrl = (email: string) => {
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain === 'gmail.com') return 'https://mail.google.com';
  if (domain === 'naver.com') return 'https://mail.naver.com';
  if (domain === 'daum.net' || domain === 'hanmail.net') return 'https://mail.daum.net';
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') return 'https://outlook.live.com/mail';
  return `mailto:${email}`;
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const hasConfirmationError = searchParams.get('status') === 'error';

  useEffect(() => {
    if (email) {
      sessionStorage.setItem('commatch.pendingEmail', email);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const pendingEmail = sessionStorage.getItem('commatch.pendingEmail');
      if (pendingEmail) setEmail(pendingEmail);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [email]);

  const webmailUrl = useMemo(() => getWebmailUrl(email), [email]);

  const handleResend = async () => {
    if (!email || isResending) {
      if (!email) setMessage({ text: '가입한 이메일 주소를 확인할 수 없습니다. 회원가입 페이지에서 다시 시도해주세요.', type: 'error' });
      return;
    }

    setIsResending(true);
    setMessage(null);
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=/profile/create`;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo },
    });

    setMessage(error
      ? { text: '인증 메일 재전송에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' }
      : { text: '인증 메일을 다시 발송했습니다.', type: 'success' });
    setIsResending(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-md space-y-7 text-center">
        <div className="flex flex-col items-center">
          <div className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${hasConfirmationError ? 'bg-red-50' : 'bg-green-50'}`}>
            {hasConfirmationError
              ? <AlertCircle className="h-10 w-10 text-red-500" />
              : <Mail className="h-10 w-10 text-[#16a34a]" />}
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-gray-900">
            {hasConfirmationError ? '이메일 인증에 실패했습니다.' : '회원가입이 완료되었습니다.'}
          </h1>
          <p className="text-lg leading-relaxed text-gray-600">
            {hasConfirmationError
              ? '이메일 인증 링크가 만료되었거나 올바르지 않습니다.'
              : '입력하신 이메일로 인증 메일을 발송했습니다.'}
          </p>
        </div>

        {email ? (
          <div className="rounded-2xl border border-green-100 bg-green-50 px-5 py-4">
            <p className="mb-1 text-xs font-medium text-gray-500">가입 이메일</p>
            <a
              href={`mailto:${email}`}
              aria-label={`${email} 주소로 이메일 앱 열기`}
              className="break-all font-bold text-green-700 underline underline-offset-4"
            >
              {email}
            </a>
            <p className="mt-2 text-xs text-gray-500">이 링크는 인증 링크가 아니라 이메일 앱을 여는 링크입니다.</p>
          </div>
        ) : null}

        {!hasConfirmationError ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
            <p className="leading-relaxed text-gray-700">
              이메일을 확인한 후 <strong className="text-[#16a34a]">‘Confirm email address’</strong>를 눌러주세요.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
              <CheckCircle2 size={16} className="text-[#16a34a]" />
              인증이 완료되면 프로필 작성 화면으로 이동합니다.
            </div>
          </div>
        ) : null}

        {email ? (
          <a
            href={webmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] py-4 font-bold text-white shadow-lg shadow-green-100 transition hover:bg-green-700"
          >
            <ExternalLink size={18} /> 인증 메일 확인하기
          </a>
        ) : null}

        <div className="rounded-2xl border border-gray-200 p-5">
          <p className="mb-3 text-sm text-gray-600">인증 메일을 받지 못하셨나요?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-600 px-5 py-3 font-semibold text-green-700 transition hover:bg-green-50 disabled:cursor-wait disabled:opacity-60"
          >
            {isResending ? <Loader2 size={18} className="animate-spin" /> : <RotateCw size={18} />}
            {isResending ? '재전송 중...' : '인증 메일 다시 받기'}
          </button>
          {message ? (
            <p role="alert" className={`mt-3 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
              {message.text}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/login" className="w-full rounded-xl border border-gray-200 bg-white py-3 font-medium text-gray-600 transition hover:text-gray-900">
            로그인
          </Link>
          {!email ? (
            <Link href="/signup" className="text-sm font-semibold text-green-700 hover:underline">회원가입으로 돌아가기</Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
