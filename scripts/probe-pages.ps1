$ErrorActionPreference = 'Stop'
$urls = @(
  "http://localhost:3000/",
  "http://localhost:3000/dishes",
  "http://localhost:3000/api/dishes/trending?limit=12"
)
foreach ($u in $urls) {
  $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30 -Method HEAD
  Write-Host "$u -> $($r.StatusCode)"
}
