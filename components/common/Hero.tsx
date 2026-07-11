import Link from 'next/link';
import Button from '../ui/Button';

const Hero = () => {
  return (
    <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 tracking-tight mb-6">
          AI와 함께하는 스마트한 <br />
          <span className="text-green-600">셀프 매칭 서비스, ComMatch</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          복잡한 과정 없이 AI가 당신에게 가장 적합한 상대를 찾아드립니다.
          지금 바로 ComMatch에서 새로운 만남을 시작해보세요.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link href="/login" className="w-full sm:w-auto">
            <Button size="lg" className="w-full">
              무료로 시작하기
            </Button>
          </Link>
          <Button variant="outline" size="lg">
            더 알아보기
          </Button>
        </div>
        <div className="mt-16 relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-gray-100"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
