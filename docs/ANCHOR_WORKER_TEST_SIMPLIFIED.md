# Anchor Worker 간단 테스트 가이드

## 방법: SQL Console에서 직접 생성

RDS에 직접 연결할 수 없으므로, AWS Console의 Query Editor를 사용합니다.

### 1단계: RDS Query Editor 열기

1. [AWS RDS Console](https://ap-northeast-2.console.aws.amazon.com/rds/home?region=ap-northeast-2) 접속
2. 좌측 메뉴에서 **"Query Editor"** 클릭
3. `evscrap-db` 데이터베이스 선택
4. Secrets Manager에서 자격증명 선택: `evscrap/db/credentials`

### 2단계: 테스트 데이터 생성

아래 SQL을 Query Editor에서 실행:

```sql
-- Tenant 생성 (이미 있으면 스킵)
INSERT INTO tenants (tenant_id, display_name, phone_number, status, created_at, updated_at)
VALUES ('test-tenant-001', 'Test Tenant', '+821012345678', 'APPROVED', NOW(), NOW())
ON CONFLICT (tenant_id) DO NOTHING;

-- Case 생성
INSERT INTO cases (case_id, vin, make, model, year, tenant_id, created_at)
VALUES (
  'test-case-' || extract(epoch from now())::bigint,
  'TEST-VIN-' || extract(epoch from now())::bigint,
  'Tesla',
  'Model 3',
  2023,
  'test-tenant-001',
  NOW()
)
RETURNING case_id;
-- 👆 이 case_id를 복사하세요!
```

그 다음 위에서 받은 `case_id`로 Event 생성:

```sql
-- Event 생성 (case_id를 위에서 받은 값으로 교체!)
INSERT INTO events (
  event_id,
  target_type,
  target_id,
  event_type,
  occurred_at,
  payload,
  canonical_hash,
  anchor_status,
  tenant_id,
  created_at
)
VALUES (
  'event-' || extract(epoch from now())::bigint,
  'CASE',
  'YOUR_CASE_ID_HERE',  -- 👈 위에서 받은 case_id로 교체!
  'CASE_CREATED',
  NOW(),
  '{"type":"CASE_CREATED","vin":"TEST-VIN"}'::jsonb,
  encode(sha256('test'::bytea), 'hex'),
  'PENDING',  -- ⭐ 중요!
  'test-tenant-001',
  NOW()
)
RETURNING event_id, anchor_status;
-- 👆 이 event_id를 복사하세요!
```

### 3단계: SQS 메시지 전송

PowerShell에서 실행 (event_id를 위에서 받은 값으로 교체):

```powershell
$eventId = "YOUR_EVENT_ID_HERE"  # 👈 위에서 받은 event_id로 교체!

aws sqs send-message `
  --queue-url "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue" `
  --message-body "{`"eventId`":`"$eventId`"}" `
  --region ap-northeast-2
```

### 4단계: 결과 확인

#### CloudWatch Logs 확인:

```powershell
aws logs tail /aws/lambda/evscrap-anchor-worker --since 2m --region ap-northeast-2 --follow
```

#### DB 확인 (Query Editor):

```sql
-- Event 상태 확인
SELECT event_id, anchor_status, anchor_txid, created_at
FROM events
WHERE event_id = 'YOUR_EVENT_ID_HERE';

-- BlockchainAnchor 확인
SELECT event_id, txid, status, anchored_at
FROM blockchain_anchors
WHERE event_id = 'YOUR_EVENT_ID_HERE';
```

### 예상 결과

✅ **성공 시:**

- CloudWatch에 `[ProcessEvent] Successfully processed event` 로그
- `events.anchor_status` = `'VERIFIED'`
- `events.anchor_txid` = `'mock-tx-...'`
- `blockchain_anchors` 테이블에 새 레코드 생성

---

## 대안: 로컬 DB 사용

로컬에서 PostgreSQL을 설치하고 테스트하려면:

1. PostgreSQL 설치
2. `.env` 파일의 `DATABASE_URL`을 로컬 DB로 변경
3. `npx prisma migrate deploy` 실행
4. `npm run dev`로 Core API 실행
5. API로 테스트

하지만 실제 Anchor Worker Lambda는 AWS RDS를 사용하므로, 위의 SQL 방법을 추천합니다.
