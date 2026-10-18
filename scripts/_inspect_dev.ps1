Get-ChildItem -Path "D:\KhaiDai\khaidai\.next\dev-server.log" -ErrorAction SilentlyContinue | Format-List LastWriteTime,Length
Write-Host "=== PROCS ==="
Get-Process -Name node -ErrorAction SilentlyContinue | Format-Table Id,ProcessName,@{Name='CPU';Expression={$_.CPU}},@{Name='Mem(MB)';Expression={[math]::Round($_.WorkingSet64/1MB,1)}}
Write-Host "=== PORT 3001 ==="
Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess | Format-Table
