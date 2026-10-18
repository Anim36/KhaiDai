Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
& D:\KhaiDai\khaidai\scripts\_start_dev_tee.ps1
Start-Sleep -Seconds 12
& D:\KhaiDai\khaidai\scripts\_inspect_dev.ps1
& D:\KhaiDai\khaidai\scripts\_probe_dev_long.ps1
