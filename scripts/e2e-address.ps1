function TestBody($url, $expectedCode = 200) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return "OK " + $r.StatusCode + " " + $r.Content.Substring(0, [Math]::Min(180, $r.Content.Length))
  } catch {
    $msg = $_.Exception.Message
    if ($_.Exception.Response) {
      $resp = $_.Exception.Response
      try { $reader = New-Object System.IO.StreamReader($resp.GetResponseStream()); $body = $reader.ReadToEnd() } catch { $body = "" }
      return "ERR " + $resp.StatusCode + " " + ($body -replace '\s+', ' ').Substring(0, [Math]::Min(200, $body.Length))
    }
    return "ERR " + $msg
  }
}

$rand = Get-Random -Minimum 100000 -Maximum 999999
$email = "rahim" + $rand + "@khaidai.test"
$password = "Password123!"

$registerBody = @{
  name     = "Rahim Ahmed"
  email    = $email
  password = $password
  phone    = "+8801711000000"
  role     = "CUSTOMER"
} | ConvertTo-Json

$reg = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/register" `
  -Method POST -ContentType "application/json" -Body $registerBody `
  -UseBasicParsing -TimeoutSec 20
"REGISTER: " + $reg.StatusCode

$loginBody = @{ email = $email; password = $password } | ConvertTo-Json
$login = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
  -Method POST -ContentType "application/json" -Body $loginBody `
  -UseBasicParsing -TimeoutSec 20
"LOGIN: " + $login.StatusCode

$token = ($login.Content | ConvertFrom-Json).token
"HAS_TOKEN: " + ($null -ne $token)

$addrBody = @{
  label       = "HOME"
  fullAddress = "House 22, Road 7, Dhanmondi, Dhaka"
  city        = "Dhaka"
  area        = "Dhanmondi"
  latitude    = 23.7461
  longitude   = 90.3742
  isDefault   = $true
} | ConvertTo-Json

$addResp = Invoke-WebRequest -Uri "http://localhost:3000/api/addresses" `
  -Method POST -ContentType "application/json" -Body $addrBody `
  -Headers @{ Authorization = "Bearer $token" } `
  -UseBasicParsing -TimeoutSec 20
"ADDR_POST: " + $addResp.StatusCode + " " + ($addResp.Content -replace '\s+', ' ').Substring(0, [Math]::Min(200, $addResp.Content.Length))

$list = Invoke-WebRequest -Uri "http://localhost:3000/api/addresses" `
  -Headers @{ Authorization = "Bearer $token" } `
  -UseBasicParsing -TimeoutSec 20
"ADDR_LIST: " + $list.StatusCode + " " + ($list.Content -replace '\s+', ' ').Substring(0, [Math]::Min(280, $list.Content.Length))
