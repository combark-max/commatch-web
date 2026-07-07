"use client";

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function VerifiedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-12">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#16a34a]" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">
            이메일 인증이 완료되었습니다.
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            이제 ComMatch에 로그인하여 <br />
            AI 셀프 매칭 서비스를 이용할 수 있습니다.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <Link
            href="/login"
            className="w-full bg-[#16a34a] text-white py-4 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100"
          >
            로그인하기
          </Link>
          <Link
            href="/"
            className="w-full bg-white text-gray-500 py-4 rounded-xl font-medium hover:text-gray-800 transition-all border border-gray-200"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
