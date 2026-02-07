# Get latest CloudWatch logs for Anchor Worker

Write-Host "Fetching latest CloudWatch Logs for Anchor Worker...`n" -ForegroundColor Cyan

# Get logs from last 2 minutes
$logs = aws logs filter-log-events `
    --log-group-name "/aws/lambda/evscrap-anchor-worker" `
    --start-time ([DateTimeOffset]::Now.AddMinutes(-2).ToUnixTimeMilliseconds()) `
    --region ap-northeast-2 `
    --max-items 50 | ConvertFrom-Json

if ($logs.events) {
    Write-Host "Found $($logs.events.Count) log events:`n" -ForegroundColor Green
    
    foreach ($event in $logs.events) {
        $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($event.timestamp).ToLocalTime()
        Write-Host "[$timestamp] $($event.message)" -ForegroundColor White
    }
}
else {
    Write-Host "No logs found in the last 2 minutes." -ForegroundColor Yellow
}
