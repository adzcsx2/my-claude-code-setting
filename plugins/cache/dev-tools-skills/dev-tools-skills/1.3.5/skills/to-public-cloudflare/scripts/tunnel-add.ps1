# Cloudflare Tunnel Add
# Interactively add or update a tunnel in the registry

$ErrorActionPreference = "Stop"

$CF_DIR = Join-Path $env:USERPROFILE ".cloudflared"
$REGISTRY_FILE = Join-Path $CF_DIR "tunnel-registry.json"

function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Blue }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  $msg" -ForegroundColor Red }

# ---- Init registry ----
if (-not (Test-Path $CF_DIR)) { New-Item -ItemType Directory -Path $CF_DIR -Force | Out-Null }

if (-not (Test-Path $REGISTRY_FILE)) {
    Write-Warn "No tunnel registry found."
    $domain = Read-Host "  Enter your Cloudflare domain (e.g. long123456789.xyz)"
    if (-not $domain -or $domain -notmatch '\.') {
        Write-Err "Invalid domain."
        exit 1
    }
    $initJson = "{`"domain`":`"$domain`",`"tunnels`":[]}"
    [System.IO.File]::WriteAllText($REGISTRY_FILE, $initJson, [System.Text.UTF8Encoding]::new($false))
    Write-Ok "Registry created: $REGISTRY_FILE"
}

$reg = Get-Content $REGISTRY_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
$domain = $reg.domain

Write-Host ""
Write-Host "  === Add Cloudflare Tunnel ===" -ForegroundColor Cyan
Write-Host "  Domain: $domain" -ForegroundColor Green
Write-Host ""

# ---- Check cloudflared ----
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Err "cloudflared not found. Install it first."
    exit 1
}

if (-not (Test-Path (Join-Path $CF_DIR "cert.pem"))) {
    Write-Warn "No cert.pem found. Running 'cloudflared tunnel login'..."
    & cloudflared.exe tunnel login
    if (-not (Test-Path (Join-Path $CF_DIR "cert.pem"))) {
        Write-Err "Login failed or cancelled."
        exit 1
    }
    Write-Ok "Login successful."
}

# ---- Subdomain ----
$subdomain = Read-Host "  Enter subdomain (e.g. myapp, will become myapp.$domain)"
if (-not $subdomain -or $subdomain -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') {
    Write-Err "Invalid subdomain. Use lowercase letters, numbers, and hyphens."
    exit 1
}

# ---- Check existing ----
$existing = $reg.tunnels | Where-Object { $_.name -eq $subdomain }
$isUpdate = $false

if ($existing) {
    Write-Warn "Tunnel '$subdomain' already exists: $($existing.hostname) -> localhost:$($existing.port)"
    $answer = Read-Host "  Update to a new port? (y/n)"
    if ($answer -notmatch '^[yY]') {
        Write-Info "Cancelled."
        exit 0
    }
    $isUpdate = $true
}

# ---- Port ----
$portStr = Read-Host "  Enter local port (e.g. 3000)"
if (-not ($portStr -match '^\d+$') -or [int]$portStr -lt 1 -or [int]$portStr -gt 65535) {
    Write-Err "Invalid port number."
    exit 1
}
$port = [int]$portStr

# Warn if port already used by another tunnel
$portConflict = $reg.tunnels | Where-Object { $_.name -ne $subdomain -and [int]$_.port -eq $port }
if ($portConflict) {
    Write-Warn "Note: port $port is also used by tunnel '$($portConflict.name)'"
}

# ---- Get or create tunnel ----
$tunnelId = $null

if ($isUpdate) {
    $tunnelId = $existing.tunnel_id
    Write-Ok "Reusing existing tunnel: $subdomain ($tunnelId)"
} else {
    # Check if tunnel exists on Cloudflare
    $listOutput = & cloudflared.exe tunnel list 2>&1 | Out-String
    $existingLine = $listOutput -split "`n" | Where-Object { $_ -match "\s+$subdomain\s" }

    if ($existingLine) {
        $tunnelId = ($existingLine.Trim() -split '\s+')[0]
        Write-Ok "Reusing existing Cloudflare tunnel: $subdomain ($tunnelId)"
    } else {
        Write-Info "Creating tunnel: $subdomain..."
        $createOutput = & cloudflared.exe tunnel create $subdomain 2>&1 | Out-String
        $tunnelId = if ($createOutput -match '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') {
            $Matches[1]
        } else { $null }

        if (-not $tunnelId) {
            Write-Err "Failed to create tunnel."
            Write-Host $createOutput
            exit 1
        }
        Write-Ok "Created tunnel: $tunnelId"
    }
}

$hostname = "$subdomain.$domain"
$configFileName = "config-$subdomain.yml"
$configPath = Join-Path $CF_DIR $configFileName

# ---- Generate config ----
$credFile = Join-Path $CF_DIR "$tunnelId.json"
$configContent = @"
tunnel: $tunnelId
credentials-file: $($credFile -replace '\\','/')

ingress:
  - hostname: $hostname
    service: http://localhost:$port
  - service: http_status:404
"@
[System.IO.File]::WriteAllText($configPath, $configContent, [System.Text.UTF8Encoding]::new($false))
Write-Ok "Config written: $configFileName"

# ---- DNS route ----
Write-Info "Creating DNS route: $hostname..."
try {
    & cloudflared.exe tunnel route dns $subdomain $hostname 2>&1 | Out-Null
    Write-Ok "DNS route created."
} catch {
    Write-Warn "DNS route may already exist (this is OK)."
}

# ---- Update registry ----
$newTunnel = [PSCustomObject]@{
    name       = $subdomain
    tunnel_id  = $tunnelId
    subdomain  = $subdomain
    hostname   = $hostname
    port       = $port
    config_file = $configFileName
}

# Remove existing entry with same name, then add new
$otherTunnels = @($reg.tunnels | Where-Object { $_.name -ne $subdomain })
$reg.tunnels = @($otherTunnels) + @($newTunnel)

$json = $reg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($REGISTRY_FILE, $json, [System.Text.UTF8Encoding]::new($false))

# ---- Done ----
Write-Host ""
Write-Host "  ========================================" -ForegroundColor White
Write-Host "  Tunnel $($if($isUpdate){'updated'}else{'added'})!" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor White
Write-Host "  Hostname: https://$hostname" -ForegroundColor Cyan
Write-Host "  Local:    http://localhost:$port"
Write-Host "  Start:    tunnel-start $subdomain"
Write-Host ""
