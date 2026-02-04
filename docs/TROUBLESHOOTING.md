# 트러블슈팅 가이드

이 문서는 evscrap 프로젝트에서 발생할 수 있는 일반적인 문제와 해결 방법을 안내합니다.

## 목차

- [OIDC 관련 문제](#oidc-관련-문제)
- [CDK 관련 문제](#cdk-관련-문제)
- [API 관련 문제](#api-관련-문제)
- [Lambda 관련 문제](#lambda-관련-문제)
- [CloudWatch 로그 확인](#cloudwatch-로그-확인)

---

## OIDC 관련 문제

### 1. "User is not authorized to perform: sts:AssumeRoleWithWebIdentity"

**증상**: GitHub Actions 워크플로우가 AWS 인증 단계에서 실패

**원인**:

- GitHub Actions OIDC Role이 생성되지 않음
- Trust Policy에 GitHub OIDC Provider가 설정되지 않음
- Trust Policy의 `sub` 조건이 잘못됨

**해결 방법**:

1. AWS IAM 콘솔에서 Role 확인:

   ```
   arn:aws:iam::090733632671:role/GitHubActions-evscrap-deploy-dev
   ```

2. Trust Policy 확인 (Trust relationships 탭):

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

3. OIDC Provider가 없으면 생성:
   - Provider URL: `token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

---

### 2. "Error: Credentials could not be loaded"

**증상**: GitHub Actions에서 `id-token: write` 권한 에러

**해결 방법**:

워크플로우 파일에 권한 설정 확인:

```yaml
permissions:
  id-token: write
  contents: read
```

---

## CDK 관련 문제

### 1. "This stack uses assets, so the toolkit stack must be deployed"

**증상**: CDK deploy 시 Bootstrap 관련 에러

**원인**: CDK Bootstrap이 실행되지 않음

**해결 방법**:

```bash
cd infra
npx cdk bootstrap aws://090733632671/ap-northeast-2
```

---

### 2. "User is not authorized to perform: cloudformation:CreateStack"

**증상**: CDK deploy 시 권한 부족 에러

**원인**: GitHub Actions Role에 필요한 권한이 없음

**해결 방법**:

Role에 다음 권한 추가:

- `AWSCloudFormationFullAccess` (또는 최소 권한 정책)
- `IAMFullAccess` (Lambda 실행 Role 생성용)
- Lambda, API Gateway, S3, Cognito 관련 권한

최소 권한 정책 예시:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:CreateRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:PassRole",
        "lambda:*",
        "apigateway:*",
        "s3:*",
        "cognito-idp:*",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

### 3. "Stack EvscrapStack is in UPDATE_ROLLBACK_COMPLETE state"

**증상**: 이전 배포가 실패하여 스택이 롤백 상태

**해결 방법**:

1. CloudFormation 콘솔에서 스택 삭제
2. 또는 CDK로 삭제:
   ```bash
   cd infra
   npx cdk destroy
   ```
3. 재배포:
   ```bash
   npx cdk deploy --all
   ```

---

### 4. "Resource being requested does not exist in region"

**증상**: 잘못된 리전에 배포 시도

**원인**: AWS_REGION 환경 변수가 잘못 설정됨

**해결 방법**:

리전 확인:

```bash
echo $AWS_REGION  # ap-northeast-2이어야 함
```

CDK 앱에서 리전 확인 (`infra/bin/app.ts`):

```typescript
const env = {
  account: "090733632671",
  region: "ap-northeast-2",
};
```

---

## API 관련 문제

### 1. 배포 직후 스모크 테스트 실패 (502/503 에러)

**증상**: `bash smoke-test.sh` 실행 시 502 Bad Gateway 또는 503 Service Unavailable

**원인**:

- Lambda cold start (첫 호출 시 초기화 시간 필요)
- API Gateway 배포 전파 지연

**해결 방법**:

스모크 테스트는 자동으로 10회 재시도 (5초 간격)하므로, cold start 문제는 대부분 해결됩니다.

수동 재시도:

```bash
# 10-20초 대기 후 재시도
sleep 20
bash scripts/smoke-test.sh https://<api-id>.execute-api.ap-northeast-2.amazonaws.com/prod/
```

---

### 2. "404 Not Found" 에러

**증상**: health 엔드포인트 호출 시 404

**원인**: 엔드포인트 경로 불일치

**해결 방법**:

1. API Gateway 콘솔에서 리소스 확인:
   - `/health` 리소스가 있는지 확인
   - GET 메서드가 설정되어 있는지 확인

2. Lambda 통합 확인:
   - `/health` 리소스에 Lambda 함수가 연결되어 있는지 확인

3. 배포 확인:
   - API Gateway → Stages → prod → Deploy 확인

---

### 3. CORS 에러 (브라우저에서 접근 시)

**증상**: 브라우저 콘솔에 CORS 관련 에러

**원인**: API Gateway CORS 설정 누락

**해결 방법**:

CDK 스택에서 CORS 설정 확인 (`infra/lib/evscrap-stack.ts`):

```typescript
defaultCorsPreflightOptions: {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,
  allowMethods: apigateway.Cors.ALL_METHODS,
}
```

재배포:

```bash
cd infra
npx cdk deploy
```

---

## Lambda 관련 문제

### 1. Lambda 함수 업데이트 실패

**증상**: `aws lambda update-function-code` 실패

**원인**:

- Lambda 함수가 존재하지 않음
- ZIP 파일 경로 오류
- 권한 부족

**해결 방법**:

1. Lambda 함수 존재 확인:

   ```bash
   aws lambda get-function --function-name evscrap-health --region ap-northeast-2
   ```

2. 함수가 없으면 인프라 먼저 배포:

   ```bash
   cd infra
   npx cdk deploy
   ```

3. ZIP 파일 경로 확인:
   ```bash
   ls -lh core-api/lambda.zip
   ```

---

### 2. Lambda 함수 실행 에러 (500 Internal Server Error)

**증상**: API 호출 시 500 에러

**원인**: Lambda 함수 코드 내부 에러

**해결 방법**:

CloudWatch Logs 확인 (아래 섹션 참고)

---

## CloudWatch 로그 확인

### Lambda 로그 확인

**방법 1: AWS CLI**

```bash
# 최근 로그 스트림 확인
aws logs tail /aws/lambda/evscrap-health --follow --region ap-northeast-2

# 특정 시간대 로그 확인
aws logs filter-log-events \
  --log-group-name /aws/lambda/evscrap-health \
  --start-time $(date -d '10 minutes ago' +%s)000 \
  --region ap-northeast-2
```

**방법 2: AWS 콘솔**

1. CloudWatch → Logs → Log groups
2. `/aws/lambda/evscrap-health` 선택
3. 최신 Log stream 확인

---

### API Gateway 로그 확인

**방법 1: AWS CLI**

```bash
aws logs tail /aws/apigateway/evscrap-api --follow --region ap-northeast-2
```

**방법 2: AWS 콘솔**

1. CloudWatch → Logs → Log groups
2. `/aws/apigateway/<api-id>/prod` 선택 (API ID는 API Gateway 콘솔에서 확인)

---

## GitHub Actions 로그 확인

### 워크플로우 실패 시

1. GitHub 레포지토리 → Actions 탭
2. 실패한 워크플로우 클릭
3. 실패한 스텝 확인:
   - "CDK Deploy" - 인프라 배포 에러
   - "Smoke Test" - 스모크 테스트 에러
   - "Configure AWS credentials" - OIDC 인증 에러

### 스모크 테스트 실패 로그 예시

```
[Attempt 1/10] Testing https://xxxx.execute-api.ap-northeast-2.amazonaws.com/prod/health...
✗ Failed! HTTP 502

Response body:
{"message": "Internal server error"}

Retrying in 5s...
```

이 경우 CloudWatch Logs에서 Lambda 에러 확인 필요.

---

## 추가 리소스

- [AWS CDK Troubleshooting](https://docs.aws.amazon.com/cdk/v2/guide/troubleshooting.html)
- [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [API Gateway Troubleshooting](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-troubleshooting.html)
- [Lambda Troubleshooting](https://docs.aws.amazon.com/lambda/latest/dg/lambda-troubleshooting.html)

---

## 도움이 필요하면

1. CloudWatch Logs 확인
2. GitHub Actions 워크플로우 로그 확인
3. 이 문서의 해당 섹션 참고
4. 여전히 문제가 해결되지 않으면 Issue 생성
