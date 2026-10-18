Set-Location D:\KhaiDai\khaidai
Remove-Item migrate.err -ErrorAction SilentlyContinue
node ./node_modules/prisma/build/index.js generate 2> migrate.err
Write-Output "EXIT=$LASTEXITCODE"
Get-Content migrate.err -Tail 10
Remove-Item scripts/apply-migration.ps1, migrate.err -EA SilentlyContinue
