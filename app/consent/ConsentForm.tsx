'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
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

const INITIAL_STATE: ConsentActionState = {
  status: 'idle',
  message: null,
  completedTypes: [],
};

const TERMS_SECTIONS = [
  ['제1조 목적', '이 약관은 ComMatch가 제공하는 회원 프로필, 추천, 관심, 매칭 및 메시지 등 서비스의 이용 조건과 회원 및 회사의 권리·의무를 정하는 것을 목적으로 합니다.'],
  ['제2조 정의', '회원은 본 약관에 동의하고 계정을 만든 이용자를 말하며, 서비스는 ComMatch 웹사이트에서 제공하는 결혼 상대 탐색 지원 기능을 말합니다.'],
  ['제3조 약관의 적용', '회원은 가입과 서비스 이용 전에 약관을 확인해야 합니다. 약관이 변경되는 경우 회사는 적용 내용과 시점을 서비스에서 안내합니다.'],
  ['제4조 회원가입과 계정', '회원은 정확한 정보를 사용하여 본인 계정을 관리해야 하며, 계정이나 인증 정보를 타인에게 양도하거나 공유해서는 안 됩니다.'],
  ['제5조 서비스 이용', '서비스는 회원이 직접 작성한 프로필과 선호 조건을 바탕으로 상대 회원을 탐색하고 소통할 수 있도록 지원합니다. 특정한 만남이나 혼인 성립을 보장하지 않습니다.'],
  ['제6조 프로필 정보', '회원은 사실에 부합하는 정보를 작성해야 하며, 타인의 개인정보·사진·저작물을 권한 없이 사용해서는 안 됩니다.'],
  ['제7조 회원 간 소통', '회원은 상대방을 존중하고 동의 없는 연락, 괴롭힘, 차별, 위협, 성적 불쾌감을 주는 행위 또는 사기성 행위를 해서는 안 됩니다.'],
  ['제8조 금지행위', '불법행위, 허위 계정, 서비스 운영 방해, 개인정보 무단 수집, 영리 목적의 광고·권유, 시스템 우회 또는 부정한 접근을 금지합니다.'],
  ['제9조 신고와 안전조치', '회사는 신고 내용과 서비스 이용 기록을 확인하고 필요한 경우 콘텐츠 제한, 계정 이용 제한 또는 종료 등 안전조치를 할 수 있습니다.'],
  ['제10조 서비스 변경과 중단', '운영상·기술상 필요에 따라 서비스의 전부 또는 일부가 변경되거나 일시 중단될 수 있으며, 중요한 변경은 가능한 범위에서 사전에 안내합니다.'],
  ['제11조 Premium 기능', 'Premium 기능의 범위와 이용 조건은 해당 기능 도입 시 별도로 안내하며, 이번 약관 동의만으로 유료 결제가 이루어지지 않습니다.'],
  ['제12조 게시물과 권리', '회원이 작성한 콘텐츠의 권리는 원칙적으로 회원에게 있으며, 회원은 서비스 제공과 운영에 필요한 범위에서 회사가 이를 처리할 수 있도록 허용합니다.'],
  ['제13조 개인정보 보호', '회사는 개인정보 처리와 보호에 관하여 별도의 개인정보 수집·이용 안내 및 관련 정책을 따릅니다.'],
  ['제14조 이용 제한', '회원이 약관 또는 운영정책을 위반하거나 서비스 안전을 해칠 우려가 있는 경우 회사는 사안에 따라 서비스 이용을 제한할 수 있습니다.'],
  ['제15조 탈퇴', '회원은 계정 설정에서 탈퇴를 요청할 수 있습니다. 탈퇴 후 정보 처리는 개인정보 안내와 관련 법령 및 안전·분쟁 대응 기준을 따릅니다.'],
  ['제16조 준거와 분쟁', '서비스 이용과 관련한 분쟁은 당사자 간 협의를 우선하며, 해결되지 않는 경우 대한민국 법령과 관할 법원의 절차를 따릅니다.'],
  ['제17조 회원 간 관계와 책임', '① 회원은 상대 회원과의 만남 및 소통 여부를 스스로 판단하고 자신의 안전을 위해 필요한 주의를 기울여야 합니다.\n② 회사는 회원이 제공한 정보와 회원 간 의사결정을 대신하지 않으며, 회원은 상대방의 정보를 직접 확인해야 합니다.\n③ 회원 간의 개인적인 약속, 금전 거래 또는 서비스 밖에서 이루어진 행위는 원칙적으로 해당 회원 당사자 사이의 문제입니다.'],
] as const;

const PRIVACY_ITEMS = [
  '이메일 주소',
  '내부 회원 식별정보',
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
  '관심/매칭 정보',
  '메시지 정보',
  '신고 및 운영 관련 정보',
  'Premium 이용 상태',
  'consent 이력',
] as const;

const ConsentDocument = ({ type }: { type: ConsentFormType }) => {
  if (type === 'terms') {
    return (
      <div className="space-y-5">
        {TERMS_SECTIONS.map(([heading, body]) => (
          <section key={heading}>
            <h3 className="font-bold text-gray-900">{heading}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">{body}</p>
          </section>
        ))}
      </div>
    );
  }

  if (type === 'privacy') {
    return (
      <div className="space-y-6 text-sm leading-6 text-gray-600">
        <section>
          <h3 className="font-bold text-gray-900">수집·이용 목적</h3>
          <p className="mt-2">
            회원 식별과 계정 운영, 프로필 제공, 관심·추천·매칭 및 메시지 기능, 신고 처리와 서비스 안전,
            Premium 상태 관리, 동의 사실 확인을 위해 개인정보를 수집·이용합니다.
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
            회원탈퇴 또는 처리 목적 달성 시까지 보유·이용하는 것을 원칙으로 하며, 신고·안전 관련 기록 및
            동의 이력 등 필요한 정보는 관련 법령, 서비스 안전, 분쟁 대응 또는 동의 사실 증빙에 필요한 기간
            동안 별도로 보관할 수 있습니다.
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
        : window.crypto.randomUUID(),
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
            {items.map((item) => {
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
                <p className="mt-1 text-xs text-gray-500">문서 버전 {documentVersions[openDocument]} · 시행일 추후 확정</p>
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
