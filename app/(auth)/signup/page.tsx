"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { signUp } from '@/lib/auth/auth';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const passwordMessage = '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.';
const identityVerificationAvailable = false;

const signupSchema = z.object({
  email: z.string().trim().min(1, { message: '이메일을 입력해주세요.' }).email({
    message: '올바른 이메일 주소를 입력해주세요.',
  }),
  password: z.string().min(8, { message: passwordMessage }).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: passwordMessage,
  }),
  confirmPassword: z.string().min(1, { message: '비밀번호 확인을 입력해주세요.' }),
  terms: z.boolean(),
  privacy: z.boolean(),
  adult: z.boolean(),
  marketing: z.boolean(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '비밀번호가 일치하지 않습니다.',
  path: ['confirmPassword'],
}).refine((data) => data.terms && data.privacy && data.adult, {
  message: '필수 약관에 동의해주세요.',
  path: ['terms'],
});

type SignupFormValues = z.infer<typeof signupSchema>;

const unavailableEmailErrorCodes = new Set([
  'email_address_invalid',
  'email_exists',
  'user_already_exists',
]);

const getSignupErrorMessage = (code?: string, status?: number) => {
  if ((code && unavailableEmailErrorCodes.has(code)) || status === 422) {
    return '이미 가입된 이메일이거나 사용할 수 없는 이메일입니다.';
  }

  return '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.';
};

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      terms: false,
      privacy: false,
      adult: false,
      marketing: false,
    },
  });

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    setToast(null);

    try {
      const email = data.email.trim();
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/profile/create`;
      const { data: signUpData, error: signUpError } = await signUp(email, data.password, emailRedirectTo);

      if (signUpError) {
        setToast({ message: getSignupErrorMessage(signUpError.code, signUpError.status), type: 'error' });
        return;
      }

      if (signUpData.user?.identities?.length === 0) {
        setToast({ message: '이미 가입된 이메일이거나 사용할 수 없는 이메일입니다.', type: 'error' });
        return;
      }

      sessionStorage.setItem('commatch.pendingEmail', email);
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch {
      setToast({ message: '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.', type: 'error' });
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

        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60">
          <header className="border-b border-green-100 bg-green-50 px-10 py-9 lg:px-14">
            <Link href="/" className="text-3xl font-black tracking-tight text-green-700">ComMatch</Link>
            <div className="mt-6 flex items-end justify-between gap-6">
              <div>
                <h1 className="text-3xl font-black text-gray-950">회원가입</h1>
                <p className="mt-2 text-base text-gray-600">이메일 인증 후 프로필을 작성할 수 있습니다.</p>
              </div>
              <p className="hidden text-sm font-semibold text-green-700 lg:block">계정 정보 입력</p>
            </div>
          </header>

          <form className="p-8 lg:p-14" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-800">이메일</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    {...register('email')}
                    id="email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    className={`h-14 w-full rounded-xl border pl-12 pr-4 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.email ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                    placeholder="example@email.com"
                  />
                </div>
                {errors.email ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.email.message}</p> : null}
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-800">비밀번호</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    {...register('password')}
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.password)}
                    className={`h-14 w-full rounded-xl border pl-12 pr-12 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.password ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                    placeholder="8자 이상, 영문과 숫자 포함"
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
                {errors.password ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.password.message}</p> : null}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-gray-800">비밀번호 확인</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    {...register('confirmPassword')}
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.confirmPassword)}
                    className={`h-14 w-full rounded-xl border pl-12 pr-4 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.confirmPassword ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                    placeholder="비밀번호를 다시 입력해주세요"
                  />
                </div>
                {errors.confirmPassword ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.confirmPassword.message}</p> : null}
              </div>
            </div>

            <section className="mt-9 rounded-2xl border border-gray-200 bg-gray-50 p-6" aria-labelledby="identity-verification-heading">
              <div className="flex items-start justify-between gap-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm">
                    <ShieldCheck size={21} aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="identity-verification-heading" className="font-bold text-gray-900">본인 및 성인 인증</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      안전한 회원 가입을 위해 향후 PASS 본인인증이 제공될 예정입니다.<br />
                      PASS 도입 후 본인 명의와 만 20세 이상 여부를 확인합니다.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-600">도입 예정</span>
              </div>

              <button
                type="button"
                disabled={!identityVerificationAvailable}
                aria-describedby="identity-verification-notice"
                className="mt-5 h-12 w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 font-semibold text-gray-400"
              >
                PASS 본인인증
              </button>

              <div id="identity-verification-notice" className="mt-4 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-gray-500">
                <p>현재는 PASS 본인인증 서비스 준비 중입니다.</p>
                <p>정식 서비스 도입 전까지 만 20세 이상 여부는 가입자의 확인을 기준으로 합니다.</p>
              </div>
            </section>

            <section className="mt-9 rounded-2xl border border-gray-200 p-6" aria-labelledby="agreements-heading">
              <h2 id="agreements-heading" className="font-bold text-gray-900">약관 동의</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('terms')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />이용약관 동의 <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('privacy')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />개인정보처리방침 동의 <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('adult')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />본인은 만 20세 이상임을 확인합니다. <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('marketing')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />마케팅 수신 동의 <span className="text-gray-400">(선택)</span></label>
              </div>
              {errors.terms ? <p role="alert" className="mt-4 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.terms.message}</p> : null}
            </section>

            <div className="mt-9">
              <Button type="submit" className="h-14 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 animate-spin" size={20} />가입 중...</> : '회원가입'}
              </Button>
              <p className="mt-3 text-center text-sm text-gray-500">가입 후 이메일 인증을 완료해주세요.</p>
              <p className="mt-6 text-center text-sm text-gray-600">
                이미 계정이 있으신가요?{' '}
                <Link href="/login" className="font-bold text-green-700 transition hover:text-green-800">로그인</Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
