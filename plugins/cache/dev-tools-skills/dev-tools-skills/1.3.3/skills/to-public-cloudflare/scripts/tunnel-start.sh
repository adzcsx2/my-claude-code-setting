#!/usr/bin/env bash
# Cloudflare Tunnel Start
# Starts specified tunnels (or all) from registry + launches health monitor
# Usage: tunnel-start [name1] [name2] ...

set -euo pipefail

CF_DIR="$HOME/.cloudflared"
REGISTRY_FILE="$CF_DIR/tunnel-registry.json"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ ! -f "$REGISTRY_FILE" ]; then
    echo -e "${RED}No tunnel registry found. Run 'tunnel-add' first.${NC}"
    exit 1
fi

COUNT=$(jq '.tunnels | length' "$REGISTRY_FILE")

# Filter by arguments
SELECTED_INDICES=()
if [ $# -gt 0 ]; then
    for arg in "$@"; do
        for ((i=0; i<COUNT; i++)); do
            NAME=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
            if [ "$NAME" = "$arg" ]; then
                SELECTED_INDICES+=($i)
            fi
        done
    done
    if [ ${#SELECTED_INDICES[@]} -eq 0 ]; then
        echo -e "${RED}No matching tunnels found.${NC}"
        exit 1
    fi
else
    for ((i=0; i<COUNT; i++)); do
        SELECTED_INDICES+=($i)
    done
fi

echo ""
echo -e "  ${CYAN}Starting Cloudflare Tunnels...${NC}"
echo ""

for i in "${SELECTED_INDICES[@]}"; do
    NAME=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
    HOSTNAME=$(jq -r ".tunnels[$i].hostname" "$REGISTRY_FILE")
    PORT=$(jq -r ".tunnels[$i].port" "$REGISTRY_FILE")
    CONFIG_FILE="$CF_DIR/$(jq -r ".tunnels[$i].config_file" "$REGISTRY_FILE")"

    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "  ${YELLOW}[SKIP] $NAME - config not found${NC}"
        continue
    fi

    # Check if already running
    if pgrep -f "cloudflared.*$CONFIG_FILE" >/dev/null 2>&1; then
        echo -e "  ${GREEN}[SKIP] $NAME already running${NC}"
    else
        cloudflared tunnel --config "$CONFIG_FILE" run "$NAME" >> "/tmp/${NAME}-tunnel.log" 2>&1 &
        echo -e "  ${GREEN}[START] $NAME - https://$HOSTNAME <- localhost:$PORT${NC}"
    fi
done

# ---- Start health monitor ----
echo ""
echo -e "  ${CYAN}Starting health monitor...${NC}"

HC_SCRIPT="$HOME/bin/tunnel-healthcheck.sh"
PID_FILE="/tmp/tunnel-healthcheck.pid"

# Kill existing healthcheck
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        kill "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
fi

if [ -f "$HC_SCRIPT" ]; then
    bash "$HC_SCRIPT" &
    echo -e "  ${GREEN}Health monitor running (PID: $!)${NC}"
    echo -e "  Log: /tmp/tunnel-healthcheck.log"
else
    echo -e "  ${YELLOW}tunnel-healthcheck.sh not found in ~/bin/, health monitoring disabled${NC}"
fi

# ---- Summary ----
echo ""
echo -e "  ${BOLD}========================================${NC}"
echo -e "  ${GREEN}${BOLD}Tunnels started${NC}"
echo -e "  ${BOLD}========================================${NC}"
for i in "${SELECTED_INDICES[@]}"; do
    NAME=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
    HOSTNAME=$(jq -r ".tunnels[$i].hostname" "$REGISTRY_FILE")
    echo -e "  $NAME: ${CYAN}https://$HOSTNAME${NC}"
done
echo ""
echo "  Commands:"
echo "    tunnel-stop       Stop all tunnels"
echo "    tunnel-list       Show tunnel status"
echo "    tail /tmp/tunnel-healthcheck.log  View health log"
echo ""
