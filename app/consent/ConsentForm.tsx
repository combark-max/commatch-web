'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  submitRequiredConsents,
  type ConsentActionState,
} from './actions';

type ConsentFormType = 'terms' | 'privacy' | 'adult_confirmation';

type ConsentFormProps = {
  completedTypes: ConsentFormType[];
  documentVersions: Record<ConsentFormType, string>;
  adultConfirmationLabel: string;
};

type RequestIds = Record<ConsentFormType, string>;

const CONSENT_TYPES: ConsentFormType[] = ['terms', 'privacy', 'adult_confirmation'];
const UUID_PATTERN = (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
);

const createUuidV4 = () => {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const INITIAL_STATE: ConsentActionState = {
  status: 'idle',
  message: null,
  completedTypes: [],
};

const PRIVACY_ITEMS = [
  '이메일 주소',
  '내부 회원 식별정보',
  '인증 휴대폰 번호 및 인증 상태·시각',
  '닉네임',
  '성별',
  '생년월일',
  '키',
  '지역',
  '직업',
  '학력',
  '취미',
  '음주 여부',
  '흡연 여부',
  '결혼 이력',
  '자기소개',
  '결혼에 대한 가치관',
  '프로필 이미지',
  '관심·좋아요 및 매칭 정보',
  '메시지, 읽음 및 운영 처리 정보',
  '신고 정보와 신고 대상 snapshot',
  '1:1 문의, 답변 및 처리정보',
  '알림 및 읽음 기록',
  'Push subscription 정보(endpoint, 암호화 키, 수신 설정 및 상태·시각)',
  'Push 발송 상태, 시도 횟수, 응답 상태 및 오류 기록',
  'Premium 이용·관리 기록',
  'consent 및 탈퇴 후 보존되는 관련 이력',
  '관리자 조치·감사 기록',
  'rate-limit용 가명 식별정보',
  '접속·보안 관련 정보',
] as const;

const ConsentDocument = ({ type }: { type: ConsentFormType }) => {
  if (type === 'terms') {
    return (
      <div className="space-y-5 text-sm leading-6 text-gray-600">
        <section>
          <h3 className="font-bold text-gray-900">이용약관 요약</h3>
          <p className="mt-2">
            ComMatch 이용약관은 회원가입과 계정 관리, 프로필·탐색·추천·관심·매칭·메시지 이용,
            회원 간 안전과 금지행위, 신고 및 이용 제한, Premium 서비스, 탈퇴와 책임에 관한 사항을 정합니다.
          </p>
        </section>
        <p>실제 동의 대상은 아래 링크에서 확인할 수 있는 전체 이용약관입니다.</p>
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl border border-green-200 px-4 font-bold text-green-700 transition hover:bg-green-50"
        >
          전체 이용약관 확인
        </Link>
      </div>
    );
  }

  if (type === 'privacy') {
    return (
      <div className="space-y-6 text-sm leading-6 text-gray-600">
        <section>
          <h3 className="font-bold text-gray-900">수집·이용 목적</h3>
          <p className="mt-2">
            회원 식별과 계정 운영, 프로필·선호정보 제공, 관심·추천·매칭 및 메시지 기능, 문의·신고 처리,
            알림·Push 제공, Premium 및 관리자 운영, 서비스 안전과 부정 이용 방지, 동의 사실 확인을 위해
            개인정보를 수집·이용합니다.
          </p>
        </section>
        <section>
          <h3 className="font-bold text-gray-900">수집 항목</h3>
          <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {PRIVACY_ITEMS.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-gray-900">보유·이용 기간</h3>
          <p className="mt-2">
            회원탈퇴 또는 처리 목적 달성 시까지 보유·이용하는 것을 원칙으로 하며, 신고·안전 관련 기록,
            관리자 조치·감사 기록, 동의 이력 등 필요한 정보는 관련 법령, 서비스 안전, 분쟁 대응 또는 동의
            사실 증빙에 필요한 기간 동안 별도로 보관할 수 있습니다. 구체적인 보유·이용 기간은
            개인정보처리방침을 따릅니다.
          </p>
        </section>
        <section>
          <h3 className="font-bold text-gray-900">동의 거부</h3>
          <p className="mt-2">필수 수집·이용에 동의하지 않을 수 있으나, 이 경우 ComMatch 회원 서비스를 이용할 수 없습니다.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm leading-6 text-gray-600">
      <p>ComMatch는 만 19세 이상 성인을 대상으로 합니다.</p>
      <ul className="space-y-2">
        <li>• 본인은 만 19세 이상임을 확인합니다.</li>
        <li>• 타인의 정보를 이용하거나 허위로 확인해서는 안 됩니다.</li>
        <li>• 만 19세 미만은 가입하거나 서비스를 이용할 수 없습니다.</li>
        <li>• 허위 확인이 확인되면 서비스 이용 제한 또는 계정 종료 조치가 이루어질 수 있습니다.</li>
      </ul>
      <p className="rounded-xl bg-gray-50 p-4 text-xs text-gray-500">
        이 확인은 휴대폰 본인인증 또는 신분증 인증 완료를 의미하지 않습니다.
      </p>
    </div>
  );
};

export default function ConsentForm({
  completedTypes,
  documentVersions,
  adultConfirmationLabel,
}: ConsentFormProps) {
  const [state, formAction, pending] = useActionState(submitRequiredConsents, INITIAL_STATE);
  const [checked, setChecked] = useState<Record<ConsentFormType, boolean>>({
    terms: completedTypes.includes('terms'),
    privacy: completedTypes.includes('privacy'),
    adult_confirmation: completedTypes.includes('adult_confirmation'),
  });
  const [requestIds, setRequestIds] = useState<RequestIds | null>(null);
  const [openDocument, setOpenDocument] = useState<ConsentFormType | null>(null);

  const completed = useMemo(() => new Set([
    ...completedTypes,
    ...state.completedTypes,
  ]), [completedTypes, state.completedTypes]);

  const items = useMemo(() => ([
    { type: 'terms' as const, title: '이용약관', label: '[필수] 이용약관에 동의합니다.' },
    { type: 'privacy' as const, title: '개인정보 수집·이용', label: '[필수] 개인정보 수집·이용에 동의합니다.' },
    { type: 'adult_confirmation' as const, title: '성인 확인', label: adultConfirmationLabel },
  ]), [adultConfirmationLabel]);
  const visibleItems = items.filter(({ type }) => !completed.has(type));

  const ensureRequestIds = () => {
    if (requestIds) return;

    const storageKey = `commatch:consent-request-ids:${CONSENT_TYPES
      .map((type) => `${type}:${documentVersions[type]}`)
      .join('|')}`;
    let stored: Partial<RequestIds> = {};

    try {
      stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}') as Partial<RequestIds>;
    } catch {
      stored = {};
    }

    const resolved = Object.fromEntries(CONSENT_TYPES.map((type) => [
      type,
      typeof stored[type] === 'string' && UUID_PATTERN.test(stored[type]!)
        ? stored[type]
        : createUuidV4(),
    ])) as RequestIds;

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(resolved));
    } catch {
      // The in-memory IDs still provide separate requests for this page session.
    }
    setRequestIds(resolved);
  };

  useEffect(() => {
    if (!openDocument) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenDocument(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openDocument]);

  const isAgreed = (type: ConsentFormType) => completed.has(type) || checked[type];
  const allAgreed = CONSENT_TYPES.every(isAgreed);

  const setAll = (value: boolean) => {
    if (value) ensureRequestIds();
    setChecked(Object.fromEntries(CONSENT_TYPES.map((type) => [
      type,
      completed.has(type) || value,
    ])) as Record<ConsentFormType, boolean>);
  };

  return (
    <div className="bg-gray-50 px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
            <ShieldCheck size={30} aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">
            서비스 이용을 위해 확인이 필요합니다
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-600">
            ComMatch 이용을 위해 아래 필수 내용을 확인하고 동의해 주세요.
          </p>
        </header>

        <form action={formAction} className="mt-9 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl shadow-gray-200/60">
          <div className="divide-y divide-gray-100">
            {visibleItems.map((item) => {
              const isCompleted = completed.has(item.type);
              return (
                <section key={item.type} className="p-6 sm:p-7">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className={`flex items-start gap-3 ${isCompleted ? 'cursor-default' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        name={`consent_${item.type}`}
                        checked={isAgreed(item.type)}
                        disabled={isCompleted || pending}
                        required={!isCompleted}
                        onChange={(event) => {
                          if (event.target.checked) ensureRequestIds();
                          setChecked((current) => ({
                            ...current,
                            [item.type]: event.target.checked,
                          }));
                        }}
                        className="mt-0.5 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span>
                        <span className="block font-bold text-gray-900">{item.label}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          문서 버전 {documentVersions[item.type]}
                          {isCompleted ? ' · 동의 완료' : ''}
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setOpenDocument(item.type)}
                      className="inline-flex min-h-11 items-center justify-center gap-1 self-start rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700 sm:self-auto"
                    >
                      내용 보기 <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <input type="hidden" name={`request_id_${item.type}`} value={requestIds?.[item.type] ?? ''} />
                </section>
              );
            })}
          </div>

          <div className="border-t border-gray-200 bg-gray-50/70 p-6 sm:p-7">
            <label className="flex cursor-pointer items-center gap-3 font-bold text-gray-900">
              <input
                type="checkbox"
                checked={allAgreed}
                disabled={pending}
                onChange={(event) => setAll(event.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              모두 동의
            </label>

            {state.status === 'error' && state.message ? (
              <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                {state.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!allAgreed || pending || !requestIds}
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-green-600 px-6 text-base font-bold text-white shadow-lg shadow-green-100 transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
            >
              {pending ? <Loader2 className="mr-2 animate-spin" size={20} aria-hidden="true" /> : <Check className="mr-2" size={20} aria-hidden="true" />}
              {pending ? '동의 저장 중...' : '동의하고 계속하기'}
            </button>
          </div>
        </form>
      </div>

      {openDocument ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenDocument(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-document-title"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 id="consent-document-title" className="text-xl font-black text-gray-900">
                  {items.find(({ type }) => type === openDocument)?.title}
                </h2>
                <p className="mt-1 text-xs text-gray-500">문서 버전 {documentVersions[openDocument]}</p>
              </div>
              <button
                type="button"
                aria-label="내용 닫기"
                onClick={() => setOpenDocument(null)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </header>
            <div className="overflow-y-auto px-6 py-6 sm:px-8">
              <ConsentDocument type={openDocument} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
