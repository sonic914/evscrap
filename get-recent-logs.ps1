# Get very recent logs (last 1 minute)

Write-Host "Fetching latest CloudWatch Logs (last 1 minute)...`n" -ForegroundColor Cyan

$startTime = [DateTimeOffset]::Now.AddMinutes(-1).ToUnixTimeMilliseconds()

$logs = aws logs filter-log-events `
    --log-group-name "/aws/lambda/evscrap-anchor-worker" `
    --start-time $startTime `
    --region ap-northeast-2 | ConvertFrom-Json

if ($logs.events -and $logs.events.Count -gt 0) {
    Write-Host "Found $($logs.events.Count) log events:`n" -ForegroundColor Green
    
    foreach ($event in $logs.events) {
        $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($event.timestamp).ToLocalTime()
        $message = $event.message
        
        # Highlight important messages
        if ($message -match "ERROR" -or $message -match "Failed") {
            Write-Host "[$timestamp] $message" -ForegroundColor Red
        }
        elseif ($message -match "AnchorWorker|ProcessEvent") {
            Write-Host "[$timestamp] $message" -ForegroundColor Cyan
        }
        else {
            Write-Host "[$timestamp] $message" -ForegroundColor White
        }
    }
}
else {
    Write-Host "No logs found in the last minute." -ForegroundColor Yellow
    Write-Host "The Lambda might not have been triggered yet, or logs are delayed." -ForegroundColor Yellow
}
