$ErrorActionPreference = 'Stop'
try {
  $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -UseBasicParsing -TimeoutSec 30 -Method POST -Headers @{"content-type"="application/json"} -Body '{"email":"toggle-test@khaidai.test","password":"Password1!"}'
  Write-Host "STATUS: $($resp.StatusCode)"
  Write-Host "BODY: $($resp.Content)"
} catch {
  Write-Host "ERROR: $($_.Exception.Message)"
  if ($_.Exception.Response) {
    Write-Host "STATUS: $($_.Exception.Response.StatusCode)"
    Write-Host "BODY: $($_.Exception.Response.Content)"
  }
}
