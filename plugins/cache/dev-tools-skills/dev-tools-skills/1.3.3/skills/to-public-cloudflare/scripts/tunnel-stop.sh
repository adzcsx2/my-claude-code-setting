#!/usr/bin/env bash
# Cloudflare Tunnel Stop
# Stops all tunnel processes + health monitor

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "  ${CYAN}Stopping Cloudflare Tunnels...${NC}"
echo ""

# ---- Stop health monitor ----
echo -e "  Stopping health monitor..."
PID_FILE="/tmp/tunnel-healthcheck.pid"
if [ -f "$PID_FILE" ]; then
    HC_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$HC_PID" ] && kill -0 "$HC_PID" 2>/dev/null; then
        kill "$HC_PID" 2>/dev/null || true
        echo -e "    ${GREEN}Health monitor stopped (PID: $HC_PID)${NC}"
    fi
    rm -f "$PID_FILE"
fi

# Also kill any bash process running tunnel-healthcheck
pkill -f "tunnel-healthcheck" 2>/dev/null && echo -e "    ${GREEN}Killed healthcheck process${NC}" || true

# ---- Stop cloudflared processes ----
if pgrep -f "cloudflared.*tunnel" >/dev/null 2>&1; then
    pkill -f "cloudflared.*tunnel" 2>/dev/null || true
    sleep 1
    # Verify
    if pgrep -f "cloudflared.*tunnel" >/dev/null 2>&1; then
        pkill -9 -f "cloudflared.*tunnel" 2>/dev/null || true
    fi
    echo -e "    ${GREEN}All cloudflared processes stopped${NC}"
else
    echo -e "    ${YELLOW}No cloudflared processes running.${NC}"
fi

# Clean up state directory
rm -rf /tmp/tunnel-healthcheck-state 2>/dev/null || true

echo ""
echo -e "  ${GREEN}All tunnels stopped.${NC}"
echo ""
