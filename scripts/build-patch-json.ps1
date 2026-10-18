$cover = Get-Content "D:\KhaiDai\khaidai\.tmp\big_cover.txt" -Raw
# Build JSON by hand so we know the coverImage is the only thing in
# the body — no ConvertTo-Json escaping weirdness.
$json = '{"coverImage":"' + $cover + '"}'
Write-Host ("json len = " + $json.Length)
Set-Content -Path "D:\KhaiDai\khaidai\.tmp\big_patch.json" -Value $json -NoNewline -Encoding UTF8
Write-Host "wrote big_patch.json"
