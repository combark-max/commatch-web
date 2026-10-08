import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Compass,
  Flag,
  Heart,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
} from 'lucide-react';

const benefits = [
  { title: '내가 직접 선택', description: '조건과 가치관을 확인하고 원하는 상대를 직접 찾아보세요.', icon: Compass },
  { title: '가치관까지 확인', description: '프로필과 매칭 테스트를 통해 서로의 생각을 미리 확인할 수 있습니다.', icon: SlidersHorizontal },
  { title: '서로 관심이 있을 때 대화', description: '일방적인 소개가 아니라 서로 관심이 있을 때 대화가 시작됩니다.', icon: HeartHandshake },
];

export function LandingBenefits() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="grid gap-8 md:grid-cols-3 md:gap-10">
        {benefits.map(({ title, description, icon: Icon }) => (
          <article key={title} className="flex gap-4 md:block">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EDF5ED] text-[#2E7D32]">
              <Icon aria-hidden="true" size={25} strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-xl font-black text-[#183B1B] md:mt-5">{title}</h2>
              <p className="mt-2 text-[15px] leading-7 text-gray-600 sm:text-base">{description}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function MatchTestPromo() {
  return (
    <section className="bg-[#183B1B] py-16 text-white sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#E0C872]">Match Test</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">나는 어떤 사람과 잘 맞을까?</h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">10개의 간단한 질문으로 나의 결혼 매칭 성향을 알아보세요.</p>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="매칭 테스트 정보">
            {['약 1분', '10문항', '회원가입 없이 이용 가능'].map((item) => (
              <li key={item} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white/90">{item}</li>
            ))}
          </ul>
          <Link href="/match-test" className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-black text-[#183B1B] transition-colors hover:bg-[#F4F8F4] focus:outline-none focus:ring-4 focus:ring-white/25 sm:w-auto sm:text-lg">
            1분 매칭 테스트 시작 <ArrowRight aria-hidden="true" size={20} />
          </Link>
        </div>

        <div className="rounded-[2rem] bg-white p-6 text-gray-900 shadow-lg shadow-black/10 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <span className="rounded-full bg-[#EDF5ED] px-3 py-1.5 text-sm font-black text-[#2E7D32]">가치관</span>
            <span className="text-sm font-bold text-gray-500">미리보기</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full w-2/5 rounded-full bg-[#C8A951]" /></div>
          <p className="mt-7 text-2xl font-black leading-9 text-[#183B1B]">데이트에서 더 중요한 것은?</p>
          <div className="mt-6 space-y-3" aria-label="매칭 테스트 정적 미리보기">
            {['편안한 대화', '새로운 경험'].map((option, index) => (
              <div key={option} className={`flex min-h-14 items-center justify-between rounded-xl border-2 px-5 py-4 font-bold ${index === 0 ? 'border-[#2E7D32] bg-[#F4F8F4] text-[#183B1B]' : 'border-gray-200 text-gray-600'}`}>
                <span>{option}</span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${index === 0 ? 'border-[#2E7D32] bg-[#2E7D32] text-white' : 'border-gray-300'}`}>
                  {index === 0 ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const serviceSteps = [
  { number: '01', title: '상대 찾기' },
  { number: '02', title: '프로필 확인' },
  { number: '03', title: '서로 관심 확인' },
  { number: '04', title: '대화 시작' },
];

function MemberSearchPreview() {
  return (
    <div className="rounded-2xl bg-[#F4F8F4] p-4">
      <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-gray-400"><Search aria-hidden="true" size={14} /> 조건으로 상대 찾기</div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-white p-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DDEBDD] font-black text-[#2E7D32]">예</span>
        <div className="min-w-0"><p className="font-bold text-gray-800">예시 회원 · 38세</p><p className="mt-1 text-xs text-gray-500">서울 · 기획 직군</p></div>
        <Heart aria-hidden="true" className="ml-auto text-[#B28A2E]" size={19} />
      </div>
    </div>
  );
}

function ProfilePreview() {
  return (
    <div className="space-y-3 rounded-2xl bg-[#F4F8F4] p-4 text-sm">
      <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold text-[#806B26]">자기소개</p><p className="mt-1.5 leading-6 text-gray-600">대화와 배려를 중요하게 생각해요.</p></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white p-3"><b className="block text-xs text-gray-800">관심사</b><span className="mt-1 block text-xs text-gray-500">산책과 전시</span></div>
        <div className="rounded-xl bg-white p-3"><b className="block text-xs text-gray-800">결혼 가치관</b><span className="mt-1 block text-xs text-gray-500">함께 조율하기</span></div>
      </div>
    </div>
  );
}

function MatchPreview() {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl bg-[#F4F8F4] p-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#2E7D32] shadow-sm"><HeartHandshake aria-hidden="true" size={31} /></span>
      <p className="mt-4 font-black text-[#183B1B]">서로 관심을 확인했어요</p>
      <p className="mt-1 text-xs text-gray-500">이제 편안하게 대화를 시작해보세요.</p>
    </div>
  );
}

function ChatPreview() {
  return (
    <div className="space-y-3 rounded-2xl bg-[#F4F8F4] p-4 text-xs leading-5">
      <p className="mr-8 rounded-2xl rounded-bl-md bg-white px-3 py-2.5 text-gray-600">안녕하세요. 프로필의 여행 이야기가 인상적이었어요.</p>
      <p className="ml-8 rounded-2xl rounded-br-md bg-[#2E7D32] px-3 py-2.5 text-white">반가워요. 천천히 이야기 나눠봐요.</p>
    </div>
  );
}

const servicePreviews = [MemberSearchPreview, ProfilePreview, MatchPreview, ChatPreview];

export function ServiceJourney() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#806B26]">How ComMatch Works</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">직접 찾고, 서로 선택하고, 대화를 시작하세요.</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {serviceSteps.map(({ number, title }, index) => {
            const Preview = servicePreviews[index];
            return (
              <article key={title} className="rounded-[1.75rem] border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-[#183B1B]">{number} {title}</h3>
                  <span className="rounded-full bg-[#F4F8F4] px-2.5 py-1 text-[11px] font-bold text-[#2E7D32]">서비스 화면 예시</span>
                </div>
                <div className="mt-5"><Preview /></div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function MatchingComparison() {
  return (
    <section className="bg-[#F4F8F4] py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-[1.75rem] bg-white/70 p-6 sm:p-8">
            <h2 className="text-xl font-black text-gray-700 sm:text-2xl">일반적인 소개 방식</h2>
            <ol className="mt-6 space-y-4 text-gray-600">
              {['상담', '추천 기다리기', '소개받기'].map((item, index) => <li key={item} className="flex items-center gap-3"><span className="text-sm font-black text-gray-400">0{index + 1}</span><span className="font-bold">{item}</span></li>)}
            </ol>
          </article>
          <article className="rounded-[1.75rem] bg-[#183B1B] p-6 text-white sm:p-8">
            <h2 className="text-xl font-black sm:text-2xl">ComMatch 셀프매칭</h2>
            <ol className="mt-6 grid gap-4 sm:grid-cols-2">
              {['직접 검색', '프로필과 가치관 확인', '관심 표현', '상호 매칭'].map((item, index) => <li key={item} className="flex items-center gap-3"><span className="text-sm font-black text-[#E0C872]">0{index + 1}</span><span className="font-bold text-white/90">{item}</span></li>)}
            </ol>
          </article>
        </div>
        <p className="mx-auto mt-9 max-w-3xl text-center text-2xl font-black leading-9 text-[#183B1B] sm:text-3xl sm:leading-10">내 결혼 상대를 가장 잘 아는 사람은 결국 나 자신입니다.</p>
      </div>
    </section>
  );
}

const trustItems = [
  { title: '개인정보 보호', description: '회원 정보는 서비스 제공에 필요한 범위에서 처리하고 접근 권한을 제한합니다.', icon: LockKeyhole },
  { title: '상호 매칭', description: '두 회원이 서로 좋아요를 보낸 경우에만 매칭이 만들어지고 대화를 시작할 수 있습니다.', icon: HeartHandshake },
  { title: '신고 기능', description: '부적절한 프로필과 메시지는 서비스 안에서 신고할 수 있습니다.', icon: Flag },
  { title: '프로필·계정 관리', description: '내 프로필과 계정 정보를 직접 확인하고 수정할 수 있습니다.', icon: UserCog },
];

export function TrustSafety() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EDF5ED] text-[#2E7D32]"><ShieldCheck aria-hidden="true" size={26} /></span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">신뢰할 수 있는 만남을 위한 기본</h2>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ title, description, icon: Icon }) => (
            <article key={title} className="border-t-2 border-[#2E7D32]/20 pt-5">
              <Icon aria-hidden="true" className="text-[#2E7D32]" size={24} />
              <h3 className="mt-4 text-lg font-black text-gray-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const usageSteps = [
  { title: '회원가입', description: '이메일로 간단하게 시작하세요.', icon: UserRound },
  { title: '프로필 작성', description: '나를 보여줄 정보와 가치관을 작성하세요.', icon: SlidersHorizontal },
  { title: '상대 찾기', description: '조건을 살펴보고 원하는 상대를 찾아보세요.', icon: Search },
  { title: '매칭 & 대화', description: '서로 좋아요가 확인되면 대화를 시작하세요.', icon: MessagesSquare },
];

export function LandingHowToUse() {
  return (
    <section id="how-it-works" className="bg-[#F4F8F4] py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#806B26]">Simple Steps</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-[#183B1B] sm:text-4xl">ComMatch 시작하기</h2>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {usageSteps.map(({ title, description, icon: Icon }, index) => (
            <li key={title} className="rounded-2xl bg-white p-6 shadow-sm shadow-green-950/5">
              <div className="flex items-center justify-between"><span className="text-sm font-black text-[#806B26]">{index + 1}</span><Icon aria-hidden="true" className="text-[#2E7D32]" size={24} /></div>
              <h3 className="mt-5 text-xl font-black text-[#183B1B]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <Link href="/how-to-use" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-5 py-3 font-bold text-[#2E7D32] hover:bg-white hover:text-[#245F28] focus:outline-none focus:ring-4 focus:ring-[#2E7D32]/15">
            자세한 이용방법 보기 <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FinalMatchCta() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-[#183B1B] px-6 py-12 text-center text-white sm:px-10 sm:py-16">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-[#E0C872]"><MessageCircle aria-hidden="true" size={25} /></span>
        <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">좋은 인연을 기다리기만 하지 마세요.</h2>
        <p className="mt-4 text-lg text-white/75 sm:text-xl">내가 원하는 상대를 직접 찾아보세요.</p>
        <Link href="/match-test" className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-black text-[#183B1B] transition-colors hover:bg-[#F4F8F4] focus:outline-none focus:ring-4 focus:ring-white/25 sm:w-auto sm:text-lg">
          내 매칭 성향 알아보기 <ArrowRight aria-hidden="true" size={20} />
        </Link>
        <p className="mt-4 text-sm font-bold text-[#E0C872]">현재 무료 이용</p>
      </div>
    </section>
  );
}
