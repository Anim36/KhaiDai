$files = Get-ChildItem -Path 'D:\KhaiDai\khaidai\components' -Recurse -Filter '*.tsx'
foreach ($f in $files) {
  $lines = Get-Content $f.FullName
  for ($i = 0; $i -lt $lines.Count - 1; $i++) {
    if ($lines[$i] -match '^\s*\}\s*$' -and $lines[$i+1] -match '^\s*use(Effect|State|Memo|Callback|Ref|SyncExternalStore)\(') {
      Write-Host $f.FullName, 'line', ($i+2), $lines[$i+1].Trim()
    }
  }
}
Write-Host "done"
