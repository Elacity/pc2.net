# Stealth Mode: Multi-Layer DPI-Resistant Transport

> For users behind Deep Packet Inspection (DPI) firewalls — China GFW, Russian ISP blocks, Iranian censorship, corporate networks.

## What is Stealth Mode?

Stealth Mode activates PC2's DPI-resistant transport layers. Two complementary technologies work together:

### AmneziaWG 2.0 (UDP Stealth)

A WireGuard fork that adds transport-layer obfuscation to make UDP VPN tunnels undetectable by DPI:

- **Randomizes headers** (H1-H4) to eliminate the WireGuard fingerprint
- **Pads packets** (S1-S4) and injects junk traffic (Jc, Jmin, Jmax)
- **Mimics real protocol signatures** (I1) — tunnel initiation packets look like a QUIC handshake (the protocol Chrome uses for Google/YouTube), so DPI systems classify the connection as normal web traffic rather than an unknown VPN

### VLESS Reality (TCP Stealth)

When all UDP is blocked (some ISPs and firewalls block unknown UDP entirely), PC2 wraps AmneziaWG traffic inside a VLESS Reality tunnel:

- **TLS 1.3 mimicry** — "borrows" the TLS certificate of a real website (www.microsoft.com) so DPI sees a perfectly valid HTTPS handshake
- **Chrome fingerprint** — uses uTLS to match Chrome's JA3/JA4 TLS fingerprint, making the connection indistinguishable from regular browsing
- **XUDP encapsulation** — carries AWG's UDP packets inside the TCP/TLS tunnel transparently
- **Chaining architecture** — AWG handles the bidirectional VPN tunnel, VLESS handles the stealth TCP transport. Double obfuscation: AWG randomizes + VLESS mimics HTTPS

The cryptographic core remains identical to WireGuard (ChaCha20-Poly1305, Curve25519) — only the transport layer is modified.

## Four-Tier Transport Cascade

PC2 uses a cascading transport system that automatically finds the best available connection:

```
1. WireGuard (primary)           — fastest, audited, works on most networks
2. AmneziaWG (UDP stealth)       — DPI-resistant, nearly as fast, for censored networks
3. VLESS Reality + AWG (TCP)     — maximum stealth, for networks blocking all UDP
4. ActiveProxy (relay)           — TCP relay via Boson supernode, last resort
```

The system automatically falls down the cascade when a transport fails and periodically retries higher-tier transports in the background.

### Automatic DPI Detection

When standard WireGuard connects but immediately fails its health check (interface is up but packets are dropped), PC2 flags this as a likely DPI block and automatically switches to AmneziaWG. If AmneziaWG also fails (all UDP blocked), it tries VLESS Reality wrapping before falling to ActiveProxy. The DPI flag resets when the network changes (e.g., switching WiFi networks).

### How VLESS Reality Chaining Works

```
Client AWG ──UDP──> sing-box client ──TCP/TLS──> sing-box server ──UDP──> AWG server
                    (localhost:51822)    (port 8443)                  (port 51821)
                    
DPI sees: TLS 1.3 connection to www.microsoft.com (legitimate HTTPS)
Reality:  AmneziaWG packets encapsulated in VLESS tunnel via XUDP
```

The supernode runs sing-box as a VLESS Reality server on port 8443. The client's sing-box creates a local UDP tunnel (127.0.0.1:51822) that forwards AWG packets through the VLESS tunnel. AWG connects to this local port instead of directly to the supernode. The gateway sees a normal AWG peer — no routing changes needed.

## Configuration

### Force Stealth Mode

If you know your network blocks WireGuard, you can skip it entirely:

**Via Settings UI:** Settings → Personal Cloud → Stealth Mode toggle

**Via Cloud Dropdown:** Click the cloud icon in the toolbar → Stealth Mode toggle

**Via config file** (`pc2-node/config/default.json`):
```json
{
  "boson": {
    "stealth_mode": true
  }
}
```

