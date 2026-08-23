'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Settings, X } from 'lucide-react';
import PushSettings from '@/components/push/PushSettings';
import { cleanupPushBeforeSignOut } from '@/lib/push/client';
import { createClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isChecking, setIsChecking] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.replace('/login');
      else setIsChecking(false);
    };
    void checkUser();
  }, [router, supabase]);

  const closeModal = () => {
    if (isDeleting) return;
    setIsModalOpen(false);
    setConfirmation('');
    setPassword('');
    setError(null);
  };

  const handleDeleteAccount = async () => {
    if (confirmation !== '회원탈퇴' || !password || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setError('로그인 정보를 확인할 수 없습니다.');
      setIsDeleting(false);
      return;
    }

    const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (passwordError) {
      setError('현재 비밀번호가 올바르지 않습니다.');
      setIsDeleting(false);
      return;
    }

    const response = await fetch('/api/account/delete', { method: 'DELETE' });
    const body = await response.json() as { success?: boolean; message?: string };
    if (!response.ok || !body.success) {
      setError(body.message ?? '회원탈퇴 처리 중 오류가 발생했습니다.');
      setIsDeleting(false);
      return;
    }

    await cleanupPushBeforeSignOut();
    await supabase.auth.signOut();
    window.alert('회원탈퇴가 완료되었습니다.');
    router.replace('/');
    router.refresh();
  };

  if (isChecking) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div><h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900"><Settings className="text-green-600" /> 계정 설정</h1><p className="mt-2 text-gray-500">비밀번호와 계정 정보를 관리합니다.</p></div>
        <PushSettings />
        <section id="delete-account" className="rounded-2xl border border-red-200 bg-white p-7 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold text-red-700"><AlertTriangle /> 회원탈퇴</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">프로필, 관심회원, 이상형 정보와 사진을 모두 삭제합니다.</p>
          <button type="button" onClick={() => setIsModalOpen(true)} className="mt-5 rounded-xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700">회원탈퇴</button>
        </section>
      </div>

      {isModalOpen ? (
        <div role="dialog" aria-modal="true" aria-label="회원탈퇴 확인" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={closeModal}>
          <div className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="회원탈퇴 창 닫기" onClick={closeModal} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"><X /></button>
            <AlertTriangle className="mb-4 h-10 w-10 text-red-600" />
            <h2 className="text-xl font-bold text-gray-900">정말 탈퇴하시겠습니까?</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">회원탈퇴 시 프로필, 관심회원, 이상형 정보와 사진이 삭제되며 복구할 수 없습니다.</p>
            <label htmlFor="deleteConfirmation" className="mt-5 block text-sm font-medium text-gray-700">확인을 위해 “회원탈퇴”를 입력해주세요.</label>
            <input id="deleteConfirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3" />
            <label htmlFor="currentPassword" className="mt-4 block text-sm font-medium text-gray-700">현재 비밀번호</label>
            <input id="currentPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3" />
            {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}
            <div className="mt-6 flex gap-3"><button type="button" onClick={closeModal} disabled={isDeleting} className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold">취소</button><button type="button" onClick={handleDeleteAccount} disabled={confirmation !== '회원탈퇴' || !password || isDeleting} className="flex flex-1 items-center justify-center rounded-xl bg-red-600 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isDeleting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}탈퇴하기</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
