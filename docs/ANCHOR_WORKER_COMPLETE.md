# 🎯 Anchor Worker - 최종 상태 및 마지막 테스트

## ✅ 해결한 모든 문제들

### 1. Lambda 번들링 문제 (ImportModuleError)

- **문제**: `node_modules`와 Prisma Client가 Lambda 패키지에 없음
- **해결**: 번들링 스크립트 (`scripts/bundle-lambda.js`) 생성
- **결과**: 223개 패키지 포함된 Lambda 번들 생성

### 2. JSON 파싱 문제

- **문제**: PowerShell → AWS CLI 전달 시 JSON 따옴표 제거
  - 전송: `{eventId:test...}` ❌
- **해결**: `--cli-input-json file://` 방식 사용
  - 전송: `{"eventId":"test..."}` ✅

### 3. Prisma 바이너리 타겟 문제

- **문제**: Windows용 Prisma Client가 Lambda(Linux)에서 실행 불가
  - 에러: `required "rhel-openssl-3.0.x"`
- **해결**: `schema.prisma`에 `binaryTargets = ["native", "rhel-openssl-3.0.x"]` 추가

### 4. DATABASE_URL 환경변수 누락

- **문제**: Lambda에 `DATABASE_URL` 없음
- **해결**: CDK에서 환경변수 추가
  ```typescript
  DATABASE_URL: `postgresql://evscrap_admin@${dbProxy.endpoint}:5432/evscrap`;
  ```

## 📊 최신 테스트 결과

**Event ID:** `test-event-20260206233857`  
**실행 시간:** 395ms  
**메모리 사용:** 92MB / 512MB  
**상태:** ⚠️ 추가 확인 필요

CLI 로그가 잘려서 전체 에러를 확인할 수 없습니다.

## 🔍 CloudWatch에서 확인할 사항

[CloudWatch Logs Console](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fevscrap-anchor-worker)

**최신 로그 스트림:** `2026/02/06/[$LATEST]96bdca67bf6e4bfc976c5b1a91a66a42`  
**시간:** `14:38:59 UTC` (23:38:59 한국시간)

### 예상 시나리오

#### ✅ 성공 케이스

```
[AnchorWorker] Received 1 message(s)
[AnchorWorker] Processing eventId: test-event-20260206233857
[ProcessEvent] Starting: test-event-20260206233857
[ProcessEvent] Event not found: test-event-20260206233857
[AnchorWorker] Batch processing complete
```

→ "Event not found"는 정상 (테스트 ID가 DB에 없음)

#### ❌ 실패 케이스

가능한 에러들:

1. **DB 연결 실패**: RDS Proxy 연결 문제 또는 보안 그룹 설정
2. **인증 실패**: `evscrap_admin` 사용자 또는 비밀번호 문제
3. **네트워크 문제**: VPC/서브넷 설정 문제

## 🛠️ 디버깅 단계

만약 CloudWatch에서 에러가 계속 발생한다면:

### 1. DATABASE_URL 확인

Lambda Console → Configuration → Environment variables에서 확인:

```
DATABASE_URL = postgresql://evscrap_admin@evscrap-dbproxy-czyc40wu4fe3.ap-northeast-2.rds.amazonaws.com:5432/evscrap?schema=public
```

### 2. RDS Proxy 엔드포인트 확인

```powershell
aws rds describe-db-proxies --region ap-northeast-2 --query "DBProxies[?DBProxyName=='evscrap-db-proxy'].Endpoint"
```

### 3. Secrets Manager에서 자격 증명 확인

```powershell
aws secretsmanager get-secret-value --secret-id evscrap/db/credentials --region ap-northeast-2
```

### 4. VPC/보안 그룹 확인

Lambda가 PRIVATE_WITH_EGRESS 서브넷에 있고, RDS Proxy에 접근 가능한지 확인

## 🎯 다음 단계

1. **CloudWatch Logs에서 전체 에러 확인**
2. **에러에 따라 추가 수정:**
   - DB 연결 문제 → 보안 그룹/네트워크 확인
   - 인증 문제 → DATABASE_URL의 username/password 확인
3. **성공 후 실제 데이터로 테스트:**
   - DB에 실제 이벤트 생성
   - SQS 메시지 전송
   - `anchor_status = 'COMPLETED'` 확인

## 📝 테스트 재실행

```powershell
cd c:\Users\sonic\Projects\evscrap\evscrap
powershell -ExecutionPolicy Bypass -File test-worker-simple.ps1
```

## 🔄 변경사항 요약

### 수정된 파일

1. `core-api/prisma/schema.prisma` - Linux 바이너리 타겟 추가
2. `core-api/scripts/bundle-lambda.js` - Lambda 번들링 스크립트 생성
3. `core-api/package.json` - `build:lambda` 스크립트 추가
4. `infra/lib/evscrap-stack.ts` - `DATABASE_URL` 환경변수 추가
5. `test-worker-simple.ps1` - JSON 파싱 문제 해결

### 배포 명령

```powershell
cd core-api
npm run build:lambda

cd ..\infra
npm run deploy
```
