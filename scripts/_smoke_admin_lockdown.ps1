$base = 'http://localhost:3000'

# 1. Login as a CUSTOMER (existing test user from earlier sessions).
$custBody = '{"email":"customer-smoke@khaidai.test","password":"khaidai1234"}'
try {
  $cust = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $custBody
  $custHeaders = @{ Authorization = "Bearer $($cust.token)" }
  Write-Host "CUSTOMER login: ok, role=$($cust.user.role)"
} catch {
  Write-Host "CUSTOMER login failed:" $_.Exception.Message
  exit 1
}

# 2. Hit an admin endpoint as a customer — should 403.
try {
  $r = Invoke-WebRequest -Uri "$base/api/admin/overview" -Headers $custHeaders -Method GET -UseBasicParsing
  Write-Host "CUSTOMER → /api/admin/overview: status=$($r.StatusCode) (UNEXPECTED!)"
} catch {
  Write-Host "CUSTOMER → /api/admin/overview: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 403)"
}

# 3. Hit the admin overview unauthenticated — should 401.
try {
  $r = Invoke-WebRequest -Uri "$base/api/admin/overview" -Method GET -UseBasicParsing
  Write-Host "GUEST → /api/admin/overview: status=$($r.StatusCode) (UNEXPECTED!)"
} catch {
  Write-Host "GUEST → /api/admin/overview: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 401)"
}

# 4. Login as PARTNER and try to hit /admin — should redirect (status 307 from middleware).
$partBody = '{"email":"spice175318@khaidai.test","password":"khaidai1234"}'
try {
  $part = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $partBody
  $partHeaders = @{ Authorization = "Bearer $($part.token)" }
  Write-Host "PARTNER login: ok, role=$($part.user.role)"
  try {
    $r = Invoke-WebRequest -Uri "$base/admin/dashboard" -Headers $partHeaders -Method GET -UseBasicParsing
    Write-Host "PARTNER → /admin/dashboard: status=$($r.StatusCode) (UNEXPECTED!)"
  } catch {
    Write-Host "PARTNER → /admin/dashboard: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 307)"
  }
} catch {
  Write-Host "PARTNER login skipped:" $_.Exception.Message
}

# 5. Login as the ADMIN and try to hit /partner/dashboard — should redirect.
$admBody = '{"email":"admin-smoke@khaidai.test","password":"hunter2smoke"}'
$adm = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $admBody
$admHeaders = @{ Authorization = "Bearer $($adm.token)" }
Write-Host "ADMIN login: ok, role=$($adm.user.role)"
try {
  $r = Invoke-WebRequest -Uri "$base/partner/dashboard" -Headers $admHeaders -Method GET -UseBasicParsing
  Write-Host "ADMIN → /partner/dashboard: status=$($r.StatusCode) (UNEXPECTED!)"
} catch {
  Write-Host "ADMIN → /partner/dashboard: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 307)"
}

# 6. Unauthenticated visit to /admin/dashboard — middleware should redirect to /admin/login.
try {
  $r = Invoke-WebRequest -Uri "$base/admin/dashboard" -Method GET -UseBasicParsing
  Write-Host "GUEST → /admin/dashboard: status=$($r.StatusCode) (UNEXPECTED!)"
} catch {
  Write-Host "GUEST → /admin/dashboard: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 307 → /admin/login)"
}

# 7. Try to login as the suspended smoke admin — should fail with 401.
# (We'll suspend them first as ADMIN, then try to login as them.)
$userId = ($adm.user).id
$null = Invoke-RestMethod -Uri "$base/api/admin/users/$userId" -Headers $admHeaders -Method GET
$suspendBody = '{"isSuspended":true}'
$susp = Invoke-RestMethod -Uri "$base/api/admin/users/$userId" -Headers $admHeaders -Method PATCH -ContentType "application/json" -Body $suspendBody
Write-Host "Suspended admin result:" ($susp | ConvertTo-Json)
try {
  $reLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $admBody
  Write-Host "SUSPENDED admin re-login: status=200 (UNEXPECTED!)"
} catch {
  Write-Host "SUSPENDED admin re-login: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 401)"
}
# Un-suspend so other tests can use this account again.
$unBody = '{"isSuspended":false}'
$un = Invoke-RestMethod -Uri "$base/api/admin/users/$userId" -Headers $admHeaders -Method PATCH -ContentType "application/json" -Body $unBody
Write-Host "Unsuspended admin result:" ($un | ConvertTo-Json)
