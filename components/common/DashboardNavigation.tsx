'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

type DashboardNavigationProps = {
  className?: string;
};

export default function DashboardNavigation({ className = '' }: DashboardNavigationProps) {
  const router = useRouter();

  return (
    <div className={`mt-10 flex flex-col gap-3 border-t border-gray-100 pt-8 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}>
      <Button
        variant="outline"
        className="w-full justify-center rounded-2xl border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-green-400 hover:text-green-600 sm:w-auto"
        onClick={() => router.back()}
      >
        ← 이전
      </Button>

      <Button
        className="w-full justify-center rounded-2xl px-5 py-3 text-sm font-semibold shadow-sm sm:w-auto"
        onClick={() => router.push('/dashboard')}
      >
        대시보드로
      </Button>
    </div>
  );
}
