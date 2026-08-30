import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runPushDrain } from '@/lib/push/drain';

export const runtime = 'nodejs';

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const workerSecret = process.env.PUSH_WORKER_SECRET;
  if (!workerSecret || workerSecret.length < 32) {
    console.error('Push worker configuration is missing.', { code: 'worker_secret_missing' });
    return NextResponse.json({ message: 'Push worker is unavailable.' }, { status: 503 });
  }
  if (!isAuthorized(request, workerSecret)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  const result = await runPushDrain();
  return NextResponse.json(result.body, { status: result.status });
}
