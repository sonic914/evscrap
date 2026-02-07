# Simple Anchor Worker Test
# Sends a test message to SQS and checks Lambda execution

Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "Anchor Worker - Simple Test`n" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

$queueUrl = "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue"
$testEventId = "test-event-" + (Get-Date -Format "yyyyMMddHHmmss")

Write-Host "Step 1: Sending SQS message..." -ForegroundColor Yellow
Write-Host "Event ID: $testEventId`n" -ForegroundColor Gray

# Create AWS CLI input JSON file
$cliInput = @{
    QueueUrl    = $queueUrl
    MessageBody = @{
        eventId = $testEventId
    } | ConvertTo-Json -Compress
} | ConvertTo-Json

$tempFile = Join-Path $env:TEMP "sqs-cli-input.json"
$cliInput | Out-File -FilePath $tempFile -Encoding ASCII -NoNewline

Write-Host "DEBUG: Message will contain: {`"eventId`":`"$testEventId`"}`n" -ForegroundColor Gray

# Use --cli-input-json to avoid PowerShell escaping issues
$result = aws sqs send-message --cli-input-json "file://$tempFile" --region ap-northeast-2 2>&1

# Clean up
Remove-Item -Path $tempFile -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Message sent to SQS`n" -ForegroundColor Green
}
else {
    Write-Host "ERROR: Failed to send message" -ForegroundColor Red
    Write-Host "$result`n"
    exit 1
}

Write-Host "Step 2: Waiting 15 seconds for Lambda..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "`nStep 3: Checking CloudWatch Logs:`n" -ForegroundColor Yellow

aws logs tail /aws/lambda/evscrap-anchor-worker --since 2m --region ap-northeast-2

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "Expected Results:" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "SUCCESS: You should see 'Received 1 message(s)'" -ForegroundColor Green
Write-Host "         And 'Event not found' error (this is OK)`n" -ForegroundColor Green
Write-Host "FAILURE: No logs or old logs only" -ForegroundColor Red
Write-Host "         Check Lambda configuration`n" -ForegroundColor Red
