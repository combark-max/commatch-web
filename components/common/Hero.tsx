import Image from 'next/image';
import Link from 'next/link';

const Hero = () => {
  return (
    <section className="overflow-hidden bg-[#F4F8F4] py-14 sm:py-20 lg:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8">
        <div className="max-w-2xl">
          <p className="inline-flex rounded-full border border-[#C8A951]/35 bg-white px-4 py-2 text-sm font-bold text-[#806B26] sm:text-base">
            셀프 결혼매칭 ComMatch
          </p>
          <h1 className="mt-6 text-4xl font-black leading-[1.2] tracking-tight text-[#183B1B] sm:text-5xl lg:text-[3.5rem]">
            결혼 상대, 이제 내가 직접 찾아보세요.
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

        <div className="relative mx-auto aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-[#DCEADB] shadow-lg shadow-green-950/10">
          <Image
            src="/images/hero/commatch-hero-couple.png"
            alt="밝은 공간에서 편안하게 대화하는 남녀"
            fill
            preload
            sizes="(max-width: 1024px) 100vw, 46vw"
            className="object-cover object-center"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
