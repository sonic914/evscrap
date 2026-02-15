# User Web (PWA) 로컬 개발 가이드

## 환경변수 설정

```bash
cd user-web
cp .env.example .env.local
```

`.env.local`에 아래 값을 채운다:

```env
VITE_API_BASE=https://yvowx0u2vf.execute-api.ap-northeast-2.amazonaws.com/prod/
VITE_COGNITO_USER_POOL_ID_USER=ap-northeast-2_7Krvybche
VITE_COGNITO_CLIENT_ID_USER=7msdn24vkvs0nqp95pc2dcsd1o
VITE_AWS_REGION=ap-northeast-2
```

> CDK Stack Outputs에서 `UserPoolId`, `UserPoolClientId`, `ApiUrl` 값을 사용

## 실행

```bash
npm install
npm run dev
# → http://localhost:5173
```

## 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 대시보드 (Health Check 버튼) |
| `/login` | 사용자 로그인 (Cognito User Pool) |
| `/cases` | 보호 라우트 — 케이스 등록 |

## 인증 흐름

1. `/login`에서 username/password 입력
2. Cognito User Pool(사용자용)에서 id_token 발급
3. `localStorage['user_id_token']`에 저장
4. `/cases` 접근 시 토큰 확인 → 없으면 `/login` 리다이렉트
5. API 호출 시 `Authorization: Bearer <token>` + `x-correlation-id` 자동 주입
6. 401 응답 시 토큰 삭제 + `/login` 이동

## 테스트 사용자

Cognito User Pool에 사용자를 생성해야 한다:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id ap-northeast-2_7Krvybche \
  --username "test@example.com" \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id ap-northeast-2_7Krvybche \
  --username "test@example.com" \
  --password "Evscrap2026!" \
  --permanent
```

## 빌드

```bash
npm run build
```
