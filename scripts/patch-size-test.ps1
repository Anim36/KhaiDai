$base = "http://localhost:3001"

# Use an existing seeded partner's restaurant. Login as a seeded
# partner if we have one, or just use the one we created.
$rand = Get-Random -Minimum 10000 -Maximum 99999
$email = "patchtest_$rand@example.com"

Write-Host "--- Register partner + restaurant ---"
$regBody = @{ name = "Patch Size Test"; email = $email; password = "patchpass123"; phone = "+8801700000002"; role = "PARTNER" } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -Body $regBody -ContentType "application/json"
$token = $reg.token

$resBody = @{ name = "Patch Size Restaurant"; address = "Test 1"; cuisine = "Bengali"; deliveryTime = 30; deliveryFee = 30 } | ConvertTo-Json
$res = Invoke-RestMethod -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $resBody -ContentType "application/json"
$rid = $res.restaurant.id
Write-Host "restaurantId: $rid"

Write-Host ""
Write-Host "--- PATCH /api/restaurants/$rid with 11 MB cover (should 400) ---"
$bigCover = "data:image/png;base64," + ("a" * (11 * 1024 * 1024))
$bigPatch = @{ coverImage = $bigCover } | ConvertTo-Json -Depth 10
try {
  $r1 = Invoke-WebRequest -Uri "$base/api/restaurants/$rid" -Method PATCH -Headers @{ Authorization = "Bearer $token" } -Body $bigPatch -ContentType "application/json" -UseBasicParsing
  Write-Host "Unexpected 2xx"
} catch {
  $ex = $_.Exception.Response
  if ($ex) {
    $code = [int]$ex.StatusCode
    $stream = $ex.GetResponseStream()
    $reader = New-Object IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "HTTP $code body: $body"
  }
}

Write-Host ""
Write-Host "--- PATCH with valid 1 KB cover (should 200) ---"
$small = @{ coverImage = "data:image/png;base64,iVBORw0KGgo=" } | ConvertTo-Json
$ok = Invoke-RestMethod -Uri "$base/api/restaurants/$rid" -Method PATCH -Headers @{ Authorization = "Bearer $token" } -Body $small -ContentType "application/json"
Write-Host "PATCH OK; new cover length = $($ok.restaurant.coverImage.Length)"
