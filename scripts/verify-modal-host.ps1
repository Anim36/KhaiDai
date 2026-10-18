try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
  $body = $r.Content
  "Has DeliveryAddressModalHost component in JS bundle (DeliveryAddressProvider): " + $body.Contains("DeliveryAddressProvider")
  "Has DeliveryAddressModalHost reference: " + $body.Contains("DeliveryAddressModalHost")
  "Has DeliveryAddressContext: " + $body.Contains("DeliveryAddressContext")
} catch {
  "ERR: " + $_.Exception.Message
}
