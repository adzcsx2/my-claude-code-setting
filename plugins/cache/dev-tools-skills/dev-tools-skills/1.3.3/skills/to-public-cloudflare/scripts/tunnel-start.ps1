# Cloudflare Tunnel Start
# Starts specified tunnels (or all) from registry + launches health monitor
# Usage: tunnel-start [name1] [name2] ...

$CF_DIR = Join-Path $env:USERPROFILE ".cloudflared"
$REGISTRY_FILE = Join-Path $CF_DIR "tunnel-registry.json"

function Write-Info($msg) { Write-Host "  $msg" -ForegroundColor Blue }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  $msg" -ForegroundColor Red }

function Test-TunnelHealthy {
    param([string]$Url)
    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec 10 -UseBasicParsing
        return $true
    } catch {
        if ($_.Exception.Response) { return $true }
        return $false
    }
}

function Wait-TunnelHealthy {
    param([string]$Url, [int]$MaxWaitSeconds = 30, [string]$Name)
    $deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TunnelHealthy -Url $Url) { return $true }
        Start-Sleep -Seconds 3
    }
    return $false
}

if (-not (Test-Path $REGISTRY_FILE)) {
    Write-Host "No tunnel registry found. Run 'tunnel-add' first." -ForegroundColor Red
    exit 1
}

$reg = Get-Content $REGISTRY_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
$allTunnels = $reg.tunnels

# Filter by arguments if provided
$selectedTunnels = $allTunnels
if ($args.Count -gt 0) {
    $selectedTunnels = $allTunnels | Where-Object { $args -contains $_.name }
    $missing = $args | Where-Object { $_ -notin $allTunnels.name }
    if ($missing) {
        Write-Warn "Tunnels not found in registry: $($missing -join ', ')"
    }
}

if (-not $selectedTunnels -or $selectedTunnels.Count -eq 0) {
    Write-Host "No matching tunnels found." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Starting Cloudflare Tunnels..." -ForegroundColor Cyan
Write-Host ""

foreach ($t in $selectedTunnels) {
    $configPath = Join-Path $CF_DIR $t.config_file
    $url = "https://$($t.hostname)"

    if (-not (Test-Path $configPath)) {
        Write-Warn "[SKIP] $($t.name) - config not found: $($t.config_file)"
        continue
    }

    # Check if already running
    $existing = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$configPath*" } |
        Select-Object -First 1

    if ($existing) {
        # Process exists, but check if tunnel is actually healthy
        if (Test-TunnelHealthy -Url $url) {
            Write-Ok "[OK]   $($t.name) running & healthy (PID: $($existing.ProcessId)) - $url"
            continue
        } else {
            Write-Warn "[DEAD] $($t.name) process alive but tunnel unreachable (PID: $($existing.ProcessId)), restarting..."
            Stop-Process -Id $existing.ProcessId -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
            # Fall through to start below
        }
    }

    # Start tunnel
    Start-Process -FilePath "cloudflared.exe" `
        -ArgumentList "tunnel","--config",$configPath,"run" `
        -WindowStyle Minimized
    Write-Info "[WAIT] $($t.name) starting... - $url <- localhost:$($t.port)"

    # Wait and verify
    if (Wait-TunnelHealthy -Url $url -Name $t.name -MaxWaitSeconds 30) {
        Write-Ok "[OK]   $($t.name) connected - $url"
    } else {
        Write-Fail "[FAIL] $($t.name) started but not reachable within 30s - $url"
        Write-Info "       Check: cloudflared tunnel info $($t.tunnel_id)"
    }
}

# ---- Start health monitor ----
Write-Host ""
Write-Host "  Starting health monitor..." -ForegroundColor Cyan

$HC_SCRIPT = Join-Path $env:USERPROFILE "bin\tunnel-healthcheck.ps1"

# Kill existing healthcheck
$HC_PID_FILE = "$env:TEMP\tunnel-healthcheck.pid"
if (Test-Path $HC_PID_FILE) {
    $oldPid = Get-Content $HC_PID_FILE -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid) {
        Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $HC_PID_FILE -Force -ErrorAction SilentlyContinue
}

# Also kill any PowerShell running tunnel-healthcheck
Get-CimInstance Win32_Process -Filter "name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tunnel-healthcheck*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path $HC_SCRIPT) {
    Start-Process -FilePath "powershell" `
        -ArgumentList "-ExecutionPolicy","Bypass","-NoProfile","-File",$HC_SCRIPT `
        -WindowStyle Minimized

    # Verify healthcheck actually started
    Start-Sleep -Seconds 2
    $hcProc = Get-CimInstance Win32_Process -Filter "name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*tunnel-healthcheck*' } |
        Select-Object -First 1

    if ($hcProc) {
        Write-Ok "Health monitor running (PID: $($hcProc.ProcessId))"
    } else {
        Write-Fail "Health monitor FAILED to start"
    }
    Write-Info "Log: $env:TEMP\tunnel-healthcheck.log"
} else {
    Write-Warn "tunnel-healthcheck.ps1 not found in ~/bin/, health monitoring disabled"
}

# ---- Summary ----
Write-Host ""
Write-Host "  ========================================" -ForegroundColor White
Write-Host "  Tunnels started" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor White
foreach ($t in $selectedTunnels) {
    Write-Host "  $($t.name): https://$($t.hostname)" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  Commands:"
Write-Host "    tunnel-stop       Stop all tunnels"
Write-Host "    tunnel-list       Show tunnel status"
Write-Host "    type `"`$env:TEMP\tunnel-healthcheck.log`"  View health log"
Write-Host ""
