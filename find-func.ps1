Get-ChildItem D:\KhaiDai\khaidai -Recurse -File -Include *.tsx,*.ts | Where-Object { $_.FullName -notmatch 'node_modules' -and $_.FullName -notmatch '\.next' } | ForEach-Object {
  Select-String -Path $_.FullName -Pattern 'All Trending Dishes' | ForEach-Object {
    Write-Host ($_.Path + ' L' + $_.LineNumber + ': ' + $_.Line.Trim())
  }
}