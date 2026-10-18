Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Set-Location D:\KhaiDai\khaidai
& node node_modules/next/dist/bin/next dev -p 3001 2>&1
