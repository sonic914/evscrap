# Anchor Worker 구현 완료

## 개요

Mock 블록체인에 이벤트를 앵커링하는 Worker Lambda 구현

## 아키텍처

```
Event 생성 (API) → SQS Queue → Worker Lambda → Mock Anchoring → DB 업데이트
                                     ↓
                                Prisma Client
                                     ↓
                          Event + BlockchainAnchor
```

## 구성 요소

### 1. MockAnchorProvider

- Mock txid 생성: `mock-tx-{timestamp}-{randomHex}`
- 1-3초 지연 시뮬레이션
- 95% 성공률

### 2. SQS Handler (index.ts)

- SQS 메시지 파싱
- Batch 처리
- 에러 처리 및 재시도

### 3. Business Logic (handler.ts)

- Prisma로 Event 조회
- 멱등성 보장 (VERIFIED 스킵)
- 트랜잭션: Event + BlockchainAnchor 동시 업데이트
- 실패 시 FAILED 상태 + throw (DLQ 재시도)

## 배포

```bash
cd core-api && npm run build
cd ../infra && npm run deploy
```

## 테스트

자세한 내용은 [ANCHOR_WORKER_TEST.md](./ANCHOR_WORKER_TEST.md) 참조

## 환경변수

- `DB_PROXY_ENDPOINT`: RDS Proxy 엔드포인트
- `DB_SECRET_ARN`: DB 자격증명 ARN
- `NODE_ENV`: production

## 재시도 정책

- SQS visibility timeout: 300초
- 최대 재시도: 5회
- DLQ: `evscrap-anchor-events-dlq`
