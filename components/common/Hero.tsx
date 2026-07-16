import Link from 'next/link';

const Hero = () => {
  return (
    <section className="overflow-hidden bg-[#F4F8F4] py-16 sm:py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-[#C8A951]/40 bg-white px-4 py-2 text-base font-bold text-[#806B26]">
            셀프 결혼정보 플랫폼 ComMatch
          </p>
          <h1 className="text-4xl font-black leading-[1.25] tracking-tight text-[#183B1B] sm:text-5xl lg:text-6xl">
            진지한 만남,
            <br />
            <span className="text-[#2E7D32]">믿을 수 있는 매칭</span>
          </h1>
          <p className="mt-7 text-xl font-medium leading-8 text-gray-700 sm:text-2xl sm:leading-10">
            상담사가 아닌,
            <br />
            당신이 직접 선택하는
            <br />
            셀프 결혼정보 플랫폼
          </p>
          <Link
            href="/match-test"
            className="mt-9 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-[#2E7D32] px-8 py-4 text-lg font-bold text-white shadow-lg shadow-green-900/15 transition-colors hover:bg-[#256729] focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/20 sm:w-auto"
          >
            무료로 시작하기
          </Link>
        </div>

        <div aria-hidden="true" className="relative mx-auto w-full max-w-lg">
          <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full border border-[#C8A951]/40" />
          <div className="absolute -bottom-10 -right-8 h-40 w-40 rounded-full bg-[#C8A951]/15" />
          <div className="relative rounded-[2rem] border border-[#2E7D32]/15 bg-white p-7 shadow-xl shadow-green-900/10 sm:p-10">
            <div className="mb-8 flex items-center justify-between border-b border-gray-100 pb-5">
              <span className="text-lg font-black text-[#2E7D32]">ComMatch</span>
              <span className="rounded-full bg-[#F4F8F4] px-3 py-1.5 text-sm font-bold text-[#2E7D32]">SELF MATCHING</span>
            </div>
            <div className="space-y-4">
              {['내 프로필을 직접 작성하고', '원하는 조건을 직접 선택하고', 'AI 추천으로 인연을 발견해요'].map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2E7D32] text-base font-black text-white">
                    {index + 1}
                  </span>
                  <span className="text-base font-bold text-gray-700 sm:text-lg">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 h-2 rounded-full bg-gray-100">
              <div className="h-2 w-3/4 rounded-full bg-[#C8A951]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
