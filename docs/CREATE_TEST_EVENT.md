# 테스트 이벤트 생성 가이드

## 옵션 1: SQL로 직접 생성 (가장 빠름)

```sql
-- 1. 테넌트 생성 (이미 있으면 스킵)
INSERT INTO tenants (tenant_id, display_name, phone_number, status)
VALUES ('test-tenant-001', 'Test Tenant', '+821012345678', 'APPROVED')
ON CONFLICT (tenant_id) DO NOTHING;

-- 2. Case 생성 (이미 있으면 스킵)
INSERT INTO cases (case_id, vin, make, model, year, tenant_id)
VALUES ('test-case-001', 'TEST-VIN-123', 'Tesla', 'Model 3', 2023, 'test-tenant-001')
ON CONFLICT (case_id) DO NOTHING;

-- 3. PENDING 상태의 Event 생성
INSERT INTO events (
  event_id,
  target_type,
  target_id,
  event_type,
  occurred_at,
  payload,
  canonical_hash,
  anchor_status,
  tenant_id
)
VALUES (
  'test-event-' || extract(epoch from now())::text,
  'CASE',
  'test-case-001',
  'CASE_CREATED',
  NOW(),
  '{"eventType":"CASE_CREATED","caseId":"test-case-001"}'::jsonb,
  encode(sha256('test-payload'::bytea), 'hex'),
  'PENDING',  -- ⭐ 중요!
  'test-tenant-001'
)
RETURNING event_id;
```

위 SQL을 실행한 후, 출력된 `event_id`를 복사하세요.

## 옵션 2: Core API 사용

```bash
# Core API가 실행 중이라면
curl -X POST http://localhost:3000/api/v1/cases \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: test-tenant-001" \
  -d '{
    "vin": "TEST-VIN-123",
    "make": "Tesla",
    "model": "Model 3",
    "year": 2023
  }'
```

Case 생성 시 자동으로 PENDING 이벤트가 생성됩니다.

## 다음 단계

Event ID를 얻은 후:

```bash
aws sqs send-message \
  --queue-url "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue" \
  --message-body "{\"eventId\":\"YOUR_EVENT_ID_HERE\"}" \
  --region ap-northeast-2
```
