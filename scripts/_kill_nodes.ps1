Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "killed"
