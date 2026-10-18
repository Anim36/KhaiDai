# scripts/_verify_carousel_security.ps1
#
# End-to-end verification for কাজ ২:
#   • কাজ ১ — Promo Carousel redesign (imageUrl column, horizontal
#     scroll, image field on partner form).
#   • কাজ ২ — Login/Register role enforcement (customer login only
#     accepts CUSTOMER; per-portal forms pass expectedRole; CUSTOMER
#     register ignores role input).
#
# Each test prints PASS/FAIL with a short note. Final exit code = 0
# only if every test passed.

$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pass = "khaidai1234"
$adminEmail = "admin-smoke@khaidai.test"
$partnerEmail = "spice175318@khaidai.test"
$riderEmail = "rahim.smoke@example.com"
$customerEmail = "customer-smoke@khaidai.test"

$results = @()

function Add-Result {
  param([string]$Name, [bool]$Ok, [string]$Note = "")
  $script:results += [PSCustomObject]@{
    Name = $Name
    Pass = $Ok
    Note = $Note
  }
  $tag = if ($Ok) { "PASS" } else { "FAIL" }
  Write-Host "[$tag] $Name $Note"
}

# Wrap Invoke-WebRequest to return a clean PSCustomObject so the
# error stream doesn't pollute the test output. The default
# behaviour throws on 4xx/5xx which we explicitly want to *not*
# turn into script-terminating errors.
function Invoke-WebRequestSafe {
  param(
    [string]$Uri,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    $Body = $null,
    [switch]$SkipError
  )
  try {
    $params = @{
      Uri = $Uri
      Method = $Method
      Headers = $Headers
      UseBasicParsing = $true
      TimeoutSec = 30
    }
    if ($null -ne $Body) { $params.Body = $Body }
    $r = Invoke-WebRequest @params
    return @{
      Status = [int]$r.StatusCode
      Body = [string]$r.Content
      Headers = $r.Headers
    }
  } catch {
    $ex = $_.Exception.Response
    if ($ex) {
      $code = [int]$ex.StatusCode
      $stream = $ex.GetResponseStream()
      $rdr = New-Object System.IO.StreamReader($stream)
      $bodyText = $rdr.ReadToEnd()
      $rdr.Close()
      return @{ Status = $code; Body = $bodyText; Headers = @{} }
    }
    return @{ Status = 0; Body = $_.Exception.Message; Headers = @{} }
  }
}

# POST /api/auth/login with optional expectedRole. Returns the raw
# response so the caller can inspect both the status code AND the
# body. Cookies are dropped on the floor — for middleware tests
# below we use a separate session-based helper.
function Post-Login {
  param([string]$Email, [string]$Password, [string]$ExpectedRole = "")
  $payload = @{ email = $Email; password = $Password }
  if ($ExpectedRole -ne "") { $payload.expectedRole = $ExpectedRole }
  $body = $payload | ConvertTo-Json -Compress
  $r = Invoke-WebRequestSafe -Uri "$base/api/auth/login" -Method POST `
    -Headers @{ "content-type" = "application/json" } -Body $body
  return $r
}

# Issue a GET using a fresh Session so Set-Cookie round-trips into
# the jar. Returns the URL the server eventually responded with so
# callers can confirm a 307 redirect's destination. With
# `-MaximumRedirection 0` PowerShell does NOT throw on 3xx — it
# returns the response as-is, with the Location header populated.
function Get-With-Session {
  param([string]$Path, $Session)
  $uri = "$base$Path"
  try {
    $r = Invoke-WebRequest -Uri $uri -Method GET -WebSession $Session `
      -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30
    $loc = $r.Headers["Location"]
    return @{
      Status = [int]$r.StatusCode
      Body = [string]$r.Content
      FinalUri = if ($loc) { $loc } else { $uri }
    }
  } catch {
    $ex = $_.Exception.Response
    if ($ex) {
      $code = [int]$ex.StatusCode
      $stream = $ex.GetResponseStream()
      $rdr = New-Object System.IO.StreamReader($stream)
      $bodyText = $rdr.ReadToEnd()
      $rdr.Close()
      $loc = $ex.Headers["Location"]
      return @{
        Status = $code
        Body = $bodyText
        FinalUri = if ($loc) { $loc } else { $uri }
      }
    }
    return @{ Status = 0; Body = $_.Exception.Message; FinalUri = $uri }
  }
}

