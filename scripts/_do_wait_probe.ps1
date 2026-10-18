Start-Sleep -Seconds 90
& D:\KhaiDai\khaidai\scripts\_inspect_dev.ps1
Write-Host "=== LOG ==="
Get-Content D:\KhaiDai\khaidai\.next\dev-server.log -Tail 30
& D:\KhaiDai\khaidai\scripts\_curl_probe.ps1
