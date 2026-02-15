# 프론트엔드 부트스트랩 가이드

## 구조

```
admin-web/     — 관리자 웹 (Next.js, App Router)
user-web/      — 사용자 PWA (Vite + React)
shared/api-client/ — 공용 API 클라이언트 (@evscrap/api-client)
```

## 사전 조건

- Node.js 22+
- `shared/api-client`에 생성된 `openapi-types.ts` 최신 상태

## api-client 타입 재생성

```bash
cd shared/api-client && npm ci && npm run generate:openapi
```

## admin-web 실행

```bash
cd admin-web
cp .env.example .env.local    # 환경변수 설정
npm install
npm run dev                   # http://localhost:3000
```

### 필요 환경변수 (admin-web/.env.local)

| 변수 | 설명 |
|------|------|
| NEXT_PUBLIC_API_BASE | API Gateway URL (e.g. `https://xxx.execute-api.../prod/`) |
| NEXT_PUBLIC_COGNITO_USER_POOL_ID_ADMIN | Admin Cognito Pool ID |
| NEXT_PUBLIC_COGNITO_CLIENT_ID_ADMIN | Admin Cognito Client ID |

## user-web 실행

```bash
cd user-web
cp .env.example .env.local    # 환경변수 설정
npm install
npm run dev                   # http://localhost:5173
```

### 필요 환경변수 (user-web/.env.local)

| 변수 | 설명 |
|------|------|
| VITE_API_BASE | API Gateway URL |
| VITE_COGNITO_USER_POOL_ID_USER | User Cognito Pool ID |
| VITE_COGNITO_CLIENT_ID_USER | User Cognito Client ID |

## 환경변수 자동 생성 (선택)

CDK Outputs에서 자동으로 .env.local 파일 생성:

```bash
node scripts/gen-frontend-env.mjs
```

## CI

- `frontend-build.yml`: admin-web + user-web 빌드 체크 (push/PR)
- `openapi-check.yml`: OpenAPI 타입 최신성 체크
