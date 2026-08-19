import {
  HeartHandshake,
  LockKeyhole,
  MailCheck,
  MessagesSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

const trustItems = [
  {
    title: '이메일 인증·성인 확인',
    detail:
      '가입자는 이메일 인증을 완료하고 필수 약관 동의와 만 19세 이상 여부를 직접 확인합니다. PASS 휴대폰 본인인증은 현재 도입 전입니다.',
    icon: MailCheck,
  },
  {
    title: '프로필·선호조건 맞춤 추천',
    detail:
      '희망 연령·키·지역·직업 등의 조건 일치도를 기준으로 추천 이유를 제공합니다. Premium 확대 추천에서는 더 많은 후보와 상세 일치 정보를 확인할 수 있습니다.',
    icon: Sparkles,
  },
  {
    title: '상호 호감 매칭',
    detail:
      '관심목록 저장과 좋아요는 서로 다른 기능입니다. 두 회원이 서로 좋아요를 보내면 매칭이 생성되고 대화를 시작할 수 있습니다.',
    icon: HeartHandshake,
  },
  {
    title: '매칭 알림과 실시간 채팅',
    detail:
      '새 매칭은 서비스 내 알림에서 확인할 수 있으며, 매칭된 회원끼리 실시간 채팅과 메시지 읽음 상태를 이용할 수 있습니다.',
    icon: MessagesSquare,
  },
  {
    title: '개인정보 보호',
    detail:
      '회원 정보는 서비스 목적에 필요한 범위에서 처리하며, 프로필·매칭·메시지·신고 데이터 접근을 인증 및 권한 정책으로 제한합니다.',
    icon: LockKeyhole,
  },
  {
    title: '신고와 운영자 조치',
    detail:
      '프로필이나 메시지를 신고할 수 있으며, 운영자는 신고를 확인해 처리 상태를 관리하고 필요한 경우 회원 이용 제한이나 프로필 노출 숨김 등의 조치를 할 수 있습니다.',
    icon: ShieldAlert,
  },
];

const Features = () => {
  return (
    <section aria-label="ComMatch 신뢰 서비스" className="border-y border-gray-100 bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trustItems.map(({ title, detail, icon: Icon }) => (
            <article
              key={title}
              className="flex h-full flex-col items-start rounded-2xl border border-gray-200 bg-white p-5"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F4F8F4] text-[#2E7D32]">
                <Icon aria-hidden="true" size={27} strokeWidth={1.8} />
              </span>
              <h2 className="mt-4 text-base font-bold leading-6 text-gray-900 sm:text-lg">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-700">{detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
