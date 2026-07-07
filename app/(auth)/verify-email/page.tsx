"use client";

import React from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2 } from 'lucide-react';

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-12">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <Mail className="w-10 h-10 text-[#16a34a]" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">
            회원가입이 완료되었습니다.
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            입력하신 이메일로 인증 메일을 보냈습니다.
          </p>
        </div>

        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
          <p className="text-gray-700 leading-relaxed">
            메일함에서 <br />
            <span className="font-bold text-[#16a34a]">'이메일 인증'</span> <br />
            버튼을 눌러주세요.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
            <CheckCircle2 size={16} className="text-[#16a34a]" />
            <span>인증이 완료되면 로그인할 수 있습니다.</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="w-full bg-[#16a34a] text-white py-4 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100"
          >
            로그인으로 이동
          </Link>
          <Link
            href="/signup"
            className="w-full bg-white text-gray-500 py-4 rounded-xl font-medium hover:text-gray-800 transition-all border border-gray-200"
          >
            회원가입 다시하기
          </Link>
        </div>
      </div>
    </div>
  );
}