function Login-Session {
  param([string]$Email, [string]$Password, [string]$ExpectedRole = "")
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $payload = @{ email = $Email; password = $Password }
  if ($ExpectedRole -ne "") { $payload.expectedRole = $ExpectedRole }
  $body = $payload | ConvertTo-Json -Compress
  try {
    Invoke-WebRequest -Uri "$base/api/auth/login" -Method POST `
      -Headers @{ "content-type" = "application/json" } `
      -Body $body -WebSession $session -UseBasicParsing -TimeoutSec 30 `
      | Out-Null
  } catch {
    # Cookie may still be set even on 4xx (e.g. 401); don't fail
    # the session build here.
  }
  return $session
}

# Build a session with the role cookie the Edge middleware reads.
# The /api/auth/login endpoint doesn't set `khaidai_role` itself
# (the browser-side AuthProvider sets it via document.cookie); for
# headless smoke tests we set it directly. This is the same approach
# the existing _smoke_admin_redirect.ps1 / _verify_admin_panel.ps1
# use — it tests middleware in isolation, independent of the login
# response shape.
function New-RoleSession {
  param([string]$Role)
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $cookie = New-Object System.Net.Cookie("khaidai_role", $Role, "/", "localhost")
  $session.Cookies.Add($cookie)
  return $session
}

function Post-Register {
  param([string]$Path, [hashtable]$Body)
  $json = $Body | ConvertTo-Json -Compress
  return Invoke-WebRequestSafe -Uri "$base$Path" -Method POST `
    -Headers @{ "content-type" = "application/json" } -Body $json
}

Write-Host "=========================================="
Write-Host "কাজ ২ verification suite"
Write-Host "=========================================="

# ============================================================================
# কাজ ২ — security: login role enforcement
# ============================================================================

# T1: Customer login form: ADMIN creds → rejected (generic 401)
$r = Post-Login -Email $adminEmail -Password $pass
Add-Result "T1: customer login rejects ADMIN" ($r.Status -eq 401 -and $r.Body -match "Invalid email or password") "(status=$($r.Status))"

# T2: Customer login form: PARTNER creds → rejected (generic 401)
$r = Post-Login -Email $partnerEmail -Password $pass
Add-Result "T2: customer login rejects PARTNER" ($r.Status -eq 401 -and $r.Body -match "Invalid email or password") "(status=$($r.Status))"

# T3: Customer login form: RIDER creds → rejected (generic 401)
$r = Post-Login -Email $riderEmail -Password $pass
Add-Result "T3: customer login rejects RIDER" ($r.Status -eq 401 -and $r.Body -match "Invalid email or password") "(status=$($r.Status))"

# T4: Customer login form: valid CUSTOMER creds → success
$r = Post-Login -Email $customerEmail -Password $pass
Add-Result "T4: customer login accepts CUSTOMER" ($r.Status -eq 200 -and $r.Body -match '"role":"CUSTOMER"') "(status=$($r.Status))"

# T5: Partner login form (expectedRole=PARTNER): ADMIN → 403 + clear msg
$r = Post-Login -Email $adminEmail -Password $pass -ExpectedRole "PARTNER"
Add-Result "T5: partner login rejects ADMIN" ($r.Status -eq 403 -and $r.Body -match "registered as ADMIN") "(status=$($r.Status))"

# T6: Partner login form: RIDER → 403 + clear msg
$r = Post-Login -Email $riderEmail -Password $pass -ExpectedRole "PARTNER"
Add-Result "T6: partner login rejects RIDER" ($r.Status -eq 403 -and $r.Body -match "registered as RIDER") "(status=$($r.Status))"

# T7: Partner login form: valid PARTNER → success
$r = Post-Login -Email $partnerEmail -Password $pass -ExpectedRole "PARTNER"
Add-Result "T7: partner login accepts PARTNER" ($r.Status -eq 200 -and $r.Body -match '"role":"PARTNER"') "(status=$($r.Status))"

# T8: Rider login form: ADMIN → 403
$r = Post-Login -Email $adminEmail -Password $pass -ExpectedRole "RIDER"
Add-Result "T8: rider login rejects ADMIN" ($r.Status -eq 403 -and $r.Body -match "registered as ADMIN") "(status=$($r.Status))"

# T9: Rider login form: valid RIDER → success
$r = Post-Login -Email $riderEmail -Password $pass -ExpectedRole "RIDER"
Add-Result "T9: rider login accepts RIDER" ($r.Status -eq 200 -and $r.Body -match '"role":"RIDER"') "(status=$($r.Status))"

# T10: Admin login form: PARTNER → 403
$r = Post-Login -Email $partnerEmail -Password $pass -ExpectedRole "ADMIN"
Add-Result "T10: admin login rejects PARTNER" ($r.Status -eq 403 -and $r.Body -match "registered as PARTNER") "(status=$($r.Status))"

# T11: Admin login form: valid ADMIN → success
$r = Post-Login -Email $adminEmail -Password $pass -ExpectedRole "ADMIN"
Add-Result "T11: admin login accepts ADMIN" ($r.Status -eq 200 -and $r.Body -match '"role":"ADMIN"') "(status=$($r.Status))"

# T12: Tampered login attempt with role=ADMIN + expectedRole=CUSTOMER
#      would still hit the role gate (expectedRole wins, mismatch
#      yields 403 with the explicit "registered as ADMIN" message).
$r = Post-Login -Email $adminEmail -Password $pass -ExpectedRole "CUSTOMER"
Add-Result "T12: tampered login (expectedRole=CUSTOMER + ADMIN creds) → 403 + role message" ($r.Status -eq 403 -and $r.Body -match "registered as ADMIN") "(status=$($r.Status))"

# ============================================================================
# কাজ ২ — security: register role enforcement
# ============================================================================

# T13: /api/auth/register with role=ADMIN → server forces CUSTOMER
$probeEmail = "probe-roletest-$([DateTime]::UtcNow.Ticks)@khaidai.test"
$r = Post-Register -Path "/api/auth/register" -Body @{
  name = "Probe Role Test"
  email = $probeEmail
  password = "supersecret1"
  phone = ""
  role = "ADMIN"
}
Add-Result "T13: register ignores role=ADMIN (forces CUSTOMER)" ($r.Status -eq 201 -and $r.Body -match '"role":"CUSTOMER"') "(status=$($r.Status))"

# T14: /api/auth/register with no role → CUSTOMER (default)
$probeEmail2 = "probe-norole-$([DateTime]::UtcNow.Ticks)@khaidai.test"
$r = Post-Register -Path "/api/auth/register" -Body @{
  name = "Probe No Role"
  email = $probeEmail2
  password = "supersecret1"
  phone = ""
}
Add-Result "T14: register with no role → CUSTOMER" ($r.Status -eq 201 -and $r.Body -match '"role":"CUSTOMER"') "(status=$($r.Status))"

# T15: /api/auth/register/partner exists + accepts PARTNER
$probeEmail3 = "probe-partner-$([DateTime]::UtcNow.Ticks)@khaidai.test"
$r = Post-Register -Path "/api/auth/register/partner" -Body @{
  name = "Probe Partner"
  email = $probeEmail3
  password = "supersecret1"
  phone = ""
}
Add-Result "T15: /register/partner creates PARTNER" ($r.Status -eq 201 -and $r.Body -match '"role":"PARTNER"') "(status=$($r.Status))"

# T16: /api/auth/register/rider exists + accepts RIDER
$probeEmail4 = "probe-rider-$([DateTime]::UtcNow.Ticks)@khaidai.test"
$r = Post-Register -Path "/api/auth/register/rider" -Body @{
  name = "Probe Rider"
  email = $probeEmail4
  password = "supersecret1"
  phone = ""
  vehicleType = "bike"
  vehicleRegNumber = "DH-1234"
}
Add-Result "T16: /register/rider creates RIDER" ($r.Status -eq 201 -and $r.Body -match '"role":"RIDER"') "(status=$($r.Status))"

# ============================================================================
# কাজ ২ — security: middleware blocks non-customer from customer routes
# ============================================================================
# For middleware tests we set the role cookie directly (the
# /api/auth/login route doesn't write `khaidai_role` — that cookie
# is set client-side by AuthProvider.writeStored via document.cookie.
# Setting it here in PowerShell is the same trick the existing
# _smoke_admin_redirect.ps1 uses.)
$customerSession = New-RoleSession -Role "CUSTOMER"
$partnerSession = New-RoleSession -Role "PARTNER"
$riderSession = New-RoleSession -Role "RIDER"
$adminSession = New-RoleSession -Role "ADMIN"

# T17: PARTNER hitting / → 307 redirect to /partner/dashboard
$r = Get-With-Session -Path "/" -Session $partnerSession
Add-Result "T17: PARTNER → / redirects to /partner/dashboard" ($r.Status -eq 307 -and $r.FinalUri -match "/partner/dashboard") "(status=$($r.Status), target=$($r.FinalUri))"

# T18: RIDER hitting / → 307 to /rider/dashboard
$r = Get-With-Session -Path "/" -Session $riderSession
Add-Result "T18: RIDER → / redirects to /rider/dashboard" ($r.Status -eq 307 -and $r.FinalUri -match "/rider/dashboard") "(status=$($r.Status), target=$($r.FinalUri))"

# T19: ADMIN hitting / → 307 to /admin/dashboard
$r = Get-With-Session -Path "/" -Session $adminSession
Add-Result "T19: ADMIN → / redirects to /admin/dashboard" ($r.Status -eq 307 -and $r.FinalUri -match "/admin/dashboard") "(status=$($r.Status), target=$($r.FinalUri))"

# T20: PARTNER hitting /checkout → 307 (already enforced in middleware)
$r = Get-With-Session -Path "/checkout" -Session $partnerSession
Add-Result "T20: PARTNER → /checkout redirects" ($r.Status -eq 307 -and $r.FinalUri -match "/partner/dashboard") "(status=$($r.Status), target=$($r.FinalUri))"

# T21: CUSTOMER hitting / → 200 (homepage is allowed for customers)
$r = Get-With-Session -Path "/" -Session $customerSession
Add-Result "T21: CUSTOMER → / 200 OK" ($r.Status -eq 200) "(status=$($r.Status))"

# T22: Guest hitting / → 200 (public homepage)
$guestSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$r = Get-With-Session -Path "/" -Session $guestSession
Add-Result "T22: guest → / 200 OK" ($r.Status -eq 200) "(status=$($r.Status))"

# ============================================================================
# কাজ ১ — promo carousel
# ============================================================================
# T23: /api/promo-codes/active returns imageUrl field (maybe null, but
#      the field must be present in the JSON shape).
try {
  $r = Invoke-WebRequestSafe -Uri "$base/api/promo-codes/active"
  $hasField = $r.Body -match '"imageUrl"'
  Add-Result "T23: /api/promo-codes/active carries imageUrl field" ($r.Status -eq 200 -and $hasField) "(status=$($r.Status))"
} catch {
  Add-Result "T23: /api/promo-codes/active carries imageUrl field" $false "(error: $($_.Exception.Message))"
}

# T24+T25: ADMIN can list promo codes via /api/admin/promo-codes. The
#          /api/* routes use the JWT bearer (Authorization header),
#          not the role cookie. Build a fresh session by hitting
#          /api/auth/login and then carry the token forward.
try {
  $loginResp = Post-Login -Email $adminEmail -Password $pass -ExpectedRole "ADMIN"
  if ($loginResp.Status -ne 200) {
    Add-Result "T24: /api/admin/promo-codes returns imageUrl per row" $false "(login status=$($loginResp.Status))"
    Add-Result "T25: 5+ promo codes in DB for scroll test" $false "(login status=$($loginResp.Status))"
  } else {
    $adminToken = ($loginResp.Body | ConvertFrom-Json).token
    $adminList = Invoke-WebRequestSafe -Uri "$base/api/admin/promo-codes?pageSize=50" `
      -Headers @{ Authorization = "Bearer $adminToken" }
    if ($adminList.Status -eq 200) {
      $parsed = $adminList.Body | ConvertFrom-Json
      $codes = $parsed.codes
      $hasImageUrlOnRows = $false
      if ($codes -and $codes.Count -gt 0) {
        $hasImageUrlOnRows = ($codes[0].PSObject.Properties.Name -contains "imageUrl")
      }
      Add-Result "T24: /api/admin/promo-codes returns imageUrl per row" $hasImageUrlOnRows "(codes=$($codes.Count))"
      $total = $parsed.total
      Add-Result "T25: 5+ promo codes in DB for scroll test" ($total -ge 5) "(total=$total)"
    } else {
      Add-Result "T24: /api/admin/promo-codes returns imageUrl per row" $false "(status=$($adminList.Status))"
      Add-Result "T25: 5+ promo codes in DB for scroll test" $false "(status=$($adminList.Status))"
    }
  }
} catch {
  Add-Result "T24: /api/admin/promo-codes returns imageUrl per row" $false "(error: $($_.Exception.Message))"
  Add-Result "T25: 5+ promo codes in DB for scroll test" $false "(error)"
}

# T26: /api/promo-codes/active returns >= 5 codes with full text
try {
  $r = Invoke-WebRequestSafe -Uri "$base/api/promo-codes/active"
  if ($r.Status -eq 200) {
    $promos = ($r.Body | ConvertFrom-Json).promos
    $truncatedCount = ($promos | Where-Object { $_.code.Length -lt 4 }).Count
    Add-Result "T26: every active promo has a real (>=4 char) code" ($truncatedCount -eq 0 -and $promos.Count -ge 5) "(promos=$($promos.Count))"
  } else {
    Add-Result "T26: every active promo has a real (>=4 char) code" $false "(status=$($r.Status))"
  }
} catch {
  Add-Result "T26: every active promo has a real (>=4 char) code" $false "(error: $($_.Exception.Message))"
}

Write-Host ""
Write-Host "=========================================="
Write-Host "Summary"
Write-Host "=========================================="
$failed = $results | Where-Object { -not $_.Pass }
$passed = ($results | Where-Object { $_.Pass }).Count
Write-Host "$passed / $($results.Count) tests passed"
if ($failed.Count -gt 0) {
  Write-Host "FAILED:"
  $failed | ForEach-Object { Write-Host "  - $($_.Name): $($_.Note)" }
  exit 1
}
exit 0