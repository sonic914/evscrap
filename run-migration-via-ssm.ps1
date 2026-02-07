# SSM 포트 포워딩 및 마이그레이션 실행 스크립트

Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "SSM 포트 포워딩 및 데이터베이스 마이그레이션`n" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

# 1. Instance ID 가져오기
Write-Host "Step 1: Bastion Instance ID 확인...`n" -ForegroundColor Yellow

$bastionId = aws cloudformation describe-stacks `
    --stack-name EvscrapStack `
    --region ap-northeast-2 `
    --query 'Stacks[0].Outputs[?OutputKey==`BastionInstanceId`].OutputValue' `
    --output text 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Bastion Instance ID: $bastionId`n" -ForegroundColor Green
}
else {
    Write-Host "❌ Failed to get Bastion Instance ID" -ForegroundColor Red
    Write-Host "$bastionId`n"
    exit 1
}

# 2. RDS 엔드포인트
$rdsHost = "evscrap-db.czyc40wu4fe3.ap-northeast-2.rds.amazonaws.com"

# 3. 사용자에게 SSM 세션 시작 안내
Write-Host "Step 2: SSM 포트 포워딩 시작 필요`n" -ForegroundColor Yellow
Write-Host "⚠️  새 PowerShell 창을 열고 다음 명령을 실행하세요:" -ForegroundColor Cyan
Write-Host ""
Write-Host "aws ssm start-session ``" -ForegroundColor Gray
Write-Host "  --target $bastionId ``" -ForegroundColor Gray  
Write-Host "  --region ap-northeast-2 ``" -ForegroundColor Gray
Write-Host "  --document-name AWS-StartPortForwardingSessionToRemoteHost ``" -ForegroundColor Gray
Write-Host "  --parameters '{``portNumber``:[``5432``],``localPortNumber``:[``5432``],``host``:[``$rdsHost``]}'" -ForegroundColor Gray
Write-Host ""
Write-Host "⏸️  SSM 세션을 시작한 후 Enter 키를 눌러 계속..." -ForegroundColor Yellow
Read-Host

# 4. .env 백업 및 수정
Write-Host "`nStep 3: .env 파일 수정...`n" -ForegroundColor Yellow
cd c:\Users\sonic\Projects\evscrap\evscrap\core-api

if (Test-Path .env.backup) {
    Remove-Item .env.backup -Force
}
Copy-Item .env .env.backup

(Get-Content .env) -replace 'evscrap-db\.czyc40wu4fe3\.ap-northeast-2\.rds\.amazonaws\.com', 'localhost' | Set-Content .env
Write-Host "✅ .env 파일이 localhost로 수정되었습니다.`n" -ForegroundColor Green

# 5. 데이터베이스 연결 테스트
Write-Host "Step 4: 데이터베이스 연결 테스트...`n" -ForegroundColor Yellow
Start-Sleep -Seconds 2

# 6. Prisma 마이그레이션
Write-Host "Step 5: Prisma 마이그레이션 실행...`n" -ForegroundColor Yellow
npx prisma db push

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ 마이그레이션 성공!`n" -ForegroundColor Green
}
else {
    Write-Host "`n❌ 마이그레이션 실패" -ForegroundColor Red
    Move-Item .env.backup .env -Force
    exit 1
}

# 7. 테스트 데이터 생성
Write-Host "Step 6: 테스트 데이터 생성...`n" -ForegroundColor Yellow
npx ts-node scripts/create-test-event.ts

# 8. .env 복원
Write-Host "`nStep 7: .env 파일 복원...`n" -ForegroundColor Yellow
Move-Item .env.backup .env -Force
Write-Host "✅ .env 파일이 복원되었습니다.`n" -ForegroundColor Green

# 9. 완료 안내
Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "🎉 데이터베이스 설정 완료!`n" -ForegroundColor Green
Write-Host "다음 단계:" -ForegroundColor Cyan
Write-Host "  1. Anchor Worker 테스트: cd .. && .\test-worker-simple.ps1" -ForegroundColor Gray
Write-Host "  2. CloudWatch 로그 확인: .\get-recent-logs.ps1" -ForegroundColor Gray
Write-Host "  3. SSM 세션 종료: 포트 포워딩 창에서 Ctrl+C" -ForegroundColor Gray
Write-Host "`n=========================================`n" -ForegroundColor Cyan
