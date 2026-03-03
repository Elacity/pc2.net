#!/bin/bash
# setup-vless-server.sh
# Sets up VLESS Reality (via sing-box) on a PC2 supernode.
# Run as root on the supernode.
#
# Usage: bash scripts/setup-vless-server.sh
#
# Creates:
#   /usr/local/bin/sing-box          - sing-box binary
#   /etc/vless-reality/config.json   - server config (VLESS Reality inbound)
#   /etc/vless-reality/credentials.json - keys for client provisioning
#   /etc/vless-reality/peers.json    - registered clients
#   /etc/vless-reality/manage-peers.sh - peer add/remove/list tool
#   /etc/systemd/system/pc2-vless-reality.service - systemd unit
#   /etc/cron.d/vless-reality-watchdog - crash recovery cron

set -euo pipefail

SINGBOX_VERSION="1.11.0"
LISTEN_PORT=8443
SERVER_NAME="www.microsoft.com"

echo "=== PC2 VLESS Reality Server Setup ==="

# 1. Install sing-box
if command -v sing-box &>/dev/null; then
    echo "[OK] sing-box already installed: $(sing-box version 2>&1 | head -1)"
else
    echo "[*] Installing sing-box v${SINGBOX_VERSION}..."
    ARCH=$(dpkg --print-architecture 2>/dev/null || echo "amd64")
    wget -q "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-${ARCH}.tar.gz" -O /tmp/sing-box.tar.gz
    cd /tmp && tar -xzf sing-box.tar.gz
    cp sing-box-${SINGBOX_VERSION}-linux-${ARCH}/sing-box /usr/local/bin/sing-box
    chmod 755 /usr/local/bin/sing-box
    rm -rf /tmp/sing-box*
    echo "[OK] sing-box installed"
fi

# 2. Generate credentials
mkdir -p /etc/vless-reality

if [ -f /etc/vless-reality/credentials.json ]; then
    echo "[OK] Credentials already exist"
else
    echo "[*] Generating Reality credentials..."
    KEYPAIR=$(sing-box generate reality-keypair 2>&1)
    PRIVATE_KEY=$(echo "$KEYPAIR" | grep "PrivateKey" | awk '{print $2}')
    PUBLIC_KEY=$(echo "$KEYPAIR" | grep "PublicKey" | awk '{print $2}')
    SHORT_ID=$(sing-box generate rand 8 --hex 2>&1)

    cat > /etc/vless-reality/credentials.json << EOF
{
  "private_key": "$PRIVATE_KEY",
  "public_key": "$PUBLIC_KEY",
  "short_id": "$SHORT_ID",
  "server_name": "$SERVER_NAME",
  "listen_port": $LISTEN_PORT
}
EOF
    echo "[OK] Credentials generated"
    echo "  Public Key: $PUBLIC_KEY"
    echo "  Short ID: $SHORT_ID"
fi

# 3. Create server config
echo "[*] Creating sing-box server config..."
PRIVATE_KEY=$(jq -r '.private_key' /etc/vless-reality/credentials.json)
SHORT_ID=$(jq -r '.short_id' /etc/vless-reality/credentials.json)

cat > /etc/vless-reality/config.json << EOF
{
  "log": {
    "level": "info",
    "output": "/var/log/sing-box.log",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-in",
      "listen": "::",
      "listen_port": ${LISTEN_PORT},
      "users": [],
      "tls": {
        "enabled": true,
        "server_name": "${SERVER_NAME}",
        "reality": {
          "enabled": true,
          "handshake": {
            "server": "${SERVER_NAME}",
            "server_port": 443
          },
          "private_key": "${PRIVATE_KEY}",
          "short_id": ["${SHORT_ID}"]
        }
      },
      "multiplex": {
        "enabled": true
      }
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ]
}
EOF

# 4. Create peers file
[ -f /etc/vless-reality/peers.json ] || echo '{"peers":{}}' > /etc/vless-reality/peers.json

# 5. Create peer management script
cat > /etc/vless-reality/manage-peers.sh << 'SCRIPT'
#!/bin/bash
CONFIG="/etc/vless-reality/config.json"
PEERS="/etc/vless-reality/peers.json"

case "$1" in
  add)
    USERNAME="$2"
    UUID="${3:-$(sing-box generate uuid)}"
    jq --arg u "$USERNAME" --arg uuid "$UUID" '.peers[$u] = {"uuid": $uuid, "created": (now | todate)}' "$PEERS" > "${PEERS}.tmp" && mv "${PEERS}.tmp" "$PEERS"
    USERS=$(jq '[.peers | to_entries[] | {"uuid": .value.uuid, "name": .key}]' "$PEERS")
    jq --argjson users "$USERS" '.inbounds[0].users = $users' "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
    systemctl reload pc2-vless-reality 2>/dev/null || systemctl restart pc2-vless-reality
    echo "$UUID"
    ;;
  remove)
    USERNAME="$2"
    jq --arg u "$USERNAME" 'del(.peers[$u])' "$PEERS" > "${PEERS}.tmp" && mv "${PEERS}.tmp" "$PEERS"
    USERS=$(jq '[.peers | to_entries[] | {"uuid": .value.uuid, "name": .key}]' "$PEERS")
    jq --argjson users "$USERS" '.inbounds[0].users = $users' "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
    systemctl reload pc2-vless-reality 2>/dev/null || systemctl restart pc2-vless-reality
    echo "removed"
    ;;
  list)
    jq '.peers' "$PEERS"
    ;;
esac
SCRIPT
chmod 755 /etc/vless-reality/manage-peers.sh

# 6. Create systemd service
cat > /etc/systemd/system/pc2-vless-reality.service << EOF
[Unit]
Description=PC2 VLESS Reality Transport
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/sing-box run -c /etc/vless-reality/config.json
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pc2-vless-reality
systemctl restart pc2-vless-reality

# 7. Create watchdog cron
cat > /etc/cron.d/vless-reality-watchdog << EOF
* * * * * root pgrep -x sing-box > /dev/null || systemctl restart pc2-vless-reality
EOF
chmod 644 /etc/cron.d/vless-reality-watchdog

# 8. Open firewall
if command -v ufw &>/dev/null; then
    ufw allow ${LISTEN_PORT}/tcp 2>/dev/null || true
fi

# Verify
echo ""
echo "=== Setup Complete ==="
echo "Service: $(systemctl is-active pc2-vless-reality)"
echo "Port: $(ss -tlnp | grep ${LISTEN_PORT} | head -1)"
echo ""
echo "Credentials for gateway API:"
cat /etc/vless-reality/credentials.json
