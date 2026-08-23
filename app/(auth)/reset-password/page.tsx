'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cleanupPushBeforeSignOut } from '@/lib/push/client';

type ResetStatus = 'expired' | 'session_error' | 'invalid' | 'error';

const resetStatusContent: Record<ResetStatus, { title: string; description: string; alert: string }> = {
  expired: {
    title: '재설정 링크가 만료되었습니다.',
    description: '링크가 만료되었거나 이미 사용되었습니다. 최신 재설정 메일을 요청해주세요.',
    alert: '최신 재설정 메일을 다시 요청해주세요.',
  },
  session_error: {
    title: '재설정 연결에 실패했습니다.',
    description: '복구 세션 연결에 실패했습니다. 재설정 메일을 다시 요청해주세요.',
    alert: '재설정 메일을 다시 요청한 후 최신 링크를 사용해주세요.',
  },
  invalid: {
    title: '올바르지 않은 재설정 요청입니다.',
    description: '가장 최근에 받은 재설정 메일의 링크를 확인해주세요.',
    alert: '재설정 인증 정보를 확인할 수 없습니다.',
  },
  error: {
    title: '비밀번호 재설정을 준비하는 중 오류가 발생했습니다.',
    description: '재설정 메일을 다시 요청하거나 잠시 후 다시 시도해주세요.',
    alert: '비밀번호 재설정을 준비할 수 없습니다.',
  },
};

const defaultResetStatusContent = {
  title: '재설정 인증이 필요합니다.',
  description: '비밀번호 재설정 링크가 만료되었거나 인증 정보를 확인할 수 없습니다.',
  alert: '재설정 인증 정보를 확인할 수 없습니다.',
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const rawStatus = searchParams.get('status');
  const callbackStatus: ResetStatus | null = rawStatus === 'expired'
    || rawStatus === 'session_error'
    || rawStatus === 'invalid'
    || rawStatus === 'error'
    ? rawStatus
    : null;

  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (isMounted) {
          setHasSession(false);
          setIsCheckingSession(false);
        }
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (isMounted) {
        setHasSession(Boolean(user));
        setIsCheckingSession(false);
      }
    };

    void syncSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        setHasSession(Boolean(session));
        setIsCheckingSession(false);
      }
      if (event === 'SIGNED_OUT') setHasSession(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('비밀번호 조건을 확인해주세요.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setHasSession(false);
        setError('재설정 인증 정보를 확인할 수 없습니다.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        console.error('비밀번호 변경 실패:', {
          message: updateError.message,
          code: updateError.code ?? null,
          status: updateError.status ?? null,
          name: updateError.name,
        });

        const message = updateError.message.toLowerCase();
        if (updateError.status === 401 || updateError.status === 403) {
          setHasSession(false);
          setError('재설정 인증 정보를 확인할 수 없습니다.');
        } else if (updateError.code === 'weak_password' || message.includes('password')) {
          setError('비밀번호 조건을 확인해주세요.');
        } else {
          setError('비밀번호 변경에 실패했습니다.');
        }
        return;
      }
      setIsComplete(true);
    } catch (caughtError) {
      console.error('비밀번호 변경 네트워크 오류:', caughtError);
      setError('네트워크 연결을 확인한 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isResending) return;
    setIsResending(true);
    setError(null);
    setResendMessage(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resendError) console.error('비밀번호 재설정 메일 재전송 실패:', resendError);
      setResendMessage('재설정 메일을 다시 발송했습니다. 이메일의 링크를 눌러 이 화면으로 돌아와주세요.');
    } catch (caughtError) {
      console.error('비밀번호 재설정 메일 재전송 실패:', caughtError);
      setError('네트워크 연결을 확인한 후 다시 시도해주세요.');
    } finally {
      setIsResending(false);
    }
  };

  const handleLogin = async () => {
    await cleanupPushBeforeSignOut();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (isCheckingSession) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  const statusContent = callbackStatus ? resetStatusContent[callbackStatus] : defaultResetStatusContent;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        <KeyRound className="mx-auto mb-4 h-12 w-12 text-green-600" />
        {isComplete ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">비밀번호가 변경되었습니다.</h1>
            <button type="button" onClick={handleLogin} className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-bold text-white hover:bg-green-700">로그인하기</button>
          </div>
        ) : hasSession ? (
          <>
            <h1 className="text-center text-2xl font-bold text-gray-900">새 비밀번호 설정</h1>
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div><label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700">새 비밀번호</label><input id="newPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="w-full rounded-lg border border-gray-300 px-4 py-3" /></div>
              <div><label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-gray-700">새 비밀번호 확인</label><input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} className="w-full rounded-lg border border-gray-300 px-4 py-3" /></div>
              {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
              <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-xl bg-green-600 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60">{isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}{isSubmitting ? '변경 중...' : '비밀번호 변경'}</button>
            </form>
          </>
        ) : (
          <>
            <Mail className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <h1 className="text-center text-2xl font-bold text-gray-900">{statusContent.title}</h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-gray-500">{statusContent.description}</p>
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{statusContent.alert}</p>
            <form onSubmit={handleResend} className="mt-6 space-y-4">
              <div><label htmlFor="recoveryEmail" className="mb-1 block text-sm font-medium text-gray-700">이메일</label><input id="recoveryEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-lg border border-gray-300 px-4 py-3" /></div>
              <button type="submit" disabled={isResending} className="flex w-full items-center justify-center rounded-xl bg-green-600 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60">{isResending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}{isResending ? '발송 중...' : '재설정 메일 다시 보내기'}</button>
            </form>
            {resendMessage ? <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{resendMessage}</p> : null}
            {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
