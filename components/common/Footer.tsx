import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-white border-t border-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-6 md:mb-0">
            <Link href="/" className="text-2xl font-bold text-green-600">
              ComMatch
            </Link>
            <p className="mt-2 text-gray-500 text-sm">
              © 2024 ComMatch Inc. All rights reserved.
            </p>
          </div>
          <div className="flex space-x-6">
            <Link href="#" className="text-gray-400 hover:text-green-600 transition-colors">
              이용약관
            </Link>
            <Link href="#" className="text-gray-400 hover:text-green-600 transition-colors">
              개인정보처리방침
            </Link>
            <Link href="#" className="text-gray-400 hover:text-green-600 transition-colors">
              문의하기
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
