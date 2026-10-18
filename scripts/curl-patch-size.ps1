$base = "http://localhost:3001"
$rand = Get-Random -Minimum 10000 -Maximum 99999
$email = "curltest_$rand@example.com"

$regBody = @{ name = "Curl Size Test 2"; email = $email; password = "curlpass123"; phone = "+8801700000004"; role = "PARTNER" } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -Body $regBody -ContentType "application/json"
$token = $reg.token

$resBody = @{ name = "Curl Size Restaurant 2"; address = "Test 1"; cuisine = "Bengali"; deliveryTime = 30; deliveryFee = 30 } | ConvertTo-Json
$res = Invoke-RestMethod -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $resBody -ContentType "application/json"
$rid = $res.restaurant.id

$token | Out-File -FilePath "D:\KhaiDai\khaidai\.tmp\khaidai_token.txt" -Encoding ASCII -NoNewline
$rid | Out-File -FilePath "D:\KhaiDai\khaidai\.tmp\khaidai_rid.txt" -Encoding ASCII -NoNewline
Write-Host "restaurantId: $rid"
