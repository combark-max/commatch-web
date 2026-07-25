'use client';

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  CalendarDays,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  UserRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { resolveProfileImageUrl } from '@/lib/profile-image';
import Button from '@/components/ui/Button';

type MatchRpcRow = {
  match_id: string | null;
  match_status: string | null;
  matched_at: string | null;
  other_user_id: string | null;
  other_nickname: string | null;
  other_profile_image: string | null;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
};

type ChatMatch = {
  id: string;
  status: string;
  matchedAt: string | null;
  otherUserId: string;
  nickname: string;
  profileImageUrl: string | null;
};

type PageState = 'loading' | 'ready' | 'error' | 'denied';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 1000;

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

function formatDate(value: string | null): string {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : '날짜 정보 없음';
}

function dateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const matchId = params.matchId;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [match, setMatch] = useState<ChatMatch | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [deniedMessage, setDeniedMessage] = useState('');
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isEndConfirmOpen, setIsEndConfirmOpen] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [endError, setEndError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadChat = async () => {
      setPageState('loading');
      setLoadError('');
      setDeniedMessage('');
      setEndError('');
      setIsEndConfirmOpen(false);

      if (!matchId || !UUID_PATTERN.test(matchId)) {
        if (isMounted) {
          setDeniedMessage('올바르지 않은 매칭 주소입니다.');
          setPageState('denied');
        }
        return;
      }

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

        const { data: matchRows, error: matchError } = await supabase.rpc('get_my_matches');
        if (matchError) throw matchError;

        const selectedMatch = Array.isArray(matchRows)
          ? (matchRows as MatchRpcRow[]).find((row) => row.match_id === matchId)
          : undefined;

        if (!selectedMatch || !selectedMatch.other_user_id) {
          if (isMounted) {
            setDeniedMessage('존재하지 않거나 접근할 수 없는 매칭입니다.');
            setPageState('denied');
          }
          return;
        }

        if (selectedMatch.match_status !== 'active' && selectedMatch.match_status !== 'ended') {
          if (isMounted) {
            setDeniedMessage('현재 채팅을 이용할 수 없는 매칭입니다.');
            setPageState('denied');
          }
          return;
        }

        const { data: messageRows, error: messageError } = await supabase
          .from('messages')
          .select('id, match_id, sender_id, content, read_at, created_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });

        if (messageError) throw messageError;

        const resolvedMatch: ChatMatch = {
          id: matchId,
          status: selectedMatch.match_status,
          matchedAt: selectedMatch.matched_at,
          otherUserId: selectedMatch.other_user_id,
          nickname: selectedMatch.other_nickname?.trim() || '매칭 상대',
          profileImageUrl: resolveProfileImageUrl(selectedMatch.other_profile_image),
        };

        if (isMounted) {
          setCurrentUserId(user.id);
          setMatch(resolvedMatch);
          setMessages((messageRows ?? []) as MessageRow[]);
          setImageFailed(false);
          setPageState('ready');
        }

        const hasUnreadMessages = (messageRows ?? []).some(
          (message) => message.sender_id !== user.id && message.read_at === null,
        );

        if (hasUnreadMessages) {
          const { error: readError } = await supabase.rpc('mark_match_read', {
            p_match_id: matchId,
          });

          if (readError) {
            console.error('채팅 메시지 읽음 처리에 실패했습니다.');
          }
        }
      } catch {
        console.error('채팅 내용을 불러오지 못했습니다.');
        if (isMounted) {
          setLoadError('채팅 내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
          setPageState('error');
        }
      }
    };

    void loadChat();

    return () => {
      isMounted = false;
    };
  }, [matchId, retryKey, router, supabase]);

  useEffect(() => {
    if (pageState !== 'ready') return;
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pageState]);

  const refreshMessages = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, match_id, sender_id, content, read_at, created_at')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) return false;
    setMessages((data ?? []) as MessageRow[]);
    return true;
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || isSending || isEndingMatch || pageState !== 'ready' || match?.status !== 'active') return;

    setIsSending(true);
    setSendError('');

    const { error } = await supabase.rpc('send_match_message', {
      p_match_id: matchId,
      p_content: content,
    });

    if (error) {
      setSendError('메시지를 보내지 못했습니다. 내용을 유지했으니 다시 시도해 주세요.');
      setIsSending(false);
      return;
    }

    setDraft('');
    const refreshed = await refreshMessages();
    if (!refreshed) {
      setSendError('메시지는 전송되었지만 목록을 갱신하지 못했습니다. 다시 불러와 주세요.');
    }
    setIsSending(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleEndMatch = async () => {
    if (!match || match.status !== 'active' || isEndingMatch || isSending) return;

    setIsEndingMatch(true);
    setEndError('');

    try {
      const { data, error } = await supabase.rpc('end_match', {
        p_match_id: matchId,
      });

      if (error || data !== 'ended') throw error ?? new Error('Unexpected end_match response');

      setMatch((current) => current ? { ...current, status: 'ended' } : current);
      setDraft('');
      setSendError('');
      setIsEndConfirmOpen(false);
    } catch {
      console.error('매칭 종료에 실패했습니다.');
      setEndError('매칭 종료에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsEndingMatch(false);
    }
  };

  const handleBack = () => router.push('/matches');

  if (pageState === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-50 px-4">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-green-600" />
        <p className="font-medium text-gray-500">채팅 내용을 불러오는 중...</p>
      </div>
    );
  }

  if (pageState === 'denied') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-gray-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">채팅방에 들어갈 수 없습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{deniedMessage}</p>
          <Link
            href="/matches"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-green-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-green-700"
          >
            매칭목록으로 돌아가기
          </Link>
        </section>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gray-50 px-4 py-12">
        <section className="w-full max-w-md rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-5 text-xl font-bold text-gray-900">채팅을 불러오지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{loadError}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button className="min-h-12 rounded-2xl px-6 text-sm" onClick={() => setRetryKey((key) => key + 1)}>
              <RefreshCw className="mr-2 h-4 w-4" /> 다시 시도
            </Button>
            <Link
              href="/matches"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-gray-300 bg-white px-6 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
            >
              매칭목록으로
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (!match || !currentUserId) return null;

  return (
    <div className="bg-gray-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex h-[calc(100vh-7rem)] min-h-[620px] max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
        <header className="flex shrink-0 items-center gap-4 border-b border-gray-100 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={handleBack}
            aria-label="매칭목록으로 돌아가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <ArrowLeft size={21} />
          </button>

          {match.profileImageUrl && !imageFailed ? (
            <Image
              src={match.profileImageUrl}
              alt={`${match.nickname} 프로필 사진`}
              width={48}
              height={48}
              unoptimized
              onError={() => setImageFailed(true)}
              className="h-12 w-12 shrink-0 rounded-full border border-gray-100 object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
              <UserRound size={25} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold text-gray-900">{match.nickname}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <CalendarDays size={13} /> {formatDate(match.matchedAt)} 매칭
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${
              match.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {match.status === 'active' ? '매칭 중' : '종료된 매칭'}
            </span>
            {match.status === 'active' ? (
              <button
                type="button"
                disabled={isEndingMatch || isSending}
                onClick={() => {
                  setEndError('');
                  setIsEndConfirmOpen(true);
                }}
                className="min-h-10 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"
              >
                매칭 종료
              </button>
            ) : null}
          </div>
        </header>

        {match.status === 'ended' ? (
          <section className="shrink-0 border-b border-amber-100 bg-amber-50 px-5 py-4 sm:px-7" aria-live="polite">
            <p className="text-sm font-bold text-amber-800">종료된 매칭입니다.</p>
            <p className="mt-1 text-xs leading-5 text-amber-700 sm:text-sm">
              기존 대화는 확인할 수 있지만 새로운 메시지는 보낼 수 없습니다.
            </p>
          </section>
        ) : null}

        <main className="min-h-0 flex-1 overflow-y-auto bg-[#f8faf8] px-4 py-6 sm:px-7" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
                <MessageCircle size={30} />
              </span>
              <h2 className="mt-5 text-lg font-bold text-gray-800">아직 대화가 없습니다.</h2>
              <p className="mt-2 text-sm text-gray-500">첫 메시지를 보내보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const isMine = message.sender_id === currentUserId;
                const previousMessage = messages[index - 1];
                const showDate = !previousMessage || dateKey(previousMessage.created_at) !== dateKey(message.created_at);

                return (
                  <div key={message.id}>
                    {showDate ? (
                      <div className="my-6 flex items-center gap-3" aria-label={formatDate(message.created_at)}>
                        <span className="h-px flex-1 bg-gray-200" />
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500 shadow-sm">
                          {formatDate(message.created_at)}
                        </span>
                        <span className="h-px flex-1 bg-gray-200" />
                      </div>
                    ) : null}

                    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[85%] items-end gap-2 sm:max-w-[70%] ${isMine ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                            isMine
                              ? 'rounded-br-md bg-green-600 text-white'
                              : 'rounded-bl-md border border-gray-100 bg-white text-gray-800'
                          }`}
                        >
                          {message.content}
                        </div>
                        <div className={`mb-0.5 shrink-0 text-[11px] leading-4 text-gray-400 ${isMine ? 'text-right' : ''}`}>
                          {isMine ? <span className="block text-[#806B26]">{message.read_at ? '읽음' : '전송됨'}</span> : null}
                          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          )}
        </main>

        <footer className="shrink-0 border-t border-gray-100 bg-white px-4 py-4 sm:px-6">
          {sendError ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600" role="alert">
              <span>{sendError}</span>
              {sendError.includes('목록을 갱신') ? (
                <button type="button" onClick={() => void refreshMessages()} className="font-bold underline underline-offset-2">
                  다시 불러오기
                </button>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 transition focus-within:border-green-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-green-100">
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (sendError) setSendError('');
                }}
                onKeyDown={handleKeyDown}
                disabled={match.status !== 'active' || isEndingMatch}
                maxLength={MAX_MESSAGE_LENGTH}
                rows={2}
                placeholder={match.status === 'active' ? '메시지를 입력하세요' : '종료된 매칭에서는 메시지를 보낼 수 없습니다.'}
                aria-label="메시지 입력"
                className="max-h-32 min-h-12 w-full resize-none bg-transparent py-1 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400"
              />
              <p className="text-right text-[11px] text-gray-400">{draft.length}/{MAX_MESSAGE_LENGTH}</p>
            </div>
            <button
              type="submit"
              disabled={match.status !== 'active' || !draft.trim() || isSending || isEndingMatch}
              className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-sm font-bold text-white shadow-md shadow-green-100 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{isSending ? '전송 중' : '전송'}</span>
            </button>
          </form>
          <p className="mt-2 px-1 text-xs text-gray-400">Enter로 전송 · Shift+Enter로 줄바꿈</p>
        </footer>
      </div>

      {isEndConfirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-match-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!isEndingMatch) setIsEndConfirmOpen(false);
          }}
        >
          <section
            className="w-full max-w-md rounded-[2rem] bg-white p-7 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="end-match-title" className="text-xl font-extrabold text-gray-900">매칭을 종료하시겠습니까?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              종료 후에는 새로운 메시지를 보낼 수 없지만 기존 대화는 확인할 수 있습니다.
            </p>
            {endError ? (
              <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600" role="alert">
                {endError}
              </p>
            ) : null}
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isEndingMatch}
                onClick={() => setIsEndConfirmOpen(false)}
                className="min-h-11 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isEndingMatch}
                onClick={() => void handleEndMatch()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {isEndingMatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isEndingMatch ? '종료 중...' : '매칭 종료'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
