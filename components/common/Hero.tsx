import Image from 'next/image';
import Link from 'next/link';

const Hero = () => {
  return (
    <section className="relative isolate overflow-hidden bg-[#F4F8F4] lg:min-h-[680px]">
      <div className="relative z-20 mx-auto flex max-w-7xl px-4 pt-14 pb-5 sm:px-6 sm:pt-20 sm:pb-8 lg:min-h-[680px] lg:items-center lg:px-8 lg:py-24">
        <div className="max-w-2xl lg:max-w-[56%] xl:max-w-[54%]">
          <p className="inline-flex rounded-full border border-[#C8A951]/35 bg-white px-4 py-2 text-sm font-bold text-[#806B26] sm:text-base">
            셀프 결혼매칭 ComMatch
          </p>
          <h1 className="mt-6 text-4xl font-black leading-[1.2] tracking-tight text-[#183B1B] sm:text-5xl lg:text-[3.25rem]">
            <span className="block">결혼 상대,</span>{' '}
            <span className="block">이제 내가 직접 찾아보세요.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-gray-700 sm:text-xl sm:leading-9">
            조건과 가치관을 확인하고 원하는 상대에게 직접 관심을 표현하는 셀프 결혼매칭 서비스
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/match-test"
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-[#2E7D32] px-7 py-4 text-base font-bold text-white shadow-md shadow-green-900/15 transition-colors hover:bg-[#256729] focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/20 sm:text-lg"
            >
              내 매칭 성향 알아보기
            </Link>
            <Link
              href="/how-to-use"
              className="inline-flex min-h-14 items-center justify-center rounded-xl border border-[#2E7D32]/35 bg-white px-7 py-4 text-base font-bold text-[#245F28] transition-colors hover:border-[#2E7D32] hover:bg-green-50 focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/15 sm:text-lg"
            >
              이용방법 보기
            </Link>
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm font-bold text-[#2E7D32]">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#C8A951]" />
            현재 무료 이용
          </p>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 hidden bg-[linear-gradient(90deg,rgba(244,248,244,0.97)_0%,rgba(244,248,244,0.90)_30%,rgba(244,248,244,0.62)_48%,rgba(244,248,244,0.10)_66%,transparent_80%)] lg:block"
      />

      <div className="relative z-0 mx-4 mb-4 aspect-[3/2] w-auto overflow-hidden rounded-[1.5rem] bg-[#DCEADB] sm:mx-6 sm:mb-6 lg:absolute lg:inset-0 lg:m-0 lg:aspect-auto lg:rounded-none">
        <Image
          src="/images/hero/commatch-hero-couple.png"
          alt="밝은 공간에서 편안하게 대화하는 남녀"
          fill
          preload
          sizes="100vw"
          className="object-cover object-center lg:object-[center_35%]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-[linear-gradient(180deg,rgba(244,248,244,0.55)_0%,rgba(244,248,244,0.18)_45%,transparent_100%)] lg:hidden"
        />
      </div>
    </section>
  );
};

export default Hero;
