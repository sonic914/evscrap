#!/bin/bash

##
## 스모크 테스트 스크립트
##
## 사용법:
##   bash smoke-test.sh <base-url>
##
## 예:
##   bash smoke-test.sh https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/
##
## 동작:
##   - /health 엔드포인트에 GET 요청
##   - 최대 10회 재시도 (5초 간격)
##   - 200 OK 확인
##   - 실패 시 응답 코드, 헤더, 바디 출력
##

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 인자 확인
if [ "$#" -ne 1 ]; then
    echo -e "${RED}Usage: bash smoke-test.sh <base-url>${NC}"
    echo "Example: bash smoke-test.sh https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/"
    exit 1
fi

BASE_URL="$1"
HEALTH_ENDPOINT="${BASE_URL}health"
MAX_RETRIES=10
RETRY_INTERVAL=5

echo "=========================================="
echo "Smoke Test: Health Check"
echo "=========================================="
echo "Endpoint: $HEALTH_ENDPOINT"
echo "Max Retries: $MAX_RETRIES"
echo "Retry Interval: ${RETRY_INTERVAL}s"
echo "=========================================="

# 재시도 루프
for i in $(seq 1 $MAX_RETRIES); do
    echo ""
    echo -e "${YELLOW}[Attempt $i/$MAX_RETRIES]${NC} Testing $HEALTH_ENDPOINT..."
    
    # HTTP 상태 코드 확인
    HTTP_CODE=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "$HEALTH_ENDPOINT" || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Success!${NC} HTTP $HTTP_CODE"
        echo ""
        echo "Response body:"
        cat /tmp/smoke-response.json | jq '.' 2>/dev/null || cat /tmp/smoke-response.json
        echo ""
        echo "=========================================="
        echo -e "${GREEN}Smoke Test PASSED${NC}"
        echo "=========================================="
        rm -f /tmp/smoke-response.json
        exit 0
    else
        echo -e "${RED}✗ Failed!${NC} HTTP $HTTP_CODE"
        echo ""
        echo "Response body:"
        cat /tmp/smoke-response.json 2>/dev/null || echo "(empty or error)"
        echo ""
        
        # 상세 정보 출력 (마지막 시도에서만)
        if [ "$i" -eq "$MAX_RETRIES" ]; then
            echo "=========================================="
            echo "Detailed Response (with headers):"
            echo "=========================================="
            curl -i "$HEALTH_ENDPOINT" 2>&1 || echo "Failed to get detailed response"
            echo ""
        fi
        
        # 마지막 시도가 아니면 대기
        if [ "$i" -lt "$MAX_RETRIES" ]; then
            echo "Retrying in ${RETRY_INTERVAL}s..."
            sleep $RETRY_INTERVAL
        fi
    fi
done

# 모든 재시도 실패
echo "=========================================="
echo -e "${RED}Smoke Test FAILED${NC}"
echo "=========================================="
echo "All $MAX_RETRIES attempts failed"
echo "Endpoint: $HEALTH_ENDPOINT"
echo "Last HTTP Code: $HTTP_CODE"
echo ""
echo "Troubleshooting:"
echo "1. Check CloudWatch Logs: /aws/lambda/evscrap-health"
echo "2. Verify API Gateway configuration"
echo "3. Check Lambda function deployment"
echo "4. Review docs/TROUBLESHOOTING.md"
echo "=========================================="

rm -f /tmp/smoke-response.json
exit 1
