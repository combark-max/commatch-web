'use client';

import React from 'react';
import DashboardNavigation from '@/components/common/DashboardNavigation';

export default function AiMatchPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">AI 추천</h1>
          <p className="mt-2 text-gray-600">AI가 추천하는 회원을 확인할 수 있는 화면입니다.</p>
        </div>

        <div className="rounded-[1.75rem] border border-green-100 bg-green-50 p-6 text-sm leading-7 text-gray-700">
          현재 이 기능은 준비 중이며, 기존 대시보드 흐름과 함께 하단 이동 버튼을 사용할 수 있도록 구성했습니다.
        </div>

        <DashboardNavigation />
      </div>
    </div>
  );
}
