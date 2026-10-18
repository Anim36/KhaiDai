Start-Sleep -Seconds 15
curl.exe --max-time 60 -sS -o D:\KhaiDai\khaidai\.next\probe.body -w "status=%{http_code} size=%{size_download}`n" -X POST -H "content-type: application/json" --data "{`"email`":`"x`",`"password`":`"x`"}" http://localhost:3001/api/auth/login
