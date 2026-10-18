try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
  $body = $r.Content
  "STATUS: " + $r.StatusCode
  # Find the hero pill (button with aria-label 'Choose your delivery address')
  # and check that it has min-w-0 + truncate classes
  $heroButton = ($body -split 'aria-label="Choose your delivery address"')[1]
  if ($heroButton) {
    $heroButtonSnippet = $heroButton.Substring(0, [Math]::Min(600, $heroButton.Length))
    "Hero pill snippet:" + $heroButtonSnippet
    "Has 'min-w-0': " + $heroButtonSnippet.Contains("min-w-0")
    "Has 'truncate': " + $heroButtonSnippet.Contains("truncate")
    "Has 'shrink-0' on Order Now: " + $heroButtonSnippet.Contains("shrink-0")
  } else {
    "Hero button NOT FOUND in HTML"
  }
  "---"
  # Find navbar location button
  $navButton = ($body -split 'Delivery location:')[1]
  if ($navButton) {
    $navButtonSnippet = $navButton.Substring(0, [Math]::Min(500, $navButton.Length))
    "Nav location snippet:" + $navButtonSnippet
    "Nav has 'min-w-0': " + $navButtonSnippet.Contains("min-w-0")
    "Nav has 'truncate': " + $navButtonSnippet.Contains("truncate")
  } else {
    "Nav button NOT FOUND"
  }
} catch {
  "ERR: " + $_.Exception.Message
}
