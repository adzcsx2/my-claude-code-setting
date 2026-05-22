#!/usr/bin/env bash
# Cloudflare Tunnel Remove
# Removes a tunnel from registry, deletes config, optionally deletes from Cloudflare

set -euo pipefail

CF_DIR="$HOME/.cloudflared"
REGISTRY_FILE="$CF_DIR/tunnel-registry.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

if [ ! -f "$REGISTRY_FILE" ]; then
    echo -e "${RED}No tunnel registry found.${NC}"
    exit 1
fi

COUNT=$(jq '.tunnels | length' "$REGISTRY_FILE")
if [ "$COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No tunnels in registry.${NC}"
    exit 0
fi

# If argument provided, use it; otherwise show list
NAME=""
if [ $# -gt 0 ]; then
    NAME="$1"
else
    echo ""
    echo -e "  ${CYAN}Registered tunnels:${NC}"
    for ((i=0; i<COUNT; i++)); do
        TNAME=$(jq -r ".tunnels[$i].name" "$REGISTRY_FILE")
        TPORT=$(jq -r ".tunnels[$i].port" "$REGISTRY_FILE")
        echo "    [$((i+1))] $TNAME -> localhost:$TPORT"
    done
    echo ""
    echo -ne "  Enter tunnel name or number to remove: "
    read -r INPUT
    if [[ "$INPUT" =~ ^[0-9]+$ ]] && [ "$INPUT" -ge 1 ] && [ "$INPUT" -le "$COUNT" ]; then
        NAME=$(jq -r ".tunnels[$((INPUT-1))].name" "$REGISTRY_FILE")
    else
        NAME="$INPUT"
    fi
fi

# Verify tunnel exists
TARGET=$(jq -r --arg name "$NAME" '.tunnels[] | select(.name == $name)' "$REGISTRY_FILE")
if [ -z "$TARGET" ]; then
    echo -e "${RED}Tunnel '$NAME' not found in registry.${NC}"
    exit 1
fi

HOSTNAME=$(echo "$TARGET" | jq -r '.hostname')
echo ""
echo -e "${YELLOW}About to remove tunnel: $NAME ($HOSTNAME)${NC}"
echo -ne "  Confirm? (y/n): "
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[yY] ]]; then
    echo "  Cancelled."
    exit 0
fi

# Stop the tunnel
CONFIG_FILE="$CF_DIR/$(echo "$TARGET" | jq -r '.config_file')"
if pgrep -f "cloudflared.*$CONFIG_FILE" >/dev/null 2>&1; then
    pkill -f "cloudflared.*$CONFIG_FILE" 2>/dev/null || true
    echo -e "  ${GREEN}Stopped cloudflared process for $NAME${NC}"
fi

# Delete config
if [ -f "$CONFIG_FILE" ]; then
    rm -f "$CONFIG_FILE"
    echo -e "  ${GREEN}Deleted config: $(basename "$CONFIG_FILE")${NC}"
fi

# Optionally delete from Cloudflare
echo -ne "  Also delete tunnel from Cloudflare? (y/n): "
read -r DELETE_CF
if [[ "$DELETE_CF" =~ ^[yY] ]]; then
    cloudflared tunnel delete "$NAME" 2>/dev/null && \
        echo -e "  ${GREEN}Deleted from Cloudflare: $NAME${NC}" || \
        echo -e "  ${YELLOW}Could not delete from Cloudflare (may need manual cleanup)${NC}"
fi

# Update registry
jq --arg name "$NAME" '.tunnels = (.tunnels | map(select(.name != $name)))' \
    "$REGISTRY_FILE" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "$REGISTRY_FILE"

echo -e "  ${GREEN}Removed from registry: $NAME${NC}"
echo ""
