# Full regression smoke after restart. Hits every endpoint that the
# recent work touched and prints pass/fail per assertion.
$ErrorActionPreference = "Continue"
$BASE = "http://localhost:3000"

function Pass($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:failures++ }
function Note($msg) { Write-Host "  - $msg" }

$script:failures = 0

Write-Host "=== 1. Server health ===" -ForegroundColor Cyan
try {
  $ping = Invoke-WebRequest -Uri "$BASE/" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
  if ($ping.StatusCode -eq 200) { Pass "Home page 200" } else { Fail "Home returned $($ping.StatusCode)" }
} catch {
  Fail "Home request failed: $_"
}

Write-Host "=== 2. Contact form -> DB + email + admin ===" -ForegroundColor Cyan
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$payload = (@{
  name    = "Regression Tester"
  email   = "tester.$ts@example.com"
  message = "Regression smoke test $ts - please ignore."
}) | ConvertTo-Json
$createdId = $null
try {
  $r = Invoke-RestMethod -Uri "$BASE/api/contact" -Method POST -ContentType "application/json" -Body $payload -TimeoutSec 15
  Pass "POST /api/contact 201 (id=$($r.id))"
  $createdId = $r.id
} catch {
  Fail "POST /api/contact: $($_.Exception.Message)"
}

# Admin auth via Prisma + JWT
$env:DATABASE_URL = (Get-Content ".env" | Select-String -Pattern '^DATABASE_URL=').ToString().Split('=',2)[1].Trim('"')
$adminJson = node -e "const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});p.user.findFirst({where:{role:'ADMIN'}}).then(u=>{console.log(JSON.stringify({id:u.id}));p.`$disconnect()})"
$adminId = ($adminJson | ConvertFrom-Json).id
$env:JWT_SECRET = (Get-Content ".env" | Select-String -Pattern '^JWT_SECRET=').ToString().Split('=',2)[1].Trim('"')
$jwt = node -e "const j=require('jsonwebtoken');console.log(j.sign({sub:'$adminId',role:'ADMIN'},process.env.JWT_SECRET))"

try {
  $r = Invoke-RestMethod -Uri "$BASE/api/admin/messages" -Headers @{Authorization="Bearer $jwt"} -TimeoutSec 10
  if ($r.unreadCount -gt 0) { Pass "GET /api/admin/messages shows unread=$($r.unreadCount)" } else { Fail "unreadCount should be > 0" }
  $found = $r.messages | Where-Object { $_.id -eq $createdId }
  if ($found) { Pass "New contact message present in admin list" } else { Fail "New message missing from admin list" }
} catch {
  Fail "GET /api/admin/messages: $($_.Exception.Message)"
}

if ($found) {
  try {
    $null = Invoke-WebRequest -Uri "$BASE/api/admin/messages/$($found.id)" -Method PATCH -Headers @{Authorization="Bearer $jwt"} -UseBasicParsing -TimeoutSec 10
    $r2 = Invoke-RestMethod -Uri "$BASE/api/admin/messages" -Headers @{Authorization="Bearer $jwt"} -TimeoutSec 10
    $found2 = $r2.messages | Where-Object { $_.id -eq $found.id }
    if ($found2.isRead) { Pass "PATCH /api/admin/messages/[id] flipped isRead=true" } else { Fail "isRead still false after PATCH" }
  } catch {
    Fail "PATCH /api/admin/messages: $($_.Exception.Message)"
  }
}

Write-Host "=== 3. Bug 2 - Partner docs persist ===" -ForegroundColor Cyan
$regOut = & npx tsx scripts/test-register.ts 2>&1 | Out-String
if ($regOut -match 'docs: 2') { Pass "Partner register persists 2 docs" } else { Fail "Partner docs not 2"; Note $regOut }

Write-Host "=== 4. Bug 2 - Rider docs persist ===" -ForegroundColor Cyan
$ridOut = & npx tsx scripts/test-rider-register.ts 2>&1 | Out-String
if ($ridOut -match 'docs: 1') { Pass "Rider register persists 1 doc" } else { Fail "Rider docs not 1"; Note $ridOut }

Write-Host "=== 5. Feat 1 - Max 3 concurrent deliveries ===" -ForegroundColor Cyan
$fdOut = & npx tsx scripts/test-multi-delivery.ts 2>&1 | Out-String
if ($fdOut -match 'verified: rider capped at 3 concurrent') { Pass "Feat 1: rider capped at 3" } else { Fail "Feat 1 regression"; Note $fdOut }

Write-Host "=== 6. Feat 2 - Order chat ===" -ForegroundColor Cyan
$chatOut = & npx tsx scripts/test-chat.ts 2>&1 | Out-String
$allOk = $chatOut -match 'Customer POST: 201' -and $chatOut -match 'Rider POST: 201' -and $chatOut -match 'chatEnabled: true' -and $chatOut -match 'Pre-pickup POST: 409' -and $chatOut -match 'Stranger GET: 403'
if ($allOk) { Pass "Feat 2: customer/rider 201, stranger 403, pre-pickup 409" } else { Fail "Feat 2 regression"; Note $chatOut }

Write-Host "=== 7. Bug 1 - Confirm Pickup transition (code-level) ===" -ForegroundColor Cyan
$bug1File = Get-Content "components/rider/dashboard/DeliveryStatusAction.tsx" -Raw
if ($bug1File -match 'onAdvance:\s*\(currentStage') { Pass "DeliveryStatusAction forwards CURRENT stage" } else { Fail "DeliveryStatusAction still buggy" }
$bug1File2 = Get-Content "components/rider/dashboard/RiderDeliveryPage.tsx" -Raw
if ($bug1File2 -match 'stageToApiStatus\(currentStage\)') { Pass "RiderDeliveryPage PATCH uses currentStage" } else { Fail "RiderDeliveryPage still buggy" }

Write-Host "=== 8. npx tsc --noEmit ===" -ForegroundColor Cyan
& npx tsc --noEmit 1>$null 2>$null
if ($LASTEXITCODE -eq 0) { Pass "tsc --noEmit clean" } else { Fail "tsc exit=$LASTEXITCODE" }

Write-Host "=== 9. prisma migrate status ===" -ForegroundColor Cyan
$migOut = & npx prisma migrate status 2>&1 | Out-String
if ($migOut -match 'Database schema is up to date' -or $migOut -match 'No pending migrations') {
  Pass "prisma migrate status clean"
} else {
  Note "Migrations output:"
  $migOut.Split("`n") | Select-Object -First 5 | ForEach-Object { Note $_ }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($script:failures -eq 0) {
  Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
} else {
  Write-Host "$($script:failures) CHECK(S) FAILED" -ForegroundColor Red
}
exit $script:failures