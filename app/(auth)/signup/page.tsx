"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, Smartphone, UserRound } from 'lucide-react';
import { isValidLoginId, normalizeLoginId } from '@/lib/auth/login-id';
import { formatKoreanMobilePhone, isValidKoreanMobilePhone } from '@/lib/auth/phone';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const loginIdMessage = '영문 소문자, 숫자, 밑줄을 사용해 5~20자로 입력해주세요.';
const passwordMessage = '비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.';

const signupSchema = z.object({
  loginId: z.string().trim().min(1, { message: '로그인 아이디를 입력해주세요.' }).refine(isValidLoginId, {
    message: loginIdMessage,
  }),
  password: z.string().min(8, { message: passwordMessage }).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: passwordMessage }),
  confirmPassword: z.string().min(1, { message: '비밀번호 확인을 입력해주세요.' }),
  name: z.string().trim().min(1, { message: '이름을 입력해주세요.' }).max(100, { message: '이름은 100자 이하로 입력해주세요.' }),
  phone: z.string().trim().min(1, { message: '휴대폰 번호를 입력해주세요.' }).refine(isValidKoreanMobilePhone, {
    message: '올바른 휴대폰 번호를 입력해주세요.',
  }),
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

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      loginId: '',
      password: '',
      confirmPassword: '',
      name: '',
      phone: '',
      terms: false,
      privacy: false,
      adult: false,
      marketing: false,
    },
  });

  const loginIdField = register('loginId');
  const phoneField = register('phone');

  const onSubmit = () => {
    setToast({
      message: '휴대폰 인증 서비스 연결 후 회원가입을 이용할 수 있습니다.',
      type: 'error',
    });
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
                <p className="mt-2 text-base text-gray-600">안전한 만남을 위한 기본 정보를 입력해주세요.</p>
              </div>
              <p className="hidden text-sm font-semibold text-green-700 lg:block">계정 정보 입력</p>
            </div>
          </header>

          <form className="p-8 lg:p-14" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label htmlFor="loginId" className="mb-2 block text-sm font-semibold text-gray-800">로그인 아이디</label>
                <div className="flex gap-3">
                  <div className="relative min-w-0 flex-1">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      {...loginIdField}
                      id="loginId"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      aria-invalid={Boolean(errors.loginId)}
                      onBlur={(event) => {
                        loginIdField.onBlur(event);
                        setValue('loginId', normalizeLoginId(event.target.value), { shouldValidate: true });
                      }}
                      className={`h-14 w-full rounded-xl border pl-12 pr-4 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.loginId ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                      placeholder="로그인에 사용할 아이디"
                    />
                  </div>
                  <button type="button" disabled className="min-w-44 cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-5 text-sm font-semibold text-gray-500">
                    아이디 중복 확인 — 준비 중
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">{loginIdMessage}</p>
                {errors.loginId ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.loginId.message}</p> : null}
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

              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-800">이름</label>
                <input
                  {...register('name')}
                  id="name"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  aria-invalid={Boolean(errors.name)}
                  className={`h-14 w-full rounded-xl border px-4 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.name ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                  placeholder="이름을 입력해주세요"
                />
                {errors.name ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.name.message}</p> : null}
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-gray-800">휴대폰 번호</label>
                <div className="flex gap-3">
                  <div className="relative min-w-0 flex-1">
                    <Smartphone className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      {...phoneField}
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      aria-invalid={Boolean(errors.phone)}
                      onBlur={(event) => {
                        phoneField.onBlur(event);
                        if (isValidKoreanMobilePhone(event.target.value)) {
                          setValue('phone', formatKoreanMobilePhone(event.target.value), { shouldValidate: true });
                        }
                      }}
                      className={`h-14 w-full rounded-xl border pl-12 pr-4 outline-none transition focus:ring-2 focus:ring-green-500/20 ${errors.phone ? 'border-red-400' : 'border-gray-300 focus:border-green-600'}`}
                      placeholder="010-1234-5678"
                    />
                  </div>
                  <button type="button" disabled className="min-w-32 cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-5 text-sm font-semibold text-gray-500">인증번호 받기</button>
                </div>
                {errors.phone ? <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.phone.message}</p> : null}
              </div>

              <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 lg:col-span-2" aria-labelledby="phone-verification-heading">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="phone-verification-heading" className="flex items-center gap-2 font-bold text-gray-900"><Smartphone size={19} className="text-green-600" />휴대폰 인증 — 도입 예정</h2>
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-600">도입 예정</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">SMS 인증 서비스 연결 후 사용할 수 있습니다.</p>
                <div className="mt-4 flex gap-3">
                  <input type="text" disabled aria-label="인증번호" placeholder="인증번호" className="h-12 min-w-0 flex-1 cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 text-gray-400" />
                  <button type="button" disabled className="min-w-28 cursor-not-allowed rounded-xl bg-gray-200 px-5 text-sm font-semibold text-gray-500">인증 확인</button>
                </div>
              </section>
            </div>

            <section className="mt-9 rounded-2xl border border-gray-200 p-6" aria-labelledby="agreements-heading">
              <h2 id="agreements-heading" className="font-bold text-gray-900">약관 동의</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('terms')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />이용약관 동의 <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('privacy')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />개인정보처리방침 동의 <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('adult')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />만 20세 이상 확인 <span className="text-red-500">(필수)</span></label>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700"><input {...register('marketing')} type="checkbox" className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />마케팅 수신 동의 <span className="text-gray-400">(선택)</span></label>
              </div>
              {errors.terms ? <p role="alert" className="mt-4 flex items-center gap-1 text-sm text-red-600"><AlertCircle size={14} />{errors.terms.message}</p> : null}
            </section>

            <div className="mt-9">
              <Button type="submit" className="h-14 w-full">회원가입</Button>
              <p className="mt-3 text-center text-sm text-gray-500">휴대폰 인증 서비스 연결 후 회원가입을 이용할 수 있습니다.</p>
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
