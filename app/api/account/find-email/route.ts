import { createHmac } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeKoreanPhoneToE164 } from '@/lib/auth/phone';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const NOT_FOUND_MESSAGE = '입력한 정보와 일치하는 계정을 확인할 수 없습니다.';
const MULTIPLE_MESSAGE = '동일한 정보의 계정이 여러 개 확인되었습니다. 고객지원에 문의해주세요.';
const INVALID_MESSAGE = '입력한 정보를 다시 확인해주세요.';
const RATE_LIMIT_MESSAGE = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
const SERVER_ERROR_MESSAGE = '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

const maskEmail = (email: string): string | null => {
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
  const [localPart, domain] = email.split('@');
  const visibleLength = Math.min(3, Math.max(1, localPart.length - 1));
  return `${localPart.slice(0, visibleLength)}${'*'.repeat(Math.max(3, localPart.length - visibleLength))}@${domain}`;
};

const getClientIdentifierHash = (request: NextRequest): string => {
  const vercelIp = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  const fallbackIp = process.env.VERCEL === '1'
    ? null
    : request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')?.trim();
  const clientIdentifier = vercelIp || fallbackIp || 'unknown';
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  return createHmac('sha256', secret).update(clientIdentifier).digest('hex');
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    nickname?: unknown;
    birthDate?: unknown;
    phone?: unknown;
  } | null;
  const normalizedNickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  const normalizedBirthDate = typeof body?.birthDate === 'string' ? body.birthDate.trim() : '';
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeKoreanPhoneToE164(typeof body?.phone === 'string' ? body.phone : '');
  } catch {
    return NextResponse.json({ message: INVALID_MESSAGE }, { status: 400 });
  }
  if (normalizedNickname.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
    return NextResponse.json({ message: INVALID_MESSAGE }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const identifierHash = getClientIdentifierHash(request);
    const { data, error } = await admin.rpc('consume_account_find_email_rate_limit', {
      p_identifier_hash: identifierHash,
    });
    const rateLimit = Array.isArray(data) ? data[0] : null;
    if (error || typeof rateLimit?.allowed !== 'boolean') {
      console.error('가입 이메일 찾기 rate limit 처리 실패:', {
        code: error?.code ?? null,
        message: error?.message ?? 'invalid rate limit response',
      });
      return NextResponse.json({ message: SERVER_ERROR_MESSAGE }, { status: 500 });
    }
    if (!rateLimit.allowed) {
      const retryAfter = typeof rateLimit.retry_after_seconds === 'number'
        ? Math.max(1, Math.ceil(rateLimit.retry_after_seconds))
        : 600;
      return NextResponse.json(
        { message: RATE_LIMIT_MESSAGE },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const { data: accounts, error: accountError } = await admin
      .from('accounts')
      .select('user_id')
      .eq('phone_e164', normalizedPhone)
      .not('phone_verified_at', 'is', null)
      .limit(2);
    if (accountError) {
      console.error('가입 이메일 찾기 accounts 조회 실패:', {
        code: accountError.code,
        message: accountError.message,
        details: accountError.details,
        hint: accountError.hint,
      });
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 500 });
    }
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 200 });
    }
    if (accounts.length > 1) {
      return NextResponse.json({ found: false, message: MULTIPLE_MESSAGE }, { status: 200 });
    }

    const userId = accounts[0].user_id;
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, nickname, birth_date')
      .eq('id', userId)
      .eq('birth_date', normalizedBirthDate)
      .limit(2);
    if (profileError) {
      console.error('가입 이메일 찾기 profiles 조회 실패:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      });
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 500 });
    }

    const matchedProfiles = (profiles ?? []).filter((profile) =>
      profile.nickname?.trim().toLowerCase() === normalizedNickname.toLowerCase());
    if (matchedProfiles.length === 0) {
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 200 });
    }
    if (matchedProfiles.length > 1) {
      return NextResponse.json({ found: false, message: MULTIPLE_MESSAGE }, { status: 200 });
    }

    const { data: { user }, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError) {
      console.error('가입 이메일 찾기 Auth 사용자 조회 실패:', {
        userId,
        message: userError.message,
        code: userError.code ?? null,
        status: userError.status ?? null,
      });
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 500 });
    }

    const maskedEmail = user?.email ? maskEmail(user.email) : null;
    if (!maskedEmail) {
      return NextResponse.json({ found: false, message: NOT_FOUND_MESSAGE }, { status: 200 });
    }

    return NextResponse.json({ found: true, maskedEmail }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 서버 오류';
    console.error('가입 이메일 찾기 서버 설정 또는 처리 실패:', { message });
    return NextResponse.json({ message: SERVER_ERROR_MESSAGE }, { status: 500 });
  }
}
