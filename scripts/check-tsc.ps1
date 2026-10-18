Set-Location D:\KhaiDai\khaidai
cmd /c "npx tsc --noEmit > %TEMP%\tsc.log 2>&1"
$lines = (Get-Content $env:TEMP\tsc.log | Measure-Object -Line).Lines
if ($lines -gt 0) {
  Get-Content $env:TEMP\tsc.log
} else {
  "TYPECHECK_CLEAN"
}
