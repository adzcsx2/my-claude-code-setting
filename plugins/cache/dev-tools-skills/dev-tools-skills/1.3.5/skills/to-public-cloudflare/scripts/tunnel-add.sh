#!/usr/bin/env bash
# Cloudflare Tunnel Add
# Interactively add or update a tunnel in the registry

set -euo pipefail

CF_DIR="$HOME/.cloudflared"
REGISTRY_FILE="$CF_DIR/tunnel-registry.json"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# ---- Init registry ----
mkdir -p "$CF_DIR"

if [ ! -f "$REGISTRY_FILE" ]; then
    echo -e "${YELLOW}  No tunnel registry found.${NC}"
    echo -ne "  Enter your Cloudflare domain (e.g. long123456789.xyz): "
    read -r DOMAIN
    if [[ ! "$DOMAIN" =~ \. ]]; then
        echo -e "${RED}  Invalid domain.${NC}"
        exit 1
    fi
    echo "{\"domain\":\"$DOMAIN\",\"tunnels\":[]}" | jq . > "$REGISTRY_FILE"
    echo -e "${GREEN}  Registry created: $REGISTRY_FILE${NC}"
fi

DOMAIN=$(jq -r '.domain' "$REGISTRY_FILE")

echo ""
echo -e "  ${CYAN}=== Add Cloudflare Tunnel ===${NC}"
echo -e "  Domain: ${GREEN}$DOMAIN${NC}"
echo ""

# ---- Check cloudflared ----
if ! command -v cloudflared &>/dev/null; then
    echo -e "${RED}  cloudflared not found. Install it first.${NC}"
    exit 1
fi

if [ ! -f "$CF_DIR/cert.pem" ]; then
    echo -e "${YELLOW}  No cert.pem found. Running 'cloudflared tunnel login'...${NC}"
    cloudflared tunnel login
    if [ ! -f "$CF_DIR/cert.pem" ]; then
        echo -e "${RED}  Login failed or cancelled.${NC}"
        exit 1
    fi
    echo -e "${GREEN}  Login successful.${NC}"
fi

# ---- Subdomain ----
echo -ne "  Enter subdomain (e.g. myapp, will become myapp.$DOMAIN): "
read -r SUBDOMAIN
if [[ ! "$SUBDOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo -e "${RED}  Invalid subdomain. Use lowercase letters, numbers, and hyphens.${NC}"
    exit 1
fi

# ---- Check existing ----
IS_UPDATE=false
EXISTING=$(jq -r --arg name "$SUBDOMAIN" '.tunnels[] | select(.name == $name)' "$REGISTRY_FILE")
if [ -n "$EXISTING" ]; then
    EXISTING_PORT=$(echo "$EXISTING" | jq -r '.port')
    echo -e "${YELLOW}  Tunnel '$SUBDOMAIN' already exists: $SUBDOMAIN.$DOMAIN -> localhost:$EXISTING_PORT${NC}"
    echo -ne "  Update to a new port? (y/n): "
    read -r ANSWER
    if [[ ! "$ANSWER" =~ ^[yY] ]]; then
        echo "  Cancelled."
        exit 0
    fi
    IS_UPDATE=true
fi

# ---- Port ----
echo -ne "  Enter local port (e.g. 3000): "
read -r PORT
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo -e "${RED}  Invalid port number.${NC}"
    exit 1
fi

# Warn if port used by another tunnel
PORT_CONFLICT=$(jq -r --arg name "$SUBDOMAIN" --argjson port "$PORT" \
    '.tunnels[] | select(.name != $name and .port == $port) | .name' "$REGISTRY_FILE")
if [ -n "$PORT_CONFLICT" ]; then
    echo -e "${YELLOW}  Note: port $PORT is also used by tunnel '$PORT_CONFLICT'${NC}"
fi

# ---- Get or create tunnel ----
TUNNEL_ID=""

if $IS_UPDATE; then
    TUNNEL_ID=$(echo "$EXISTING" | jq -r '.tunnel_id')
    echo -e "${GREEN}  Reusing existing tunnel: $SUBDOMAIN ($TUNNEL_ID)${NC}"
else
    # Check if tunnel exists on Cloudflare
    EXISTING_LINE=$(cloudflared tunnel list 2>/dev/null | grep " $SUBDOMAIN " || true)
    if [ -n "$EXISTING_LINE" ]; then
        TUNNEL_ID=$(echo "$EXISTING_LINE" | awk '{print $1}')
        echo -e "${GREEN}  Reusing existing Cloudflare tunnel: $SUBDOMAIN ($TUNNEL_ID)${NC}"
    else
        echo "  Creating tunnel: $SUBDOMAIN..."
        CREATE_OUTPUT=$(cloudflared tunnel create "$SUBDOMAIN" 2>&1)
        TUNNEL_ID=$(echo "$CREATE_OUTPUT" | grep -oP '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' || true)
        if [ -z "$TUNNEL_ID" ]; then
            echo -e "${RED}  Failed to create tunnel.${NC}"
            echo "$CREATE_OUTPUT"
            exit 1
        fi
        echo -e "${GREEN}  Created tunnel: $TUNNEL_ID${NC}"
    fi
fi

HOSTNAME="$SUBDOMAIN.$DOMAIN"
CONFIG_FILENAME="config-$SUBDOMAIN.yml"
CONFIG_PATH="$CF_DIR/$CONFIG_FILENAME"

# ---- Generate config ----
cat > "$CONFIG_PATH" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CF_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:$PORT
  - service: http_status:404
EOF
echo -e "${GREEN}  Config written: $CONFIG_FILENAME${NC}"

# ---- DNS route ----
echo "  Creating DNS route: $HOSTNAME..."
cloudflared tunnel route dns "$SUBDOMAIN" "$HOSTNAME" 2>/dev/null || \
    echo -e "${YELLOW}  DNS route may already exist (this is OK).${NC}"

# ---- Update registry ----
jq --arg name "$SUBDOMAIN" \
   --arg id "$TUNNEL_ID" \
   --arg sub "$SUBDOMAIN" \
   --arg host "$HOSTNAME" \
   --argjson port "$PORT" \
   --arg config "$CONFIG_FILENAME" \
   '.tunnels = ((.tunnels // []) | map(select(.name != $name)) + [{
       name: $name, tunnel_id: $id, subdomain: $sub,
       hostname: $host, port: $port, config_file: $config
   }])' "$REGISTRY_FILE" > "${REGISTRY_FILE}.tmp" && mv "${REGISTRY_FILE}.tmp" "$REGISTRY_FILE"

# ---- Done ----
ACTION=$($IS_UPDATE && echo "updated" || echo "added")
echo ""
echo -e "  ${BOLD}========================================${NC}"
echo -e "  ${GREEN}${BOLD}Tunnel ${ACTION}!${NC}"
echo -e "  ${BOLD}========================================${NC}"
echo -e "  Hostname: ${CYAN}https://$HOSTNAME${NC}"
echo -e "  Local:    http://localhost:$PORT"
echo -e "  Start:    ${BOLD}tunnel-start $SUBDOMAIN${NC}"
echo ""
