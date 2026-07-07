"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mail, Lock, LogIn, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { signIn } from '@/lib/auth/auth';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';

const loginSchema = z.object({
  email: z.string().email({ message: "유효한 이메일 주소를 입력해주세요." }),
  password: z.string().min(1, { message: "비밀번호를 입력해주세요." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const { error: signInError } = await signIn(data.email, data.password);

      if (signInError) {
        setToast({ message: signInError.message, type: 'error' });
      } else {
        router.push('/');
      }
    } catch (err) {
      setToast({ message: "로그인 중 오류가 발생했습니다. 다시 시도해주세요.", type: 'error' });
    } finally {
      setIsLoading(false);
    }
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
          <h2 className="text-2xl font-bold text-gray-900">환영합니다</h2>
          <p className="mt-2 text-sm text-gray-600">
            ComMatch에 로그인하여 인연을 찾아보세요.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
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
              {errors.email && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.email.message}</p>}
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
              {errors.password && <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> {errors.password.message}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link href="/forgot-password" size="sm" className="font-medium text-green-600 hover:text-green-700 transition-colors">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full py-3.5"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin mr-2" size={20} />
                로그인 중...
              </>
            ) : (
              <>
                <LogIn className="mr-2" size={20} />
                로그인
              </>
            )}
          </Button>

          <div className="text-center mt-6">
            <p className="text-sm text-gray-600">
              계정이 없으신가요?{' '}
              <Link href="/signup" className="font-bold text-green-600 hover:text-green-700 transition-colors">
                회원가입하기
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
