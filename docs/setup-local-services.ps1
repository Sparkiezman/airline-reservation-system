# Run this in an ADMINISTRATOR PowerShell window
# (Start menu -> type PowerShell -> right-click -> Run as administrator).
#
# It performs one-time local machine setup for the Airline Reservation System:
#   1. Resets the Postgres 'postgres' superuser password (needed because the
#      existing local install requires a password nobody currently has).
#   2. Installs Memurai Developer (a maintained, Redis-compatible Windows
#      service) since there is no official Redis build for Windows.
#   3. Sets a requirepass on Memurai matching server/.env.
#
# Safe to re-run. Review before running, as with any script from the internet.

$ErrorActionPreference = "Stop"
# Fill these in before running — keep them in sync with server/.env.
# (Generate one with: node -e "console.log(require('crypto').randomBytes(18).toString('base64').replace(/[+/=]/g,'').slice(0,20))")
$pgPassword = "CHANGE_ME_POSTGRES_SUPERUSER_PASSWORD"   # postgres superuser password (admin login only, not used by the app)
$appDbPassword = "CHANGE_ME_APP_DB_PASSWORD"             # must match server/.env DB_PASSWORD
$redisPassword = "CHANGE_ME_REDIS_PASSWORD"              # must match server/.env REDIS_PASSWORD

# IMPORTANT: PowerShell 5.1's "-Encoding utf8" writes a UTF-8 BOM, which
# breaks Postgres's pg_hba.conf parser (causes a silent startup failure with
# an empty log). Use this BOM-less UTF8 encoding for every config file write.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-FileNoBom($path, [string[]]$lines) {
    [System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $utf8NoBom)
}

# ---------- 1. Reset Postgres password ----------
Write-Host "== Step 1: Resetting postgres superuser password ==" -ForegroundColor Cyan
$hba = "C:\Program Files\PostgreSQL\16\data\pg_hba.conf"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"

if (Test-Path $hba) {
    Copy-Item $hba "$hba.bak" -Force
    $trustLines = (Get-Content $hba) | ForEach-Object {
        $_ -replace '^(local\s+all\s+all\s+)scram-sha-256', '$1trust' `
           -replace '^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)scram-sha-256', '$1trust' `
           -replace '^(host\s+all\s+all\s+::1/128\s+)scram-sha-256', '$1trust'
    }
    Write-FileNoBom $hba $trustLines

    Restart-Service -Name "postgresql-x64-16" -Force
    Start-Sleep -Seconds 3

    & $psql -U postgres -h localhost -c "ALTER USER postgres PASSWORD '$pgPassword';"

    Write-Host "Creating airline_app role and airline_reservation database..."
    & $psql -U postgres -h localhost -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'airline_app') THEN CREATE ROLE airline_app WITH LOGIN PASSWORD '$appDbPassword'; END IF; END `$`$;"
    & $psql -U postgres -h localhost -c "ALTER ROLE airline_app WITH PASSWORD '$appDbPassword';"
    $dbExists = & $psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname = 'airline_reservation';"
    if ($dbExists -ne "1") {
        & $psql -U postgres -h localhost -c "CREATE DATABASE airline_reservation OWNER airline_app;"
    }

    Copy-Item "$hba.bak" $hba -Force
    Remove-Item "$hba.bak" -Force

    Restart-Service -Name "postgresql-x64-16" -Force
    Start-Sleep -Seconds 3
    Write-Host "Postgres password reset complete." -ForegroundColor Green
} else {
    Write-Host "pg_hba.conf not found at expected path — skipping Postgres step." -ForegroundColor Yellow
}

# ---------- 2. Install Memurai (Redis-compatible) ----------
Write-Host "== Step 2: Installing Memurai Developer ==" -ForegroundColor Cyan
winget install --id Memurai.MemuraiDeveloper --source winget --accept-package-agreements --accept-source-agreements -e

Start-Sleep -Seconds 3

# ---------- 3. Configure requirepass ----------
Write-Host "== Step 3: Configuring Memurai requirepass ==" -ForegroundColor Cyan
$memuraiConf = "C:\Program Files\Memurai\memurai.conf"
if (Test-Path $memuraiConf) {
    $content = Get-Content $memuraiConf
    if ($content -match '^\s*#?\s*requirepass\s+') {
        $content = $content -replace '^\s*#?\s*requirepass\s+.*', "requirepass $redisPassword"
    } else {
        $content += "requirepass $redisPassword"
    }
    Write-FileNoBom $memuraiConf $content
    Restart-Service -Name "Memurai" -Force -ErrorAction SilentlyContinue
    Write-Host "Memurai configured with requirepass and restarted." -ForegroundColor Green
} else {
    Write-Host "Could not find memurai.conf at $memuraiConf — set requirepass manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "All done. Next steps in a normal (non-admin) terminal:" -ForegroundColor Cyan
Write-Host '  cd "C:\Users\PC\Desktop\airline web\server"'
Write-Host "  npm run migrate"
Write-Host "  npm run seed"
Write-Host "  npm start"
