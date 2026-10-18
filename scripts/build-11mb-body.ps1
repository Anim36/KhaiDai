$token = Get-Content "D:\KhaiDai\khaidai\.tmp\khaidai_token.txt"
$rid = Get-Content "D:\KhaiDai\khaidai\.tmp\khaidai_rid.txt"
Write-Host "token=$token"
Write-Host "rid=$rid"
$cover = "data:image/png;base64," + ("a" * (11 * 1024 * 1024))
Write-Host ("cover len = " + $cover.Length)
Set-Content -Path "D:\KhaiDai\khaidai\.tmp\big_cover.txt" -Value $cover -NoNewline
Write-Host "wrote big_cover.txt"
