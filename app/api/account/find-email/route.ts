import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GENERIC_MESSAGE = '입력한 정보와 일치하는 계정을 확인할 수 없습니다.';
const MULTIPLE_MESSAGE = '동일한 정보의 계정이 여러 개 확인되었습니다. 고객지원에 문의해주세요.';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const requestsByIp = new Map<string, { count: number; resetAt: number }>();

const maskEmail = (email: string) => {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***';
  const visibleLength = Math.min(3, Math.max(1, localPart.length - 1));
  return `${localPart.slice(0, visibleLength)}${'*'.repeat(Math.max(3, localPart.length - visibleLength))}@${domain}`;
};

const isRateLimited = (ip: string) => {
  const now = Date.now();
  const current = requestsByIp.get(ip);
  if (!current || current.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json({ message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { nickname?: unknown; birthDate?: unknown } | null;
  const normalizedNickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  const normalizedBirthDate = typeof body?.birthDate === 'string' ? body.birthDate.trim() : '';
  if (normalizedNickname.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
    return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    // 닉네임과 생년월일은 완전한 본인 인증 수단이 아니므로 이메일은 마스킹하고 단일 일치만 반환한다.
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, nickname, birth_date')
      .eq('birth_date', normalizedBirthDate)
      .limit(10);

    if (profileError) {
      console.error('가입 이메일 찾기 profiles 조회 실패:', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      });
      return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 500 });
    }

    const matchedProfiles = (profiles ?? []).filter((profile) =>
      profile.nickname?.trim().toLowerCase() === normalizedNickname.toLowerCase());

    if (process.env.NODE_ENV === 'development') {
      console.info('가입 이메일 찾기 디버깅:', {
        normalizedNickname,
        normalizedBirthDate,
        profileCount: profiles?.length ?? 0,
        nicknameMatchCount: matchedProfiles.length,
        userIdentifierColumn: 'id',
      });
    }

    if (matchedProfiles.length === 0) {
      return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 200 });
    }
    if (matchedProfiles.length > 1) {
      return NextResponse.json({ found: false, message: MULTIPLE_MESSAGE }, { status: 200 });
    }

    const userId = matchedProfiles[0].id;
    const { data: { user }, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError) {
      console.error('가입 이메일 찾기 Auth 사용자 조회 실패:', {
        userId,
        message: userError.message,
        code: userError.code ?? null,
        status: userError.status ?? null,
      });
      return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 500 });
    }
    if (!user?.email) {
      return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 200 });
    }

    return NextResponse.json({ found: true, maskedEmail: maskEmail(user.email) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 서버 오류';
    console.error('가입 이메일 찾기 서버 설정 또는 처리 실패:', { message });
    return NextResponse.json({ found: false, message: GENERIC_MESSAGE }, { status: 500 });
  }
}
