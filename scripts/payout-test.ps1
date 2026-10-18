$base = "http://localhost:3001"
$rand = Get-Random -Minimum 10000 -Maximum 99999
$email = "payouttest_$rand@example.com"

Write-Host "--- Register partner + restaurant ---"
$regBody = @{
  name = "Payout Test"
  email = $email
  password = "payoutpass123"
  phone = "+8801700000001"
  role = "PARTNER"
} | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -Body $regBody -ContentType "application/json"
$token = $reg.token

$resBody = @{
  name = "Payout Kacchi"
  address = "Test 1"
  cuisine = "Bengali"
  deliveryTime = 30
  deliveryFee = 30
} | ConvertTo-Json
$res = Invoke-RestMethod -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $resBody -ContentType "application/json"
Write-Host "restaurantId: $($res.restaurant.id)"

Write-Host ""
Write-Host "--- POST /api/payouts with amount < minPayout (should 400) ---"
$pay1 = @{
  amount = 100
  method = "BKASH"
  destination = "01700000000"
} | ConvertTo-Json
try {
  $r1 = Invoke-WebRequest -Uri "$base/api/payouts" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $pay1 -ContentType "application/json" -UseBasicParsing
  Write-Host "Unexpected 2xx: HTTP $($r1.StatusCode) body: $($r1.Content)"
} catch {
  $ex = $_.Exception.Response
  if ($ex) {
    $code = [int]$ex.StatusCode
    $stream = $ex.GetResponseStream()
    $reader = New-Object IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "HTTP $code body: $body"
  } else {
    Write-Host "no response: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "--- 11 MB cover image (should reject with new 10MB limit) ---"
# Build a 11MB base64 data URL
$bigCover = "data:image/png;base64," + ("a" * (11 * 1024 * 1024))
$bigBody = @{
  name = "Big Cover Test"
  address = "Test 1"
  cuisine = "Test"
  deliveryTime = 30
  deliveryFee = 30
  coverImage = $bigCover
} | ConvertTo-Json -Depth 10
try {
  $r2 = Invoke-WebRequest -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $bigBody -ContentType "application/json" -UseBasicParsing
  Write-Host "Unexpected 2xx: HTTP $($r2.StatusCode)"
} catch {
  $ex = $_.Exception.Response
  if ($ex) {
    $code = [int]$ex.StatusCode
    $stream = $ex.GetResponseStream()
    $reader = New-Object IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "HTTP $code body: $body"
  } else {
    Write-Host "no response: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "--- Bad method (should 400) ---"
$bad = @{
  amount = 100
  method = "PAYPAL"
  destination = "01700000000"
} | ConvertTo-Json
try {
  $r3 = Invoke-WebRequest -Uri "$base/api/payouts" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $bad -ContentType "application/json" -UseBasicParsing
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
Write-Host "--- Earnings without orders (should be 200 + balance=0) ---"
$ear = Invoke-RestMethod -Uri "$base/api/partner/earnings" -Headers @{ Authorization = "Bearer $token" }
Write-Host "balance=$($ear.balance) minPayout=$($ear.minPayout) canRequest=$($ear.canRequestPayout) cards=$($ear.summaryCards.Count)"
