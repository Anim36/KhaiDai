$ErrorActionPreference = 'Stop'
# Read DATABASE_URL from .env (the script does not hardcode
# any credentials). Falls back to whatever is already exported
# in the user's shell session.
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not $env:DATABASE_URL -and (Test-Path $envFile)) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*"?([^"]+)"?') {
      $env:DATABASE_URL = $Matches[1]
    }
  }
}
if (-not $env:DATABASE_URL) {
  Write-Host "ERROR: DATABASE_URL not set and .env is missing DATABASE_URL." -ForegroundColor Red
  exit 1
}
# Mirror the password out of DATABASE_URL into PGPASSWORD so psql
# can pick it up.
$uri = [System.Uri]$env:DATABASE_URL
if ($uri.UserInfo) {
  $creds = $uri.UserInfo.Split(':')
  if ($creds.Length -ge 2) {
    $env:PGPASSWORD = $creds[1]
  }
}
$queries = @(
  'SELECT COUNT(*) AS restaurants FROM "Restaurant";',
  'SELECT COUNT(*) AS menu_items FROM "MenuItem";',
  'SELECT COUNT(*) AS delivered_orders FROM "Order" WHERE status = ''DELIVERED'';',
  'SELECT COUNT(*) AS orders FROM "Order";'
)
foreach ($q in $queries) {
  Write-Host "--- $q ---"
  & psql -h localhost -U postgres -d khaidai_db -c $q
}
