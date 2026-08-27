'use client';

import { useEffect, useState } from 'react';
import {
  BellRing,
  CircleHelp,
  CircleX,
  HeartHandshake,
  Loader2,
  MessageCircle,
  Smartphone,
  ThumbsUp,
} from 'lucide-react';
import {
  getCurrentPushSubscription,
  getMyPushSubscriptionSettings,
  getPushCapability,
  revokeAndUnsubscribePush,
  subscribeAndRegisterPush,
  type PushCapability,
} from '@/lib/push/client';

type PushSettingKey = 'message' | 'like' | 'match' | 'support' | 'match-ended';
type LoadState = 'loading' | 'ready' | 'error';

function PushToggle({
  checked,
  disabled,
  label,
  description,
  onChange,
  icon,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-t border-gray-100 py-5 first:border-t-0">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-700">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900">{label}</p>
        <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-green-600' : 'bg-gray-300'
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
  );
}

export default function PushSettings() {
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [messageEnabled, setMessageEnabled] = useState(false);
  const [likeEnabled, setLikeEnabled] = useState(false);
  const [matchEnabled, setMatchEnabled] = useState(false);
  const [supportEnabled, setSupportEnabled] = useState(false);
  const [matchEndedEnabled, setMatchEndedEnabled] = useState(false);
  const [pendingSetting, setPendingSetting] = useState<PushSettingKey | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      const nextCapability = getPushCapability();
      if (!isMounted) return;
      setCapability(nextCapability);

      if (nextCapability.status !== 'ready') {
        setLoadState('ready');
        return;
      }

      try {
        const subscription = await getCurrentPushSubscription();
        if (!subscription) {
          if (isMounted) setLoadState('ready');
          return;
        }

        if (Notification.permission === 'denied') {
          await revokeAndUnsubscribePush(subscription).catch(() => undefined);
          if (isMounted) {
            setCapability({ status: 'ready', permission: 'denied' });
            setLoadState('ready');
          }
          return;
        }

        const settings = await getMyPushSubscriptionSettings(subscription);
        if (isMounted && settings && settings.revokedAt === null) {
          setMessageEnabled(settings.newMessageEnabled);
          setLikeEnabled(settings.newLikeEnabled);
          setMatchEnabled(settings.newMatchEnabled);
          setSupportEnabled(settings.supportInquiryAnsweredEnabled);
          setMatchEndedEnabled(settings.matchEndedEnabled);
        }
        if (isMounted) setLoadState('ready');
      } catch (error) {
        console.error('Push 설정을 불러오지 못했습니다.', error);
        if (isMounted) setLoadState('error');
      }
    };

    void loadSettings();
    return () => {
      isMounted = false;
    };
  }, []);

  const updateSetting = async (setting: PushSettingKey) => {
    if (pendingSetting || !capability || capability.status !== 'ready') return;

    const previousMessageEnabled = messageEnabled;
    const previousLikeEnabled = likeEnabled;
    const previousMatchEnabled = matchEnabled;
    const previousSupportEnabled = supportEnabled;
    const previousMatchEndedEnabled = matchEndedEnabled;
    const nextMessageEnabled = setting === 'message' ? !messageEnabled : messageEnabled;
    const nextLikeEnabled = setting === 'like' ? !likeEnabled : likeEnabled;
    const nextMatchEnabled = setting === 'match' ? !matchEnabled : matchEnabled;
    const nextSupportEnabled = setting === 'support' ? !supportEnabled : supportEnabled;
    const nextMatchEndedEnabled = setting === 'match-ended' ? !matchEndedEnabled : matchEndedEnabled;

    setPendingSetting(setting);
    setStatusMessage(null);

    try {
      if (
        !nextMessageEnabled
        && !nextLikeEnabled
        && !nextMatchEnabled
        && !nextSupportEnabled
        && !nextMatchEndedEnabled
      ) {
        await revokeAndUnsubscribePush();
        setMessageEnabled(false);
        setLikeEnabled(false);
        setMatchEnabled(false);
        setSupportEnabled(false);
        setMatchEndedEnabled(false);
        setCapability({ status: 'ready', permission: Notification.permission });
        setStatusMessage('이 기기의 Push 알림을 해제했습니다.');
        return;
      }

      const result = await subscribeAndRegisterPush({
        newMessageEnabled: nextMessageEnabled,
        newLikeEnabled: nextLikeEnabled,
        newMatchEnabled: nextMatchEnabled,
        supportInquiryAnsweredEnabled: nextSupportEnabled,
        matchEndedEnabled: nextMatchEndedEnabled,
      });
      setMessageEnabled(result.settings.newMessageEnabled);
      setLikeEnabled(result.settings.newLikeEnabled);
      setMatchEnabled(result.settings.newMatchEnabled);
      setSupportEnabled(result.settings.supportInquiryAnsweredEnabled);
      setMatchEndedEnabled(result.settings.matchEndedEnabled);
      setCapability({ status: 'ready', permission: Notification.permission });
      setStatusMessage('이 기기의 Push 설정을 저장했습니다.');
    } catch (error) {
      console.error('Push 설정을 저장하지 못했습니다.', error);
      setMessageEnabled(previousMessageEnabled);
      setLikeEnabled(previousLikeEnabled);
      setMatchEnabled(previousMatchEnabled);
      setSupportEnabled(previousSupportEnabled);
      setMatchEndedEnabled(previousMatchEndedEnabled);
      const permission = 'Notification' in window ? Notification.permission : 'default';
      setCapability({ status: 'ready', permission });
      setStatusMessage(
        permission === 'denied'
          ? '브라우저에서 알림 권한이 차단되어 있습니다. 브라우저 또는 기기 설정에서 ComMatch 알림을 허용해 주세요.'
          : 'Push 설정을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setPendingSetting(null);
    }
  };

  const isBusy = pendingSetting !== null;

  return (
    <section className="rounded-2xl border border-green-100 bg-white p-7 shadow-sm" aria-labelledby="push-settings-heading">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-100 text-green-700">
          <BellRing size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 id="push-settings-heading" className="text-lg font-bold text-gray-900">Push 알림</h2>
          <p className="mt-1 text-sm leading-6 text-gray-600">현재 브라우저 또는 홈 화면 앱에서 받을 알림을 선택합니다.</p>
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-gray-50 p-4 text-sm font-semibold text-gray-600">
          <Loader2 className="animate-spin" size={18} /> Push 설정을 확인하는 중...
        </div>
      ) : null}

      {capability?.status === 'ios-install-required' ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <p className="flex items-center gap-2 font-bold"><Smartphone size={18} /> iPhone/iPad에서는 홈 화면 추가가 필요합니다.</p>
          <p className="mt-2">Safari의 공유 버튼에서 <strong>홈 화면에 추가</strong>한 뒤, 홈 화면의 ComMatch를 열어 Push 알림을 설정해 주세요.</p>
        </div>
      ) : null}

      {capability?.status === 'unsupported' ? (
        <p className="mt-6 rounded-xl bg-gray-100 p-4 text-sm font-semibold text-gray-700">이 브라우저 또는 현재 연결 환경에서는 Web Push를 사용할 수 없습니다.</p>
      ) : null}

      {capability?.status === 'configuration-missing' ? (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Push 공개 키가 설정되지 않아 알림을 켤 수 없습니다.</p>
      ) : null}

      {capability?.status === 'ready' ? (
        <>
          {capability.permission === 'denied' ? (
            <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">브라우저에서 알림 권한이 차단되어 있습니다. 브라우저 또는 기기 설정에서 ComMatch 알림을 허용해 주세요.</p>
          ) : (
            <div className="mt-5">
              <PushToggle
                checked={messageEnabled}
                disabled={isBusy || loadState !== 'ready'}
                label="메시지 Push"
                description="새 메시지가 도착하면 이 기기에서 알림을 받습니다."
                onChange={() => void updateSetting('message')}
                icon={<MessageCircle size={20} aria-hidden="true" />}
              />
              <PushToggle
                checked={likeEnabled}
                disabled={isBusy || loadState !== 'ready'}
                label="좋아요 Push"
                description="새로운 좋아요를 받으면 이 기기에서 알림을 받습니다."
                onChange={() => void updateSetting('like')}
                icon={<ThumbsUp size={20} aria-hidden="true" />}
              />
              <PushToggle
                checked={matchEnabled}
                disabled={isBusy || loadState !== 'ready'}
                label="새 매칭 Push"
                description="새로운 매칭이 성사되면 이 기기에서 알림을 받습니다."
                onChange={() => void updateSetting('match')}
                icon={<HeartHandshake size={20} aria-hidden="true" />}
              />
              <PushToggle
                checked={supportEnabled}
                disabled={isBusy || loadState !== 'ready'}
                label="문의 답변 Push"
                description="문의에 답변이 등록되면 이 기기에서 알림을 받습니다."
                onChange={() => void updateSetting('support')}
                icon={<CircleHelp size={20} aria-hidden="true" />}
              />
              <PushToggle
                checked={matchEndedEnabled}
                disabled={isBusy || loadState !== 'ready'}
                label="매칭 종료"
                description="상대 회원이 매칭을 종료하면 알림을 받습니다."
                onChange={() => void updateSetting('match-ended')}
                icon={<CircleX size={20} aria-hidden="true" />}
              />
            </div>
          )}
          {capability.permission === 'default' ? (
            <p className="mt-2 text-xs leading-5 text-gray-500">처음 ON을 누를 때만 브라우저의 알림 권한 요청이 표시됩니다.</p>
          ) : null}
        </>
      ) : null}

      {loadState === 'error' ? (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">Push 설정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>
      ) : null}
      {statusMessage ? <p role="status" className="mt-4 text-sm font-semibold leading-6 text-gray-700">{statusMessage}</p> : null}
    </section>
  );
}
