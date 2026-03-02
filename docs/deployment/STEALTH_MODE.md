# Stealth Mode: AmneziaWG DPI-Resistant Transport

> For users behind Deep Packet Inspection (DPI) firewalls — China GFW, Russian ISP blocks, Iranian censorship, corporate networks.

## What is Stealth Mode?

Stealth Mode uses **AmneziaWG**, a fork of WireGuard that adds transport-layer obfuscation to make VPN tunnels undetectable by DPI systems. While standard WireGuard uses a recognizable handshake pattern that can be fingerprinted and blocked, AmneziaWG randomizes headers, adds junk packets, and pads traffic to look like ordinary UDP.

The cryptographic core remains identical to WireGuard (ChaCha20-Poly1305, Curve25519) — only the transport layer is modified.

## Three-Tier Transport Cascade

PC2 uses a cascading transport system that automatically finds the best available connection:

```
1. WireGuard (primary)     — fastest, audited, works on most networks
2. AmneziaWG (stealth)     — DPI-resistant, nearly as fast, for censored networks
3. ActiveProxy (relay)     — TCP relay via Boson supernode, works everywhere
```

The system automatically falls down the cascade when a transport fails and periodically retries higher-tier transports in the background.

### Automatic DPI Detection

When standard WireGuard connects but immediately fails its health check (interface is up but packets are dropped), PC2 flags this as a likely DPI block and automatically switches to AmneziaWG. This flag resets when the network changes (e.g., switching WiFi networks).

## Configuration

### Force Stealth Mode

If you know your network blocks WireGuard, you can skip it entirely:

**Via Settings UI:** Settings → Personal Cloud → Stealth Mode toggle

**Via config file** (`pc2-node/config/default.json`):
```json
{
  "boson": {
    "stealth_mode": true
  }
}
```

### Disable AmneziaWG Fallback

If you don't want AmneziaWG available even as a fallback:

```json
{
  "boson": {
    "amnezia_wg": {
      "enabled": false
    }
  }
}
```

## Installation

AmneziaWG is automatically installed by the PC2 install scripts:

- **macOS/Linux desktop:** `start-local.sh` builds `amneziawg-go` from source using Go
- **ARM/Jetson devices:** `install-arm.sh` does the same

### Requirements

- **Go compiler** (automatically installed if not present)
- **Git** (for cloning `amnezia-wg-tools` source)

### Manual Installation

If automatic installation fails:

```bash
# Install Go (if not present)
brew install go          # macOS
sudo apt install golang  # Ubuntu/Debian

# Build amneziawg-go
sudo GOBIN=/usr/local/bin go install github.com/amnezia-vpn/amneziawg-go@latest

# Build amnezia-wg-tools (awg, awg-quick)
git clone --depth 1 https://github.com/amnezia-vpn/amnezia-wg-tools.git /tmp/awg-tools
cd /tmp/awg-tools/src && make && sudo make install

# Configure passwordless sudo for awg-quick
echo "$(whoami) ALL=(ALL) NOPASSWD: $(which awg-quick)" | sudo tee /etc/sudoers.d/amneziawg
sudo chmod 440 /etc/sudoers.d/amneziawg
```

## How It Works

### Supernode Side

The supernode runs a separate AmneziaWG interface (`awg0`) on port `51821` with subnet `10.101.0.0/16` (standard WireGuard uses `wg0` on port `51820` with `10.100.0.0/16`). Obfuscation parameters (H1-H4, S1-S4, Jc, Jmin, Jmax) are generated per-interface and distributed to all clients.

### Client Side

1. PC2 node checks if `amneziawg-go` and `awg-quick` are installed
2. Generates a keypair (same Curve25519 format as WireGuard)
3. Registers with the supernode's `/api/awg/register` endpoint
4. Receives: assigned IP, server public key, endpoint, obfuscation params
5. Writes an AmneziaWG config file with obfuscation parameters
6. Brings up `awg0` interface using `awg-quick`
7. Registers `http://<awg-ip>:4200` with the gateway

### Obfuscation Parameters

| Parameter | Purpose |
|-----------|---------|
| Jc | Junk packet count per handshake |
| Jmin/Jmax | Min/max junk packet size range |
| S1/S2 | Init packet padding sizes |
| S3/S4 | Response/data packet padding sizes |
| H1-H4 | Header randomization seeds |

These parameters must match between server and client. They are generated once per supernode interface and distributed via the provisioning API.

## Security Considerations

- The **cryptographic core is audited WireGuard** — AmneziaWG only modifies the transport layer
- Obfuscation parameters are **not secret** (they prevent fingerprinting, not provide confidentiality)
- AmneziaWG is **not audited at the transport layer** — it's positioned as opt-in for censored networks
- The MTU is set to 1280 (IPv6 minimum) to avoid fragmentation from packet padding

## Verifying Stealth Mode

### Check Current Transport

In the PC2 cloud dropdown (top bar), the "Access" line shows:
- **WireGuard** (green) — standard tunnel
- **AmneziaWG (Stealth)** (purple) — obfuscated tunnel  
- **Active Proxy** (amber) — TCP relay

### Check AmneziaWG Status

```bash
# Check if AmneziaWG binary is installed
which amneziawg-go

# Check if awg interface is up
sudo awg show awg0

# Check tunnel connectivity
ping 10.101.0.1
```

## Troubleshooting

### AmneziaWG not available

Check installation:
```bash
ls -la /usr/local/bin/amneziawg-go
which awg-quick
```

If missing, re-run the install script or follow manual installation above.

### Tunnel up but no connectivity

The obfuscation parameters may be out of sync. Remove cached provision and retry:
```bash
rm -f ~/.pc2/amneziawg/provision.json
pm2 restart pc2
```

### Port 51821 blocked

Some networks may block UDP entirely. In this case, AmneziaWG will fail and PC2 will fall back to ActiveProxy (TCP relay).

## Elastos Launcher Integration (v1.1)

When distributing via the Elastos Launcher (Electron desktop app), the install step that configures passwordless sudo for `wg-quick` and `awg-quick` must trigger a **native OS authorization dialog** instead of a terminal `sudo` prompt:

- **macOS**: Use `osascript -e 'do shell script "..." with administrator privileges'` to show the system password/Touch ID dialog. Touch ID works on modern Macs so users don't need to type a password.
- **Windows**: The standard UAC prompt ("Do you want to allow this app to make changes?") handles elevation.
- **Linux**: `pkexec` or equivalent for graphical sudo.

**Key points:**
- No code changes needed to WireGuard/AmneziaWG services -- only the Launcher's install wrapper
- The authorization is a **one-time prompt** during installation, not every app launch
- After the sudoers entry is created, `wg-quick`/`awg-quick` run without any password prompt at runtime
- This is the same pattern used by Docker Desktop, Tailscale, the official WireGuard macOS app, and other VPN clients

## Future: Service Capsule Architecture

In PC2 v2, AmneziaWG will become a modular service capsule (`amnezia://`) that can be:
- Composed with other providers (e.g., routing peer-provider traffic through the stealth tunnel)
- Opted in/out per user
- Updated independently of the core system

This aligns with the runtime v2 architecture where network transports are pluggable capabilities.
