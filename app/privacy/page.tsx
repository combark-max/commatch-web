import type { Metadata } from 'next';
import Footer from '@/components/common/Footer';

export const metadata: Metadata = {
  title: 'ComMatch 개인정보처리방침',
  description: 'ComMatch 서비스의 개인정보 처리 목적과 항목을 안내합니다.',
};

const PROFILE_ITEMS = [
  '닉네임',
  '성별',
  '생년월일',
  '키',
  '지역',
  '직업',
  '학력',
  '취미',
  '음주 여부',
  '흡연 여부',
  '결혼 이력',
  '자기소개',
  '결혼에 대한 가치관',
  '프로필 이미지',
] as const;

const PURPOSES = [
  '회원가입, 인증 및 계정 관리',
  '회원 프로필 작성·표시·관리',
  '선호조건 저장과 회원 탐색·추천 지원',
  '관심 표시, 매칭 및 회원 간 연결',
  '메시지 제공과 대화 상태 관리',
  '신고 접수, 분쟁 대응 및 회원 보호',
  'Premium 상태와 기능 이용 권한 관리',
  '이용약관, 개인정보 수집·이용 및 성인 확인 이력 관리',
  '서비스 운영, 장애 대응, 부정 이용 방지 및 보안',
] as const;

const BulletList = ({ items }: { items: readonly string[] }) => (
  <ul className="mt-3 grid gap-x-6 gap-y-2 text-[15px] leading-7 text-gray-700 sm:grid-cols-2">
    {items.map((item) => <li key={item}>• {item}</li>)}
  </ul>
);

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <article className="mx-auto max-w-4xl rounded-3xl border border-gray-100 bg-white px-6 py-9 shadow-sm sm:px-10 sm:py-12">
          <header className="border-b border-gray-200 pb-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">Privacy</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">ComMatch 개인정보처리방침</h1>
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600">
              <div className="flex gap-2"><dt className="font-semibold text-gray-800">버전</dt><dd>1.0</dd></div>
              <div className="flex gap-2"><dt className="font-semibold text-gray-800">시행일</dt><dd>추후 확정</dd></div>
            </dl>
          </header>

          <div className="mt-10 space-y-10 text-[15px] leading-7 text-gray-700">
            <section>
              <h2 className="text-xl font-black text-gray-900">1. 개인정보 처리 목적</h2>
              <p className="mt-4">ComMatch는 다음 목적을 위하여 필요한 범위에서 개인정보를 처리합니다.</p>
              <BulletList items={PURPOSES} />
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">2. 처리하는 개인정보</h2>
              <div className="mt-5 space-y-6">
                <div>
                  <h3 className="font-bold text-gray-900">회원가입 및 계정관리</h3>
                  <BulletList items={['이메일 주소', '내부 회원 식별정보']} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">프로필</h3>
                  <BulletList items={PROFILE_ITEMS} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">선호조건</h3>
                  <p className="mt-2">희망 연령, 희망 키, 선호 지역, 선호 직업 및 추가 소개 등 회원이 설정한 상대방 선호정보</p>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">서비스 이용정보</h3>
                  <BulletList items={[
                    '관심 등록 및 관심 수신 정보',
                    '매칭 및 메시지 정보',
                    '신고 내용과 운영 처리 정보',
                    'Premium 상태와 기능 권한 정보',
                    '이용약관·개인정보·성인 확인 동의 이력',
                    '로그인 세션, 접속 및 서비스 보안에 필요한 정보',
                  ]} />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">3. 개인정보의 보유·이용 기간</h2>
              <p className="mt-4">
                개인정보는 회원탈퇴 또는 처리 목적 달성 시까지 보유·이용하는 것을 원칙으로 하며,
                신고·안전 관련 기록 및 동의 이력 등 필요한 정보는 관련 법령, 서비스 안전, 분쟁 대응 또는
                동의 사실 증빙에 필요한 기간 동안 별도로 보관할 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">4. 개인정보의 제3자 제공</h2>
              <p className="mt-4">
                ComMatch는 회원의 개인정보를 고지한 목적 범위에서 처리하며, 회원의 별도 동의가 있거나
                관련 법령에 근거가 있는 경우를 제외하고 제3자에게 제공하지 않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">5. 처리위탁 및 국외이전</h2>
              <p className="mt-4">
                서비스 운영을 위하여 외부 서비스가 이용될 수 있습니다. 외부 서비스 제공자 및 국외이전 관련
                세부사항은 실제 운영환경 확정 후 반영합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">6. 개인정보의 파기</h2>
              <p className="mt-4">
                개인정보가 불필요하게 된 경우 관련 법령과 내부 절차에 따라 복구 또는 재생하기 어려운 방법으로
                파기합니다. 별도 보관이 필요한 정보는 다른 개인정보와 분리하여 관리할 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">7. 회원의 권리와 행사방법</h2>
              <p className="mt-4">
                회원은 서비스가 제공하는 기능을 통하여 자신의 프로필을 확인·수정하고 계정 탈퇴를 요청할 수
                있습니다. 법령이 정한 범위에서 개인정보 열람, 정정, 삭제 또는 처리정지를 요청할 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">8. 쿠키 및 브라우저 저장정보</h2>
              <p className="mt-4">
                ComMatch는 로그인과 인증 세션 유지, 보안 및 화면 기능 제공을 위하여 필요한 쿠키 또는 브라우저
                저장정보를 사용할 수 있습니다. 브라우저 설정에서 저장을 제한할 수 있으나 일부 기능 이용이
                어려워질 수 있습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">9. 개인정보의 안전성 확보조치</h2>
              <p className="mt-4">
                ComMatch는 접근 권한 관리, 인증과 세션 보호, 기록 관리 및 서비스 보안 점검 등 개인정보 보호에
                필요한 기술적·관리적 조치를 마련하도록 노력합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">10. 만 19세 미만 이용 제한</h2>
              <p className="mt-4">
                ComMatch는 만 19세 이상 성인을 대상으로 하며, 만 19세 미만은 가입하거나 서비스를 이용할 수
                없습니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">11. 개인정보 보호책임자</h2>
              <dl className="mt-4 space-y-2 rounded-2xl bg-gray-50 p-5">
                <div className="flex flex-wrap gap-2"><dt className="font-bold text-gray-900">개인정보 보호책임자:</dt><dd>[확정 필요]</dd></div>
                <div className="flex flex-wrap gap-2"><dt className="font-bold text-gray-900">이메일:</dt><dd>[확정 필요]</dd></div>
              </dl>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">12. 개인정보처리방침의 변경</h2>
              <p className="mt-4">
                이 방침의 내용이 변경되는 경우 적용 내용과 시점을 서비스 화면 등 적절한 방법으로 안내합니다.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-gray-900">13. 부칙</h2>
              <ul className="mt-4 space-y-2">
                <li>1. 이 개인정보처리방침의 버전은 1.0입니다.</li>
                <li>2. 이 개인정보처리방침의 시행일은 추후 확정합니다.</li>
              </ul>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
