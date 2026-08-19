import type { Metadata } from 'next';
import {
  BookmarkCheck,
  HeartHandshake,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Footer from '@/components/common/Footer';

export const metadata: Metadata = {
  title: 'ComMatch 회사소개',
  description: 'ComMatch의 서비스 취지와 주요 기능, 신중한 만남을 위한 운영 방향을 소개합니다.',
};

const serviceFeatures = [
  {
    title: '프로필과 가치관 중심의 탐색',
    description:
      '사진이나 단편적인 조건만이 아니라 기본 프로필, 자기소개, 생활 스타일, 결혼에 대한 생각 등을 함께 살펴볼 수 있도록 구성하고 있습니다.',
    icon: Search,
  },
  {
    title: '관심과 좋아요를 구분한 신중한 선택',
    description:
      '마음에 드는 회원을 바로 매칭 대상으로 처리하는 것이 아니라 먼저 관심회원으로 저장해 충분히 살펴본 뒤 좋아요를 보낼 수 있습니다.',
    icon: BookmarkCheck,
  },
  {
    title: '상호 선택 기반의 매칭',
    description:
      '한쪽의 일방적인 요청이 아니라 서로 좋아요를 보낸 경우에 매칭이 이루어집니다. 두 사람의 관심이 확인된 뒤 대화를 시작할 수 있도록 설계했습니다.',
    icon: HeartHandshake,
  },
  {
    title: '매칭 후 이어지는 채팅',
    description:
      '매칭된 회원은 서비스 안에서 대화할 수 있으며, 실시간 메시지 반영과 읽음 상태를 통해 자연스럽게 소통을 이어갈 수 있습니다.',
    icon: MessagesSquare,
  },
  {
    title: 'AI를 활용한 탐색 지원',
    description: 'AI Match는 회원이 설정한 조건과 프로필 정보를 바탕으로 상대를 찾는 과정을 돕습니다.',
    icon: Sparkles,
  },
  {
    title: '더 다양한 탐색을 위한 Premium 기능',
    description:
      '고급 회원 검색, 추천 인원 확대 등 추가적인 탐색 기능을 Premium 영역에서 제공하고 있습니다. 현재 주요 Premium 기능은 무료로 제공되고 있습니다.',
    icon: ShieldCheck,
  },
] as const;

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <header className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">About ComMatch</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">회사소개</h1>
            <h2 className="mt-6 text-2xl font-black leading-9 text-[#183B1B] sm:text-3xl sm:leading-10">
              좋은 인연을 찾는 과정을 더 신중하고 의미 있게
            </h2>
            <div className="mt-6 space-y-4 text-base leading-8 text-gray-700">
              <p>
                ComMatch는 단순히 많은 사람을 빠르게 연결하는 것보다, 서로의 프로필과 가치관을 충분히 살펴보고
                스스로 선택하며 좋은 인연을 만들어가는 과정을 중요하게 생각합니다.
              </p>
              <p>
                회원이 직접 자신의 프로필을 만들고, 관심 있는 상대를 탐색하고, 서로의 선택이 확인된 뒤 대화로
                이어지는 구조를 통해 보다 신중하고 자연스러운 만남을 돕는 셀프 매칭 서비스입니다.
              </p>
            </div>
          </header>

          <section className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm sm:p-9" aria-labelledby="about-service">
            <h2 id="about-service" className="text-2xl font-black text-gray-900">ComMatch는 어떤 서비스인가요?</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-8 text-gray-700 sm:text-base">
              <p>ComMatch는 회원이 자신의 기준과 선택을 중심에 두고 인연을 찾아가는 서비스입니다.</p>
              <p>
                프로필과 자기소개, 생활 방식과 결혼에 대한 생각 등을 바탕으로 상대를 살펴보고, 관심회원으로
                저장하거나 좋아요를 보내며 스스로 관계의 다음 단계를 결정할 수 있습니다.
              </p>
              <p>AI Match 기능은 입력된 선호조건과 프로필 정보를 바탕으로 상대를 탐색하는 데 도움을 줍니다.</p>
              <p>
                ComMatch는 누군가가 일방적으로 상대를 정해주는 방식보다, 회원이 충분히 확인하고 판단하며 선택할
                수 있는 과정을 지향합니다.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm sm:p-9" aria-labelledby="mutual-choice">
            <h2 id="mutual-choice" className="text-2xl font-black text-gray-900">서로의 선택에서 시작되는 만남</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-8 text-gray-700 sm:text-base">
              <p>ComMatch의 만남은 한 번의 추천으로 끝나지 않습니다.</p>
              <p>
                회원가입과 프로필 작성을 시작으로 AI 추천과 회원 탐색을 통해 상대를 알아보고, 관심회원 저장과
                좋아요를 통해 자신의 관심을 표현할 수 있습니다.
              </p>
              <p>
                서로 좋아요를 보낸 경우 매칭이 이루어지고, 양쪽 회원에게 매칭 알림이 전달됩니다. 이후 매칭된
                회원끼리 채팅을 통해 서로의 생각과 가치관을 더 알아갈 수 있습니다.
              </p>
              <p>충분한 대화 이후 실제 만남을 이어갈지는 회원 각자가 신중하게 판단하고 결정합니다.</p>
            </div>
          </section>

          <section aria-labelledby="service-features">
            <div className="px-1">
              <h2 id="service-features" className="text-2xl font-black text-gray-900">ComMatch의 주요 특징</h2>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {serviceFeatures.map(({ title, description, icon: Icon }) => (
                <article key={title} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-700">
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-black leading-7 text-gray-900">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-gray-700 sm:text-[15px]">{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-green-100 bg-[#F4F8F4] p-7 shadow-sm sm:p-9" aria-labelledby="thoughtful-use">
            <h2 id="thoughtful-use" className="text-2xl font-black text-[#183B1B]">신중한 이용을 돕는 운영 기능</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-8 text-gray-700 sm:text-base">
              <p>
                좋은 만남은 기능만으로 만들어지는 것이 아니라 서로를 존중하고 신중하게 알아가는 과정에서
                시작된다고 생각합니다.
              </p>
              <p>
                ComMatch는 부적절한 프로필이나 채팅 메시지를 신고할 수 있는 기능을 제공하며, 회원은 자신의 신고
                내역과 처리 상태를 확인할 수 있습니다.
              </p>
              <p>
                서비스 이용 중 궁금한 점이나 도움이 필요한 경우 로그인 후 1:1 문의를 통해 관리자에게 문의하고
                답변을 확인할 수 있습니다.
              </p>
              <p>신고 내용에 따라 운영자는 회원 이용 제한이나 프로필 노출 제한 등의 조치를 할 수 있습니다.</p>
              <p>상대를 충분히 알아보고 개인정보 공유나 금전 거래에는 신중하게 판단하는 것이 중요합니다.</p>
            </div>
          </section>

          <section className="rounded-3xl bg-[#183B1B] p-7 text-white shadow-sm sm:p-9" aria-labelledby="service-direction">
            <h2 id="service-direction" className="text-2xl font-black">ComMatch가 만들고 싶은 서비스</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-8 text-white/80 sm:text-base">
              <p>
                ComMatch는 많은 사람을 빠르게 연결하는 것보다, 한 사람 한 사람에게 의미 있는 인연을 찾는 과정이
                더 중요하다고 생각합니다.
              </p>
              <p>
                조건만으로 상대를 판단하기보다 서로의 삶과 생각을 알아보고, 자신의 기준에 따라 선택하며, 충분한
                대화를 통해 관계를 만들어갈 수 있는 서비스를 만들고자 합니다.
              </p>
              <p>
                회원이 더 편리하게 상대를 찾고, 더 신중하게 선택하고, 더 자연스럽게 좋은 인연으로 이어갈 수
                있도록 ComMatch를 계속 발전시켜 나가겠습니다.
              </p>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
