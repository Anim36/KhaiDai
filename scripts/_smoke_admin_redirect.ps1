$base = 'http://localhost:3000'

# Helper: simulate a logged-in browser by setting both cookies
# (khaidai_role + the khaidai.auth.v2 localStorage is NOT used by
# middleware; we just need the role cookie for redirects).
function New-BrowserSession {
  param([string]$role)
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $cookie = New-Object System.Net.Cookie("khaidai_role", $role, "/", "localhost")
  $session.Cookies.Add($cookie)
  return $session
}

# ADMIN hits /partner/dashboard — middleware should 307 → /admin/dashboard.
$adm = New-BrowserSession -role "ADMIN"
$r = Invoke-WebRequest -Uri "$base/partner/dashboard" -WebSession $adm -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "ADMIN cookie → /partner/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# CUSTOMER cookie hits /admin/dashboard — should 307 → /
$cust = New-BrowserSession -role "CUSTOMER"
$r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $cust -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "CUSTOMER cookie → /admin/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# PARTNER cookie hits /admin/dashboard — should 307 → /partner/dashboard
$part = New-BrowserSession -role "PARTNER"
$r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $part -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "PARTNER cookie → /admin/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# RIDER cookie hits /admin/dashboard — should 307 → /rider/dashboard
$rid = New-BrowserSession -role "RIDER"
$r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $rid -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "RIDER cookie → /admin/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# GUEST hits /admin/dashboard — should 307 → /admin/login
$gst = New-BrowserSession -role ""
$r = Invoke-WebRequest -Uri "$base/admin/dashboard" -WebSession $gst -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "GUEST → /admin/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# ADMIN cookie hits /admin/login — should be 200 (allowed)
$r = Invoke-WebRequest -Uri "$base/admin/login" -WebSession $adm -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "ADMIN cookie → /admin/login: status=$($r.StatusCode) (EXPECTED 200)"

# ADMIN cookie hits /rider/dashboard — should 307 → /admin/dashboard
$r = Invoke-WebRequest -Uri "$base/rider/dashboard" -WebSession $adm -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "ADMIN cookie → /rider/dashboard: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"

# ADMIN cookie hits /checkout — should 307 → /admin/dashboard
$r = Invoke-WebRequest -Uri "$base/checkout" -WebSession $adm -Method GET -UseBasicParsing -MaximumRedirection 0
Write-Host "ADMIN cookie → /checkout: status=$($r.StatusCode) (EXPECTED 307) headers.Location=$($r.Headers['Location'])"
