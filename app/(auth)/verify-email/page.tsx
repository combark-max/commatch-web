'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Mail, RotateCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type VerificationStatus = 'confirmed' | 'session_error' | 'expired' | 'invalid' | 'error';

const verificationStatusContent: Record<VerificationStatus, { title: string; description: string }> = {
  confirmed: {
    title: '이메일 인증이 완료되었습니다.',
    description: '프로필 작성 또는 로그인 화면에서 계속 진행해 주세요.',
  },
  session_error: {
    title: '로그인 연결에 실패했습니다.',
    description: '이메일 인증은 완료되었지만 로그인 연결에 실패했습니다. 로그인 화면에서 다시 로그인해 주세요.',
  },
  expired: {
    title: '인증 링크가 만료되었습니다.',
    description: '인증 링크가 만료되었거나 이미 사용되었습니다.',
  },
  invalid: {
    title: '유효하지 않은 인증 링크입니다.',
    description: '가장 최근에 받은 인증메일의 링크를 다시 확인해 주세요.',
  },
  error: {
    title: '이메일 인증 처리 중 문제가 발생했습니다.',
    description: '잠시 후 다시 시도하거나 인증메일을 다시 요청해 주세요.',
  },
};

const getWebmailUrl = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalizedEmail)) return null;
  const domain = normalizedEmail.split('@').pop();
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'https://mail.google.com/mail/u/0/#inbox';
  if (domain === 'naver.com') return 'https://mail.naver.com/';
  if (domain === 'daum.net' || domain === 'hanmail.net' || domain === 'kakao.com') return 'https://mail.daum.net/';
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com') return 'https://outlook.live.com/mail/0/inbox';
  return null;
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const rawStatus = searchParams.get('status');
  const verificationStatus: VerificationStatus | null = rawStatus === null
    ? null
    : ['confirmed', 'session_error', 'expired', 'invalid', 'error'].includes(rawStatus)
      ? rawStatus as VerificationStatus
      : 'error';
  const statusContent = verificationStatus ? verificationStatusContent[verificationStatus] : null;
  const hasConfirmationError = verificationStatus !== null && verificationStatus !== 'confirmed';

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
      : { text: '인증 메일을 다시 발송했습니다. 가장 최근에 받은 메일의 링크를 사용해 주세요.', type: 'success' });
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
            {statusContent?.title ?? '회원가입이 완료되었습니다.'}
          </h1>
          <p className="text-lg leading-relaxed text-gray-600">
            {statusContent?.description ?? '입력하신 이메일로 인증 메일을 발송했습니다.'}
          </p>
        </div>

        {email ? (
          <div className="rounded-2xl border border-green-100 bg-green-50 px-5 py-4">
            <p className="mb-1 text-xs font-medium text-gray-500">가입 이메일</p>
            {webmailUrl ? (
              <a
                href={webmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${email} 메일함 열기`}
                className="break-all font-bold text-green-700 underline underline-offset-4"
              >
                {email}
              </a>
            ) : (
              <span className="break-all font-bold text-green-700">
                {email}
              </span>
            )}
            <p className="mt-2 text-xs text-gray-500">이 링크는 인증 링크가 아니라 이메일 앱을 여는 링크입니다.</p>
          </div>
        ) : null}

        {verificationStatus === null ? (
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

        {email && webmailUrl ? (
          <a
            href={webmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] py-4 font-bold text-white shadow-lg shadow-green-100 transition hover:bg-green-700"
          >
            <ExternalLink size={18} /> 인증 메일 확인하기
          </a>
        ) : email ? (
          <div>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#16a34a] py-4 font-bold text-white opacity-60 shadow-lg shadow-green-100"
            >
              <ExternalLink size={18} /> 메일 서비스에서 직접 확인
            </button>
            <p className="mt-3 text-sm text-gray-600">사용 중인 메일 서비스에 직접 접속해 인증메일을 확인해 주세요.</p>
          </div>
        ) : null}

        {!email ? (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600">
            가입할 때 사용한 이메일에서 인증메일을 확인해 주세요.
          </div>
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
          <p className="mt-3 text-xs text-gray-500">인증메일을 다시 요청한 경우 가장 최근에 받은 메일의 링크를 사용해 주세요.</p>
        </div>

        <div className="flex flex-col gap-3">
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
