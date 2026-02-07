# CI DB Smoke Test 가이드

## 개요

배포 직후 GitHub Actions에서 **DB Read/Write까지 자동 검증**하는 파이프라인.

```
CDK deploy → Migration → Resolve Outputs → /health 200 → DB Smoke (Cognito 인증 + Write/Read)
```

## 워크플로우 단계

| 단계 | 설명 | 실패 시 |
|------|------|---------|
| Resolve CDK Outputs | cdk-outputs.json에서 API_BASE, Cognito IDs 자동 추출 | outputs 파일 없으면 CloudFormation fallback |
| Smoke Test (health) | `GET /health` → 200 | Lambda/API Gateway 문제 |
| DB Smoke Test | Cognito 인증 + tenant 생성(201) + 목록 조회(200) + case 생성(201) | 인증/DB/Prisma 문제 |

## 필요한 GitHub Secrets (4개)

Repository → Settings → Secrets and variables → Actions → **New repository secret**

| Secret Name | 설명 | 예시 |
|-------------|------|------|
| `TEST_USER_USERNAME` | 폐차장 Cognito 테스트 계정 이메일 | `ci-user@evscrap-test.com` |
| `TEST_USER_PASSWORD` | 폐차장 테스트 계정 비밀번호 | `TestPass123!@#` |
| `TEST_ADMIN_USERNAME` | 관리자 Cognito 테스트 계정 이메일 | `ci-admin@evscrap-test.com` |
| `TEST_ADMIN_PASSWORD` | 관리자 테스트 계정 비밀번호 | `AdminPass123!@#` |

> **주의**: API_BASE, USER_POOL_ID, USER_POOL_CLIENT_ID 등은 CDK outputs에서 **자동 추출**됩니다.
> Secrets에 Cognito ID를 저장할 필요 없습니다.

## Cognito 테스트 계정 사전 생성 (1회)

### 1) 폐차장(User) 계정

```bash
# UserPool ID 확인
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name EvscrapStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

# 계정 생성
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username "ci-user@evscrap-test.com" \
  --user-attributes Name=email,Value="ci-user@evscrap-test.com" Name=email_verified,Value=true \
  --temporary-password "TempPass123!@#" \
  --message-action SUPPRESS

# 비밀번호 확정 (FORCE_CHANGE_PASSWORD 상태 해제)
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username "ci-user@evscrap-test.com" \
  --password "TestPass123!@#" \
  --permanent
```

### 2) 관리자(Admin) 계정

```bash
ADMIN_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name EvscrapStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AdminPoolId`].OutputValue' \
  --output text)

aws cognito-idp admin-create-user \
  --user-pool-id $ADMIN_POOL_ID \
  --username "ci-admin@evscrap-test.com" \
  --user-attributes Name=email,Value="ci-admin@evscrap-test.com" Name=email_verified,Value=true \
  --temporary-password "TempPass123!@#" \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id $ADMIN_POOL_ID \
  --username "ci-admin@evscrap-test.com" \
  --password "AdminPass123!@#" \
  --permanent
```

## 자동 추출 경로 (resolve-outputs.mjs)

1. **1순위**: `infra/cdk-outputs.json` (CDK deploy 시 `--outputs-file`로 생성)
2. **2순위**: `aws cloudformation describe-stacks --stack-name EvscrapStack` (fallback)

추출 대상:
- `API_BASE` ← CfnOutput `ApiUrl`
- `USER_POOL_ID` ← CfnOutput `UserPoolId`
- `USER_POOL_CLIENT_ID` ← CfnOutput `UserPoolClientId`
- `ADMIN_POOL_ID` ← CfnOutput `AdminPoolId`
- `ADMIN_POOL_CLIENT_ID` ← CfnOutput `AdminPoolClientId`

## 롤백 방법

workflow 변경만 되돌리면 됩니다:

```bash
# 추가된 파일 삭제
rm scripts/resolve-outputs.mjs scripts/db-smoke.mjs docs/CI_DB_SMOKE.md

# infra-deploy.yml에서 db-smoke 관련 단계 삭제 (이전 커밋으로 복원)
git checkout HEAD~1 -- .github/workflows/infra-deploy.yml

git commit -am "revert: DB smoke test 제거"
git push
```

## 실패 디버깅

| 실패 위치 | 원인 | 확인 방법 |
|-----------|------|-----------|
| Resolve Outputs | cdk-outputs.json 미생성 | CDK Deploy 단계 로그 확인 |
| Health 200 | Lambda cold start / API GW | CloudWatch Logs |
| 토큰 발급 | Cognito 계정 미생성/비밀번호 불일치 | 위 "사전 생성" 절차 확인 |
| tenant-create 201 | DB 연결/Prisma 스키마 불일치 | Lambda CloudWatch Logs |
| tenant-list 200 | Admin 인증 실패 | Admin Pool 계정 확인 |
| case-create 201 | tenantId 매핑 문제 | Cognito custom:tenant_id 확인 |
