"use client";

import React from 'react';
import { useRouter } from "next/navigation";
import { signOut } from '@/lib/auth/auth';

const menuItems = [
  {
    title: "AI 추천 ❤️",
    description: "AI가 추천하는 회원 보기",
    color: "bg-green-50 text-green-600",
    path: "/ai-match"
  },
  {
    title: "회원 둘러보기 👥",
    description: "전체 회원 보기",
    color: "bg-blue-50 text-blue-600",
    path: "/members"
  },
  {
    title: "관심회원 ❤️",
    description: "관심 회원 관리",
    color: "bg-rose-50 text-rose-600",
    path: "/favorites"
  },
  {
    title: "내 프로필 👤",
    description: "프로필 수정",
    color: "bg-purple-50 text-purple-600",
    path: "/profile/create"
  },
  {
    title: "이상형 수정 ⚙️",
    description: "이상형 조건 수정",
    color: "bg-amber-50 text-amber-600",
    path: "/preference"
  },
  {
    title: "로그아웃 🚪",
    description: "로그아웃",
    color: "bg-rose-50 text-rose-600",
    path: "logout"
  },
];

export default function DashboardPage() {
  const router = useRouter();

  const handleMenuClick = async (path: string) => {
    if (path === "logout") {
      const { error } = await signOut();
      if (!error) {
        router.push('/login');
      } else {
        alert("로그아웃 중 오류가 발생했습니다.");
      }
      return;
    }
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-left mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">대시보드</h1>
          <p className="mt-2 text-gray-500 text-lg">원하시는 작업을 선택해주세요.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {menuItems.map((item, index) => (
            <div
              key={index}
              onClick={() => handleMenuClick(item.path)}
              className={`group relative bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-green-500/30 transition-all duration-300 cursor-pointer overflow-hidden ${
                item.title === "로그아웃 🚪" ? "sm:col-span-2 md:col-span-1" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 leading-relaxed font-medium">
                    {item.description}
                  </p>
                </div>
                <div className={`p-3 rounded-2xl ${item.color} group-hover:scale-110 transition-transform duration-300`}>
                  <span className="text-2xl" role="img" aria-label="icon">
                    {item.title.split(" ").pop()}
                  </span>
                </div>
              </div>

              {/* Decorative background element */}
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-gray-50 rounded-full opacity-50 group-hover:bg-green-50 group-hover:scale-150 transition-all duration-500 -z-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
