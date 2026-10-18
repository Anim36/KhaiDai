# Read just the end of the response file to see the JSON tail.
$path = "D:\KhaiDai\khaidai\.tmp\patch_resp.json"
$size = (Get-Item $path).Length
Write-Host ("file size = " + $size)
$stream = [System.IO.File]::OpenRead($path)
$stream.Position = $size - 400
$reader = New-Object IO.StreamReader($stream)
$tail = $reader.ReadToEnd()
Write-Host "--- TAIL ---"
Write-Host $tail
$reader.Dispose()
