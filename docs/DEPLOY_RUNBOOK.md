# evscrap 배포 가이드 (Runbook)

## 환경 정보

| 항목                    | 값                                                              |
| ----------------------- | --------------------------------------------------------------- |
| **AWS Account ID**      | 090733632671                                                    |
| **AWS Region**          | ap-northeast-2 (서울)                                           |
| **GitHub Repository**   | sonic914/evscrap                                                |
| **Default Branch**      | main                                                            |
| **GitHub Actions Role** | arn:aws:iam::090733632671:role/GitHubActions-evscrap-deploy-dev |

## 사전 요구사항

### 1. GitHub Actions OIDC Role 설정

배포를 위해서는 AWS IAM Role에 GitHub OIDC Provider를 통한 신뢰 관계가 설정되어 있어야 합니다.

#### Role ARN

```
arn:aws:iam::090733632671:role/GitHubActions-evscrap-deploy-dev
```

#### Trust Policy 예시

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::090733632671:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:sonic914/evscrap:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

#### 필요한 권한

Role에는 다음 권한이 필요합니다:

- CloudFormation (스택 생성/업데이트/삭제)
- IAM (Lambda 실행 역할 생성)
- Lambda (함수 생성/업데이트)
- API Gateway (API 생성/업데이트)
- S3 (버킷 생성, CDK assets 업로드)
- Cognito (User Pool 생성/업데이트)
- CloudWatch Logs (로그 그룹 생성)

관리형 정책 예시:

- `AWSCloudFormationFullAccess`
- `AWSLambda_FullAccess`
- `AmazonAPIGatewayAdministrator`
- `AmazonS3FullAccess`
- `AmazonCognitoPowerUser`
- `CloudWatchLogsFullAccess`

> [!WARNING]
> 프로덕션 환경에서는 최소 권한 원칙(Principle of Least Privilege)에 따라 필요한 권한만 부여하세요.

### 2. CDK Bootstrap (최초 1회)

AWS 계정에 CDK를 최초로 사용하는 경우 Bootstrap이 필요합니다.

```bash
cd infra
npx cdk bootstrap aws://090733632671/ap-northeast-2
```

이 명령은 다음을 생성합니다:

- CDK 자산용 S3 버킷 (`cdk-hnb659fds-assets-*`)
- CloudFormation 스택 실행을 위한 IAM Role
- ECR 저장소 (컨테이너 이미지용)

## 배포 방법

### 자동 배포 (GitHub Actions)

main 브랜치에 푸시하면 자동으로 배포됩니다.

#### 인프라 배포

`infra/**` 경로의 파일이 변경되면 자동으로 CDK 배포가 실행됩니다.

```bash
# 변경 후 커밋
git add infra/
git commit -m "Update infrastructure"
git push origin main
```

워크플로우: `.github/workflows/infra-deploy.yml`

#### Core API 배포

`core-api/**` 경로의 파일이 변경되면 자동으로 Lambda 함수가 업데이트됩니다.

```bash
# 변경 후 커밋
git add core-api/
git commit -m "Update core API"
git push origin main
```

워크플로우: `.github/workflows/core-api-deploy.yml`

### 수동 배포 (로컬)

#### 1. 인프라 배포

```bash
# Makefile 사용
make deploy

# 또는 직접 실행
cd infra
npm install
npx cdk deploy --all
```

배포 완료 후 Outputs에서 다음 정보를 확인할 수 있습니다:

- API Gateway URL
- S3 Bucket Name
- Cognito User Pool IDs

#### 2. Core API 업데이트

Core API는 인프라와 함께 배포되므로, 인프라 배포 시 자동으로 포함됩니다.

별도로 Lambda 함수만 업데이트하려면:

```bash
cd core-api
npm install
npm run build

# Lambda 업데이트
cd dist
zip -r ../lambda.zip .
cd ..
zip -g lambda.zip package.json
cd node_modules
zip -r ../lambda.zip .
cd ..

aws lambda update-function-code \
  --function-name evscrap-health \
  --zip-file fileb://lambda.zip \
  --region ap-northeast-2
```

