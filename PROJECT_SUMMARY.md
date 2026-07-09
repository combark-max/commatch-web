# ComMatch (commatch-web) 프로젝트 요약

## 1. 프로젝트 개요
- 이름: ComMatch
- 경로: commatch-web/
- 목적: 매칭 서비스 웹 프론트엔드(Next.js 기반)로 보이며, 인증, 프로필, 매칭, 결제 관련 모듈을 포함합니다.

## 2. 기술 스택(추정)
- 프레임워크: Next.js (App Router 사용, `app/` 디렉터리 존재)
- 언어: TypeScript
- 스타일: PostCSS/Tailwind 가능성 (`postcss.config.mjs`, `globals.css`)
- 인증/백엔드 연동: Supabase (lib/supabase 클라이언트 존재)

## 3. 주요 디렉터리 및 역할
- `app/` : Next.js App Router 기반의 페이지/라우트 구성
  - `(auth)/` : 인증 관련 페이지 (login, signup, verified, verify-email)
  - `(main)/` : 메인 애플리케이션(대시보드, 회원, 설정, 프로필 생성 등)
  - `admin/`, `api/` : 관리자 및 API 엔드포인트(폴더 존재)
- `components/` : UI 및 도메인 컴포넌트
  - `common/` : `Hero.tsx`, `Footer.tsx`, `Navbar.tsx`, `Features.tsx` 등 공통 컴포넌트
  - `ui/` : 재사용 가능한 UI 요소 (`Button.tsx`, `Toast.tsx`)
  - `profile/`, `matching/`, `payment/`, `auth/` 등 도메인별 컴포넌트 인덱스
- `lib/` : 클라이언트/서비스 초기화 및 유틸
  - `supabase/` : Supabase 클라이언트 및 래퍼
  - `auth/` : 인증 관련 유틸
- `services/` : 도메인 서비스(비즈니스 로직 호출용 래퍼)
- `hooks/` : 커스텀 훅
- `constants/` : `jobs.ts`, `regions.ts` 등 상수
- `types/` : 전역 타입 정의
- `public/` : 정적 자원 (이미지, 아이콘 등)

## 4. 라우팅(주요 페이지 매핑)
- 인증 관련
  - `app/(auth)/login/page.tsx` → 로그인
  - `app/(auth)/signup/page.tsx` → 회원가입
  - `app/(auth)/verified/page.tsx` → 인증 완료 페이지
  - `app/(auth)/verify-email/page.tsx` → 이메일 인증
- 메인/유저 플로우
  - `app/(main)/page.tsx` → 메인 랜딩
  - `app/(main)/dashboard/page.tsx` → 대시보드
  - `app/(main)/members/page.tsx` → 멤버 목록/관리
  - `app/(main)/preference/page.tsx` → 선호도 설정
  - `app/(main)/profile/create/page.tsx` → 프로필 생성

## 5. 주요 파일/모듈 (핵심 포인트)
- `package.json` : 의존성 및 스크립트
- `next.config.ts` / `next-env.d.ts` : Next 설정 및 타입
- `postcss.config.mjs`, `globals.css` : 스타일/글로벌 CSS
- `lib/supabase/client.ts` : Supabase 초기화 (백엔드 연동 지점)
- `components/ui/Button.tsx`, `components/ui/Toast.tsx` : 공통 UI 컴포넌트

## 6. 실행(일반 안내)
1. 의존성 설치: `npm install` 또는 `pnpm install` 등
2. 개발 서버: 일반적으로 `npm run dev`
(프로젝트의 `package.json` 스크립트를 확인하세요.)

## 7. 개선/확인 포인트(검토 권장)
- `package.json`의 `scripts` 확인: 실제 시작 스크립트 확인 필요
- 환경 변수 및 Supabase 키 관리 위치 확인 (`.env` 혹은 환경 구성)
- 라우트 중 동적 라우팅이나 서버 액션 사용 유무 확인
- 테스트/CI 관련 설정(존재 시 문서 업데이트 권장)

## 8. 파일 참고 링크
- 레포트 파일 위치: [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
- 주요 코드 위치 예시:
  - [app/](app/)
  - [components/ui/Button.tsx](components/ui/Button.tsx)
  - [lib/supabase/client.ts](lib/supabase/client.ts)

---
원하시면 이 파일을 기반으로 더 상세한 문서(라우트 트리, 컴포넌트 인벤토리, 의존성 목록 등)를 생성해 드리겠습니다.
