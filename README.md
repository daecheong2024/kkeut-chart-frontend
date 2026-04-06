# KKEUT Chart – Frontend (Vite + React + TypeScript)

프론트만 먼저 빠르게 만들기 위한 **차트 UI 골격** 프로젝트입니다.
- Back-end: **C#** (추후 연결)
- Front-end: **TypeScript + React** (현재 프로젝트)

## 실행
```bash
npm install
npm run dev
```

## 환경변수
`.env`를 만들어 아래를 설정하세요.
- `VITE_API_BASE_URL` : C# API base url (예: http://localhost:5000)
- `VITE_USE_MOCK` : `true`면 mock 데이터로 UI 구동 (백엔드 없이 동작)

예시:
```bash
cp .env.example .env
```

## 구조(핵심)
- **절대 하드코딩 최소화**: UI가 설정(config) 기반으로 동작하도록 설계
- `src/stores/useSettingsStore.ts` : 지점/예약 컬럼/카테고리/표시방식 등 설정(추후 백엔드에서 로드)
- `src/services/scheduleService.ts` : 예약/접수/완료 목록 fetch(현재 mock / 추후 API)

## 다음 단계(권장)
- C# API 최소 스펙부터 붙이기
  - `/auth/login`
  - `/settings` (지점/컬럼/카테고리/주기 등)
  - `/appointments` (조회/변경/취소)
- 장비 연동은 백엔드 진행하면서 프론트는 통합 UI 유지
