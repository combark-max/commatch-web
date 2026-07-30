'use client';

import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

export default function AdminLogoutButton() {
  const supabase = createClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMessage('로그아웃할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      setIsLoggingOut(false);
      return;
    }

    window.location.assign('/admin/login');
  };

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="min-w-36 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? (
          <><Loader2 className="mr-2 animate-spin" size={18} />로그아웃 중...</>
        ) : (
          <><LogOut className="mr-2" size={18} />로그아웃</>
        )}
      </Button>
      {errorMessage ? <p role="alert" className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
