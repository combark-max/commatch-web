# ComMatch Project Rules

## 프로젝트 정보

프로젝트명 : ComMatch

목적 :
AI 기반 셀프 매칭 서비스(Web + Mobile)

현재 기술스택

- Next.js(App Router)
- TypeScript
- Tailwind CSS
- Supabase(Auth + Database)
- React Hook Form
- Zod

---

# 개발 원칙

기존 프로젝트 구조를 절대 변경하지 않는다.

불필요한 리팩토링을 하지 않는다.

기존 UI 디자인을 유지한다.

TypeScript 오류가 발생하지 않도록 작성한다.

기존 코딩 스타일을 유지한다.

기능 하나만 수정한다.

여러 파일을 동시에 수정하지 않는다.
(필요한 경우만 수정)

---

# 현재 폴더 구조

app/

(auth)

(main)

components/

constants/

lib/

public/

---

# Supabase

Authentication 사용

Database 사용

Storage는 아직 사용하지 않음

Realtime 아직 사용하지 않음

---

# 현재 테이블

profiles

preferences

---

# profiles 컬럼

id

nickname

gender

birth_date

height

region

job

education

hobby

drinking

introduction

※ profile_image 컬럼은 아직 존재하지 않는다.

---

# preferences 컬럼

user_id

preferred_gender

age_min

age_max

height_min

height_max

preferred_job

preferred_region

introduction

---

# 현재 완료 기능

회원가입

로그인

이메일 인증

프로필 생성

프로필 수정

이상형 등록

이상형 수정

Dashboard

회원목록

---

# 앞으로 개발할 기능

회원 상세

프로필 사진

좋아요

AI 추천

매칭

채팅

알림

결제

관리자

---

# UI 규칙

Tailwind CSS 사용

기존 색상 유지

기존 Button 사용

기존 Toast 사용

반응형 유지

Card 디자인 유지

---

# 금지사항

존재하지 않는 컬럼 사용 금지

존재하지 않는 테이블 생성 금지

기존 Supabase 구조 변경 금지

기존 Navigation 변경 금지

불필요한 라이브러리 추가 금지

---

# 코드 작성 규칙

코드는 최대한 단순하게 작성한다.

재사용 가능한 코드를 작성한다.

에러 처리를 반드시 포함한다.

Loading 상태를 구현한다.

빈 데이터 처리(empty state)를 구현한다.

TypeScript 타입을 유지한다.

---

# Copilot 응답 규칙

기존 프로젝트를 먼저 분석한 후 코드를 작성한다.

수정한 파일을 먼저 알려준다.

왜 수정했는지 설명한다.

필요 이상의 리팩토링은 하지 않는다.

기존 구조를 유지한다.

항상 ComMatch 프로젝트의 규칙을 따른다.
