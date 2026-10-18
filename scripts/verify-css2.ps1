try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 25 -ErrorAction Stop
  $body = $r.Content
  $heroButton = ($body -split 'aria-label="Choose your delivery address"')[1]
  # Look further in the markup
  $heroButtonSnippet = $heroButton.Substring(0, [Math]::Min(2000, $heroButton.Length))
  "Hero has 'min-w-0': " + ($heroButtonSnippet.Split('"') | Where-Object { $_ -match 'min-w-0' } | Measure-Object).Count
  "Hero has 'truncate': " + ($heroButtonSnippet.Split('"') | Where-Object { $_ -match 'truncate' } | Measure-Object).Count
  "Hero has 'shrink-0': " + ($heroButtonSnippet.Split('"') | Where-Object { $_ -match 'shrink-0' } | Measure-Object).Count
  $navButton = ($body -split 'Delivery location:')[1]
  $navButtonSnippet = $navButton.Substring(0, [Math]::Min(2000, $navButton.Length))
  "Nav has 'min-w-0': " + ($navButtonSnippet.Split('"') | Where-Object { $_ -match 'min-w-0' } | Measure-Object).Count
  "Nav has 'truncate': " + ($navButtonSnippet.Split('"') | Where-Object { $_ -match 'truncate' } | Measure-Object).Count
} catch {
  "ERR: " + $_.Exception.Message
}
