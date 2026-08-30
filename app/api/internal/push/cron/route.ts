import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runPushDrain, type PushDrainResult } from '@/lib/push/drain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: PushDrainResult['body'], status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32) {
    console.error('Push cron configuration is missing.', { code: 'cron_secret_missing' });
    return json({ message: 'Push worker is unavailable.' }, 503);
  }
  if (!isAuthorized(request, cronSecret)) {
    return json({ message: 'Unauthorized.' }, 401);
  }

  const result = await runPushDrain();
  return json(result.body, result.status);
}
