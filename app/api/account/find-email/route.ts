import { NextResponse } from 'next/server';

const UNAVAILABLE_MESSAGE = '현재 가입 이메일 찾기 기능을 이용할 수 없습니다.';

export async function POST() {
  return NextResponse.json(
    { message: UNAVAILABLE_MESSAGE },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
