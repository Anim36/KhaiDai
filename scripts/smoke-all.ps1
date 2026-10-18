function TestUrl($url, [int]$timeout = 30) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeout -ErrorAction Stop
    return $r.StatusCode
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

"HOME: " + (TestUrl "http://localhost:3000/")
"LOGIN: " + (TestUrl "http://localhost:3000/login")
"CHECKOUT: " + (TestUrl "http://localhost:3000/checkout")
"ADDR_API: " + (TestUrl "http://localhost:3000/api/addresses")
"DISHES: " + (TestUrl "http://localhost:3000/dishes")