When toggled, the node immediately disconnects the current tunnel and reconnects via the selected transport.

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

### Disable VLESS Reality Fallback

```json
{
  "boson": {
    "vless_reality": {
      "enabled": false
    }
  }
}
```

## Installation

AmneziaWG and sing-box (for VLESS Reality) are automatically installed by the PC2 install scripts:

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

The supernode runs a separate AmneziaWG interface (`awg0`) on port `51821` with subnet `10.101.0.0/16` (standard WireGuard uses `wg0` on port `51820` with `10.100.0.0/16`).

The supernode infrastructure includes:

**AmneziaWG:**
- **Systemd service** (`pc2-amneziawg.service`) — manages the `awg0` interface, auto-starts on boot
- **Crash watchdog** (`/etc/cron.d/amneziawg-watchdog`) — checks every minute if `amneziawg-go` is alive; restarts via systemd if crashed (necessary because AmneziaWG is a userspace Go binary, unlike WireGuard which runs as a kernel module)
- **Gateway healthcheck** — probes both WireGuard (`10.100.*`) and AmneziaWG (`10.101.*`) peers every 60s, flushing stale sockets for unreachable peers
- **Provisioning API** (`/api/awg/register`) — handles client registration, IP allocation, and distributes obfuscation + I1 parameters

**VLESS Reality (sing-box):**
- **sing-box server** on port `8443` — VLESS Reality inbound with TLS 1.3 mimicry (www.microsoft.com), direct outbound to forward decapsulated AWG UDP packets to port `51821`
- **Systemd service** (`pc2-vless-reality.service`) — manages sing-box, auto-restarts on crash (RestartSec=5)
- **Crash watchdog** (`/etc/cron.d/vless-reality-watchdog`) — checks every minute if `sing-box` is alive
- **Peer management** (`/etc/vless-reality/manage-peers.sh`) — add/remove VLESS users, auto-reloads sing-box config
- **Provisioning API** (`/api/vless/register`) — assigns UUID, returns Reality public key + short ID for client config

### Client Side (AmneziaWG direct)

1. PC2 node checks if `amneziawg-go` and `awg-quick` are installed
2. Generates a keypair (same Curve25519 format as WireGuard)
3. Registers with the supernode's `/api/awg/register` endpoint
4. Receives: assigned IP, server public key, endpoint, obfuscation params (including I1 QUIC signature)
5. Writes an AmneziaWG config file with all obfuscation parameters
6. Cleans up any stale processes/state from previous connections
7. Brings up `awg0` interface using `awg-quick`
8. Registers `http://<awg-ip>:4200` with the gateway

### Client Side (VLESS Reality chained — when UDP is blocked)

1. PC2 node detects that direct AWG connection failed (UDP blocked)
2. Calls `/api/vless/register` to get UUID + Reality credentials
3. Generates sing-box client config: local UDP tunnel (127.0.0.1:51822) → VLESS Reality → supernode:51821
4. Starts sing-box as a background process
5. Connects AWG through the local tunnel (endpoint override: 127.0.0.1:51822)
6. AWG packets travel inside the VLESS TLS tunnel transparently
7. Gateway sees a normal AWG peer — no changes needed

### Obfuscation Parameters (AWG 2.0)

| Parameter | Purpose |
|-----------|---------|
| Jc | Junk packet count per handshake |
| Jmin/Jmax | Min/max junk packet size range |
| S1/S2 | Init packet padding sizes |
| S3/S4 | Response/data packet padding sizes (AWG 2.0) |
| H1-H4 | Header randomization seeds (randomized range, AWG 2.0) |
| I1 | Protocol signature mimicry — QUIC handshake (AWG 2.0) |

These parameters must match between server and client. They are generated once per supernode interface and distributed via the provisioning API.

## Architecture: Shared vs Isolated State

PC2's network has two distinct layers with deliberately different sharing models:

### Shared Layer: Boson DHT (Decentralized Identity & Routing)

