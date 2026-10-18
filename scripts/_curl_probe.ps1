$out = curl.exe --max-time 60 -sS -o D:\KhaiDai\khaidai\.next\probe.body -w "status=%{http_code}`r`nsize=%{size_download}`r`n" -X POST -H "content-type: application/json" --data "{`"email`":`"x`",`"password`":`"x`"}" http://localhost:3001/api/auth/login
Write-Host $out
Write-Host "=== body ==="
Get-Content D:\KhaiDai\khaidai\.next\probe.body -Tail 5
