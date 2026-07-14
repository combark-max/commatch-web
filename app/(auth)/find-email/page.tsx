'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2, MailSearch } from 'lucide-react';

export default function FindEmailPage() {
  const [nickname, setNickname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/account/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, birthDate }),
      });
      const body = await response.json() as { maskedEmail?: string; message?: string };
      if (!response.ok || !body.maskedEmail) setError(body.message ?? '입력한 정보와 일치하는 계정을 확인할 수 없습니다.');
      else setResult(body.maskedEmail);
    } catch {
      setError('요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        <MailSearch className="mx-auto mb-4 h-12 w-12 text-green-600" />
        <h1 className="text-center text-2xl font-bold text-gray-900">가입 이메일 찾기</h1>
        <p className="mt-2 text-center text-sm text-gray-500">가입할 때 등록한 프로필 정보를 입력해주세요.</p>
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="nickname" className="mb-1 block text-sm font-medium text-gray-700">닉네임</label>
            <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} required minLength={2} className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100" />
          </div>
          <div>
            <label htmlFor="birthDate" className="mb-1 block text-sm font-medium text-gray-700">생년월일</label>
            <input id="birthDate" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-100" />
          </div>
          <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null} 이메일 확인
          </button>
        </form>
        {result ? <p className="mt-5 rounded-xl bg-green-50 p-4 text-center font-bold text-green-700">가입 이메일: {result}</p> : null}
        {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p> : null}
        <p className="mt-4 text-xs leading-relaxed text-gray-400">닉네임과 생년월일 확인은 완전한 본인 인증 수단이 아닙니다. 이메일은 일부만 표시됩니다.</p>
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-green-700 hover:underline">로그인으로 돌아가기</Link>
      </div>
    </div>
  );
}
