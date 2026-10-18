Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Remove-Item D:\KhaiDai\khaidai\.next\dev-server.log -ErrorAction SilentlyContinue
Set-Location D:\KhaiDai\khaidai
& node node_modules\next\dist\bin\next dev -p 3001 2>&1
