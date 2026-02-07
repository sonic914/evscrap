# Anchor Worker 테스트 가이드

## 개요

배포된 Anchor Worker Lambda를 테스트하는 방법을 설명합니다.

---

## 1. SQS 테스트 메시지 전송

### 방법 A: AWS CLI 사용

```bash
# 환경변수 설정 (CDK Output에서 확인)
QUEUE_URL="https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue"

# 테스트 이벤트 ID (실제 DB에 있는 PENDING 상태의 이벤트 ID로 교체)
EVENT_ID="YOUR_EVENT_ID_HERE"

# 메시지 전송
aws sqs send-message \
  --queue-url $QUEUE_URL \
  --message-body "{\"eventId\":\"$EVENT_ID\"}" \
  --region ap-northeast-2
```

### 방법 B: AWS Console 사용

1. [AWS Console](https://ap-northeast-2.console.aws.amazon.com/sqs/v2/home?region=ap-northeast-2) 접속
   - 또는 상단 검색바에서 **"SQS"** 검색 → Simple Queue Service 클릭
2. `evscrap-anchor-events-queue` 선택
3. "Send and receive messages" 클릭
4. Message body에 입력:
   ```json
   {
     "eventId": "YOUR_EVENT_ID_HERE"
   }
   ```
5. "Send message" 클릭

---

## 2. CloudWatch Logs 확인

### AWS Console

1. CloudWatch → Logs → Log groups
2. `/aws/lambda/evscrap-anchor-worker` 선택
3. 최신 로그 스트림 확인

### AWS CLI

```bash
# 최근 로그 조회
aws logs tail /aws/lambda/evscrap-anchor-worker \
  --follow \
  --region ap-northeast-2
```

### 예상 로그 출력

```
[AnchorWorker] Received 1 message(s)
[AnchorWorker] Processing eventId: abc123...
[ProcessEvent] Starting: abc123...
[ProcessEvent] Event found: abc123, status: PENDING
[ProcessEvent] Anchoring hash: abcdef1234567890...
[MockAnchorProvider] Anchoring hash: abcdef1234567890...
[MockAnchorProvider] Success! txid: mock-tx-1770369060392-10ad0f55
[ProcessEvent] Anchoring succeeded, txid: mock-tx-1770369060392-10ad0f55
[ProcessEvent] Successfully processed event abc123
[AnchorWorker] Batch processing complete: [{"eventId":"abc123","status":"success"}]
```

---

## 3. DB 검증

### PostgreSQL 접속

```bash
# RDS Proxy 엔드포인트로 접속 (VPN/Bastion 필요)
psql -h YOUR_RDS_PROXY_ENDPOINT -U evscrap_admin -d evscrap
```

### 검증 쿼리

```sql
-- 이벤트 상태 확인
SELECT
  event_id,
  event_type,
  anchor_status,
  anchor_txid,
  created_at
FROM events
WHERE event_id = 'YOUR_EVENT_ID_HERE';

-- BlockchainAnchor 레코드 확인
SELECT
  event_id,
  txid,
  status,
  anchored_at,
  verified_at
FROM blockchain_anchors
WHERE event_id = 'YOUR_EVENT_ID_HERE';

-- 최근 앵커링된 이벤트 목록
SELECT
  event_id,
  anchor_status,
  anchor_txid,
  created_at
FROM events
WHERE anchor_status = 'VERIFIED'
ORDER BY created_at DESC
LIMIT 10;
```

### 예상 결과

- `events.anchor_status` = `'VERIFIED'`
- `events.anchor_txid` = `'mock-tx-...'`
- `blockchain_anchors` 테이블에 새 레코드 생성
- `blockchain_anchors.status` = `'VERIFIED'`

---

## 4. 에러 시나리오 테스트

### 존재하지 않는 이벤트 ID

```json
{
  "eventId": "non-existent-id"
}
```

**예상 동작**:

- CloudWatch에 에러 로그
- SQS DLQ로 메시지 이동 (5회 재시도 후)

### 이미 VERIFIED 상태인 이벤트

**예상 동작**:

- 로그: `"Event already VERIFIED, skipping"`
- DB 변경 없음 (멱등성 보장)

---

## 5. DLQ (Dead Letter Queue) 확인

### AWS Console

1. SQS → `evscrap-anchor-events-dlq`
2. "Send and receive messages"
3. "Poll for messages" 클릭
4. 실패한 메시지 확인

### AWS CLI

```bash
aws sqs receive-message \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-dlq \
  --region ap-northeast-2
```

---

## 6. 통합 테스트 스크립트 (선택)

### 전체 플로우 테스트

```bash
#!/bin/bash
# test-anchor-worker.sh

EVENT_ID="YOUR_EVENT_ID_HERE"
QUEUE_URL="YOUR_QUEUE_URL_HERE"

echo "1. Sending message to SQS..."
aws sqs send-message \
  --queue-url $QUEUE_URL \
  --message-body "{\"eventId\":\"$EVENT_ID\"}"

echo "2. Waiting 10 seconds for processing..."
sleep 10

echo "3. Checking CloudWatch Logs..."
aws logs tail /aws/lambda/evscrap-anchor-worker --since 5m

echo "4. Query DB for verification..."
echo "Run: SELECT * FROM events WHERE event_id = '$EVENT_ID';"
```

---

## 트러블슈팅

### Worker가 메시지를 처리하지 않음

- Lambda 함수가 VPC에 있고 NAT Gateway가 있는지 확인
- SQS 트리거가 활성화되어 있는지 확인
- Lambda 실행 역할에 SQS 권한이 있는지 확인

### DB 연결 오류

- RDS Proxy 엔드포인트가 올바른지 확인
- Lambda Security Group이 RDS Security Group에 접근 가능한지 확인
- Secrets Manager에서 DB 자격증명 확인

### Prisma Client 오류

- `npm run build` 후 재배포 확인
- `prisma generate` 실행 확인

---

## 다음 단계

테스트 성공 후:

1. ✅ Phase 1-B의 Anchor Worker 구현 완료
2. 정산 게이트 검증 구현 (Settlement commit 시 앵커 확인)
3. CI/CD 파이프라인에 통합
