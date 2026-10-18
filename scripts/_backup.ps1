# scripts/_backup.ps1
#
# One-shot DB backup before each migration. Reads DATABASE_URL from
# .env (in the project root) and dumps the schema + data into
# scripts/_backups/<timestamp>.dump using pg_dump's custom format.
#
# Run with:  powershell -ExecutionPolicy Bypass -File scripts\_backup.ps1 [label]
param(
  [string]$Label = "manual"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pgDump = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
if (-not (Test-Path $pgDump)) { throw "pg_dump not found at $pgDump" }

$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw ".env not found at $envFile" }
$line = (Get-Content $envFile | Where-Object { $_ -match "^DATABASE_URL=" } | Select-Object -First 1)
$dbUrl = $line.Substring("DATABASE_URL=".Length).Trim()
$dbUrl = $dbUrl.Trim('"').Trim("'")

$uri = [System.Uri]$dbUrl
$userInfo = $uri.UserInfo
if ([string]::IsNullOrEmpty($userInfo)) { throw "Could not parse userinfo from $dbUrl" }
$user = $userInfo.Split(":")[0]
$pass = $userInfo.Split(":")[1]
$pgHost = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$db = $uri.LocalPath.TrimStart("/")
if ($db.Contains("?")) { $db = $db.Substring(0, $db.IndexOf("?")) }

$backupDir = Join-Path $root "scripts\_backups"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $backupDir ("khaidai_{0}_{1}.dump" -f $Label, $stamp)
$env:PGPASSWORD = $pass

& $pgDump -h $pgHost -p $port -U $user -d $db -F c -f $out --no-owner --no-acl
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

Remove-Item Env:PGPASSWORD
"OK: $out"
"size: {0} KB" -f [int]((Get-Item $out).Length / 1024)