$err = Get-Content -Path ".next\dev-server.err" -Tail 30 -ErrorAction SilentlyContinue
$log = Get-Content -Path ".next\dev-server.log" -Tail 30 -ErrorAction SilentlyContinue
Write-Host "=== LOG ==="
Write-Host $log
Write-Host "=== ERR ==="
Write-Host $err
Write-Host "=== PROCS ==="
Get-Process -Name node -ErrorAction SilentlyContinue | Format-Table Id,ProcessName,StartTime
