import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type VerificationErrorStatus = 'session_error' | 'expired' | 'invalid' | 'error';
type AuthFlow = 'signup/profile' | 'password reset';

const DEFAULT_NEXT_PATH = '/consent';
const SAFE_MESSAGE_MAX_LENGTH = 160;

const expiredErrorCodes = new Set([
  'otp_expired',
  'flow_state_expired',
  'token_expired',
]);

const sessionErrorCodes = new Set([
  'bad_code_verifier',
  'flow_state_not_found',
  'exchange_code_for_session_failed',
]);

const invalidErrorCodes = new Set([
  'invalid_token',
  'access_denied',
  'validation_failed',
]);

const getSafeNextPath = (value: string | null) => {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_NEXT_PATH;
  }
  return value;
};

const getFailurePath = (next: string, status: VerificationErrorStatus) => next === '/reset-password'
  ? `/reset-password?status=${status}`
  : `/verify-email?status=${status}`;

const getAuthFlow = (next: string): AuthFlow => next === '/reset-password'
  ? 'password reset'
  : 'signup/profile';

const sanitizeIdentifier = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : null;
};

const sanitizeErrorMessage = (value?: string | null) => {
  if (!value) return null;

  return value
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(access_token|refresh_token|code_verifier|token|code)=\S+/gi, '$1=[redacted]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted-value]')
    .slice(0, SAFE_MESSAGE_MAX_LENGTH);
};

const logCallbackError = ({
  stage,
  flow,
  code,
  name,
  status,
  message,
  hasCode,
  hasError,
}: {
  stage: 'callback_parameters' | 'server_configuration' | 'exchange_code_for_session';
  flow: AuthFlow;
  code?: string | null;
  name?: string | null;
  status?: number | null;
  message?: string | null;
  hasCode: boolean;
  hasError: boolean;
}) => {
  console.error([
    'Supabase auth callback failure',
    `stage=${stage}`,
    `flow=${flow}`,
    `error_code=${sanitizeIdentifier(code) ?? 'unknown'}`,
    `error_name=${sanitizeIdentifier(name) ?? 'unknown'}`,
    `error_status=${typeof status === 'number' ? status : 'unknown'}`,
    `has_code=${hasCode}`,
    `has_error=${hasError}`,
    `error_message=${sanitizeErrorMessage(message) ?? 'none'}`,
  ].join(' '));
};

const classifyVerificationError = (
  code?: string | null,
  message?: string | null,
  fallbackStatus: VerificationErrorStatus = 'error',
): VerificationErrorStatus => {
  const normalizedCode = code?.toLowerCase() ?? '';
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (expiredErrorCodes.has(normalizedCode)) return 'expired';
  if (sessionErrorCodes.has(normalizedCode)) return 'session_error';
  if (invalidErrorCodes.has(normalizedCode)) return 'invalid';

  if (
    normalizedMessage.includes('expired')
    || normalizedMessage.includes('already used')
    || normalizedMessage.includes('already been used')
  ) {
    return 'expired';
  }

  if (
    normalizedMessage.includes('code verifier')
    || normalizedMessage.includes('flow state')
    || normalizedMessage.includes('pkce')
    || normalizedMessage.includes('exchange code')
  ) {
    return 'session_error';
  }

  if (normalizedMessage.includes('invalid token')) return 'invalid';

  return fallbackStatus;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const next = getSafeNextPath(searchParams.get('next'));
  const callbackError = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');
  const flow = getAuthFlow(next);
  const hasCallbackError = Boolean(callbackError || errorCode || errorDescription);

  if (hasCallbackError) {
    const status = classifyVerificationError(errorCode ?? callbackError, errorDescription);
    logCallbackError({
      stage: 'callback_parameters',
      code: errorCode ?? callbackError ?? 'unknown',
      name: callbackError,
      message: errorDescription,
      flow,
      hasCode: Boolean(code),
      hasError: true,
    });
    return NextResponse.redirect(new URL(getFailurePath(next, status), request.nextUrl.origin));
  }

  if (!code) {
    logCallbackError({
      stage: 'callback_parameters',
      code: 'missing_code',
      name: 'invalid_callback',
      flow,
      hasCode: false,
      hasError: false,
    });
    return NextResponse.redirect(new URL(getFailurePath(next, 'invalid'), request.nextUrl.origin));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    logCallbackError({
      stage: 'server_configuration',
      code: 'missing_environment',
      name: 'configuration_error',
      flow,
      hasCode: true,
      hasError: false,
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

  const status = classifyVerificationError(error.code, error.message, 'session_error');
  logCallbackError({
    stage: 'exchange_code_for_session',
    code: error.code,
    name: error.name,
    status: error.status,
    message: error.message,
    flow,
    hasCode: true,
    hasError: true,
  });
  return NextResponse.redirect(new URL(getFailurePath(next, status), request.nextUrl.origin));
}
