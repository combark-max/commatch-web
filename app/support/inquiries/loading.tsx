import { Loader2 } from 'lucide-react';

export default function SupportInquiriesLoading() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-50 px-4">
      <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
      <p className="font-medium text-gray-500">문의 정보를 불러오는 중...</p>
    </div>
  );
}
