$files = Get-ChildItem -Path 'D:\KhaiDai\khaidai\components' -Recurse -Filter '*.tsx'
foreach ($file in $files) {
  $content = Get-Content $file.FullName
  $inComponent = $false
  $braceDepth = 0
  $hadReturn = $false
  $hooksCount = 0
  for ($i = 0; $i -lt $content.Count; $i++) {
    $line = $content[$i]
    if ($line -match '^export function ') { $inComponent = $true; $hadReturn = $false; $hooksCount = 0 }
    if ($inComponent) {
      if ($line -match '^\s*use(Effect|State|Memo|Callback|Ref|SyncExternalStore)\(') { $hooksCount++ }
      if ($line -match '^\s*return\s' -and $hooksCount -gt 0) { $hadReturn = $true }
      if ($line -match '^\s*use(Effect|State|Memo|Callback|Ref|SyncExternalStore)\(' -and $hadReturn) {
        Write-Host "$($file.FullName):$($i+1) hook after return: $($line.Trim())"
      }
      if ($line -match '^}\s*$' -and $hadReturn) { $inComponent = $false }
    }
  }
}
Write-Host "done"
