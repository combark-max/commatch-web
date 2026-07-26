import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type VerificationErrorStatus = 'session_error' | 'expired' | 'invalid' | 'error';

const DEFAULT_NEXT_PATH = '/profile/create';

const getSafeNextPath = (value: string | null) => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_NEXT_PATH;
  }
  return value;
};

const getFailurePath = (next: string, status: VerificationErrorStatus) => next === '/reset-password'
  ? '/reset-password?status=invalid'
  : `/verify-email?status=${status}`;

const classifyVerificationError = (code?: string | null, message?: string | null): VerificationErrorStatus => {
  const normalizedCode = code?.toLowerCase() ?? '';
  const normalizedMessage = message?.toLowerCase() ?? '';
  const combined = `${normalizedCode} ${normalizedMessage}`;

  if (
    normalizedCode === 'otp_expired'
    || normalizedCode === 'token_expired'
    || combined.includes('expired')
    || combined.includes('already used')
    || combined.includes('already been used')
  ) {
    return 'expired';
  }

  if (
    normalizedCode === 'flow_state_not_found'
    || normalizedCode === 'bad_code_verifier'
    || normalizedCode === 'exchange_code_for_session_failed'
    || combined.includes('code verifier')
    || combined.includes('flow state')
    || combined.includes('pkce')
  ) {
    return 'session_error';
  }

  if (
    normalizedCode === 'invalid_token'
    || normalizedCode === 'access_denied'
    || normalizedCode === 'validation_failed'
    || combined.includes('invalid token')
  ) {
    return 'invalid';
  }

  return 'error';
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const next = getSafeNextPath(searchParams.get('next'));
  const callbackError = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');

  if (callbackError || errorCode || errorDescription) {
    const status = classifyVerificationError(errorCode ?? callbackError, errorDescription);
    console.error('Supabase 인증 콜백 실패:', {
      stage: 'callback_parameters',
      code: errorCode ?? callbackError ?? 'unknown',
    });
    return NextResponse.redirect(new URL(getFailurePath(next, status), request.nextUrl.origin));
  }

  if (!code) {
    console.error('Supabase 인증 콜백 실패:', {
      stage: 'callback_parameters',
      code: 'missing_code',
    });
    return NextResponse.redirect(new URL(getFailurePath(next, 'invalid'), request.nextUrl.origin));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase 인증 콜백 실패:', {
      stage: 'server_configuration',
      code: 'missing_environment',
    });
    return NextResponse.redirect(new URL(getFailurePath(next, 'error'), request.nextUrl.origin));
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

  const status = classifyVerificationError(error.code, error.message);
  console.error('Supabase 인증 코드 교환 실패:', {
    stage: 'exchange_code_for_session',
    code: error.code ?? null,
  });
  return NextResponse.redirect(new URL(getFailurePath(next, status), request.nextUrl.origin));
}
