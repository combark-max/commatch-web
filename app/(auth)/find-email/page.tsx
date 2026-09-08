import Link from 'next/link';
import { MailSearch } from 'lucide-react';

export default function FindEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-xl">
        <MailSearch className="mx-auto mb-4 h-12 w-12 text-green-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-gray-900">가입 이메일 찾기</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          현재 가입 이메일 찾기 기능을 이용할 수 없습니다.
        </p>

        <div className="mt-7 rounded-2xl bg-green-50 px-5 py-6 text-left">
          <h2 className="font-bold text-green-900">휴대폰 본인인증 준비 안내</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            현재 ComMatch는 휴대폰 본인인증 서비스를 제공하지 않습니다.
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            본인인증 서비스 도입 후 가입 이메일 찾기 기능을 제공할 예정입니다.
          </p>
        </div>

        <Link
          href="/login"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-green-200 px-5 text-sm font-semibold text-green-700 transition hover:bg-green-50"
        >
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
