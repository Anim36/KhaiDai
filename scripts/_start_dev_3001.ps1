Set-Location D:\KhaiDai\khaidai
$env:SMOKE_BASE_URL = "http://localhost:3001"
$env:NODE_OPTIONS = "--max-old-space-size=2048"
$proc = Start-Process -FilePath "node" `
  -ArgumentList "node_modules/next/dist/bin/next","dev","-p","3001" `
  -WorkingDirectory "D:\KhaiDai\khaidai" `
  -RedirectStandardOutput ".next\dev-server.log" `
  -RedirectStandardError ".next\dev-server.err" `
  -WindowStyle Hidden `
  -PassThru
Write-Output "PID=$($proc.Id)"
