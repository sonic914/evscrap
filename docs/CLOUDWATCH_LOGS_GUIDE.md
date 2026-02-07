# CloudWatch Logs 확인 가이드

## 📋 로그 스트림이 여러 개인 이유

Lambda는 **동시 실행**을 위해 여러 인스턴스를 생성할 수 있습니다:

- 각 인스턴스 = 별도의 로그 스트림
- 예시:
  - `2026/02/06/[$LATEST]68e80311213f45bd93b5fa14afdcea79` (인스턴스 1)
  - `2026/02/06/[$LATEST]1b1da1a0b44147318592be802e93d164` (인스턴스 2)

## ✅ 어떤 로그 스트림을 봐야 하나요?

**항상 가장 최신 시간의 로그 스트림을 보세요!**

스크린샷 예시:

```
✅ 2026/02/06/[$LATEST]68e80311213f45bd93b5fa14afdcea79  - 14:07:28 (최신)
   2026/02/06/[$LATEST]1b1da1a0b44147318592be802e93d164  - 13:58:41 (이전)
```

→ **첫 번째 것을 클릭하세요**

## 🔍 CloudWatch Logs 확인 방법

### 1단계: CloudWatch Logs 열기

[CloudWatch Logs Console 열기](https://ap-northeast-2.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-2#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fevscrap-anchor-worker)

### 2단계: 최신 로그 스트림 찾기

1. 로그 스트림 목록에서 **가장 위에 있는 것** (최신)
2. "마지막 이벤트 시간" 열을 보고 가장 최근 것 확인
3. 클릭!

### 3단계: 로그 내용 확인

**✅ 성공적인 로그 예시:**

```
START RequestId: xxx
[AnchorWorker] Received 1 message(s)
[AnchorWorker] Processing eventId: test-event-20260206232050
[ProcessEvent] Starting: test-event-20260206232050
[ProcessEvent] Event not found: test-event-20260206232050
[AnchorWorker] Batch processing complete: [{"eventId":"test-event-...","status":"failed","error":"Event not found"}]
END RequestId: xxx
REPORT RequestId: xxx Duration: 2.59 ms Billed Duration: 3 ms Memory Size: 512 MB Max Memory Used: 74 MB
```

**"Event not found" 에러가 나오는 이유:**

- 테스트 이벤트 ID가 실제 DB에 없기 때문입니다
- 이것은 **정상**입니다!
- Lambda가 올바르게 작동하고 있다는 증거입니다

**❌ 에러 로그 예시:**

```
ERROR [AnchorWorker] Failed to parse message body
ERROR Invoke Error
```

## 📊 최신 테스트 결과

**실행 시간:** `2026-02-06T14:20:51` (UTC) = `2026-02-06 23:20:51` (한국시간)

**Event ID:** `test-event-20260206232050`

**Lambda 성능:**

- Duration: 2.59 ms
- Memory Used: 74 MB / 512 MB
- Status: ✅ 성공

## 🎯 실제 데이터로 테스트하려면

DB에 실제 이벤트를 생성해야 합니다:

```sql
-- Step 1: Tenant 생성
INSERT INTO tenants (tenant_id, display_name, phone_number, status)
VALUES ('test-tenant-001', 'Test Tenant', '+821012345678', 'APPROVED')
ON CONFLICT (tenant_id) DO NOTHING;

-- Step 2: Case 생성
INSERT INTO cases (case_id, vin, tenant_id)
VALUES ('test-case-001', 'TEST-VIN-001', 'test-tenant-001')
ON CONFLICT (case_id) DO NOTHING;

-- Step 3: Event 생성 (PENDING 상태)
INSERT INTO events (
  event_id, target_type, target_id, event_type,
  occurred_at, payload, canonical_hash, anchor_status, tenant_id
)
VALUES (
  'test-event-real-001',
  'CASE',
  'test-case-001',
  'CASE_CREATED',
  NOW(),
  '{"type":"CASE_CREATED"}'::jsonb,
  encode(sha256('test'::bytea), 'hex'),
  'PENDING',
  'test-tenant-001'
);
```

그런 다음 SQS 메시지 전송:

```powershell
# test-worker-simple.ps1 수정해서 실제 event_id 사용
# 또는 직접 전송:
aws sqs send-message `
  --queue-url "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue" `
  --message-body '{"eventId":"test-event-real-001"}' `
  --region ap-northeast-2
```

## 🔄 새로 테스트 실행

```powershell
cd c:\Users\sonic\Projects\evscrap\evscrap
powershell -ExecutionPolicy Bypass -File test-worker-simple.ps1
```

그 다음 CloudWatch에서 **새로운** 로그 스트림이 생성되었는지 확인하세요!
