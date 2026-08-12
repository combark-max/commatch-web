import { CircleHelp } from 'lucide-react';
import Footer from '@/components/common/Footer';
import { FAQ_ITEMS } from '@/lib/support/faq';

export default function FaqPage() {
  const categories = [...new Set(FAQ_ITEMS.map((item) => item.category))];

  return (
    <>
      <div className="bg-gray-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <header className="rounded-[2rem] border border-green-100 bg-white p-7 shadow-sm sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-700">
              <CircleHelp size={25} aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">자주 묻는 질문</h1>
            <p className="mt-3 leading-7 text-gray-600">ComMatch의 현재 기능과 이용 방법을 안내합니다.</p>
          </header>

          <div className="mt-8 space-y-8">
            {categories.map((category) => (
              <section key={category} aria-labelledby={`faq-${category}`}>
                <h2 id={`faq-${category}`} className="text-xl font-black text-gray-900">{category}</h2>
                <div className="mt-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                  {FAQ_ITEMS.filter((item) => item.category === category).map((item) => (
                    <details key={item.question} className="group border-b border-gray-100 last:border-b-0">
                      <summary className="cursor-pointer list-none px-5 py-5 font-bold text-gray-900 transition hover:bg-green-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 sm:px-6">
                        <span className="flex items-center justify-between gap-4">
                          <span>{item.question}</span>
                          <span className="text-xl font-medium text-green-700 transition group-open:rotate-45" aria-hidden="true">+</span>
                        </span>
                      </summary>
                      <p className="border-t border-gray-100 bg-gray-50/70 px-5 py-5 text-sm leading-7 text-gray-700 sm:px-6">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
