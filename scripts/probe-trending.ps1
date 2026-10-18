$ErrorActionPreference = 'Stop'
$resp = Invoke-WebRequest -Uri "http://localhost:3000/api/dishes/trending?limit=12" -UseBasicParsing -TimeoutSec 30 -Headers @{"Accept"="application/json"}
Write-Host "STATUS: $($resp.StatusCode)"
Write-Host "BODY:"
Write-Host $resp.Content
