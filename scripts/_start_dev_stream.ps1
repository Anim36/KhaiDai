Set-Location D:\KhaiDai\khaidai
$proc = Start-Process -FilePath "node" `
  -ArgumentList "scripts/_dev_with_log.mjs" `
  -WorkingDirectory "D:\KhaiDai\khaidai" `
  -WindowStyle Hidden `
  -PassThru
Write-Output "PID=$($proc.Id)"
