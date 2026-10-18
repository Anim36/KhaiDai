$env:SMOKE_BASE_URL = "http://localhost:3001"
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"x@x.test","password":"x"}' -ErrorAction Stop -TimeoutSec 5
    if ($r.StatusCode -ge 200) { break }
  } catch {
    $ex = $_.Exception
    if ($ex.Response -and $ex.Response.StatusCode) { break }
  }
  Start-Sleep -Seconds 1
}
Write-Output "ready"
