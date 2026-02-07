#!/bin/bash
# Anchor Worker 통합 테스트 스크립트

set -e

echo "========================================="
echo "Anchor Worker 통합 테스트"
echo "========================================="

# 환경 변수 확인
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL이 설정되지 않았습니다."
  echo "   .env 파일을 먼저 로드하세요:"
  echo "   source .env (Linux/Mac) 또는 Get-Content .env | ForEach-Object { [Environment]::SetEnvironmentVariable(\$_.Split('=')[0], \$_.Split('=')[1]) } (Windows PowerShell)"
  exit 1
fi

QUEUE_URL="${ANCHOR_QUEUE_URL:-https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue}"

echo ""
echo "1️⃣  테스트 이벤트 생성 중..."
echo ""

# 임시로 간단한 SQL로 이벤트 생성
EVENT_ID="test-event-$(date +%s)"

# psql 사용 가능 여부 확인
if ! command -v psql &> /dev/null; then
  echo "❌ psql이 설치되어 있지 않습니다."
  echo "   수동으로 테스트하세요:"
  echo ""
  echo "   1. Core API 실행:"
  echo "      npm run dev"
  echo ""
  echo "   2. Case 생성 API 호출:"
  echo "      curl -X POST http://localhost:3000/api/v1/cases \\"
  echo "        -H \"Content-Type: application/json\" \\"
  echo "        -H \"X-Tenant-Id: test-tenant\" \\"
  echo "        -d '{\"vin\":\"TEST123\",\"make\":\"Tesla\",\"model\":\"Model 3\",\"year\":2023}'"
  echo ""
  echo "   3. SQS 메시지 전송:"
  echo "      aws sqs send-message \\"
  echo "        --queue-url \"$QUEUE_URL\" \\"
  echo "        --message-body '{\"eventId\":\"<API에서 반환된 event_id>\"}' \\"
  echo "        --region ap-northeast-2"
  exit 1
fi

# PostgreSQL로 직접 이벤트 생성
psql "$DATABASE_URL" << EOF
-- Tenant 생성
INSERT INTO tenants (tenant_id, display_name, phone_number, status)
VALUES ('test-tenant-001', 'Test Tenant', '+821012345678', 'APPROVED')
ON CONFLICT (tenant_id) DO NOTHING;

-- Case 생성
INSERT INTO cases (case_id, vin, make, model, year, tenant_id)
VALUES ('test-case-001', 'TEST-VIN-123', 'Tesla', 'Model 3', 2023, 'test-tenant-001')
ON CONFLICT (case_id) DO NOTHING;

-- Event 생성
INSERT INTO events (
  event_id, target_type, target_id, event_type,
  occurred_at, payload, canonical_hash, anchor_status, tenant_id
)
VALUES (
  '$EVENT_ID', 'CASE', 'test-case-001', 'CASE_CREATED',
  NOW(), '{"type":"CASE_CREATED"}'::jsonb,
  encode(sha256('test'::bytea), 'hex'), 'PENDING', 'test-tenant-001'
);

SELECT event_id, anchor_status FROM events WHERE event_id = '$EVENT_ID';
EOF

echo ""
echo "✅ 테스트 이벤트 생성 완료: $EVENT_ID"
echo ""
echo "2️⃣  SQS 메시지 전송 중..."
echo ""

aws sqs send-message \
  --queue-url "$QUEUE_URL" \
  --message-body "{\"eventId\":\"$EVENT_ID\"}" \
  --region ap-northeast-2

echo ""
echo "✅ SQS 메시지 전송 완료"
echo ""
echo "3️⃣  CloudWatch Logs 확인 (10초 대기 후)..."
sleep 10

aws logs tail /aws/lambda/evscrap-anchor-worker \
  --since 1m \
  --region ap-northeast-2

echo ""
echo "========================================="
echo "테스트 완료!"
echo "========================================="
