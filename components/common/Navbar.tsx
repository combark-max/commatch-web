import Link from 'next/link';
import Button from '../ui/Button';

const Navbar = () => {
  return (
    <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="text-2xl font-bold text-green-600">
              ComMatch
            </Link>
          </div>
          <div className="hidden md:flex space-x-8 items-center">
            <Link href="#features" className="text-gray-600 hover:text-green-600 transition-colors">
              주요 기능
            </Link>
            <Link href="#about" className="text-gray-600 hover:text-green-600 transition-colors">
              서비스 소개
            </Link>
            <Link href="/login" className="text-gray-600 hover:text-green-600 transition-colors font-semibold">
              로그인
            </Link>
          </div>
          <div className="md:hidden">
            <button className="text-gray-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
