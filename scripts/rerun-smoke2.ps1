Remove-Item $env:TEMP\next-err.log -ErrorAction SilentlyContinue
powershell -ExecutionPolicy Bypass -File D:\KhaiDai\khaidai\scripts\smoke-all.ps1
"----ERRORS----"
if (Test-Path $env:TEMP\next-err.log) { Get-Content $env:TEMP\next-err.log } else { "(none)" }