The **Boson DID DHT** is the shared coordination layer across the entire network:

- **DID registration** — when a user registers `test39.ela.city`, their Decentralized Identifier is published to the distributed hash table, resolvable by any node on the network
- **Username-to-endpoint resolution** — any supernode or PC2 node can resolve where a user lives, regardless of which supernode they're registered on
- **Peer discovery** — the DHT enables cross-supernode routing; a user on `supernode-A.ela.city` can be discovered by `supernode-B.foo.city`
- **No single point of failure** — identity and routing are not owned by any one server

This shared state IS the decentralization and security model. No single supernode controls identity or routing for the network.

### Isolated Layer: Transport (WireGuard / AmneziaWG)

The transport tunnels are **intentionally per-supernode**:

- Each supernode manages its own AWG/WG interface, keys, peer IP allocation, and obfuscation params
- If a supernode is compromised, its AWG keys don't expose peers on other supernodes
- Obfuscation params (including I1 QUIC signatures) can vary per supernode for fingerprint diversity

This separation means the identity layer is global and decentralized, while the transport layer is compartmentalized for security.

## Scalability

### Current Capacity

- **Subnet:** `10.101.0.0/16` supports **65,534 peers** per supernode — well beyond current needs
- **Per-supernode:** Each supernode independently manages its own AWG interface, peers, and obfuscation params
- **Resource impact:** `amneziawg-go` uses minimal memory (~7MB) and CPU; the Go userspace implementation handles hundreds of concurrent peers

### Multi-Supernode / Multi-Domain

The architecture is designed for horizontal scaling:

- Adding a new domain (e.g., `*.foo.city`) means deploying a new supernode with its own AWG interface and gateway
- Clients provision against whichever supernode hosts their domain
- The Boson DHT ties all supernodes together — a node on one supernode is discoverable from any other
- Per-region obfuscation profiles (different I1 signatures for different censorship regimes) can be configured per supernode

### PC2 Nodes as Network Participants

Every PC2 node already participates in the Boson DHT as a peer, contributing to routing and peer discovery. This creates an opportunity for **lightweight relay nodes** that strengthen the network:

- **Relay capacity** — PC2 nodes with stable connections and public IPs could act as lightweight relay points for other peers, reducing load on supernodes and adding redundancy
- **DHT density** — more nodes on the DHT means faster peer discovery, more routing paths, and greater resilience against targeted takedowns
- **Regional presence** — nodes in censored regions naturally become stepping stones for nearby peers, creating organic mesh density where it's needed most
- **Stealth relay chaining** — a PC2 node behind AmneziaWG could relay traffic for other nodes in the same region, meaning only one node needs the direct supernode tunnel while others chain through it locally
- **Incentive alignment** — nodes that contribute relay capacity could earn network credits or priority routing, aligning individual node operation with collective network health

### Future Scaling Considerations

- If a single supernode exceeds peer capacity, load balancing across multiple AWG interfaces on separate ports is straightforward
- The provisioning API could be extended to support supernode discovery/selection based on latency, capacity, or region
- PC2 nodes could publish their relay capability to the DHT, enabling automatic relay selection without supernode involvement

## Security Considerations

- The **cryptographic core is audited WireGuard** — AmneziaWG only modifies the transport layer
- Obfuscation parameters are **not secret** (they prevent fingerprinting, not provide confidentiality)
- The I1 QUIC signature is a **public protocol pattern** — its value is in making DPI systems misclassify traffic, not in secrecy
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
rm -f <data-dir>/amneziawg/provision.json
pm2 restart pc2
```

### Port 51821 blocked

Some networks may block UDP entirely. In this case, AmneziaWG will fail and PC2 will fall back to ActiveProxy (TCP relay).

### Stale processes after crash

If `amneziawg-go` crashed and left orphaned processes, the service handles cleanup automatically on next connect. Manual cleanup:
```bash
sudo killall amneziawg-go
sudo rm -rf /var/run/amneziawg/
```

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
