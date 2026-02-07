# Anchor Worker 테스트 - 최종 정리

## ✅ 완료된 작업

### 1. 인프라 배포

- ✅ SQS Queue 생성: `evscrap-anchor-events-queue`
- ✅ SQS DLQ 생성: `evscrap-anchor-events-dlq`
- ✅ Lambda Function 생성: `evscrap-anchor-worker`

### 2. Lambda 번들링 문제 해결

**문제**: `Runtime.ImportModuleError` - 의존성 누락

**해결**:

- Lambda 번들링 스크립트 생성 (`scripts/bundle-lambda.js`)
- `node_modules` 포함 (223 패키지)
- Prisma Client 생성
- CDK에서 `dist/lambda` 디렉토리 사용하도록 수정

### 3. JSON 파싱 문제 해결

**문제**: PowerShell에서 JSON 이스케이프 실패

```
파싱 전: {eventId:test-event-...}  ❌
파싱 후: {"eventId":"test-event-..."}  ✅
```

**해결**: `test-worker-simple.ps1`에서 `ConvertTo-Json` 사용

## 📊 현재 상태

Lambda가 성공적으로 실행되고 있습니다:

- ✅ 초기화 성공 (Init Duration: ~175ms)
- ✅ 메모리 사용: ~74MB / 512MB
- ✅ 실행 시간: 2-4ms

## 🔍 최종 검증 필요

CloudWatch Logs에서 다음 확인:

1. [CloudWatch Logs 열기](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fevscrap-anchor-worker)

2. 최신 로그 스트림 클릭

3. 성공적인 실행 로그 확인:
   ```
   [AnchorWorker] Received 1 message(s)
   [AnchorWorker] Processing eventId: test-event-...
   [ProcessEvent] Starting: test-event-...
   [ProcessEvent] Event not found: test-event-... (정상 - DB에 없는 테스트 ID)
   ```

## 🎯 다음 단계

### 실제 데이터로 테스트

1. **DB에 테스트 이벤트 생성**
   - Core API 배포 후 API로 Case 생성
   - 또는 RDS에 직접 접속하여 SQL로 생성

2. **SQS 메시지 전송**

   ```powershell
   powershell -ExecutionPolicy Bypass -File test-worker-simple.ps1
   ```

3. **DB 검증**
   ```sql
   SELECT event_id, anchor_status, anchor_txid
   FROM events
   WHERE event_id = 'YOUR_EVENT_ID';
   ```

## 📝 테스트 스크립트

테스트 실행:

```powershell
cd c:\Users\sonic\Projects\evscrap\evscrap
powershell -ExecutionPolicy Bypass -File test-worker-simple.ps1
```

로그 확인:

```powershell
powershell -ExecutionPolicy Bypass -File get-logs.ps1
```

## 🔧 빌드 & 배포 명령

```powershell
# Anchor Worker 재빌드 및 재배포
cd core-api
npm run build:lambda

cd ..\infra
npm run deploy
```
