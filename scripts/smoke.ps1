try {
  $h = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
  "HOME:" + $h.StatusCode + " length=" + $h.Content.Length
} catch {
  $msg = $_.Exception.Message
  "HOME_ERR:" + $msg
  $resp = $_.Exception.Response
  if ($resp) {
    try {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      "BODY:" + $reader.ReadToEnd()
    } catch {}
  }
}
