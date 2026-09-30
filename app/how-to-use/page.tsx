import type { Metadata } from 'next';
import Footer from '@/components/common/Footer';

export const metadata: Metadata = {
  title: 'ComMatch 이용방법',
  description: '회원가입부터 프로필 작성, 추천, 좋아요, 매칭과 채팅까지 ComMatch의 이용 절차를 안내합니다.',
  alternates: {
    canonical: '/how-to-use',
  },
};

const steps = [
  {
    title: '회원가입',
    description:
      '이메일과 비밀번호로 가입한 뒤 받은 인증 메일에서 이메일 인증을 완료합니다. 로그인 후 이용약관과 개인정보 수집·이용에 동의하고 만 19세 이상 성인임을 확인하면 회원 서비스를 이용할 수 있습니다.',
  },
  {
    title: '프로필 작성',
    description:
      '닉네임, 성별, 생년월일 등 기본정보를 입력하고 프로필 사진과 자기소개를 작성합니다. 지역, 직업, 취미, 생활 습관과 결혼에 대한 생각 등 선택 항목도 상대가 나를 이해하는 데 도움이 됩니다.',
    tip: '선택 항목은 필요한 만큼 작성하고, 언제든 내 프로필에서 수정할 수 있습니다.',
  },
  {
    title: 'AI 분석',
    description:
      'AI Match는 입력한 프로필과 희망 연령·키·지역·직업 등의 이상형 조건을 비교해 추천 순서와 추천 이유를 제공합니다. 자유롭게 작성한 자기소개와 결혼 가치관은 현재 추천 점수에 포함되지 않습니다.',
    tip: 'Premium 확대 추천에서는 선호조건 일치율, 공통점과 확인할 점을 포함한 상세 분석을 볼 수 있습니다.',
  },
  {
    title: '추천 받기',
    description:
      '프로필과 이상형 설정을 마친 뒤 오늘의 추천에서 조건에 맞는 회원의 사진, 기본정보, 프로필 완성도와 추천 이유를 확인합니다. 일반 추천은 최대 10명까지 제공됩니다.',
    tip: 'Premium 확대 추천은 조건에 맞는 회원을 최대 20명까지 보여주며, 실제 인원은 조건에 따라 달라질 수 있습니다.',
  },
  {
    title: '좋아요',
    description:
      '관심회원 저장은 다시 살펴볼 회원을 목록에 보관하는 기능이며, 좋아요와는 다릅니다. 회원을 관심회원으로 저장한 뒤 관심회원 목록에서 프로필을 충분히 확인하고 좋아요를 보낼 수 있습니다.',
    tip: '관심회원으로 저장하는 것만으로는 좋아요가 전달되거나 매칭이 생성되지 않습니다.',
  },
  {
    title: '매칭',
    description:
      '내가 좋아요를 보낸 회원도 나에게 좋아요를 보내면 서로의 선택이 확인되어 매칭이 생성됩니다. 새 매칭은 알림과 매칭 목록에서 확인할 수 있습니다.',
  },
  {
    title: '채팅',
    description:
      '매칭 목록에서 상대를 선택하면 매칭된 회원끼리 채팅을 시작할 수 있습니다. 대화 중 새 메시지가 반영되며, 내가 보낸 메시지는 전송됨 또는 읽음 상태로 확인할 수 있습니다.',
    tip: '진행 중인 매칭에서 메시지를 보낼 수 있으며, 종료된 매칭의 기존 대화는 확인할 수 있습니다.',
  },
  {
    title: '만남',
    description:
      '채팅으로 서로의 생각과 가치관을 충분히 알아본 뒤 실제 만남으로 이어갈지는 두 회원이 신중하게 결정합니다.',
    tip: '신뢰가 쌓이기 전에는 민감한 개인정보 공유와 금전 요구에 주의하고, 불편한 메시지는 신고 기능을 이용하세요.',
  },
] as const;

export default function HowToUsePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <header className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">How to Use</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">ComMatch 이용방법</h1>
            <p className="mt-4 max-w-2xl leading-7 text-gray-600">
              가입부터 추천과 매칭, 대화 후 만남까지 ComMatch를 이용하는 흐름을 단계별로 확인하세요.
            </p>
          </header>

          <ol className="mt-8 space-y-4">
            {steps.map(({ title, description, ...step }, index) => (
              <li key={title}>
                <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex items-start gap-4 sm:gap-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2E7D32] text-lg font-black text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black text-gray-900 sm:text-2xl">{title}</h2>
                      <p className="mt-3 text-[15px] leading-7 text-gray-700 sm:text-base sm:leading-8">{description}</p>
                      {'tip' in step ? (
                        <p className="mt-4 rounded-2xl bg-[#F4F8F4] px-4 py-3 text-sm leading-6 text-green-900">
                          <span className="font-bold">Tip.</span> {step.tip}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </main>
      <Footer />
    </div>
  );
}
