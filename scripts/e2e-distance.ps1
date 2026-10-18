# End-to-end test for distance-based restaurant filtering.
#
# Flow:
#   1. Register a PARTNER, login.
#   2. POST /api/restaurants with a Dhanmondi pin (lat=23.7461, lng=90.3742).
#   3. GET /api/restaurants (no lat/lng) -> the new restaurant is present.
#   4. GET /api/restaurants?lat=<Dhanmondi>&lng=<Dhanmondi> -> distanceKm <= ~0.
#   5. GET /api/restaurants?lat=<Chittagong>&lng=<Chittagong> -> empty list
#      (Chittagong is well over 5 km from Dhanmondi).
#   6. PATCH the restaurant with a Chittagong pin.
#   7. GET ?lat=<Chittagong> -> restaurant shows with new pin.

$base = "http://localhost:3000"
$rand = Get-Random -Minimum 100000 -Maximum 999999

function J($o) { return $o | ConvertTo-Json -Compress }

# ---------- partner register / login ----------
$register = Invoke-RestMethod -Uri "$base/api/auth/register" -Method POST `
  -ContentType "application/json" `
  -Body (J(@{
    name = "Spice Junction"
    email = "spice$rand@khaidai.test"
    password = "Password123!"
    phone = "+8801711000000"
    role = "PARTNER"
  })) -TimeoutSec 20
"REGISTER: " + ($register | ConvertTo-Json -Depth 1).Substring(0, [Math]::Min(80, ($register | ConvertTo-Json).Length))

$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (J(@{ email = "spice$rand@khaidai.test"; password = "Password123!" })) `
  -TimeoutSec 20
$token = $login.token
"HAS_TOKEN: " + ($null -ne $token)

$hdr = @{ Authorization = "Bearer $token" }

# ---------- create restaurant in Dhanmondi ----------
$create = Invoke-RestMethod -Uri "$base/api/restaurants" -Method POST `
  -ContentType "application/json" -Headers $hdr `
  -Body (J(@{
    name = "Spice Junction"
    address = "House 22, Road 7, Dhanmondi, Dhaka"
    cuisine = "Bangladeshi"
    deliveryTime = 30
    deliveryFee = 50
    openingHours = "10:00 AM - 11:00 PM"
    latitude = 23.7461
    longitude = 90.3742
  })) -TimeoutSec 20
"CREATE: " + $create.restaurant.id
$restaurantId = $create.restaurant.id

# ---------- list with no coords -> restaurant shows ----------
$allList = Invoke-RestMethod -Uri "$base/api/restaurants" -TimeoutSec 20
"ALL_TOTAL: " + $allList.restaurants.Count
"ALL_HAS_NEW: " + ($allList.restaurants | Where-Object { $_.id -eq $restaurantId } | Measure-Object).Count

# ---------- list near Dhanmondi (≈0 km) ----------
$nearList = Invoke-RestMethod -Uri "$base/api/restaurants?lat=23.7461&lng=90.3742" -TimeoutSec 20
"NEAR_TOTAL: " + $nearList.restaurants.Count
$near = $nearList.restaurants | Where-Object { $_.id -eq $restaurantId } | Select-Object -First 1
"NEAR_HAS_NEW: " + ($null -ne $near)
if ($near) { "NEAR_DIST: " + $near.distanceKm }

# ---------- list near Chittagong (well over 5 km) ----------
$farList = Invoke-RestMethod -Uri "$base/api/restaurants?lat=22.3569&lng=91.7832" -TimeoutSec 20
"FAR_TOTAL: " + $farList.restaurants.Count
$FAR = $farList.restaurants | Where-Object { $_.id -eq $restaurantId } | Select-Object -First 1
"FAR_HAS_NEW: " + ($null -ne $FAR)

# ---------- now move the restaurant pin to Chittagong ----------
$patch = Invoke-RestMethod -Uri "$base/api/restaurants/$restaurantId" -Method PATCH `
  -ContentType "application/json" -Headers $hdr `
  -Body (J(@{ latitude = 22.3569; longitude = 91.7832 })) -TimeoutSec 20
"PATCH_STATUS_OK: " + ($null -ne $patch.restaurant)

# ---------- list near Chittagong again ----------
$nearList2 = Invoke-RestMethod -Uri "$base/api/restaurants?lat=22.3569&lng=91.7832" -TimeoutSec 20
$near2 = $nearList2.restaurants | Where-Object { $_.id -eq $restaurantId } | Select-Object -First 1
"NEAR2_HAS_NEW: " + ($null -ne $near2)
if ($near2) { "NEAR2_DIST: " + $near2.distanceKm }
