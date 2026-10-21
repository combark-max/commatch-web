import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Flag,
  HeartHandshake,
  LockKeyhole,
  MessagesSquare,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
} from 'lucide-react';

const coreSteps = [
  { number: '01', title: '직접 찾기', description: '원하는 조건으로 상대방을 살펴봅니다.' },
  { number: '02', title: '서로 선택', description: '일방적인 연결이 아닌 상호 관심을 바탕으로 매칭합니다.' },
  { number: '03', title: '매칭 후 대화', description: '서로 연결된 뒤 대화를 시작합니다.' },
] as const;

export function CoreApproach() {
  return (
    <section id="about" className="scroll-mt-24 bg-[#F0F6ED] py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#E77678]">The ComMatch Way</p>
            <h2 className="mt-2 text-2xl font-black leading-tight tracking-[-0.03em] text-[#175B35] sm:text-3xl">
              기다리기보다 직접 찾고,
              <span className="block">서로의 선택으로 이어집니다.</span>
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[#53675A] sm:text-base sm:leading-7">
            프로필에서 상대방이 공개한 정보를 살펴보고, 관계 성향 테스트에서는 나의 관계 방식을 알아보세요.
          </p>
        </div>

        <ol className="mt-6 grid gap-3 lg:grid-cols-3">
          {coreSteps.map(({ number, title, description }) => (
            <li key={title} className="flex gap-3 border-t border-[#175B35]/18 py-4">
              <span className="text-sm font-black tracking-widest text-[#E77678]">{number}</span>
              <div>
                <h3 className="text-lg font-black text-[#175B35]">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#53675A]">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const sampleDomainScores = [
  { label: '감정 공유 개방성', score: 75 },
  { label: '갈등 대화와 공동 해결', score: 58 },
  { label: '공동생활 조율 선호', score: 67 },
  { label: '가족 교류 선호', score: 42 },
  { label: '개인 시간과 자율성', score: 83 },
  { label: '미래 계획의 구체성', score: 58 },
] as const;

const previewOptions = ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'] as const;

export function MatchTestPromo() {
  return (
    <section className="bg-[#FFFDF8] py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[0.74fr_1.08fr_1.18fr] lg:items-stretch">
          <div className="flex flex-col justify-center py-2">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#E77678]">Relationship Test</p>
            <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-0.03em] text-[#175B35] sm:text-4xl">
              나와 맞는 사람은 어떤 사람일까요?
            </h2>
            <p className="mt-4 font-bold leading-7 text-[#405949] sm:text-lg">
              18가지 질문으로 나의 연애·결혼 관계 성향을 알아보세요.
            </p>
            <p className="mt-3 leading-7 text-[#607066]">
              감정 표현부터 갈등 대화, 생활 방식과 미래 계획까지 6가지 관계 성향을 살펴볼 수 있습니다.
            </p>
            <p className="mt-4 font-black text-[#E05D61]">회원가입 없이 결과를 확인할 수 있습니다.</p>
            <Link
              href="/match-test"
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#175B35] px-6 py-3 font-black text-white transition-colors hover:bg-[#104628] focus:outline-none focus:ring-4 focus:ring-[#175B35]/20 sm:w-auto"
            >
              매칭테스트 시작하기 <ArrowRight aria-hidden="true" size={19} />
            </Link>
          </div>

          <div className="rounded-[1.5rem] border border-[#E6EEDF] bg-white p-4 shadow-lg shadow-[#175B35]/5 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-[#F0F6ED] px-3 py-1.5 text-xs font-black text-[#175B35]">질문 예시</span>
              <span className="text-xs font-bold text-[#8A988E]">정적 미리보기</span>
            </div>
            <p className="mt-4 text-lg font-black leading-7 text-[#274936] sm:text-[1.35rem] sm:leading-8">
              마음이 힘들 때 연인에게 내 감정을 솔직하게 이야기하고 싶습니다.
            </p>
            <div className="mt-3.5 space-y-1.5" aria-label="5점 응답 형식 정적 미리보기">
              {previewOptions.map((option, index) => (
                <div key={option} className={`flex items-center gap-3 rounded-xl border px-4 py-2 text-sm font-bold ${index === 3 ? 'border-[#E77678] bg-[#FCEDEA] text-[#A94146]' : 'border-[#E5E9E3] text-[#69786E]'}`}>
                  <span className={`h-3 w-3 rounded-full border ${index === 3 ? 'border-[#E77678] bg-[#E77678]' : 'border-[#AAB5AD]'}`} />
                  {option}
                </div>
              ))}
            </div>
          </div>

          <figure className="rounded-[1.5rem] bg-[#F0F6ED] p-4 sm:p-5">
            <figcaption>
              <span className="text-lg font-black text-[#175B35]">가상 응답 결과 예시</span>
              <span className="mt-1 block text-xs font-bold text-[#718177]">6개 영역 · 0–100점</span>
            </figcaption>
            <div className="mt-4 space-y-2.5">
              {sampleDomainScores.map(({ label, score }) => (
                <div key={label}>
                  <div className="flex items-end justify-between gap-3">
                    <span className="min-w-0 text-sm font-bold leading-5 text-[#405949]">{label}</span>
                    <span className="shrink-0 text-sm font-black text-[#E05D61]">{score}점</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[#E77678]"
                      style={{ width: `${score}%` }}
                      role="img"
                      aria-label={`${label} 가상 예시 점수 ${score}점`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-[#175B35]/12 pt-3 text-xs leading-5 text-[#68786E]">
              화면 이해를 위한 가상 예시이며 실제 회원 통계·궁합 확률·추천 점수가 아닙니다.
            </p>
          </figure>
        </div>
      </div>
    </section>
  );
}

const journeySteps = [
  { number: '01', title: '회원가입', description: '간단한 정보로 시작', icon: UserRound },
  { number: '02', title: '프로필 작성', description: '나와 원하는 인연에 관한 정보 입력', icon: SlidersHorizontal },
  { number: '03', title: '조건 검색', description: '원하는 상대를 직접 탐색', icon: Search },
  { number: '04', title: '매칭 & 대화', description: '서로 연결되면 대화 시작', icon: MessagesSquare },
] as const;

export function ServiceJourney() {
  return (
    <section className="bg-[#FFFDF8] py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[1.75rem] border border-[#175B35]/10 bg-white shadow-lg shadow-[#175B35]/5 lg:grid-cols-[1.48fr_0.52fr]">
          <div className="px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#E77678]">How It Works</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#175B35] sm:text-4xl">이용방법은 간단합니다</h2>
              </div>
              <Link href="/how-to-use" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 font-black text-[#175B35] hover:bg-[#F0F6ED] focus:outline-none focus:ring-4 focus:ring-[#175B35]/15">
                자세히 보기 <ArrowRight aria-hidden="true" size={17} />
              </Link>
            </div>

            <ol className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {journeySteps.map(({ number, title, description, icon: Icon }, index) => (
                <li key={title} className="relative rounded-2xl bg-[#FFFDF8] px-3 py-5 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FCEDEA] text-[#E05D61]">
                    <Icon aria-hidden="true" size={23} strokeWidth={1.8} />
                  </span>
                  <p className="mt-3 text-xs font-black tracking-[0.14em] text-[#E77678]">{number}</p>
                  <h3 className="mt-1.5 font-black text-[#175B35]">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-[#607066]">{description}</p>
                  {index < journeySteps.length - 1 ? (
                    <ArrowRight aria-hidden="true" className="absolute -right-4 top-10 z-10 hidden text-[#E7A6A7] lg:block" size={20} />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="relative min-h-72 bg-[#F0F6ED] lg:min-h-full">
            <Image
              src="/images/landing/journey-sunset-couple.webp"
              alt="노을을 바라보며 함께 앉아 있는 커플"
              fill
              sizes="(min-width: 1024px) 34vw, 100vw"
              className="object-cover object-[68%_center]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const trustItems = [
  { title: '개인정보 보호', description: '개인정보처리방침에 따라 회원 정보를 관리합니다.', icon: LockKeyhole },
  { title: '신고 기능', description: '부적절한 프로필과 메시지를 서비스 안에서 신고할 수 있습니다.', icon: Flag },
  { title: '상호 매칭', description: '서로 관심이 연결된 뒤 대화를 시작할 수 있습니다.', icon: HeartHandshake },
  { title: '프로필·계정 관리', description: '내 정보와 계정을 직접 확인하고 관리할 수 있습니다.', icon: UserCog },
] as const;

export function TrustSafety() {
  return (
    <section className="bg-[#F0F6ED] py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <ShieldCheck aria-hidden="true" className="mx-auto text-[#E77678]" size={29} strokeWidth={1.8} />
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] text-[#175B35] sm:text-4xl">안전하고 신뢰할 수 있는 ComMatch</h2>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ title, description, icon: Icon }) => (
            <article key={title} className="flex gap-4 rounded-2xl border border-[#175B35]/12 bg-white/55 p-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#175B35] shadow-sm"><Icon aria-hidden="true" size={28} strokeWidth={1.8} /></span>
              <div>
                <h3 className="text-base font-black text-[#175B35] sm:text-lg">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#607066] sm:text-[0.95rem]">{description}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-5 text-center text-sm leading-6 text-[#607066]">
          자세한 내용은{' '}
          <Link href="/privacy" className="font-bold text-[#175B35] underline underline-offset-4">개인정보처리방침</Link>
          과{' '}
          <Link href="/terms" className="font-bold text-[#175B35] underline underline-offset-4">이용약관</Link>
          에서 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

export function FinalSignupCta() {
  return (
    <section className="relative isolate min-h-64 overflow-hidden bg-[#FCEDEA] px-4 py-11 sm:px-6 sm:py-14 lg:px-8">
      <Image
        src="/images/landing/cta-sunset-landscape.webp"
        alt="따뜻한 노을 아래 함께 걷는 두 사람"
        fill
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(255,253,248,0.97)_0%,rgba(255,253,248,0.9)_48%,rgba(255,253,248,0.25)_78%,rgba(255,253,248,0.08)_100%)]" />
      <div className="relative mx-auto max-w-7xl text-left text-[#175B35]">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#E05D61]">Start Your Story</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">지금, 좋은 인연을 시작해 보세요.</h2>
        <p className="mt-3 text-base font-medium text-[#53675A] sm:text-lg">ComMatch가 당신의 새로운 시작을 응원합니다.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#175B35] px-7 py-3 text-base font-black text-white transition-colors hover:bg-[#104628] focus:outline-none focus:ring-4 focus:ring-[#175B35]/20"
          >
            회원가입하기
          </Link>
          <Link
            href="/match-test"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#175B35]/25 bg-[#FFFDF8]/90 px-7 py-3 text-base font-black text-[#175B35] transition-colors hover:border-[#175B35] hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#175B35]/15"
          >
            매칭테스트 먼저하기
          </Link>
        </div>
        <p className="mt-3 text-sm font-bold text-[#6F625E]">현재 무료 이용</p>
      </div>
    </section>
  );
}
