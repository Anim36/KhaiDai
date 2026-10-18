$base = 'http://localhost:3000'
$body = '{"email":"admin-smoke@khaidai.test","password":"hunter2smoke"}'
try {
  $resp = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $body
} catch {
  Write-Host "LOGIN FAILED:" $_.Exception.Message
  Write-Host $_.Exception.Response.StatusCode
  exit 1
}
$token = $resp.token
Write-Host "ROLE:" $resp.user.role
$headers = @{ Authorization = "Bearer $token" }
Write-Host "`n--- overview ---"
$ov = Invoke-RestMethod -Uri "$base/api/admin/overview" -Headers $headers
Write-Host "userCounts:" ($ov.userCounts | ConvertTo-Json -Compress)
Write-Host "restaurantCount:" $ov.restaurantCount
Write-Host "orderCounts:" ($ov.orderCounts | ConvertTo-Json -Compress)
Write-Host "totalRevenue:" $ov.totalRevenue
Write-Host "recentOrders.Count:" $ov.recentOrders.Count
Write-Host "orderTrend.Count:" $ov.orderTrend.Count
Write-Host "`n--- users (first 3) ---"
$u = Invoke-RestMethod -Uri "$base/api/admin/users?pageSize=3" -Headers $headers
$u.users | Select-Object name,email,role,isSuspended | Format-Table -AutoSize
Write-Host "users.total:" $u.total
Write-Host "`n--- restaurants (first 3) ---"
$r = Invoke-RestMethod -Uri "$base/api/admin/restaurants?pageSize=3" -Headers $headers
$r.restaurants | Select-Object name,cuisine,isSuspended,totalOrders | Format-Table -AutoSize
Write-Host "restaurants.total:" $r.total
Write-Host "`n--- orders (first 3) ---"
$o = Invoke-RestMethod -Uri "$base/api/admin/orders?pageSize=3" -Headers $headers
$o.orders | Select-Object shortId,statusLabel,total,customerName | Format-Table -AutoSize
Write-Host "orders.total:" $o.total
Write-Host "`n--- audit-log (first 3) ---"
$a = Invoke-RestMethod -Uri "$base/api/admin/audit-log?pageSize=3" -Headers $headers
$a.entries | Select-Object action,entityType,actor | Format-Table -AutoSize
Write-Host "audit.total:" $a.total
Write-Host "`n--- promo-codes (first 3) ---"
$p = Invoke-RestMethod -Uri "$base/api/admin/promo-codes?pageSize=3" -Headers $headers
$p.codes | Select-Object code,discountType,discountValue,scope,isActive | Format-Table -AutoSize
Write-Host "promo-codes.total:" $p.total
