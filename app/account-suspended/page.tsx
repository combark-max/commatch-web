import { redirect } from 'next/navigation';
import { CalendarClock, CircleAlert, Headphones, ShieldAlert } from 'lucide-react';
import AccountSuspendedActions from '@/components/account/AccountSuspendedActions';
import { getCurrentMemberAccess } from '@/lib/member/access';

function formatSeoulDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Seoul',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((entry) => entry.type === type)?.value ?? ''
  );

  return `${part('year')}년 ${part('month')} ${part('day')}일 ${part('hour')}:${part('minute')}`;
}

export default async function AccountSuspendedPage() {
  const lookup = await getCurrentMemberAccess();

  if (lookup.kind === 'anonymous') redirect('/login');
  if (lookup.kind === 'valid' && lookup.access.isAllowed) redirect('/dashboard');

  const access = lookup.kind === 'valid' ? lookup.access : null;
  const isIndefinite = access?.suspendedUntil === null;

  return (
    <div className="bg-gray-50 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-gray-100 bg-white p-7 shadow-xl shadow-gray-200/60 sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <ShieldAlert size={30} aria-hidden="true" />
          </div>

          <p className="mt-7 text-sm font-bold text-green-700">계정 이용 안내</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">
            서비스 이용이 제한되었습니다.
          </h1>

          {access ? (
            <>
              <div className="mt-7 rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
                <div className="flex items-start gap-3">
                  <CalendarClock className="mt-0.5 shrink-0 text-amber-700" size={21} aria-hidden="true" />
                  <div>
                    <h2 className="font-bold text-gray-900">
                      {isIndefinite
                        ? '현재 계정은 무기한 이용 정지 상태입니다.'
                        : `이용 제한 종료 예정: ${formatSeoulDateTime(access.suspendedUntil!)}`}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {isIndefinite
                        ? '이용 재개 여부는 고객지원을 통해 확인해 주세요.'
                        : '제한 기간이 만료되면 별도 상태 변경 없이 서비스를 다시 이용할 수 있습니다.'}
                    </p>
                  </div>
                </div>
              </div>

              <section className="mt-6" aria-labelledby="suspension-reason-heading">
                <h2 id="suspension-reason-heading" className="text-sm font-bold text-gray-900">이용 제한 사유</h2>
                <p className="mt-2 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">
                  {access.reason ?? '이용 제한 사유는 고객지원 문의를 통해 확인해 주세요.'}
                </p>
              </section>
            </>
          ) : (
            <div role="alert" className="mt-7 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
              <CircleAlert className="mt-0.5 shrink-0 text-amber-700" size={21} aria-hidden="true" />
              <div>
                <h2 className="font-bold text-gray-900">회원 이용 상태를 확인하지 못했습니다.</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">잠시 후 다시 로그인해 주세요.</p>
              </div>
            </div>
          )}

          <AccountSuspendedActions />

          <div className="mt-7 flex items-center gap-3 border-t border-gray-100 pt-6 text-sm text-gray-500">
            <Headphones size={19} className="shrink-0" aria-hidden="true" />
            <span>고객 문의 — 준비 중</span>
          </div>
        </section>
      </div>
    </div>
  );
}
