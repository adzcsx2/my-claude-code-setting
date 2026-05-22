# Cloudflare Tunnel Remove
# Removes a tunnel from registry, deletes config, optionally deletes from Cloudflare

$ErrorActionPreference = "Stop"

$CF_DIR = Join-Path $env:USERPROFILE ".cloudflared"
$REGISTRY_FILE = Join-Path $CF_DIR "tunnel-registry.json"

function Write-Ok($msg) { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "  $msg" -ForegroundColor Red }

if (-not (Test-Path $REGISTRY_FILE)) {
    Write-Err "No tunnel registry found."
    exit 1
}

$reg = Get-Content $REGISTRY_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
$tunnels = $reg.tunnels

if (-not $tunnels -or $tunnels.Count -eq 0) {
    Write-Warn "No tunnels in registry."
    exit 0
}

# If argument provided, use it; otherwise show list
$name = $null
if ($args.Count -gt 0) {
    $name = $args[0]
} else {
    Write-Host ""
    Write-Host "  Registered tunnels:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $tunnels.Count; $i++) {
        Write-Host "    [$($i+1)] $($tunnels[$i].name) -> localhost:$($tunnels[$i].port)"
    }
    Write-Host ""
    $input_str = Read-Host "  Enter tunnel name or number to remove"
    if ($input_str -match '^\d+$' -and [int]$input_str -ge 1 -and [int]$input_str -le $tunnels.Count) {
        $name = $tunnels[[int]$input_str - 1].name
    } else {
        $name = $input_str
    }
}

$target = $tunnels | Where-Object { $_.name -eq $name }
if (-not $target) {
    Write-Err "Tunnel '$name' not found in registry."
    exit 1
}

Write-Host ""
Write-Warn "About to remove tunnel: $($target.name) ($($target.hostname))"
$confirm = Read-Host "  Confirm? (y/n)"
if ($confirm -notmatch '^[yY]') {
    Write-Host "  Cancelled."
    exit 0
}

# Stop the tunnel first
$configPath = Join-Path $CF_DIR $target.config_file
$proc = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$configPath*" }
if ($proc) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Ok "Stopped cloudflared process for $($target.name)"
}

# Delete config file
if (Test-Path $configPath) {
    Remove-Item $configPath -Force
    Write-Ok "Deleted config: $($target.config_file)"
}

# Optionally delete from Cloudflare
$deleteCF = Read-Host "  Also delete tunnel from Cloudflare? (y/n)"
if ($deleteCF -match '^[yY]') {
    try {
        & cloudflared.exe tunnel delete $target.name 2>&1 | Out-Null
        Write-Ok "Deleted tunnel from Cloudflare: $($target.name)"
    } catch {
        Write-Warn "Could not delete from Cloudflare (may need manual cleanup): $_"
    }
}

# Update registry
$reg.tunnels = @($reg.tunnels | Where-Object { $_.name -ne $name })
$json = $reg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($REGISTRY_FILE, $json, [System.Text.UTF8Encoding]::new($false))

Write-Ok "Removed from registry: $name"
Write-Host ""
