"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Smartphone } from 'lucide-react';
import { signUp } from '@/lib/auth/auth';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const signupSchema = z.object({
  email: z.string().email({ message: "올바른 이메일 주소를 입력해주세요." }),
  password: z.string()
    .min(8, { message: "비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다." })
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: "비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다." }),
  confirmPassword: z.string().min(1, { message: "비밀번호가 일치하지 않습니다." }),
  terms: z.boolean(),
  privacy: z.boolean(),
  adult: z.boolean(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["confirmPassword"],
}).refine((data) => data.terms && data.privacy && data.adult, {
  message: "필수 약관에 동의해주세요.",
  path: ["terms"],
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
      privacy: false,
      adult: false,
    },
  });

  const password = watch("password");

  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    setPasswordStrength(strength);
  }, [password]);

  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    try {
      if (data.password !== data.confirmPassword) {
        setToast({ message: '비밀번호가 일치하지 않습니다.', type: 'error' });
        return;
      }

      const emailRedirectTo = `${window.location.origin}/auth/callback?next=/profile/create`;
      const { error: signUpError } = await signUp(data.email, data.password, emailRedirectTo);

      if (signUpError) {
        setToast({ message: signUpError.message, type: 'error' });
      } else {
        sessionStorage.setItem('commatch.pendingEmail', data.email);
        router.push(`/verify-email?email=${encodeURIComponent(data.email)}`);
      }
    } catch {
      setToast({ message: "회원가입 중 오류가 발생했습니다. 다시 시도해주세요.", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return 'bg-red-500';
    if (passwordStrength <= 3) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthText = () => {
    if (passwordStrength <= 1) return '취약';
    if (passwordStrength <= 3) return '보통';
    return '안전';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl border border-gray-100 relative overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-green-500"></div>

        <div>
          <div className="relative flex items-center justify-center">
            <Link href="/" className="text-3xl font-bold text-green-600">
              ComMatch
            </Link>
          </div>
          <div className="mt-5 text-center">
            <h1 className="text-2xl font-bold text-gray-900">회원가입</h1>
            <p className="mt-2 text-sm text-gray-600">새로운 시작, ComMatch와 함께해요.</p>
          </div>
        </div>

        <div className="rounded-xl bg-green-50 px-4 py-4 text-center">
          <p className="text-xs font-bold tracking-wider text-green-700">STEP 1 / 3</p>
          <p className="mt-1 text-lg tracking-[0.35em] text-green-600" aria-label="3단계 중 첫 번째 단계">● ○ ○</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-medium text-gray-500">
            <span className="text-green-700">계정 만들기</span>
            <span>기본정보 작성</span>
            <span>가입 완료</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            기본정보 입력과 본인인증 기능은 순차적으로 도입될 예정입니다.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  {...register("email")}
                  type="email"
                  className={`block w-full pl-10 pr-3 py-2.5 border ${errors.email ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  placeholder="example@email.com"
                />
              </div>
              {errors.email && <p role="alert" className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.email.message}</p>}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  className={`block w-full pl-10 pr-10 py-2.5 border ${errors.password ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  placeholder="비밀번호를 입력해주세요"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <p className="mt-1.5 text-xs text-gray-500">8자 이상, 영문과 숫자를 포함해주세요.</p>

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">비밀번호 보안 수준</span>
                    <span className={`text-[10px] font-bold ${getStrengthColor().replace('bg-', 'text-')}`}>{getStrengthText()}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStrengthColor()} transition-all duration-500`}
                      style={{ width: `${(passwordStrength / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {errors.password && <p role="alert" className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.password.message}</p>}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  {...register("confirmPassword")}
                  type={showPassword ? "text" : "password"}
                  className={`block w-full pl-10 pr-3 py-2.5 border ${errors.confirmPassword ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  placeholder="비밀번호를 다시 입력해주세요"
                />
              </div>
              {errors.confirmPassword && <p role="alert" className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.confirmPassword.message}</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-bold text-gray-800">약관 동의</p>
            {/* Terms Agreement */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  {...register("terms")}
                  id="terms"
                  type="checkbox"
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer transition-colors"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="terms" className="text-gray-600 cursor-pointer">이용약관에 동의합니다. <span className="text-red-500">(필수)</span></label>
                <p className="mt-0.5 text-[10px] text-gray-400">상세 약관 페이지 준비 중</p>
              </div>
            </div>

            {/* Privacy Agreement */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  {...register("privacy")}
                  id="privacy"
                  type="checkbox"
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer transition-colors"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="privacy" className="text-gray-600 cursor-pointer">개인정보처리방침에 동의합니다. <span className="text-red-500">(필수)</span></label>
                <p className="mt-0.5 text-[10px] text-gray-400">상세 약관 페이지 준비 중</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex h-5 items-center">
                <input
                  {...register("adult")}
                  id="adult"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-gray-300 text-green-600 transition-colors focus:ring-green-500"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="adult" className="cursor-pointer text-gray-600">만 20세 이상입니다. <span className="text-red-500">(필수)</span></label>
              </div>
            </div>

            <div className="flex items-start opacity-60">
              <div className="flex h-5 items-center">
                <input id="marketing" type="checkbox" disabled className="h-4 w-4 cursor-not-allowed rounded border-gray-300" />
              </div>
              <div className="ml-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <label htmlFor="marketing">마케팅 정보 수신 동의</label>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-600">도입 예정</span>
              </div>
            </div>

            {errors.terms && <p role="alert" className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={12} /> {errors.terms.message}</p>}
          </div>

          <section className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-bold text-gray-800">추가 정보 입력</h2>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              성별, 생년월일, 거주지역 등의 정보는 회원가입 후 프로필 작성 단계에서 입력합니다.
            </p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-gray-600">이름</dt><dd className="font-medium text-gray-400">도입 예정</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-600">성별</dt><dd className="font-medium text-gray-500">프로필 작성에서 입력</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-600">생년월일</dt><dd className="font-medium text-gray-500">프로필 작성에서 입력</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-600">거주지역</dt><dd className="font-medium text-gray-500">프로필 작성에서 입력</dd></div>
            </dl>
          </section>

          {/* TODO: 휴대폰 본인인증 서비스 도입 시 실제 인증 UI와 API 연결 */}
          <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800"><Smartphone size={17} className="text-green-600" /> 휴대폰 본인인증</h2>
              <span className="rounded-full bg-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600">도입 예정</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              안전한 만남을 위한 휴대폰 본인인증 기능이 추후 추가될 예정입니다.
            </p>
          </section>

          <Button
            type="submit"
            className="w-full py-3.5 mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin mr-2" size={20} />
                가입 중...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2" size={20} />
                가입하기
              </>
            )}
          </Button>

          <div className="text-center mt-6">
            <p className="text-sm text-gray-600">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="font-bold text-green-600 hover:text-green-700 transition-colors">
                로그인하기
              </Link>
            </p>
          </div>
        </form>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
