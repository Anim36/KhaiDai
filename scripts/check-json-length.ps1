$big = "data:image/png;base64," + ("a" * (11 * 1024 * 1024))
Write-Host ("len=" + $big.Length)
$obj = @{ coverImage = $big } | ConvertTo-Json -Depth 5
Write-Host ("json len=" + $obj.Length)
Write-Host ("first 100 chars: " + $obj.Substring(0, 100))
Write-Host ("last 60 chars: " + $obj.Substring($obj.Length - 60))
