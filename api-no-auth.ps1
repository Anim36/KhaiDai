try {
  $r = Invoke-WebRequest -Uri "http://localhost:3007/api/riders/notification-preferences" -Method PATCH -UseBasicParsing -ContentType "application/json" -Body '{"notifyNewRequest": true}' -TimeoutSec 5
  Write-Host "status: $($r.StatusCode) - body: $($r.Content)"
} catch {
  Write-Host "Error: $($_.Exception.Message)"
}