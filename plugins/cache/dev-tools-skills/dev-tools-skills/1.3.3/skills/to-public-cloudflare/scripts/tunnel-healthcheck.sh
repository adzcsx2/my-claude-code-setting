#!/usr/bin/env bash
# Cloudflare Tunnel Health Monitor
# Reads tunnel list from ~/.cloudflared/tunnel-registry.json
# Started by tunnel-start, stopped by tunnel-stop

set -euo pipefail

CF_DIR="$HOME/.cloudflared"
REGISTRY_FILE="$CF_DIR/tunnel-registry.json"
LOG_FILE="/tmp/tunnel-healthcheck.log"
PID_FILE="/tmp/tunnel-healthcheck.pid"
MAX_LOG_SIZE=1048576
CHECK_INTERVAL=60
FAIL_THRESHOLD=3
COOLDOWN_AFTER_RESTART=120
MAX_BACKOFF=300

# Write PID file
echo $$ > "$PID_FILE"

# State directory (one file per tunnel: fail_count restart_count last_restart_ts)
STATE_DIR="/tmp/tunnel-healthcheck-state"
mkdir -p "$STATE_DIR"

log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] $1" >> "$LOG_FILE"
    # Rotate log if too large
    if [ -f "$LOG_FILE" ]; then
        local size
        size=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$size" -gt $MAX_LOG_SIZE ]; then
            tail -500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
        fi
    fi
}

get_state() {
    local name="$1" field="$2"
    local sf="$STATE_DIR/$name"
    if [ -f "$sf" ]; then
        case "$field" in
            fail)     cut -d' ' -f1 "$sf" ;;
            restarts) cut -d' ' -f2 "$sf" ;;
            last)     cut -d' ' -f3 "$sf" ;;
        esac
    else
        case "$field" in
            fail|restarts) echo 0 ;;
            last) echo 0 ;;
        esac
    fi
}

set_state() {
    local name="$1" fail="$2" restarts="$3" last="$4"
    echo "$fail $restarts $last" > "$STATE_DIR/$name"
}

test_external() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$1" 2>/dev/null) || code="000"
    [ "$code" != "000" ]
}

test_local_port() {
    lsof -iTCP:"$1" -sTCP:LISTEN &>/dev/null 2>&1 || ss -tlnp 2>/dev/null | grep -q ":$1 " || true
    lsof -iTCP:"$1" -sTCP:LISTEN &>/dev/null 2>&1
}

restart_tunnel() {
    local name="$1" config="$2"
    pkill -f "cloudflared.*$config" 2>/dev/null || true
    sleep 5
    cloudflared tunnel --config "$config" run "$name" >> "/tmp/${name}-tunnel.log" 2>&1 &
    log "[ACTION] Restarted tunnel $name (PID: $!)"
}

# ---- Main Loop ----
log "=== Tunnel Health Monitor Started (PID: $$) ==="
log "Config: interval=${CHECK_INTERVAL}s | threshold=$FAIL_THRESHOLD | cooldown=${COOLDOWN_AFTER_RESTART}s | max_backoff=${MAX_BACKOFF}s"

while true; do
    if [ ! -f "$REGISTRY_FILE" ]; then
        sleep $CHECK_INTERVAL
        continue
    fi

    local now
    now=$(date +%s)
    local max_restarts=0

    local count
    count=$(jq '.tunnels | length' "$REGISTRY_FILE")

    for ((i=0; i<count; i++)); do
        local name host port config_file
        name=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
        host=$(jq -r ".tunnels[$i].hostname" "$REGISTRY_FILE")
        port=$(jq -r ".tunnels[$i].port" "$REGISTRY_FILE")
        config_file="$CF_DIR/$(jq -r ".tunnels[$i].config_file" "$REGISTRY_FILE")"

        [ -f "$config_file" ] || continue

        local fail restarts last_restart
        fail=$(get_state "$name" fail)
        restarts=$(get_state "$name" restarts)
        last_restart=$(get_state "$name" last)

        # Cooldown
        if [ "$last_restart" -gt 0 ] && [ $((now - last_restart)) -lt $COOLDOWN_AFTER_RESTART ]; then
            continue
        fi

        local local_up=false external_up=false
        test_local_port "$port" && local_up=true
        test_external "https://$host" && external_up=true

        if $external_up; then
            if [ "$fail" -gt 0 ]; then
                log "[OK] $name recovered after $fail failed checks"
            fi
            set_state "$name" 0 0 "$last_restart"
        else
            fail=$((fail + 1))
            local reason
            if $local_up; then reason="tunnel dead (local OK)"; else reason="local service down on port $port"; fi
            log "[FAIL] $name $fail/$FAIL_THRESHOLD - $reason"

            if [ "$fail" -ge $FAIL_THRESHOLD ]; then
                if ! $local_up; then
                    log "[SKIP] $name local service down, restart skipped"
                    set_state "$name" 0 "$restarts" "$last_restart"
                else
                    restart_tunnel "$name" "$config_file"
                    now=$(date +%s)
                    set_state "$name" 0 $((restarts + 1)) "$now"
                    restarts=$((restarts + 1))
                    log "[INFO] $name restart #$restarts, cooldown ${COOLDOWN_AFTER_RESTART}s"
                fi
            else
                set_state "$name" "$fail" "$restarts" "$last_restart"
            fi
        fi

        [ "$restarts" -gt "$max_restarts" ] && max_restarts=$restarts
    done

    local sleep_sec=$((CHECK_INTERVAL + max_restarts * 60))
    [ "$sleep_sec" -gt "$MAX_BACKOFF" ] && sleep_sec=$MAX_BACKOFF
    sleep "$sleep_sec"
done
