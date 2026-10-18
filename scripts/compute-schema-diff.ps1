# scripts/compute-schema-diff.ps1 — diff DB schema vs the Prisma
# datamodel. Reads DATABASE_URL from the project's `.env` file
# (or whatever is already exported) so the password is never
# checked into source.
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
Set-Location D:\KhaiDai\khaidai
& npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
