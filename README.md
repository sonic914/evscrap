# evscrap - 폐차장 증빙 관리 시스템

Phase 0-A: 배포 가능한 테스트 환경 골격

## 프로젝트 개요

폐차장에서 차량 폐차 과정의 증빙 자료를 관리하고, 블록체인 앵커링을 통해 신뢰성을 확보하는 시스템입니다.

**현재 단계**: Phase 0-B - 배포 후 자동 스모크 테스트 추가

## 디렉토리 구조

```
evscrap/
├── infra/              # AWS CDK 인프라 코드 (TypeScript)
│   ├── bin/           # CDK 앱 진입점
│   ├── lib/           # CDK 스택 정의
│   └── package.json
├── core-api/          # 백엔드 API (Node.js + TypeScript)
│   ├── src/
│   │   ├── handlers/  # Lambda 핸들러
│   │   └── local-server.ts
│   └── package.json
├── scripts/           # 유틸리티 스크립트
│   ├── get-api-endpoint.mjs
│   └── smoke-test.sh
├── docs/              # 운영 및 아키텍처 문서
│   ├── DEPLOY_RUNBOOK.md
│   ├── ARCHITECTURE_PHASE0.md
│   ├── TROUBLESHOOTING.md
│   └── SMOKE_TEST.md
├── .github/
│   └── workflows/     # CI/CD 파이프라인
└── Makefile           # 개발 편의 명령어
```

## AWS 환경

- **AWS Account ID**: 090733632671
- **AWS Region**: ap-northeast-2 (서울)
- **GitHub Repository**: sonic914/evscrap
- **Default Branch**: main

## 시작하기

### 사전 요구사항

- Node.js 20+
- AWS CLI 설정 (로컬 배포용)
- AWS CDK CLI: `npm install -g aws-cdk`

### 로컬 개발

```bash
# Core API 로컬 실행
make dev

# 또는
cd core-api
npm install
npm run dev
```

로컬 서버는 `http://localhost:3000`에서 실행됩니다.

**Health Check 엔드포인트**:

- `GET /health`
- `GET /user/v1/health`
- `GET /admin/v1/health`

### 인프라 배포

```bash
# CDK Bootstrap (최초 1회만)
cd infra
npx cdk bootstrap aws://090733632671/ap-northeast-2

# 배포
make deploy

# 또는
cd infra
npm install
npx cdk deploy --all
```

### CI/CD

GitHub Actions를 통한 자동 배포:

- **infra-deploy.yml**: `main` 브랜치에 `infra/**` 변경 시 자동 배포
- **core-api-deploy.yml**: `main` 브랜치에 `core-api/**` 변경 시 자동 배포

배포는 OIDC를 통해 AWS Role (`arn:aws:iam::090733632671:role/GitHubActions-evscrap-deploy-dev`)을 assume합니다.

## Phase 로드맵

- **Phase 0-A** (완료): 배포 가능한 인프라 골격
- **Phase 0-B** (완료): CI/CD 스모크 테스트 추가
- **Phase 1**: PostgreSQL(RDS) + 도메인 모델 구현
- **Phase 2**: 관리자 콘솔 개발
- **Phase 3**: 사용자 PWA 개발

## 문서

자세한 내용은 `docs/` 디렉토리를 참고하세요:

- [배포 가이드](docs/DEPLOY_RUNBOOK.md)
- [Phase 0 아키텍처](docs/ARCHITECTURE_PHASE0.md)
- [트러블슈팅](docs/TROUBLESHOOTING.md)
- [스모크 테스트](docs/SMOKE_TEST.md)

## 라이선스

Private Project
