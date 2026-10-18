$base = 'http://localhost:3000'

Write-Host "`n=== Manual test 1: create-admin script + dashboard load ===" -ForegroundColor Cyan

# Create a fresh smoke admin (idempotent).
$out = node scripts/create-admin.mjs --email admin-smoke@khaidai.test --name "Smoke Admin" --password hunter2smoke 2>&1
Write-Host $out[-1..-1]

# Login as that admin.
$admBody = '{"email":"admin-smoke@khaidai.test","password":"hunter2smoke"}'
$adm = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $admBody
Write-Host "ROLE:" $adm.user.role
$admHeaders = @{ Authorization = "Bearer $($adm.token)" }

# Visit dashboard with ADMIN cookie.
function New-BrowserSession { param([string]$role) $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession; $c = New-Object System.Net.Cookie("khaidai_role", $role, "/", "localhost"); $s.Cookies.Add($c); return $s }
$admSess = New-BrowserSession -role "ADMIN"
try {
  $r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $admSess -Method GET -UseBasicParsing -MaximumRedirection 0
  Write-Host "GET /admin/dashboard with ADMIN cookie: status=$($r.StatusCode)"
} catch { Write-Host "GET /admin/dashboard: $($_.Exception.Response.StatusCode.value__)" }

$ov = Invoke-RestMethod -Uri "$base/api/admin/overview" -Headers $admHeaders
Write-Host "overview totals: users=$($ov.userCounts.total) restaurants=$($ov.restaurantCount) orders=$($ov.orderCounts.total) revenue=$($ov.totalRevenue)"

Write-Host "`n=== Manual test 2: real data on users / restaurants / orders ===" -ForegroundColor Cyan
$u = Invoke-RestMethod -Uri "$base/api/admin/users?pageSize=3" -Headers $admHeaders
Write-Host "users returned: $($u.users.Count) (total=$($u.total))"
$r = Invoke-RestMethod -Uri "$base/api/admin/restaurants?pageSize=3" -Headers $admHeaders
Write-Host "restaurants returned: $($r.restaurants.Count) (total=$($r.total))"
$o = Invoke-RestMethod -Uri "$base/api/admin/orders?pageSize=3" -Headers $admHeaders
Write-Host "orders returned: $($o.orders.Count) (total=$($o.total))"

Write-Host "`n=== Manual test 3: suspend a user, login fails ===" -ForegroundColor Cyan
# Pick a CUSTOMER user from the list.
$victim = Invoke-RestMethod -Uri "$base/api/admin/users?role=CUSTOMER&pageSize=1" -Headers $admHeaders
if ($victim.users.Count -gt 0) {
  $v = $victim.users[0]
  Write-Host "Target user: $($v.email) (id=$($v.id))"
  $resp = Invoke-RestMethod -Uri "$base/api/admin/users/$($v.id)" -Headers $admHeaders -Method PATCH -ContentType "application/json" -Body '{"isSuspended":true}'
  Write-Host "Suspend result: changed=$($resp.changed) isSuspended=$($resp.user.isSuspended)"
  try {
    $retry = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body ('{"email":"' + $v.email + '","password":"khaidai1234"}')
    Write-Host "Suspended user login attempt: UNEXPECTED success"
  } catch {
    Write-Host "Suspended user login attempt: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 401)"
  }
  # Re-instate so other tests don't break.
  $re = Invoke-RestMethod -Uri "$base/api/admin/users/$($v.id)" -Headers $admHeaders -Method PATCH -ContentType "application/json" -Body '{"isSuspended":false}'
  Write-Host "Reinstated: changed=$($re.changed)"
}

Write-Host "`n=== Manual test 4: audit-log captures prior actions ===" -ForegroundColor Cyan
$a = Invoke-RestMethod -Uri "$base/api/admin/audit-log?pageSize=10" -Headers $admHeaders
Write-Host "audit-log entries: $($a.entries.Count) (total=$($a.total))"
$actions = $a.entries | ForEach-Object { $_.action } | Sort-Object -Unique
Write-Host "unique actions visible: $($actions -join ', ')"
# Specifically confirm we have order status changes + promo creates.
$hasOrderStatus = $a.entries | Where-Object { $_.action -eq 'ORDER_STATUS_CHANGED' } | Select-Object -First 1
$hasPromo = $a.entries | Where-Object { $_.action -like 'PROMO_*' } | Select-Object -First 1
$hasSuspend = $a.entries | Where-Object { $_.action -like 'USER_SUSPENDED' -or $_.action -like 'USER_UNSUSPENDED' } | Select-Object -First 1
Write-Host "  ORDER_STATUS_CHANGED present: $($null -ne $hasOrderStatus)"
Write-Host "  PROMO_* present: $($null -ne $hasPromo)"
Write-Host "  USER_SUSPENDED/UNSUSPENDED present: $($null -ne $hasSuspend)"

Write-Host "`n=== Manual test 5: non-admin blocked from /admin ===" -ForegroundColor Cyan
$custBody = '{"email":"customer-smoke@khaidai.test","password":"khaidai1234"}'
$cust = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $custBody
$custHeaders = @{ Authorization = "Bearer $($cust.token)" }
try {
  $r = Invoke-RestMethod -Uri "$base/api/admin/overview" -Headers $custHeaders
  Write-Host "CUSTOMER → /api/admin/overview: UNEXPECTED status=200"
} catch {
  Write-Host "CUSTOMER → /api/admin/overview: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 403)"
}

# Cookie-based redirects.
$custSess = New-BrowserSession -role "CUSTOMER"
try {
  $r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $custSess -Method GET -UseBasicParsing -MaximumRedirection 0
  Write-Host "CUSTOMER cookie → /admin/dashboard: UNEXPECTED status=$($r.StatusCode)"
} catch {
  Write-Host "CUSTOMER cookie → /admin/dashboard: status=$($_.Exception.Response.StatusCode.value__) (EXPECTED 307) loc=$($_.Exception.Response.Headers.Location)"
}

Write-Host "`n=== Manual test 6: tsc --noEmit ===" -ForegroundColor Cyan
$tscOut = npx tsc --noEmit 2>&1
if ($tscOut.Count -eq 0) {
  Write-Host "tsc --noEmit: PASS (no errors)"
} else {
  Write-Host "tsc --noEmit: FAIL ($($tscOut.Count) lines of output)"
  $tscOut | Select-Object -First 5
}

Write-Host "`n=== ALL DONE ===" -ForegroundColor Green
