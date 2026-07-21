"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import { signIn } from '@/lib/auth/auth';
import { isValidLoginId, normalizeLoginId, toInternalAuthEmail } from '@/lib/auth/login-id';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const loginIdMessage = '아이디는 영문 소문자, 숫자, 밑줄을 사용해 5~20자로 입력해주세요.';

const loginSchema = z.object({
  loginId: z.string().trim().min(1, { message: '아이디를 입력해주세요.' }).refine(isValidLoginId, {
    message: loginIdMessage,
  }),
  password: z.string().min(1, { message: '비밀번호를 입력해주세요.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const socialLogins = [
  { label: '카카오 로그인', icon: MessageCircle },
  { label: '네이버 로그인', icon: UserRound },
  { label: 'Google 로그인', icon: LogIn },
];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginId: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);

    try {
      const normalizedLoginId = normalizeLoginId(data.loginId);
      const authEmail = toInternalAuthEmail(normalizedLoginId);
      const { error: signInError } = await signIn(authEmail, data.password);

      if (signInError) {
        setToast({ message: '아이디 또는 비밀번호가 올바르지 않습니다.', type: 'error' });
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setToast({ message: '로그인 처리 중 오류가 발생했습니다.', type: 'error' });
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        setToast({ message: '프로필 정보를 확인하는 중 오류가 발생했습니다.', type: 'error' });
        return;
      }

      router.push(profile ? '/dashboard' : '/profile/create');
    } catch {
      setToast({ message: '아이디 또는 비밀번호가 올바르지 않습니다.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 px-6 py-12 lg:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-green-700"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          뒤로가기
        </button>

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60 lg:grid lg:grid-cols-[0.9fr_1.1fr]">
          <section className="flex flex-col justify-between bg-gradient-to-br from-green-700 to-green-500 p-10 text-white lg:p-12">
            <div>
              <Link href="/" className="text-3xl font-black tracking-tight">ComMatch</Link>
              <h1 className="mt-16 text-4xl font-black">로그인</h1>
              <p className="mt-4 max-w-sm text-lg leading-8 text-green-50">
                안전하고 편리하게 ComMatch를 이용하세요.
              </p>
            </div>
            <p className="mt-16 text-sm leading-6 text-green-100">
              아이디로 로그인하고 나에게 맞는 인연을 만나보세요.
            </p>
          </section>

          <div className="p-8 lg:p-12">
            <div className="border-b border-gray-200">
              <p className="inline-flex border-b-2 border-green-600 px-1 pb-4 text-base font-bold text-green-700">
                아이디 로그인
              </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <label htmlFor="loginId" className="mb-2 block text-sm font-semibold text-gray-800">아이디</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    {...register('loginId')}
                    id="loginId"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    aria-invalid={Boolean(errors.loginId)}
                    className={`h-14 w-full rounded-xl border bg-white pl-12 pr-4 text-base outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.loginId ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                    placeholder="아이디를 입력해주세요"
                  />
                </div>
                {errors.loginId ? (
                  <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.loginId.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-800">비밀번호</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    {...register('password')}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                    className={`h-14 w-full rounded-xl border bg-white pl-12 pr-12 text-base outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.password ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                    placeholder="비밀번호를 입력해주세요"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {errors.password ? (
                  <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.password.message}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
                <span className="text-gray-500">아이디 찾기 — 준비 중</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">비밀번호 재설정 — 준비 중</span>
                <span className="text-gray-300">|</span>
                <Link href="/signup" className="font-bold text-green-700 transition hover:text-green-800">회원가입</Link>
              </div>

              <Button type="submit" className="h-14 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 animate-spin" size={20} />로그인 중...</> : <><LogIn className="mr-2" size={20} />로그인</>}
              </Button>
            </form>

            <section className="mt-10 border-t border-gray-200 pt-8" aria-labelledby="social-login-heading">
              <div className="flex items-center justify-between gap-4">
                <h2 id="social-login-heading" className="text-base font-bold text-gray-900">간편 로그인</h2>
                <span className="text-xs font-semibold text-gray-400">서비스 준비 중</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {socialLogins.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    className="flex min-h-20 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-500"
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{label}</span>
                    <span className="text-[11px] font-medium text-gray-400">도입 예정</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
