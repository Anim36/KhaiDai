# Sanity-check: Nominatim search across Bangladesh districts. The
# earlier viewbox was bounded=1 to a tiny Dhaka rectangle which
# silently returned empty for Chittagong / Sylhet / Rajshahi.
$queries = @("Chittagong", "Sylhet", "Rajshahi", "Khulna", "Cox's Bazar")
foreach ($q in $queries) {
  $url = "https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=bd&viewbox=88.0%2C20.5%2C92.5%2C26.5&q=" + [Uri]::EscapeDataString($q)
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "X-App-Identifier" = "KhaiDai/test" } -TimeoutSec 25
  $hits = ($r.Content | ConvertFrom-Json)
  $label = ""
  if ($hits.Count -gt 0) { $label = $hits[0].display_name }
  $q.PadRight(14) + " -> " + $hits.Count + " hit(s); top: " + $label
}
