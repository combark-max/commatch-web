import Link from 'next/link';

const footerItems = [
  { label: '회사소개', href: '/#about' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
  { label: '공지사항', href: '/notices' },
  { label: 'FAQ', href: '/faq' },
  { label: '문의하기' },
];

const Footer = () => {
  return (
    <footer className="border-t border-white/10 bg-[#183B1B] py-12 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/" className="text-2xl font-black text-white">
              ComMatch
            </Link>
            <p className="mt-3 text-base leading-7 text-white/70">
              직접 선택하고 AI의 도움을 받는 셀프 결혼정보 플랫폼
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            {footerItems.map((item) => item.href ? (
              <Link key={item.label} href={item.href} className="text-base font-semibold text-white/80 hover:text-white">
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="text-base font-semibold text-white/55" title="준비 중">
                {item.label}
                <span className="ml-1.5 text-sm text-[#E0C872]">준비 중</span>
              </span>
            ))}
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-sm text-white/55">
          © 2026 ComMatch. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
