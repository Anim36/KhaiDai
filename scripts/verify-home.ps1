try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
  $body = $r.Content
  "STATUS: " + $r.StatusCode
  "Has 'Set location' (initial navbar label): " + $body.Contains("Set location")
  "Has 'Enter your exact delivery address' (hero placeholder): " + $body.Contains("Enter your exact delivery address")
  "Has hardcoded 'Dhanmondi, Dhaka': " + $body.Contains("Dhanmondi, Dhaka")
  "Has 'Delivery location:' (nav button aria-label): " + $body.Contains("Delivery location:")
  "Has 'Choose your delivery address' (hero button aria-label): " + $body.Contains("Choose your delivery address")
} catch {
  "ERR: " + $_.Exception.Message
}