## 배포 확인

### 1. CloudFormation 스택 확인

AWS 콘솔에서 CloudFormation 스택이 정상적으로 생성되었는지 확인합니다.

```bash
aws cloudformation describe-stacks \
  --stack-name EvscrapStack \
  --region ap-northeast-2
```

### 2. API 엔드포인트 테스트

배포된 API를 테스트합니다.

```bash
# Outputs에서 API URL 확인
API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvscrapStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text \
  --region ap-northeast-2)

# Health check 테스트
curl ${API_URL}health
curl ${API_URL}user/v1/health
curl ${API_URL}admin/v1/health
```

예상 응답:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T12:00:00.000Z",
  "path": "/health",
  "version": "0.1.0-phase0a"
}
```

### 3. Lambda 로그 확인

```bash
aws logs tail /aws/lambda/evscrap-health \
  --follow \
  --region ap-northeast-2
```

## 롤백

### CloudFormation을 통한 롤백

```bash
aws cloudformation rollback-stack \
  --stack-name EvscrapStack \
  --region ap-northeast-2
```

### 이전 Lambda 버전으로 롤백

```bash
# Lambda 버전 목록 확인
aws lambda list-versions-by-function \
  --function-name evscrap-health \
  --region ap-northeast-2

# 특정 버전으로 별칭 업데이트
aws lambda update-alias \
  --function-name evscrap-health \
  --name prod \
  --function-version <VERSION_NUMBER> \
  --region ap-northeast-2
```

## 트러블슈팅

### 1. GitHub Actions 실패: "User is not authorized"

**원인**: OIDC Role의 Trust Policy가 올바르지 않거나, Role에 필요한 권한이 없습니다.

**해결**:

1. Role의 Trust Policy에 GitHub OIDC Provider와 리포지토리가 정확히 설정되어 있는지 확인
2. Role에 필요한 권한이 부여되어 있는지 확인

### 2. CDK Deploy 실패: "Stack already exists"

**원인**: 이전 배포가 완료되지 않았거나 충돌이 발생했습니다.

**해결**:

```bash
# 스택 상태 확인
aws cloudformation describe-stacks --stack-name EvscrapStack --region ap-northeast-2

# 필요 시 스택 삭제 후 재배포
npx cdk destroy
npx cdk deploy --all
```

### 3. Lambda 함수 업데이트 실패

**원인**: Lambda 함수가 아직 생성되지 않았거나, 함수 이름이 일치하지 않습니다.

**해결**:

1. 먼저 인프라를 배포하여 Lambda 함수를 생성
2. 함수 이름이 `evscrap-health`인지 확인

### 4. API Gateway 502 에러

**원인**: Lambda 함수 실행 중 에러가 발생했습니다.

**해결**:

1. CloudWatch Logs에서 에러 확인
2. Lambda 함수의 환경 변수가 올바르게 설정되어 있는지 확인
3. Lambda 실행 역할에 필요한 권한이 있는지 확인

## 리소스 삭제

모든 리소스를 삭제하려면:

```bash
cd infra
npx cdk destroy --all
```

> [!CAUTION]
> 이 명령은 모든 인프라를 삭제합니다. S3 버킷에 데이터가 있는 경우 먼저 백업하세요.

## 환경 변수

### 로컬 개발

`core-api/.env` 파일을 생성하고 다음 값을 설정하세요 (`.env.example` 참고):

```bash
PORT=3000
BUCKET_NAME=evscrap-evidence-090733632671
USER_POOL_ID=<CDK_OUTPUT에서_확인>
ADMIN_POOL_ID=<CDK_OUTPUT에서_확인>
AWS_REGION=ap-northeast-2
```

## 다음 단계

Phase 0-A 배포가 완료되면:

1. **Phase 0-B**: CI/CD에 스모크 테스트 추가
2. **Phase 1**: PostgreSQL(RDS) 및 도메인 모델 구현
3. **Phase 2**: 관리자 콘솔 개발
4. **Phase 3**: 사용자 PWA 개발
