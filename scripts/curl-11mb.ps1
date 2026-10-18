$token = Get-Content "D:\KhaiDai\khaidai\.tmp\khaidai_token.txt"
$rid = Get-Content "D:\KhaiDai\khaidai\.tmp\khaidai_rid.txt"
$uri = "http://localhost:3001/api/restaurants/" + $rid
Write-Host "PATCHing 11MB body to $uri"
$respFile = "D:\KhaiDai\khaidai\.tmp\patch_resp.json"
curl.exe -X PATCH `
  -H ("Authorization: Bearer " + $token) `
  -H "Content-Type: application/json" `
  --data-binary "@D:/KhaiDai/khaidai/.tmp/big_patch.json" `
  $uri `
  --max-time 30 `
  -s `
  -w "`nHTTP %{http_code}`n" `
  -o $respFile
Write-Host "--- response body ---"
Get-Content $respFile
