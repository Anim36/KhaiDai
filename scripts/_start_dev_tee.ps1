Set-Location D:\KhaiDai\khaidai
$env:NODE_OPTIONS = "--max-old-space-size=2048"
$env:NEXT_TELEMETRY_DISABLED = "1"
$logPath = "D:\KhaiDai\khaidai\.next\dev-server.log"
Remove-Item $logPath -ErrorAction SilentlyContinue
$proc = Start-Process -FilePath "node" `
  -ArgumentList "node_modules\next\dist\bin\next","dev","-p","3001" `
  -WorkingDirectory "D:\KhaiDai\khaidai" `
  -RedirectStandardOutput $logPath `
  -NoNewWindow `
  -PassThru
Write-Output "PID=$($proc.Id)"
