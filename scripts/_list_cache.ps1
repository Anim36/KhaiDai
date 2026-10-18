Get-ChildItem -Path "D:\KhaiDai\khaidai\.next\cache" -ErrorAction SilentlyContinue | Format-Table Name,Length,LastWriteTime -AutoSize
Get-ChildItem -Path "D:\KhaiDai\khaidai\.next\cache\webpack" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 5 | Format-Table FullName,Length,LastWriteTime
