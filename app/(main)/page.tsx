import Hero from "@/components/common/Hero";
import Features from "@/components/common/Features";
import Footer from "@/components/common/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-grow">
        <Hero />
        <Features />
        <section id="about" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">
                  데이터가 말해주는 <br />
                  <span className="text-green-600">완벽한 조화</span>
                </h2>
                <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                  ComMatch는 단순한 매칭을 넘어, 가치관, 생활 습관, 그리고 취미까지
                  고려한 입체적인 분석을 제공합니다.
                  당신의 삶에 긍정적인 변화를 줄 수 있는 특별한 관계를 만들어보세요.
                </p>
                <ul className="space-y-4">
                  {[
                    "심층 가치관 분석 알고리즘",
                    "실시간 매칭 상태 알림",
                    "프라이버시 중심의 매칭 프로세스"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center text-gray-700">
                      <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 bg-green-50 rounded-3xl p-8 aspect-square flex items-center justify-center">
                {/* Image placeholder or decoration */}
                <div className="text-green-600 font-bold text-xl opacity-50 border-4 border-dashed border-green-200 rounded-2xl p-12 text-center">
                  이미지 또는 <br />그래픽 요소 위치
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
