import Hero from '@/components/common/Hero';
import Features from '@/components/common/Features';
import Footer from '@/components/common/Footer';

const steps = [
  { title: '회원가입' },
  { title: '프로필 작성' },
  { title: 'AI 분석' },
  { title: '추천 받기' },
  { title: '좋아요' },
  { title: '매칭' },
  { title: '채팅' },
  { title: '만남' },
];

const safetyGuides = [
  {
    title: '프로필을 충분히 확인하세요',
    description: '프로필과 자기소개를 충분히 살펴보고 관심회원으로 저장한 뒤, 신중하게 좋아요를 보내세요.',
  },
  {
    title: '매칭 후 충분히 대화하세요',
    description: '서로 좋아요를 보내 매칭되면 채팅을 통해 서로의 생각과 가치관을 천천히 알아가세요.',
  },
  {
    title: '개인정보와 금전 요구에 주의하세요',
    description: '충분한 신뢰가 형성되기 전에는 민감한 개인정보를 전달하거나 금전 거래를 하는 데 주의하세요.',
  },
  {
    title: '불편한 상황은 알려주세요',
    description: '부적절한 프로필이나 메시지는 신고할 수 있으며, 서비스 이용 관련 문의는 로그인 후 1:1 문의를 이용할 수 있습니다.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="flex-grow">
        <Hero />
        <Features />

        <section id="about" className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <p className="mb-3 text-base font-black uppercase tracking-[0.18em] text-[#806B26]">About ComMatch</p>
            <h2 className="text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">나의 선택을 중심에 둔 만남</h2>
            <p className="mx-auto mt-7 max-w-3xl text-xl leading-9 text-gray-700 sm:text-2xl sm:leading-10">
              ComMatch는 회원이 직접 프로필을 작성하고
              <br className="hidden sm:block" />
              AI의 도움을 받아 자신에게 맞는 사람을 찾는
              <br className="hidden sm:block" />
              셀프 결혼정보 플랫폼입니다.
            </p>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#F4F8F4] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <p className="mb-3 text-base font-black uppercase tracking-[0.18em] text-[#806B26]">How It Works</p>
              <h2 className="text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">이용 절차</h2>
              <p className="mt-4 text-lg text-gray-600">가입부터 새로운 인연을 만나는 과정까지 한눈에 확인하세요.</p>
            </div>

            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 xl:gap-3">
              {steps.map((step, index) => (
                <li key={step.title} className="relative flex min-h-36 items-center gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:flex-col lg:justify-center lg:text-center xl:p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2E7D32] text-lg font-black text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{step.title}</h3>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <p className="mb-3 text-base font-black uppercase tracking-[0.18em] text-[#806B26]">Safety Guide</p>
              <h2 className="text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">안전한 만남을 위한 이용 가이드</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {safetyGuides.map(({ title, description }) => (
                <article key={title} className="rounded-xl border border-gray-200 bg-[#FAFBFA] p-6 sm:p-8">
                  <h3 className="text-lg font-bold leading-7 text-gray-800 sm:text-xl">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base sm:leading-7">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
