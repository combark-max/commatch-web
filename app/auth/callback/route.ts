import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const getSafeNextPath = (value: string | null) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/reset-password';
  return value;
};

const getFailurePath = (next: string) => next === '/reset-password'
  ? '/reset-password?status=invalid'
  : '/verify-email?status=error';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const next = getSafeNextPath(searchParams.get('next'));
  const callbackError = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');
  const failureUrl = new URL(getFailurePath(next), request.nextUrl.origin);

  if (callbackError || errorCode || errorDescription || !code) {
    console.error('Supabase 인증 콜백 실패:', {
      error: callbackError,
      error_code: errorCode,
      error_description: errorDescription ?? (!code ? 'URL에 code 파라미터가 없습니다.' : null),
    });
    return NextResponse.redirect(failureUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase 인증 콜백 실패: 환경변수가 설정되지 않았습니다.');
    return NextResponse.redirect(failureUrl);
  }

  // exchangeCodeForSession이 기록하는 세션 쿠키를 실제 redirect 응답에 직접 보존한다.
  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return response;

  console.error('Supabase 인증 코드 교환 실패:', {
    message: error.message,
    code: error.code ?? null,
    status: error.status ?? null,
  });
  return NextResponse.redirect(failureUrl);
}
