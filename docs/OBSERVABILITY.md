# Observability 가이드

## 1. 로그 구조

모든 로그는 **JSON 구조화** 형식으로 CloudWatch Logs에 적재됩니다.

```json
{
  "timestamp": "2026-02-10T14:30:00.000Z",
  "level": "INFO",
  "message": "REQUEST_END",
  "correlation_id": "abc-123-def",
  "method": "POST",
  "path": "/user/v1/tenants/submit",
  "status": 201,
  "latency_ms": 142
}
```

### 주요 로그 메시지

| 메시지 | 위치 | 설명 |
|--------|------|------|
| `REQUEST_START` | API | 요청 시작 (method, path) |
| `REQUEST_END` | API | 요청 종료 (status, latency_ms) |
| `SERVER_ERROR` | API | 5xx 응답 |
| `NOT_FOUND` | API | 404 |
| `IDEMPOTENCY_REPLAY` | API | 멱등 캐시 재응답 |
| `WORKER_BATCH_START` | Worker | SQS 배치 시작 |
| `ANCHOR_PROCESS_START` | Worker | 이벤트 앵커링 시작 |
| `ANCHOR_SUCCESS` | Worker | 앵커링 성공 (txid) |
| `ANCHOR_FAILED` | Worker | 앵커링 실패 |
| `WORKER_RECORD_FAILED` | Worker | SQS 레코드 처리 실패 |

## 2. correlation_id로 요청 추적

### API 요청 추적

```
CloudWatch Logs Insights → /aws/lambda/evscrap-api
```

```sql
fields @timestamp, message, correlation_id, method, path, status, latency_ms
| filter correlation_id = "abc-123-def"
| sort @timestamp asc
```

### API → Worker 연결

API에서 SQS로 보낸 `eventId`를 Worker 로그에서 추적:

```sql
-- Worker 로그에서 특정 eventId 추적
fields @timestamp, message, event_id, sqs_message_id, anchor_status
| filter event_id = "이벤트-UUID"
| sort @timestamp asc
```

### 전체 흐름 예시

```
1. API 로그 (correlation_id로 검색)
   → REQUEST_START: POST /user/v1/cases/{caseId}/events
   → REQUEST_END: 201, 250ms

2. Worker 로그 (event_id로 검색)
   → ANCHOR_PROCESS_START: eventId=xxx
   → ANCHOR_SUCCESS: txid=mock-xxx
```

## 3. CloudWatch 알람

| 알람 | 조건 | 의미 |
|------|------|------|
| `evscrap-api-5xx` | API GW 5XX ≥ 1 (5분) | API 서버 에러 발생 |
| `evscrap-worker-errors` | Worker Lambda Errors ≥ 1 (5분) | 앵커링 처리 실패 |
| `evscrap-dlq-messages` | DLQ 메시지 ≥ 1 (5분) | 5회 재시도 후에도 실패한 메시지 존재 |

알람 발생 시 → SNS Topic `evscrap-alarms`로 전송 (슬랙/메일 연동 가능)

## 4. 문제 발생 시 대응

### API 5XX 알람 발생

1. CloudWatch Logs → `/aws/lambda/evscrap-api`
2. `level = "ERROR"` 필터링
3. `correlation_id`로 해당 요청 전체 로그 추적
4. 일반적 원인: DB 연결 실패, 타임아웃, 코드 버그

### Worker Error 알람 발생

1. CloudWatch Logs → `/aws/lambda/evscrap-anchor-worker`
2. `message = "ANCHOR_PROCESS_ERROR"` 필터링
3. `event_id`로 어떤 이벤트가 실패했는지 확인
4. 일반적 원인: DB 연결, 앵커링 프로바이더 오류

### DLQ 메시지 쌓임

**의미:** 메시지가 5회 재시도 후에도 실패 → DLQ로 이동됨

**첫 조치:**
1. AWS Console → SQS → `evscrap-anchor-events-dlq`
2. 메시지 본문 확인 (`eventId` 확인)
3. Worker 로그에서 해당 `event_id` 검색
4. 원인 수정 후, DLQ 메시지를 원본 큐로 재전송 (Redrive)

```bash
# DLQ 메시지 확인 (CLI)
aws sqs receive-message \
  --queue-url https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-dlq \
  --max-number-of-messages 5
```

## 5. 커스텀 메트릭

로그 기반 메트릭 (CloudWatch Metric Filter 대상):

| 메트릭 | 로그 패턴 | 설명 |
|--------|----------|------|
| `anchor_worker_success` | `"_metric":"anchor_worker_success"` | 앵커링 성공 횟수 |
| `anchor_worker_error` | `"_metric":"anchor_worker_error"` | 앵커링 실패 횟수 |
| `idempotency_replay` | `"_metric":"idempotency_replay"` | 멱등 캐시 재응답 횟수 |

CloudWatch Metric Filter 설정은 추후 필요 시 CDK에 추가.
