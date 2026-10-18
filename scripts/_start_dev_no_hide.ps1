# _start_dev_no_hide.ps1 — start dev server with output to console
# Useful when the standard _start_dev_simple.ps1 hangs silently.
Set-Location D:\KhaiDai\khaidai
$env:NODE_OPTIONS = "--max-old-space-size=2048"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:DEBUG = "next:*"
node node_modules/next/dist/bin/next dev -p 3000 2>&1 | Out-File -FilePath ".next\dev-server.log" -Append