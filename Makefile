.PHONY: help dev deploy synth diff bootstrap clean

help: ## 사용 가능한 명령어 표시
	@echo "evscrap Makefile 명령어:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## Core API 로컬 서버 실행
	@echo "Core API 로컬 서버를 시작합니다..."
	cd core-api && npm install && npm run dev

deploy: ## CDK 인프라 배포
	@echo "CDK 인프라를 배포합니다..."
	cd infra && npm install && npx cdk deploy --all

synth: ## CDK 템플릿 생성 (CloudFormation)
	@echo "CDK 템플릿을 생성합니다..."
	cd infra && npm install && npx cdk synth

diff: ## 배포될 변경사항 확인
	@echo "배포 예정 변경사항을 확인합니다..."
	cd infra && npm install && npx cdk diff

bootstrap: ## CDK Bootstrap 실행 (최초 1회)
	@echo "CDK Bootstrap을 실행합니다..."
	cd infra && npx cdk bootstrap aws://090733632671/ap-northeast-2

clean: ## 빌드 산출물 및 node_modules 삭제
	@echo "빌드 산출물을 삭제합니다..."
	rm -rf infra/node_modules infra/cdk.out infra/dist
	rm -rf core-api/node_modules core-api/dist

install: ## 모든 의존성 설치
	@echo "의존성을 설치합니다..."
	cd infra && npm install
	cd core-api && npm install
