# 스모크 테스트 가이드

스모크 테스트는 배포 후 API가 정상적으로 동작하는지 빠르게 확인하는 자동화된 테스트입니다.

## 개요

**목적**: 배포된 API의 health endpoint를 호출하여 200 OK 응답을 확인

**위치**:

- 로컬: `scripts/smoke-test.sh`
- GitHub Actions: infra-deploy.yml, core-api-deploy.yml의 "Smoke Test" 스텝

**테스트 내용**:

- GET `/health` 호출
- HTTP 200 응답 확인
- 응답 바디 JSON 검증

---

## 로컬에서 스모크 테스트 실행

### 사전 요구사항

- curl 설치
- jq 설치 (선택, JSON 포맷팅용)
- 배포된 API endpoint URL

### 실행 방법

#### 1. API endpoint URL 확인

**방법 A: CDK outputs 파일 사용** (infra 배포 후)

```bash
cd infra
npx cdk deploy --outputs-file cdk-outputs.json
node ../scripts/get-api-endpoint.mjs cdk-outputs.json EvscrapStack
```

**방법 B: CloudFormation에서 직접 조회**

```bash
aws cloudformation describe-stacks \
  --stack-name EvscrapStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text \
  --region ap-northeast-2
```

**방법 C: CDK outputs 명령 사용**

```bash
cd infra
npx cdk deploy
# Outputs 섹션에서 ApiUrl 복사
```

---

#### 2. 스모크 테스트 실행

```bash
# API URL을 변수로 설정
export API_URL="https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/"

# 스모크 테스트 실행
bash scripts/smoke-test.sh $API_URL
```

**예상 출력 (성공)**:

```
==========================================
Smoke Test: Health Check
==========================================
Endpoint: https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health
Max Retries: 10
Retry Interval: 5s
==========================================

[Attempt 1/10] Testing https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health...
✓ Success! HTTP 200

Response body:
{
  "status": "healthy",
  "timestamp": "2026-02-04T13:00:00.000Z",
  "path": "/health",
  "version": "0.1.0-phase0a"
}

==========================================
Smoke Test PASSED
==========================================
```

**예상 출력 (실패)**:

```
[Attempt 1/10] Testing https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health...
✗ Failed! HTTP 502

Response body:
{"message": "Internal server error"}

Retrying in 5s...
[Attempt 2/10] Testing...
...
==========================================
Smoke Test FAILED
==========================================
All 10 attempts failed
Endpoint: https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health
Last HTTP Code: 502

Troubleshooting:
1. Check CloudWatch Logs: /aws/lambda/evscrap-health
2. Verify API Gateway configuration
3. Check Lambda function deployment
4. Review docs/TROUBLESHOOTING.md
==========================================
```

---

#### 3. 개별 엔드포인트 수동 테스트

스크립트를 사용하지 않고 직접 curl로 테스트:

```bash
# /health
curl -i https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health

# /user/v1/health
curl -i https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/user/v1/health

# /admin/v1/health
curl -i https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/admin/v1/health
```

---

## GitHub Actions에서 스모크 테스트 확인

### 자동 실행

main 브랜치에 푸시 시 자동으로 스모크 테스트가 실행됩니다.

**트리거 조건**:

- `infra/**` 변경 → infra-deploy.yml 실행
- `core-api/**` 변경 → core-api-deploy.yml 실행

---

### 워크플로우 로그 확인

1. GitHub 레포지토리 → **Actions** 탭
2. 해당 워크플로우 클릭 (예: "Infrastructure Deployment")
3. 스텝 확인:
   - ✅ **CDK Deploy** - 인프라 배포 성공
   - ✅ **Extract API Endpoint** - API URL 추출 성공
   - ✅ **Smoke Test** - 스모크 테스트 성공

---

### 스모크 테스트 스텝 상세

**infra-deploy.yml**:

