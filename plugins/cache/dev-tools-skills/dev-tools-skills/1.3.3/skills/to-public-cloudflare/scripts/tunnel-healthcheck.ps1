# Cloudflare Tunnel Health Monitor
# Reads tunnel list from ~/.cloudflared/tunnel-registry.json
# Started by tunnel-start, stopped by tunnel-stop

$ErrorActionPreference = "Continue"

$CF_DIR = Join-Path $env:USERPROFILE ".cloudflared"
$REGISTRY_FILE = Join-Path $CF_DIR "tunnel-registry.json"
$LOG_FILE = "$env:TEMP\tunnel-healthcheck.log"
$PID_FILE = "$env:TEMP\tunnel-healthcheck.pid"
$MAX_LOG_SIZE = 1MB
$CHECK_INTERVAL = 60
$FAIL_THRESHOLD = 3
$COOLDOWN_AFTER_RESTART = 120
$MAX_BACKOFF = 300

# Write PID file
[System.IO.File]::WriteAllText($PID_FILE, $PID.ToString(), [System.Text.UTF8Encoding]::new($false))

# ---- State tracking ----
$script:State = @{}

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Message"
    try {
        if ((Test-Path $LOG_FILE) -and ((Get-Item $LOG_FILE).Length -gt $MAX_LOG_SIZE)) {
            $lines = Get-Content $LOG_FILE -Tail 500 -Encoding UTF8
            [System.IO.File]::WriteAllLines($LOG_FILE, $lines, [System.Text.UTF8Encoding]::new($false))
        }
        [System.IO.File]::AppendAllText($LOG_FILE, "$line`r`n", [System.Text.UTF8Encoding]::new($false))
    } catch { }
}

function Get-TunnelsFromRegistry {
    if (-not (Test-Path $REGISTRY_FILE)) { return @() }
    try {
        $reg = Get-Content $REGISTRY_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
        $result = @()
        foreach ($t in $reg.tunnels) {
            $configPath = Join-Path $CF_DIR $t.config_file
            $result += @{
                Name      = $t.name
                Config    = $configPath
                Url       = "https://$($t.hostname)"
                LocalPort = [int]$t.port
            }
        }
        return $result
    } catch { return @() }
}

function Test-ExternalUrl {
    param([string]$Url)
    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec 10 -UseBasicParsing
        return $true
    } catch {
        if ($_.Exception.Response) { return $true }
        return $false
    }
}

function Test-LocalPort {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return [bool]$conn
    } catch { return $false }
}

function Restart-TunnelProcess {
    param([string]$Name, [string]$Config)
    $procs = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
        Where-Object { $_.CommandLine -like "*$Config*" }
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Log "[ACTION] Killed PID $($p.ProcessId) for $Name"
    }
    Start-Sleep -Seconds 5
    Start-Process -FilePath "cloudflared.exe" `
        -ArgumentList "tunnel","--config",$Config,"run" `
        -WindowStyle Minimized
    Write-Log "[ACTION] Started new cloudflared for $Name"
}

# ---- Main Loop ----
Write-Log "=== Tunnel Health Monitor Started (PID: $PID) ==="
Write-Log "Config: interval=${CHECK_INTERVAL}s | threshold=$FAIL_THRESHOLD | cooldown=${COOLDOWN_AFTER_RESTART}s | max_backoff=${MAX_BACKOFF}s"

while ($true) {
    $tunnels = Get-TunnelsFromRegistry
    if ($tunnels.Count -eq 0) {
        Start-Sleep -Seconds $CHECK_INTERVAL
        continue
    }

    foreach ($t in $tunnels) {
        if (-not (Test-Path $t.Config)) { continue }

        if (-not $script:State[$t.Name]) {
            $script:State[$t.Name] = @{ FailCount = 0; RestartCount = 0; LastRestart = $null }
        }
        $s = $script:State[$t.Name]

        # Cooldown after restart
        if ($s.LastRestart -and ((Get-Date) - $s.LastRestart).TotalSeconds -lt $COOLDOWN_AFTER_RESTART) {
            continue
        }

        $localUp    = Test-LocalPort   -Port $t.LocalPort
        $externalUp = Test-ExternalUrl  -Url  $t.Url

        if ($externalUp) {
            if ($s.FailCount -gt 0) {
                Write-Log "[OK] $($t.Name) recovered after $($s.FailCount) failed checks"
            }
            $s.FailCount    = 0
            $s.RestartCount = 0
        } else {
            $s.FailCount++
            $reason = if ($localUp) { "tunnel dead (local OK)" } else { "local service down on port $($t.LocalPort)" }
            Write-Log "[FAIL] $($t.Name) $($s.FailCount)/$FAIL_THRESHOLD - $reason"

            if ($s.FailCount -ge $FAIL_THRESHOLD) {
                if (-not $localUp) {
                    Write-Log "[SKIP] $($t.Name) local service is down, tunnel restart skipped (check PM2)"
                    $s.FailCount = 0
                } else {
                    Restart-TunnelProcess -Name $t.Name -Config $t.Config
                    $s.LastRestart  = Get-Date
                    $s.FailCount    = 0
                    $s.RestartCount++
                    Write-Log "[INFO] $($t.Name) restart #$($s.RestartCount), cooldown ${COOLDOWN_AFTER_RESTART}s"
                }
            }
        }
    }

    $maxR = 0
    foreach ($key in $script:State.Keys) {
        $rc = $script:State[$key]['RestartCount']
        if ($rc -gt $maxR) { $maxR = $rc }
    }
    $sleepSec = [Math]::Min($CHECK_INTERVAL + ($maxR * 60), $MAX_BACKOFF)
    Start-Sleep -Seconds $sleepSec
}
