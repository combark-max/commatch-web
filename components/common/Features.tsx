import { Bot, ShieldCheck, Siren, Smartphone } from 'lucide-react';

const trustItems = [
  {
    title: '휴대폰 본인인증 회원',
    icon: Smartphone,
    status: '도입 예정',
  },
  {
    title: '개인정보 보호',
    icon: ShieldCheck,
  },
  {
    title: 'AI 추천 서비스',
    icon: Bot,
  },
  {
    title: '안전한 신고 시스템',
    icon: Siren,
    status: '준비 중',
  },
];

const Features = () => {
  return (
    <section aria-label="ComMatch 신뢰 서비스" className="border-y border-gray-100 bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map(({ title, icon: Icon, status }) => (
            <div
              key={title}
              className="flex min-h-28 items-center gap-4 rounded-xl border border-gray-200 bg-white p-5"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F4F8F4] text-[#2E7D32]">
                <Icon size={27} strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-base font-bold leading-6 text-gray-800 sm:text-lg">{title}</h2>
                {status ? (
                  <span className="mt-1 inline-block text-sm font-bold text-[#806B26]">{status}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
