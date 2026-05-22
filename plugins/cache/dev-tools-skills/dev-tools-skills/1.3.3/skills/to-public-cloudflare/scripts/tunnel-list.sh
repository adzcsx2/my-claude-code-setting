#!/usr/bin/env bash
# Cloudflare Tunnel List
# Shows all registered tunnels with their status

set -euo pipefail

CF_DIR="$HOME/.cloudflared"
REGISTRY_FILE="$CF_DIR/tunnel-registry.json"

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DARK='\033[0;90m'
NC='\033[0m'

if [ ! -f "$REGISTRY_FILE" ]; then
    echo -e "${YELLOW}No tunnel registry found. Run 'tunnel-add' to create a tunnel.${NC}"
    exit 0
fi

DOMAIN=$(jq -r '.domain' "$REGISTRY_FILE")
COUNT=$(jq '.tunnels | length' "$REGISTRY_FILE")

echo ""
echo -e "  ${CYAN}${BOLD}Cloudflare Tunnels ($DOMAIN)${NC}"
echo -e "  ${CYAN}================================${NC}"
echo ""

if [ "$COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}No tunnels registered. Run 'tunnel-add' to create one.${NC}"
    exit 0
fi

echo -e "  ${BOLD}Name               Hostname                             Port   Process     Health${NC}"
echo -e "  ${BOLD}----               --------                             ----   -------     ------${NC}"

for ((i=0; i<COUNT; i++)); do
    NAME=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
    HOSTNAME=$(jq -r ".tunnels[$i].hostname" "$REGISTRY_FILE")
    PORT=$(jq -r ".tunnels[$i].port" "$REGISTRY_FILE")
    CONFIG_FILE="$CF_DIR/$(jq -r ".tunnels[$i].config_file" "$REGISTRY_FILE")"

    # Check process
    if pgrep -f "cloudflared.*$CONFIG_FILE" >/dev/null 2>&1; then
        PROCESS="running"
        P_COLOR=$GREEN
    else
        PROCESS="stopped"
        P_COLOR=$RED
    fi

    # Check health (quick 5s timeout)
    HEALTH="unknown"
    H_COLOR=$DARK
    if [ "$PROCESS" = "running" ]; then
        CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://$HOSTNAME/" 2>/dev/null) || CODE="000"
        if [ "$CODE" != "000" ]; then
            HEALTH="ok"
            H_COLOR=$GREEN
        else
            HEALTH="unreachable"
            H_COLOR=$RED
        fi
    fi

    printf "  %-18s %-37s %-6s " "$NAME" "$HOSTNAME" "$PORT"
    echo -e "${P_COLOR}$(printf '%-11s' "$PROCESS")${NC} ${H_COLOR}${HEALTH}${NC}"
done

echo ""
