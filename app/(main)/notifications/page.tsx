'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Check,
  Loader2,
  MessageCircle,
  RefreshCw,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

type NotificationRow = {
  id?: unknown;
  type?: unknown;
  match_id?: unknown;
  read_at?: unknown;
  created_at?: unknown;
};

type MatchRow = {
  match_id?: unknown;
  other_nickname?: unknown;
};

type MatchNotification = {
  id: string;
  matchId: string;
  nickname: string | null;
  readAt: string | null;
  createdAt: string;
};

type PageState = 'loading' | 'ready' | 'error';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const notificationDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeNotifications(notificationValue: unknown, matchValue: unknown): MatchNotification[] {
  if (!Array.isArray(notificationValue) || !Array.isArray(matchValue)) {
    throw new Error('Unexpected notification response');
  }

  const nicknameByMatchId = new Map<string, string | null>();
  for (const rawMatch of matchValue) {
    if (!rawMatch || typeof rawMatch !== 'object') continue;
    const match = rawMatch as MatchRow;
    const matchId = normalizeText(match.match_id);
    if (matchId && UUID_PATTERN.test(matchId)) {
      nicknameByMatchId.set(matchId, normalizeText(match.other_nickname));
    }
  }

  return notificationValue.flatMap((rawNotification) => {
    if (!rawNotification || typeof rawNotification !== 'object') return [];
    const notification = rawNotification as NotificationRow;
    const id = normalizeText(notification.id);
    const type = normalizeText(notification.type);
    const matchId = normalizeText(notification.match_id);
    const readAt = normalizeText(notification.read_at);
    const createdAt = normalizeText(notification.created_at);

    if (
      !id
      || !UUID_PATTERN.test(id)
      || type !== 'new_match'
      || !matchId
      || !UUID_PATTERN.test(matchId)
      || !createdAt
      || Number.isNaN(new Date(createdAt).getTime())
      || (readAt !== null && Number.isNaN(new Date(readAt).getTime()))
    ) {
      return [];
    }

    return [{
      id,
      matchId,
      nickname: nicknameByMatchId.get(matchId) ?? null,
      readAt,
      createdAt,
    }];
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [notifications, setNotifications] = useState<MatchNotification[]>([]);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      setPageState('loading');

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          router.replace('/login');
          return;
        }

        const [notificationResult, matchResult] = await Promise.all([
          supabase
            .from('notifications')
            .select('id, type, match_id, read_at, created_at')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
          supabase.rpc('get_my_matches'),
        ]);

        if (notificationResult.error) throw notificationResult.error;
        if (matchResult.error) throw matchResult.error;

        const normalized = normalizeNotifications(notificationResult.data, matchResult.data);
        if (isMounted) {
          setNotifications(normalized);
          setPageState('ready');
        }
      } catch (error) {
        console.error('알림 목록을 불러오지 못했습니다.', error);
        if (isMounted) setPageState('error');
      }
    };

    void loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [retryKey, router, supabase]);

  const openChat = async (notification: MatchNotification) => {
    if (markingNotificationId) return;

    if (notification.readAt === null) {
      setMarkingNotificationId(notification.id);
      const { data, error } = await supabase.rpc('mark_my_notification_read', {
        notification_id: notification.id,
      });

      if (error || data !== true) {
        console.error('알림 읽음 처리에 실패했습니다.', error?.message ?? 'Notification was not owned by the current user.');
      } else {
        const readAt = new Date().toISOString();
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? { ...item, readAt } : item
        )));
        window.dispatchEvent(new Event('commatch:notifications-changed'));
      }
      setMarkingNotificationId(null);
    }

    // Chat performs its own get_my_matches participant check. A read failure
    // never gets presented as success, but it should not trap a valid participant.
    router.push(`/matches/${notification.matchId}/chat`);
  };

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <p className="font-medium text-gray-500">알림을 불러오는 중...</p>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">알림을 불러오지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">잠시 후 다시 시도해 주세요.</p>
          <Button className="mt-7 min-h-12 rounded-2xl px-6 text-sm" onClick={() => setRetryKey((key) => key + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-gray-600 transition hover:bg-white hover:text-gray-900"
        >
          <ArrowLeft size={19} /> 마이페이지로 돌아가기
        </Link>

        <header className="mt-6 rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <Bell size={25} />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">알림</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">새로운 매칭 소식을 확인하고 바로 대화를 시작해 보세요.</p>
            </div>
          </div>
        </header>

        {notifications.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-gray-100 bg-white p-10 text-center shadow-sm sm:p-14">
            <Bell className="mx-auto h-12 w-12 text-gray-300" />
            <h2 className="mt-5 text-xl font-bold text-gray-800">아직 새로운 알림이 없습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">새로운 매칭이 생기면 이곳에서 알려드릴게요.</p>
          </section>
        ) : (
          <section className="mt-8 space-y-4" aria-label="알림 목록">
            {notifications.map((notification) => {
              const isUnread = notification.readAt === null;
              const isMarking = markingNotificationId === notification.id;
              const nickname = notification.nickname ? `${notification.nickname}님과` : '상대 회원과';

              return (
                <article
                  key={notification.id}
                  className={`rounded-[2rem] border p-6 shadow-sm transition sm:p-7 ${
                    isUnread ? 'border-green-200 bg-green-50/70' : 'border-gray-100 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      isUnread ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {isUnread ? <Bell size={19} /> : <Check size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-extrabold text-gray-900">새로운 매칭이 생겼습니다.</h2>
                        {isUnread ? (
                          <span className="rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-black text-white">새 알림</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-600">{nickname} 서로 좋아요가 성립했습니다.</p>
                      <time dateTime={notification.createdAt} className="mt-2 block text-xs font-medium text-gray-400">
                        {notificationDateFormatter.format(new Date(notification.createdAt))}
                      </time>
                      <Button
                        className="mt-5 min-h-11 rounded-2xl px-5 text-sm"
                        onClick={() => void openChat(notification)}
                        disabled={markingNotificationId !== null}
                      >
                        {isMarking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                        {isMarking ? '알림 확인 중...' : '채팅하기'}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
