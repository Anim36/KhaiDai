Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Remove-Item D:\KhaiDai\khaidai\.next\dev-server.log,D:\KhaiDai\khaidai\.next\dev-server.err -ErrorAction SilentlyContinue
& D:\KhaiDai\khaidai\scripts\_start_dev_simple.ps1
Start-Sleep -Seconds 10
