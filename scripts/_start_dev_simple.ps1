Set-Location D:\KhaiDai\khaidai
$env:NODE_OPTIONS = "--max-old-space-size=2048"
$env:NEXT_TELEMETRY_DISABLED = "1"
$proc = Start-Process -FilePath "node" `
  -ArgumentList "node_modules/next/dist/bin/next","dev","-p","3000" `
  -WorkingDirectory "D:\KhaiDai\khaidai" `
  -RedirectStandardOutput ".next\dev-server.log" `
  -RedirectStandardError ".next\dev-server.err" `
  -WindowStyle Hidden `
  -PassThru
Write-Output "PID=$($proc.Id)"
