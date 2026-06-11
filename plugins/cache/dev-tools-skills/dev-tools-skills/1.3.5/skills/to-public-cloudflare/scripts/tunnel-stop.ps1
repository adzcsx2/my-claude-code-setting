# Cloudflare Tunnel Stop
# Stops all tunnel processes + health monitor

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "  Stopping Cloudflare Tunnels..." -ForegroundColor Cyan
Write-Host ""

# ---- Stop health monitor ----
Write-Host "  Stopping health monitor..." -ForegroundColor White
$HC_PID_FILE = "$env:TEMP\tunnel-healthcheck.pid"
if (Test-Path $HC_PID_FILE) {
    $hcPid = Get-Content $HC_PID_FILE -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hcPid) {
        Stop-Process -Id ([int]$hcPid) -Force -ErrorAction SilentlyContinue
        Write-Host "    Health monitor stopped (PID: $hcPid)" -ForegroundColor Green
    }
    Remove-Item $HC_PID_FILE -Force -ErrorAction SilentlyContinue
}

# Kill any PowerShell running tunnel-healthcheck
Get-CimInstance Win32_Process -Filter "name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*tunnel-healthcheck*' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "    Killed healthcheck PID $($_.ProcessId)" -ForegroundColor Green
    }

# ---- Stop cloudflared processes ----
$procs = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" -ErrorAction SilentlyContinue
if ($procs) {
    foreach ($p in $procs) {
        # Match by config file pattern
        if ($p.CommandLine -like '*config-*' -or $p.CommandLine -like '*tunnel*run*') {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
            $tunnelName = if ($p.CommandLine -match 'config-([a-z0-9-]+)') { $Matches[1] } else { "unknown" }
            Write-Host "    Stopped tunnel: $tunnelName (PID: $($p.ProcessId))" -ForegroundColor Green
        }
    }
} else {
    Write-Host "    No cloudflared processes running." -ForegroundColor Yellow
}

# Also clean up /tmp state directory for healthcheck (sh version)
$hcStateDir = "$env:TEMP\tunnel-healthcheck-state"
if (Test-Path $hcStateDir) {
    Remove-Item $hcStateDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "  All tunnels stopped." -ForegroundColor Green
Write-Host ""
