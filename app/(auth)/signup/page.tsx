"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Lock, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { signUp } from '@/lib/auth/auth';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const signupSchema = z.object({
  email: z.string().email({ message: "유효한 이메일 주소를 입력해주세요." }),
  password: z.string()
    .min(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." }),
  confirmPassword: z.string(),
  terms: z.boolean().refine((value) => value, {
    message: "이용약관에 동의해야 합니다.",
  }),
  privacy: z.boolean().refine((value) => value, {
    message: "개인정보 처리방침에 동의해야 합니다.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["confirmPassword"],
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

        <div className="text-center">
          <Link href="/" className="text-3xl font-bold text-green-600 inline-block mb-2">
            ComMatch
          </Link>
          <h2 className="text-2xl font-bold text-gray-900">새로운 시작, 함께해요</h2>
          <p className="mt-2 text-sm text-gray-600">
            ComMatch와 함께 당신의 인연을 찾아보세요.
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
                  placeholder="8자 이상, 대소문자 및 숫자 포함"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

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

          <div className="space-y-3 pt-2">
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
                <label htmlFor="terms" className="text-gray-600 cursor-pointer">이용약관 동의 <span className="text-red-500">(필수)</span></label>
                {errors.terms && <p className="text-[10px] text-red-500 mt-0.5">{errors.terms.message}</p>}
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
                <label htmlFor="privacy" className="text-gray-600 cursor-pointer">개인정보 처리방침 동의 <span className="text-red-500">(필수)</span></label>
                {errors.privacy && <p className="text-[10px] text-red-500 mt-0.5">{errors.privacy.message}</p>}
              </div>
            </div>
          </div>

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
