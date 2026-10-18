# scripts/_backup-db.ps1 — pg_dump to timestamped file
#
# Reads the Postgres password from the project's `.env` file (or
# `PGPASSWORD` env var) — never hardcodes it.

$dir = Join-Path $PSScriptRoot ".db-backups"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ts = (Get-Date).ToString("yyyyMMdd-HHmmss")
$backup = Join-Path $dir "khaidai_db_$ts.dump"

# Pull password from .env if PGPASSWORD isn't already set.
if (-not $env:PGPASSWORD) {
  $envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^\s*DATABASE_URL\s*=\s*"?([^"]+)"?') {
        $uri = [System.Uri]$Matches[1]
        if ($uri.UserInfo) {
          $creds = $uri.UserInfo.Split(':')
          if ($creds.Length -ge 2) {
            $env:PGPASSWORD = $creds[1]
          }
        }
      }
    }
  }
}
if (-not $env:PGPASSWORD) {
  Write-Host "ERROR: PGPASSWORD not set and .env has no DATABASE_URL." -ForegroundColor Red
  exit 1
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
$psi.Arguments = "-h localhost -p 5432 -U postgres -F c -b -v -f `"$backup`" khaidai_db"
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.EnvironmentVariables["PGPASSWORD"] = $env:PGPASSWORD
$p = [System.Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEnd()
$err = $p.StandardError.ReadToEnd()
$p.WaitForExit()
Write-Host "exit: $($p.ExitCode)"
if ($err) { Write-Host "stderr:" $err }
Get-Item $backup -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime | Format-List