# ComMatch PROJECT_MASTER_PLAN

## 프로젝트 개요
- 프로젝트명: ComMatch
- 목표: AI 기반 셀프 매칭 플랫폼(MVP)
- 개발환경: VS Code + GitHub Copilot + ChatGPT(PM/QA)

---

## 개발 원칙 (고정)

1. 기능 정의
2. DB 설계
3. Supabase SQL 작성
4. RLS / Policy 설정
5. Copilot 구현
6. 브라우저 테스트
7. Supabase 데이터 확인
8. 오류 수정
9. Git Commit
10. 다음 STEP 진행

---

## 기술 스택

### Frontend
- Next.js (App Router)
- React
- TypeScript
- TailwindCSS

### Backend
- Supabase
  - Auth
  - Database
  - Storage
  - RLS

### 개발도구
- VS Code
- GitHub Copilot
- Git / GitHub
- ChatGPT Plus

---

# 현재 진행 현황

## 완료
- 회원가입 / 로그인 / 이메일 인증
- 프로필 작성
- 이상형 설정
- Dashboard
- 회원목록
- 회원상세
- 공통 네비게이션
- Dashboard 이동 버튼
- 로그인/로그아웃 UI 개선

## 진행중 (STEP7)
- 프로필 사진 업로드
- 관심회원(Favorites)
- 내정보 메뉴

## 예정
STEP8 : AI 추천
STEP9 : 매칭 요청
STEP10 : 채팅
STEP11 : 알림
STEP12 : 관리자
STEP13 : 배포

---

# Dashboard 기능

1. 내 프로필
2. 이상형 수정
3. 회원 둘러보기
4. 관심회원
5. AI 추천
6. 기타 관리 기능

모든 상세 화면 하단에는

- 이전 버튼
- 대시보드로 버튼

배치

---

# 네비게이션 규칙

## 로그인 전
- 홈
- 로그인

## 로그인 후
- 홈
- 내정보
- 로그아웃

### 내정보 드롭다운
- 대시보드
- 프로필 수정
- 이상형 수정

---

# 회원 조회 규칙

- 남성 회원 → 여성 회원만 표시
- 여성 회원 → 남성 회원만 표시
- 자기 자신은 제외

---

# 테스트 규칙

모든 기능은 아래 테스트를 통과해야 함.

1. 브라우저 동작 확인
2. Console 오류 없음
3. Supabase 데이터 확인
4. 새로고침 후 데이터 유지

---

# Git 규칙

구현
→ 테스트
→ 오류 수정
→ 재테스트
→ Commit

테스트 전 Commit 금지.

예시:

git add .

git commit -m "STEP7 완료"

git push

---

# 문서 구조

docs/

- PROJECT_MASTER_PLAN.md
- DATABASE.md
- TEST_CHECKLIST.md
- CHANGELOG.md

STEPS/

- STEP07_FAVORITES.md
- STEP08_AI_MATCH.md
- STEP09_MATCH_REQUEST.md

---

# 역할 분담

### ChatGPT
- PM
- 설계
- DB
- QA
- 테스트 절차
- 오류 분석
- 프로젝트 관리

### 사용자
- Copilot 실행
- VS Code 테스트
- Git 관리

---

최종 목표

ComMatch MVP 완성
→ Android / iOS 앱 확장
→ 실제 서비스 배포