import { NextResponse } from 'next/server';
import * as z from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const nicknameRequestSchema = z.object({
  nickname: z.string().trim().min(2, { message: '닉네임은 최소 2자 이상이어야 합니다.' }),
});

const normalizeNickname = (nickname: string) => nickname.trim().toLowerCase();

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { available: false, message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = nicknameRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { available: false, message: '닉네임은 최소 2자 이상이어야 합니다.' },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('nickname')
      .neq('id', user.id);

    if (error) {
      console.error('닉네임 중복 확인 조회 실패:', {
        code: error.code ?? null,
        message: error.message ?? null,
      });
      return NextResponse.json(
        { available: false, message: '닉네임 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 },
      );
    }

    const normalizedNickname = normalizeNickname(parsed.data.nickname);
    const isDuplicate = (profiles ?? []).some((profile) => (
      typeof profile.nickname === 'string'
      && normalizeNickname(profile.nickname) === normalizedNickname
    ));

    return NextResponse.json({
      available: !isDuplicate,
      message: isDuplicate
        ? '이미 사용 중인 닉네임입니다.'
        : '사용 가능한 닉네임입니다.',
    });
  } catch (error) {
    console.error('닉네임 중복 확인 처리 실패:', {
      message: error instanceof Error ? error.message : '알 수 없는 서버 오류',
    });
    return NextResponse.json(
      { available: false, message: '닉네임 중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
