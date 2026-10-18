$base = 'http://localhost:3000'
$admBody = '{"email":"admin-smoke@khaidai.test","password":"hunter2smoke"}'
$adm = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $admBody
$admHeaders = @{ Authorization = "Bearer $($adm.token)" }

# Each route should be 200 when hit by an ADMIN cookie. We use
# the cookie so middleware doesn't bounce them.
function New-BrowserSession { param([string]$role) $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession; $c = New-Object System.Net.Cookie("khaidai_role", $role, "/", "localhost"); $s.Cookies.Add($c); return $s }
$admSess = New-BrowserSession -role "ADMIN"

$paths = @("/admin/login","/admin/dashboard","/admin/users","/admin/restaurants","/admin/orders","/admin/audit-log","/admin/promo-codes")
foreach ($p in $paths) {
  try {
    $r = Invoke-WebRequest -Uri "$base$p" -WebSession $admSess -Method GET -UseBasicParsing -MaximumRedirection 0
    Write-Host "$p → status=$($r.StatusCode)"
  } catch {
    Write-Host "$p → status=$($_.Exception.Response.StatusCode.value__) $($_.Exception.Message)"
  }
}
