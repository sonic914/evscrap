# Create Test Event and Send to SQS
# PowerShell script for Windows

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Anchor Worker Test - Event Creation" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Use existing tenant or create via admin
Write-Host "1️⃣  Using test tenant..." -ForegroundColor Yellow
$tenantId = "test-tenant-001"
Write-Host "   📋 Tenant ID: $tenantId" -ForegroundColor Gray
Write-Host ""

# 2. Create test case (which creates a PENDING event)
Write-Host "2️⃣  Creating test case..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$caseBody = @{
    vin   = "TEST-VIN-$timestamp"
    make  = "Tesla"
    model = "Model 3"
    year  = 2023
} | ConvertTo-Json

$headers = @{
    "Content-Type"     = "application/json"
    "X-Test-Tenant-Id" = $tenantId
}

try {
    $caseResponse = Invoke-RestMethod -Uri "http://localhost:3000/user/v1/cases" -Method Post -Body $caseBody -Headers $headers -ErrorAction Stop
    
    Write-Host "   ✅ Case created: $($caseResponse.caseId)" -ForegroundColor Green
    Write-Host "   📋 VIN: $($caseResponse.vin)" -ForegroundColor Gray
    
    # Find the PENDING event
    $pendingEvent = $caseResponse.events | Where-Object { $_.anchorStatus -eq "PENDING" } | Select-Object -First 1
    
    if ($pendingEvent) {
        $eventId = $pendingEvent.eventId
        Write-Host "   ✅ Event created: $eventId" -ForegroundColor Green
        Write-Host "   📌 Anchor Status: $($pendingEvent.anchorStatus)" -ForegroundColor Gray
    }
    else {
        Write-Host "   ❌ No PENDING event found in response" -ForegroundColor Red
        Write-Host "   Response: $($caseResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
        exit 1
    }
}
catch {
    Write-Host "   ❌ Error creating case: $_" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# 3. Send message to SQS
Write-Host "3️⃣  Sending message to SQS..." -ForegroundColor Yellow

$queueUrl = "https://sqs.ap-northeast-2.amazonaws.com/090733632671/evscrap-anchor-events-queue"
$messageBody = "{`"eventId`":`"$eventId`"}"

try {
    $sqsResponse = aws sqs send-message `
        --queue-url $queueUrl `
        --message-body $messageBody `
        --region ap-northeast-2 `
        2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Message sent to SQS" -ForegroundColor Green
        Write-Host "   📨 Message: $messageBody" -ForegroundColor Gray
    }
    else {
        Write-Host "   ❌ Failed to send SQS message: $sqsResponse" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "   ❌ Error sending SQS message: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 4. Wait and check logs
Write-Host "4️⃣  Waiting 10 seconds for Lambda processing..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "5️⃣  Checking CloudWatch Logs..." -ForegroundColor Yellow
aws logs tail /aws/lambda/evscrap-anchor-worker --since 2m --region ap-northeast-2

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Event ID for verification: $eventId" -ForegroundColor Green
Write-Host ""
Write-Host "To verify in DB, run:" -ForegroundColor Yellow
Write-Host "SELECT event_id, anchor_status, anchor_txid FROM events WHERE event_id = '$eventId';" -ForegroundColor Gray
