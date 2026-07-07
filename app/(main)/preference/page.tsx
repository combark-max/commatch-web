"use client";

import React from 'react';
import { Heart, Users, Calendar, MapPin, Cigarette, Wine, Quote } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function PreferencePage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
              <Heart className="w-8 h-8 text-[#16a34a]" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">이상형 정보 설정</h1>
          <p className="mt-2 text-gray-600">당신이 꿈꾸는 이상형의 조건을 알려주세요.</p>
        </div>

        <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Preferred Gender */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Users size={16} className="mr-2 text-[#16a34a]" />
                희망 성별
              </label>
              <div className="flex gap-4">
                {['남성', '여성', '상관없음'].map((gender) => (
                  <label key={gender} className="flex-1">
                    <input type="radio" name="pref_gender" className="sr-only peer" />
                    <div className="w-full text-center py-2.5 border border-gray-300 rounded-lg cursor-pointer peer-checked:border-[#16a34a] peer-checked:bg-green-50 peer-checked:text-[#16a34a] transition-all">
                      {gender}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Preferred Age Range */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Calendar size={16} className="mr-2 text-[#16a34a]" />
                희망 나이
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="최소"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="number"
                  placeholder="최대"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all text-center"
                />
              </div>
            </div>

            {/* Preferred Region */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <MapPin size={16} className="mr-2 text-[#16a34a]" />
                희망 지역
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                <option value="">상관없음</option>
                <option value="seoul">서울</option>
                <option value="gyeonggi">경기</option>
                <option value="incheon">인천</option>
                <option value="etc">기타</option>
              </select>
            </div>

            {/* Smoking Preference */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Cigarette size={16} className="mr-2 text-[#16a34a]" />
                흡연 허용 여부
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                <option value="">선택</option>
                <option value="no">비흡연 선호</option>
                <option value="yes">상관없음</option>
              </select>
            </div>

            {/* Drinking Preference */}
            <div>
              <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                <Wine size={16} className="mr-2 text-[#16a34a]" />
                음주 허용 여부
              </label>
              <select className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all">
                <option value="">선택</option>
                <option value="none">전혀 안 함 선호</option>
                <option value="social">가끔 함 선호</option>
                <option value="yes">상관없음</option>
              </select>
            </div>
          </div>

          {/* Ideal Description */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              <Quote size={16} className="mr-2 text-[#16a34a]" />
              이상형 한줄 설명
            </label>
            <textarea
              rows={3}
              placeholder="추가적으로 바라는 이상형의 모습을 자유롭게 적어주세요."
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
            ></textarea>
          </div>

          <div className="pt-6">
            <Button
              type="submit"
              className="w-full py-4 text-lg font-bold"
            >
              저장하기
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