```yaml
- name: Extract API Endpoint
  id: api-endpoint
  working-directory: ./infra
  run: |
    API_URL=$(node ../scripts/get-api-endpoint.mjs cdk-outputs.json EvscrapStack)
    echo "api_url=$API_URL" >> $GITHUB_OUTPUT
    echo "API URL: $API_URL"

- name: Smoke Test
  run: |
    chmod +x scripts/smoke-test.sh
    bash scripts/smoke-test.sh ${{ steps.api-endpoint.outputs.api_url }}
```

**core-api-deploy.yml**:

```yaml
- name: Extract API Endpoint
  id: api-endpoint
  run: |
    API_URL=$(aws cloudformation describe-stacks \
      --stack-name EvscrapStack \
      --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
      --output text \
      --region ${{ env.AWS_REGION }})
    echo "api_url=$API_URL" >> $GITHUB_OUTPUT
    echo "API URL: $API_URL"

- name: Smoke Test
  run: |
    chmod +x scripts/smoke-test.sh
    bash scripts/smoke-test.sh ${{ steps.api-endpoint.outputs.api_url }}
```

---

## 스모크 테스트 실패 시 디버깅

### 1. GitHub Actions 로그 확인

**Extract API Endpoint 스텝**:

- API URL이 올바르게 추출되었는지 확인
- 예: `https://abc123def.execute-api.ap-northeast-2.amazonaws.com/prod/`

**Smoke Test 스텝**:

- HTTP 응답 코드 확인 (200이 아닌 경우)
- 응답 바디 확인
- 재시도 로그 확인

---

### 2. CloudWatch Logs 확인

Lambda 함수 로그:

```bash
aws logs tail /aws/lambda/evscrap-health --follow --region ap-northeast-2
```

또는 AWS 콘솔:

1. CloudWatch → Logs → Log groups
2. `/aws/lambda/evscrap-health` 선택
3. 최신 Log stream에서 에러 확인

---

### 3. 일반적인 에러 및 해결

| HTTP 코드 | 원인                   | 해결 방법                         |
| --------- | ---------------------- | --------------------------------- |
| **502**   | Lambda 함수 에러       | CloudWatch Logs 확인, 코드 디버깅 |
| **503**   | Lambda cold start      | 재시도 대기 (자동으로 재시도됨)   |
| **404**   | 엔드포인트 경로 불일치 | API Gateway 설정 확인             |
| **403**   | 권한 문제              | Lambda 실행 Role 확인             |
| **000**   | 네트워크/DNS 에러      | API URL 확인, 리전 확인           |

자세한 내용은 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 참고.

---

## 스모크 테스트 커스터마이징

### 재시도 횟수 변경

`scripts/smoke-test.sh` 파일 수정:

```bash
MAX_RETRIES=20  # 기본값: 10
RETRY_INTERVAL=3  # 기본값: 5
```

---

### 다른 엔드포인트 테스트

```bash
# 사용자 health
bash scripts/smoke-test.sh https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/user/v1/

# 관리자 health
bash scripts/smoke-test.sh https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/admin/v1/
```

> **참고**: 스크립트는 base URL 뒤에 자동으로 `health`를 붙입니다.

---

## 스모크 테스트 스크립트 구조

`scripts/smoke-test.sh`의 주요 로직:

1. **인자 검증**: base URL이 제공되었는지 확인
2. **재시도 루프**: 최대 10회 재시도
3. **HTTP 요청**: curl로 `/health` 엔드포인트 호출
4. **응답 검증**: HTTP 200 확인
5. **성공 시**: 응답 바디 출력, exit 0
6. **실패 시**: 응답 바디 출력, 재시도
7. **최종 실패**: 상세 정보 출력, exit 1

---

## 추가 정보

### API endpoint 추출 스크립트

`scripts/get-api-endpoint.mjs`:

- CDK outputs 파일에서 ApiUrl 추출
- CloudFormation stack outputs 파싱
- 에러 처리 (파일/키 없음)

사용 예:

```bash
node scripts/get-api-endpoint.mjs infra/cdk-outputs.json EvscrapStack
```

---

### 관련 문서

- [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md) - 배포 가이드
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 트러블슈팅 가이드
- [ARCHITECTURE_PHASE0.md](ARCHITECTURE_PHASE0.md) - 아키텍처 설명
