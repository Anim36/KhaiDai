Set-Location D:\KhaiDai\khaidai
$base = 'http://localhost:3001'
$stamp = Get-Date -Format "HHmmss"
$password = 'demo1234'

function Invoke-Api($method, $path, $body, $token) {
  $headers = @{ 'Content-Type' = 'application/json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $params = @{
    Method = $method
    Uri = "$base$path"
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = 30
    ErrorAction = 'SilentlyContinue'
    MaximumRedirection = 0
  }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 10) }
  try {
    $r = Invoke-WebRequest @params
  } catch {
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $text = $reader.ReadToEnd()
      return @{ status = $code; data = $text }
    }
    return @{ status = 0; data = $_.Exception.Message }
  }
  if ($r.Content -eq '') { return @{ status = $r.StatusCode; data = $null } }
  return @{ status = $r.StatusCode; data = ($r.Content | ConvertFrom-Json) }
}

function Log($step, $r) {
  $extra = ''
  if ($r.data -ne $null -and $r.data -isnot [string]) {
    $extra = " $($r.data | ConvertTo-Json -Compress -Depth 4)"
  } elseif ($r.data -is [string]) {
    $extra = " $($r.data.Substring(0, [Math]::Min($r.data.Length, 100)))"
  }
  Write-Output "$step=$($r.status)$extra"
}

# 1. Register customer + partner + rider
$rrr = Invoke-Api POST '/api/auth/register' @{
  name = "Customer $stamp"
  email = "cust_$stamp@khaidai.com"
  password = $password
  role = 'CUSTOMER'
}
Log 'register customer' $rrr
$customerToken = $rrr.data.token

$rrr = Invoke-Api POST '/api/auth/register' @{
  name = "Partner $stamp"
  email = "part_$stamp@khaidai.com"
  password = $password
  role = 'PARTNER'
  phone = '+8801711111111'
}
Log 'register partner' $rrr
$partnerToken = $rrr.data.token

$rrr = Invoke-Api POST '/api/auth/register' @{
  name = "Rider $stamp"
  email = "rid_$stamp@khaidai.com"
  password = $password
  role = 'RIDER'
  phone = '+8801711222222'
  vehicleType = 'scooter'
  vehicleRegNumber = 'DH-1234'
}
Log 'register rider' $rrr
$riderToken = $rrr.data.token
$riderUserId = $rrr.data.user.id

Log 'rider online + at restaurant pin' (Invoke-Api POST '/api/riders/location' @{
  isOnline = $true
  lat = 23.79
  lng = 90.40
} $riderToken)

# 2. Partner creates a restaurant with a pin in Dhaka
$rrr = Invoke-Api POST '/api/restaurants' @{
  name = "Review Test $stamp"
  address = "Banani, Dhaka"
  cuisine = "Bangladeshi"
  deliveryTime = 30
  deliveryFee = 50
  openingHours = "10:00 - 22:00"
  latitude = 23.79
  longitude = 90.40
  coverImage = $null
} $partnerToken
Log 'create restaurant' $rrr
$restaurantId = $rrr.data.restaurant.id

$rrr = Invoke-Api POST '/api/menu-items' @{
  restaurantId = $restaurantId
  name = "Test Biryani"
  price = 250
  category = "Main"
  description = "Test"
  available = $true
} $partnerToken
Log 'add menu' $rrr
$menuId = $rrr.data.item.id

# 3. Customer places an order, walk to DELIVERED
$rrr = Invoke-Api POST '/api/orders' @{
  restaurantId = $restaurantId
  items = @(@{ menuItemId = $menuId; quantity = 2 })
  deliveryAddress = "House 1, Banani, Dhaka"
  paymentMethod = 'CASH'
} $customerToken
Log 'place order' $rrr
$orderId = $rrr.data.order.id

Log 'partner PREPARING' (Invoke-Api PATCH "/api/orders/$orderId" @{ status = 'preparing' } $partnerToken)
Log 'partner READY'     (Invoke-Api PATCH "/api/orders/$orderId" @{ status = 'ready' } $partnerToken)

# Dispatch is async — wait briefly.
Start-Sleep -Seconds 2

$rrr = Invoke-Api GET "/api/orders/$orderId" $null $customerToken
Log 'read order' $rrr
$assignedRiderId = $rrr.data.order.rider.id

if ($assignedRiderId -eq $riderUserId) {
  Log 'rider PICKED_UP'  (Invoke-Api PATCH "/api/orders/$orderId" @{ status = 'picked_up' } $riderToken)
  Log 'rider ON_THE_WAY' (Invoke-Api PATCH "/api/orders/$orderId" @{ status = 'on_the_way' } $riderToken)
  Log 'rider DELIVERED'  (Invoke-Api PATCH "/api/orders/$orderId" @{ status = 'delivered' } $riderToken)
} else {
  Write-Output "Auto-dispatch picked existing rider ($assignedRiderId) instead of ours - test cannot continue."
  exit 1
}

# 4. Customer submits reviews
Log 'submit RESTAURANT review' (Invoke-Api POST '/api/reviews' @{
  orderId = $orderId
  kind = 'RESTAURANT'
  rating = 5
  comment = 'Excellent biryani!'
} $customerToken)

Log 'submit RIDER review' (Invoke-Api POST '/api/reviews' @{
  orderId = $orderId
  kind = 'RIDER'
  rating = 4
  comment = 'Polite but the bike was loud'
} $customerToken)

Log 'duplicate RESTAURANT review (409)' (Invoke-Api POST '/api/reviews' @{
  orderId = $orderId
  kind = 'RESTAURANT'
  rating = 1
} $customerToken)

# 5. List reviews
$rrr = Invoke-Api GET "/api/restaurants/$restaurantId/reviews?limit=10" $null $null
Write-Output "list restaurant reviews count=$($rrr.data.reviews.Count) summary.count=$($rrr.data.summary.count) summary.average=$($rrr.data.summary.average) breakdown=$($rrr.data.summary.breakdown -join ',')"

$rrr = Invoke-Api GET "/api/riders/$assignedRiderId/reviews?limit=10" $null $null
Write-Output "list rider reviews count=$($rrr.data.reviews.Count) summary.count=$($rrr.data.summary.count) summary.average=$($rrr.data.summary.average)"

# 6. Partner reviews page
$rrr = Invoke-Api GET '/api/partner/reviews' $null $partnerToken
Log 'partner reviews (list)' $rrr
$reviewId = $rrr.data.reviews[0].id

Log 'partner reply' (Invoke-Api PATCH "/api/reviews/$reviewId/reply" @{ replyText = 'Thank you!' } $partnerToken)

# 7. Restaurant detail rating should now reflect the new average
$rrr = Invoke-Api GET "/api/restaurants/$restaurantId" $null $null
Write-Output "restaurant detail rating=$($rrr.data.restaurant.rating) reviews=$($rrr.data.restaurant.reviews)"

# 8. Listing endpoint should reflect the same
$rrr = Invoke-Api GET '/api/restaurants' $null $null
$ours = $rrr.data.restaurants | Where-Object { $_.id -eq $restaurantId } | Select-Object -First 1
Write-Output "list rating=$($ours.rating) reviews=$($ours.reviews)"

Write-Output "DONE"
