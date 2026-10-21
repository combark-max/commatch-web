import Image from 'next/image';
import Link from 'next/link';

const heroFacts = ['현재 무료 이용', '18문항 테스트', '6가지 관계 성향', '회원가입 없이 이용'] as const;

const Hero = () => {
  return (
    <section className="relative isolate overflow-hidden bg-[#FFFDF8] text-[#173D29] lg:min-h-[520px]">
      <div className="relative z-20 mx-auto flex max-w-7xl px-4 pb-7 pt-10 sm:px-6 sm:pb-9 sm:pt-14 lg:min-h-[520px] lg:items-center lg:px-8 lg:py-16">
        <div className="max-w-xl lg:w-[47%]">
          <p className="text-base font-black tracking-[-0.01em] text-[#E05D61] sm:text-lg">
            좋은 사람을, 더 가까이!
          </p>
          <h1 className="mt-3 text-4xl font-black leading-[1.14] tracking-[-0.045em] text-[#123F27] sm:text-5xl lg:text-[3.45rem]">
            진지한 만남이 좋은 인연이 됩니다.
          </h1>
          <p className="mt-5 max-w-lg text-base font-medium leading-7 text-[#405949] sm:text-lg sm:leading-8">
            ComMatch는 가치관이 맞는 사람을 직접 찾아보고, 서로의 선택으로 인연을 이어가는 셀프매칭 서비스입니다.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/match-test"
              className="inline-flex min-h-13 items-center justify-center rounded-full bg-[#175B35] px-7 py-3.5 font-black text-white shadow-lg shadow-[#175B35]/15 transition-colors hover:bg-[#104628] focus:outline-none focus:ring-4 focus:ring-[#175B35]/20"
            >
              내 매칭 성향 알아보기
            </Link>
            <Link
              href="/how-to-use"
              className="inline-flex min-h-13 items-center justify-center rounded-full border border-[#175B35]/35 bg-[#FFFDF8]/90 px-7 py-3.5 font-black text-[#175B35] transition-colors hover:border-[#175B35] hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#175B35]/15"
            >
              이용방법 보기
            </Link>
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs font-bold text-[#53675A] sm:flex sm:flex-wrap sm:text-sm">
            {heroFacts.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#E77678]" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 hidden bg-[linear-gradient(90deg,#FFFDF8_0%,rgba(255,253,248,0.98)_30%,rgba(255,253,248,0.7)_48%,rgba(255,253,248,0.05)_68%,transparent_78%)] lg:block"
      />

      <div className="relative z-0 mx-4 mb-4 aspect-[3/2] overflow-hidden rounded-[1.5rem] bg-[#F0F6ED] sm:mx-6 sm:mb-6 lg:absolute lg:inset-0 lg:m-0 lg:aspect-auto lg:rounded-none">
        <Image
          src="/images/landing/hero-couple-wide.webp"
          alt="밝은 카페에서 편안하게 대화하는 커플"
          fill
          preload
          sizes="100vw"
          className="object-cover object-[62%_center] lg:object-center"
        />
      </div>
    </section>
  );
};

export default Hero;
