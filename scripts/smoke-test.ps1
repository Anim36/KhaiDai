$base = "http://localhost:3001"
$rand = Get-Random -Minimum 10000 -Maximum 99999
$email = "smoketest_$rand@example.com"

Write-Host "--- 1. Register a PARTNER ---"
$regBody = @{
  name = "Smoke Partner"
  email = $email
  password = "smokepass123"
  phone = "+8801700000000"
  role = "PARTNER"
} | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST -Body $regBody -ContentType "application/json"
$token = $reg.token
$userId = $reg.user.id
Write-Host "  userId=$userId role=$($reg.user.role)"
Write-Host "  token=$($token.Substring(0, [Math]::Min(20, $token.Length)))..."

Write-Host ""
Write-Host "--- 2. Create a restaurant with a custom cuisine ---"
$resBody = @{
  name = "Smoke Kacchi"
  address = "House 12, Road 5, Dhaka"
  cuisine = "Bengali Specials"
  deliveryTime = 35
  deliveryFee = 50
  openingHours = "11:00 AM - 11:00 PM"
  latitude = 23.7806
  longitude = 90.4074
} | ConvertTo-Json
$res = Invoke-RestMethod -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $resBody -ContentType "application/json"
$rid = $res.restaurant.id
Write-Host "  restaurantId=$rid cuisine=$($res.restaurant.cuisine)"

Write-Host ""
Write-Host "--- 3. Add a menu item with a CUSTOM category ---"
$miBody = @{
  name = "Smoke Special Platter"
  price = 550
  category = "Bengali Specials"
  description = "Custom category test"
  available = $true
} | ConvertTo-Json
$mi = Invoke-RestMethod -Uri "$base/api/menu-items" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $miBody -ContentType "application/json"
$miId = $mi.item.id
Write-Host "  itemId=$miId savedCategory=$($mi.item.category)"

Write-Host ""
Write-Host "--- 4. GET /api/partner/earnings (no orders yet) ---"
$ear = Invoke-WebRequest -Uri "$base/api/partner/earnings" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
Write-Host "  HTTP $($ear.StatusCode)"
if ($ear.StatusCode -eq 200) {
  $j = $ear.Content | ConvertFrom-Json
  Write-Host "  summaryCards=$($j.summaryCards.Count) balance=$($j.balance) minPayout=$($j.minPayout) canRequest=$($j.canRequestPayout)"
}

Write-Host ""
Write-Host "--- 5. POST /api/payouts with balance below minimum (should 400) ---"
$pay1 = @{
  amount = 100
  method = "BKASH"
  destination = "01700000000"
} | ConvertTo-Json
$pay1r = Invoke-WebRequest -Uri "$base/api/payouts" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $pay1 -ContentType "application/json" -UseBasicParsing
Write-Host "  HTTP $($pay1r.StatusCode)"
$pay1j = $pay1r.Content | ConvertFrom-Json
Write-Host "  body: $($pay1j.error)"

Write-Host ""
Write-Host "--- 6. Try 11 MB cover image (should reject with new 10MB limit) ---"
# 11 MB worth of 'a' characters as data URL
$bigCover = "data:image/png;base64," + ("a" * (11 * 1024 * 1024))
$bigBody = @{
  name = "Big Cover Test"
  address = "Test 1"
  cuisine = "Test"
  deliveryTime = 30
  deliveryFee = 30
  coverImage = $bigCover
} | ConvertTo-Json -Depth 10
$bigR = Invoke-WebRequest -Uri "$base/api/restaurants" -Method POST -Headers @{ Authorization = "Bearer $token" } -Body $bigBody -ContentType "application/json" -UseBasicParsing
Write-Host "  HTTP $($bigR.StatusCode)"
$bigJ = $bigR.Content | ConvertFrom-Json
Write-Host "  body: $($bigJ.error)"

Write-Host ""
Write-Host "--- 7. /api/restaurants returns our new 'Bengali Specials' cuisine ---"
$listing = Invoke-RestMethod -Uri "$base/api/restaurants" -Method GET
$cuisines = ($listing.restaurants | ForEach-Object { $_.cuisine } | Sort-Object -Unique)
Write-Host "  cuisines seen in listing: $($cuisines -join ', ')"
