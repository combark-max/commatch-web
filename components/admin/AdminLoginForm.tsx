'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, Lock, LogIn, Mail, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

type AdminRole = 'super_admin' | 'admin' | 'moderator';
type AdminStatus = 'active' | 'suspended' | 'revoked';
type AdminPermission =
  | 'admin_dashboard_view'
  | 'reports_view'
  | 'reports_manage'
  | 'admin_accounts_manage'
  | 'member_restrictions_view'
  | 'member_restrictions_manage'
  | 'premium_memberships_view'
  | 'premium_memberships_manage';

type AdminAccessSnapshot = {
  isAdmin: boolean;
  role: AdminRole | null;
  status: AdminStatus | null;
  permissions: AdminPermission[];
};

export type InitialAdminLoginState =
  | { kind: 'error' }
  | { kind: 'denied'; access: AdminAccessSnapshot }
  | null;

type AdminLoginFormProps = {
  initialState: InitialAdminLoginState;
};

const ADMIN_ROLES = new Set<AdminRole>(['super_admin', 'admin', 'moderator']);
const ADMIN_STATUSES = new Set<AdminStatus>(['active', 'suspended', 'revoked']);
const ADMIN_PERMISSIONS = new Set<AdminPermission>([
  'admin_dashboard_view',
  'reports_view',
  'reports_manage',
  'admin_accounts_manage',
  'member_restrictions_view',
  'member_restrictions_manage',
  'premium_memberships_view',
  'premium_memberships_manage',
]);

const GENERIC_ACCESS_ERROR = '관리자 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const parsePermissions = (value: unknown): AdminPermission[] | null => {
  if (value === null) return [];
  if (!Array.isArray(value)) return null;

  const permissions: AdminPermission[] = [];
  for (const permission of value) {
    if (typeof permission !== 'string' || !ADMIN_PERMISSIONS.has(permission as AdminPermission)) {
      return null;
    }
    permissions.push(permission as AdminPermission);
  }

  return new Set(permissions).size === permissions.length ? permissions : null;
};

const parseAdminAccess = (value: unknown): AdminAccessSnapshot | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;

  const row = value[0];
  const role = row.role === null
    ? null
    : typeof row.role === 'string' && ADMIN_ROLES.has(row.role as AdminRole)
      ? row.role as AdminRole
      : undefined;
  const status = row.status === null
    ? null
    : typeof row.status === 'string' && ADMIN_STATUSES.has(row.status as AdminStatus)
      ? row.status as AdminStatus
      : undefined;
  const permissions = parsePermissions(row.permissions);

  if (typeof row.is_admin !== 'boolean' || role === undefined || status === undefined || permissions === null) {
    return null;
  }

  return {
    isAdmin: row.is_admin,
    role,
    status,
    permissions,
  };
};

const hasDashboardAccess = (access: AdminAccessSnapshot) => (
  access.isAdmin === true
  && access.status === 'active'
  && access.permissions.includes('admin_dashboard_view')
);

const getDeniedMessage = (access: AdminAccessSnapshot) => {
  if (access.status === 'suspended') return '현재 사용이 정지된 관리자 계정입니다.';
  if (access.status === 'revoked') return '관리자 권한이 회수된 계정입니다.';
  if (access.role === null && access.status === null && access.isAdmin === false) {
    return '관리자 권한이 없는 계정입니다.';
  }
  if (access.isAdmin === true && access.status === 'active') {
    return '관리자 페이지 접근 권한이 없습니다.';
  }
  return GENERIC_ACCESS_ERROR;
};

const getInitialMessage = (initialState: InitialAdminLoginState) => {
  if (!initialState || initialState.kind === 'error') return initialState ? GENERIC_ACCESS_ERROR : null;
  return getDeniedMessage(initialState.access);
};

export default function AdminLoginForm({ initialState }: AdminLoginFormProps) {
  const supabase = createClient();
  const operationIdRef = useRef(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isClearingSession, setIsClearingSession] = useState(Boolean(initialState));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => getInitialMessage(initialState));

  useEffect(() => {
    if (!initialState) return;

    let isMounted = true;
    const clearDeniedSession = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        if (isMounted) setIsClearingSession(false);
      }
    };

    void clearDeniedSession();
    return () => {
      isMounted = false;
    };
  }, [initialState, supabase]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isClearingSession) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMessage('이메일을 입력해 주세요.');
      return;
    }
    if (!password) {
      setErrorMessage('비밀번호를 입력해 주세요.');
      return;
    }

    const operationId = operationIdRef.current + 1;
    operationIdRef.current = operationId;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (operationIdRef.current !== operationId) return;
      if (signInError) {
        setErrorMessage('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const { data, error } = await supabase.rpc('get_my_admin_access');
      if (operationIdRef.current !== operationId) return;

      const access = error ? null : parseAdminAccess(data);
      if (!access) {
        await supabase.auth.signOut();
        if (operationIdRef.current === operationId) setErrorMessage(GENERIC_ACCESS_ERROR);
        return;
      }

      if (!hasDashboardAccess(access)) {
        await supabase.auth.signOut();
        if (operationIdRef.current === operationId) setErrorMessage(getDeniedMessage(access));
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 100));
      window.location.assign('/admin');
    } catch {
      await supabase.auth.signOut();
      if (operationIdRef.current === operationId) setErrorMessage(GENERIC_ACCESS_ERROR);
    } finally {
      if (operationIdRef.current === operationId) setIsSubmitting(false);
    }
  };

  const isBusy = isClearingSession || isSubmitting;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-gray-50 px-6 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-green-700">
          <ArrowLeft size={18} aria-hidden="true" />
          홈으로 돌아가기
        </Link>

        <section className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl shadow-gray-200/60 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <ShieldCheck size={30} aria-hidden="true" />
          </div>
          <h1 className="mt-6 text-3xl font-black text-gray-900">관리자 로그인</h1>

          <form method="post" className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="admin-email" className="mb-2 block text-sm font-semibold text-gray-800">이메일</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  disabled={isBusy}
                  className="h-14 w-full rounded-xl border border-gray-300 bg-white pl-12 pr-4 text-base outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-gray-50"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-2 block text-sm font-semibold text-gray-800">비밀번호</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} aria-hidden="true" />
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={isBusy}
                  className="h-14 w-full rounded-xl border border-gray-300 bg-white pl-12 pr-4 text-base outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-gray-50"
                  placeholder="비밀번호를 입력해 주세요."
                />
              </div>
            </div>

            {errorMessage ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" className="h-14 w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={isBusy}>
              {isBusy ? (
                <><Loader2 className="mr-2 animate-spin" size={20} />{isSubmitting ? '로그인 중...' : '세션 정리 중...'}</>
              ) : (
                <><LogIn className="mr-2" size={20} />로그인</>
              )}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
