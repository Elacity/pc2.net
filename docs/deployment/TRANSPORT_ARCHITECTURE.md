# PC2 Transport Architecture

## How PC2 Nodes Connect to the Network

PC2 uses a **4-tier transport cascade** that automatically finds the best way to connect, even in heavily censored networks.

```
┌─────────────────────────────────────────────────────────────┐
│                    PC2 TRANSPORT CASCADE                    │
│                                                             │
│   Tier 1: WireGuard ──────────────── Fast, no obfuscation  │
│       │ blocked?                                            │
│       ▼                                                     │
│   Tier 2: AmneziaWG ──────────────── UDP stealth            │
│       │ all UDP blocked?                                    │
│       ▼                                                     │
│   Tier 3: VLESS Reality + AWG ────── TCP stealth            │
│       │ TCP also blocked?                                   │
│       ▼                                                     │
│   Tier 4: ActiveProxy ────────────── Boson relay fallback   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The cascade is automatic. If WireGuard gets blocked by DPI, the node detects it and switches to AmneziaWG. If all UDP is blocked (common in China/Iran during crackdowns), it chains through VLESS Reality over TCP. Users can also force a specific transport from the UI.

---

## Tier 1: WireGuard (Standard)

The default. Fast, lightweight, kernel-level VPN tunnel.

```
 Your PC2 Node                          Supernode
┌───────────┐       UDP:51820        ┌───────────┐
│           │ ◄═══════════════════► │           │
│  wg0      │    WireGuard tunnel    │  wg0      │
│  10.100.x │                        │  10.100.0.1│
└───────────┘                        └───────────┘
```

**Pros:** Fastest, lowest overhead, battle-tested  
**Cons:** Easily fingerprinted by DPI -- the WireGuard handshake has a known signature  
**Blocked by:** China, Russia, Iran, UAE (intermittently)

---

## Tier 2: AmneziaWG (UDP Stealth)

A WireGuard fork that disguises VPN traffic using multiple obfuscation techniques.

```
 Your PC2 Node                          Supernode
┌───────────┐       UDP:51821        ┌───────────┐
│           │ ◄═══════════════════► │           │
│  awg0     │   AmneziaWG tunnel     │  awg0     │
│  10.101.x │   (obfuscated UDP)     │  10.101.0.1│
└───────────┘                        └───────────┘
```

### What AmneziaWG Does to Evade DPI

```
Normal WireGuard packet (easily detected):
┌──────────────────────────────────────────┐
│ Known WG Header │ Encrypted Payload      │
│ (fingerprint)   │                        │
└──────────────────────────────────────────┘
      ▲ DPI says: "That's WireGuard. Block it."

AmneziaWG 2.0 packet (looks like QUIC):
┌──────────────────────────────────────────────────────┐
│ Junk  │ Random  │ QUIC-like    │ Padded Encrypted   │
│ Bytes │ Header  │ Signature(I1)│ Payload             │
└──────────────────────────────────────────────────────┘
      ▲ DPI says: "Looks like a QUIC/HTTP3 connection. Allow."
```

**Key techniques:**
- **Randomized headers** -- no recognizable WireGuard fingerprint
- **Junk traffic injection** -- pads packets to confuse traffic analysis
- **I1 QUIC signature mimicry** -- initial packets look like a real QUIC handshake
- **Variable packet sizes** -- defeats pattern-based detection

**Pros:** Still UDP (fast), defeats most DPI  
**Cons:** If an ISP blocks ALL unknown UDP, this won't help

---

## Tier 3: VLESS Reality + AmneziaWG Chained (TCP Stealth)

This is the advanced layer. When all UDP is blocked, we wrap AmneziaWG inside a VLESS Reality tunnel that runs over TCP.

### What is VLESS Reality?

VLESS Reality makes your VPN traffic look like you're browsing a legitimate website (e.g., microsoft.com). It uses:

- **Real TLS 1.3 handshakes** -- borrows the certificate of a legitimate site
- **SNI masking** -- the Server Name Indication says `www.microsoft.com`
- **X25519 key exchange** -- standard HTTPS key exchange, nothing unusual
- **No custom fingerprints** -- JA3/JA4 TLS fingerprints match real browsers

### The Chaining Architecture

This is what makes it powerful. AWG runs *inside* the VLESS tunnel:

```
 Your PC2 Node                                              Supernode
┌──────────────────────┐                              ┌──────────────────────┐
│                      │                              │                      │
│  App ──► awg0        │                              │  awg0 ──► PC2 Node   │
│          │           │                              │   ▲                  │
│     UDP:51822        │       TCP:8443               │   │ UDP:51821        │
│          │           │   (looks like HTTPS to       │   │                  │
│    ┌─────▼─────┐     │    www.microsoft.com)        │ ┌─┴──────────┐      │
│    │ sing-box  │◄════╪══════════════════════════════╪►│  sing-box  │      │
│    │ (client)  │     │   VLESS Reality TLS tunnel   │ │  (server)  │      │
│    └───────────┘     │                              │ └────────────┘      │
│                      │                              │                      │
└──────────────────────┘                              └──────────────────────┘
```

### What DPI Sees vs What's Actually Happening

```
┌─────────────────────────────────────────────────────────────────┐
│                     WHAT DPI SEES                               │
│                                                                 │
│  Your IP ──── TLS 1.3 ──── www.microsoft.com                   │
│               (port 8443)                                       │
│                                                                 │
│  Verdict: "User is browsing Microsoft. Normal HTTPS. Allow."   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                  WHAT'S ACTUALLY HAPPENING                      │
│                                                                 │
│  Your IP ──► sing-box ──► VLESS Reality ──► Supernode           │
│                           (TCP:8443)          │                 │
│                                               ▼                 │
│                                          sing-box unwraps       │
│                                               │                 │
│                                               ▼                 │
│                                        AWG tunnel (UDP)         │
│                                               │                 │
│                                               ▼                 │
│                                     Your PC2 Node (10.101.x)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Double Obfuscation

The chaining provides two layers:

```
Layer 1 (outer): VLESS Reality
  └─ TCP traffic that looks like HTTPS to microsoft.com
  └─ Defeats: TLS fingerprinting, SNI-based blocking, protocol detection

  Layer 2 (inner): AmneziaWG
    └─ Obfuscated WireGuard with QUIC signature mimicry
    └─ Defeats: Deep packet inspection of tunnel contents
    └─ Even if the VLESS layer were somehow stripped, the inner
       traffic is still obfuscated
```

---

## Tier 4: ActiveProxy (Boson Relay)

Last resort. Routes through Boson network relay nodes over TCP.

```
 Your PC2 Node            Supernode (relay)           Visitor
┌───────────┐  TCP:8090  ┌───────────┐              ┌────────┐
│           │◄══════════►│  Active   │◄────────────►│        │
│  PC2      │  Boson     │  Proxy    │   HTTP       │ Browser│
│  Node     │  Protocol  │  Server   │              │        │
└───────────┘            └───────────┘              └────────┘
```

**Pros:** Works everywhere, no special software needed on server  
**Cons:** Higher latency, single-hop relay, no tunnel encryption beyond TLS

---

## UI Controls

Users can control the transport from the PC2 cloud dropdown or Settings:

```
┌──────────────────────────────────────┐
│  Personal Cloud Compute             │
│  ● Connected                        │
│                                     │
│  Access: VLESS Reality              │  ◄── Dynamic transport label
│                                     │
│  Stealth Mode          [ON]         │  ◄── Enable stealth transports
│    └ VLESS Reality     [ON]         │  ◄── Sub-toggle (TCP stealth)
│                                     │
└──────────────────────────────────────┘

Transport labels update dynamically:
  Stealth OFF  → "WireGuard" (green)
  Stealth ON   → "AmneziaWG" (purple)
  VLESS ON     → "VLESS Reality" (blue)
  Fallback     → "Active Proxy" (amber)

During switches: "Switching..." → "Reconnecting..."
```

The Stealth Mode and VLESS Reality toggle states persist across dropdown open/close and are synced between the cloud dropdown and the Settings panel.

---

## Auto-Detection Flow

```
Node starts
    │
    ▼
Try WireGuard (Tier 1)
    │
    ├── Connected? ──► Done (fastest path)
    │
    ▼
DPI blocking detected (handshake timeout / reset)
    │
    ▼
Try AmneziaWG (Tier 2)
    │
    ├── Connected? ──► Done (UDP stealth)
    │
    ▼
All UDP blocked (AWG also fails)
    │
    ▼
Try VLESS Reality + AWG chain (Tier 3)
    │
    ├── Connected? ──► Done (TCP stealth, looks like HTTPS)
    │
    ▼
Try ActiveProxy (Tier 4)
    │
    └── Connected ──► Done (relay fallback, always works)
```

---

## Supernode Infrastructure

Each supernode runs all transport services:

```
Supernode (69.164.241.210)
├── WireGuard         UDP:51820   wg0    (10.100.0.0/16)
├── AmneziaWG         UDP:51821   awg0   (10.101.0.0/16)
├── sing-box (VLESS)  TCP:8443    VLESS Reality server (v1.13.0+)
├── Active Proxy      TCP:8090    Boson relay
└── Web Gateway       TCP:443     Routes *.ela.city → nodes
```

All services have:
- **systemd** units for process management
- **Cron watchdogs** for crash recovery (checks every 60s)
- **Health checks** to detect and flush stale connections

### Version Requirements

| Component | Minimum Version | Why |
|-----------|----------------|-----|
| sing-box | **1.13.0** | Fixes XUDP/multiplex bugs that silently drop packets |
| amneziawg-go | Built from HEAD | Tagged releases lack AWG 2.0 (S3/S4/I1) support |
| Go compiler | **1.24+** | Required by amneziawg-go dependencies |

### Key Configuration Notes

- **Sniffing must be disabled** on sing-box direct inbound: AWG 2.0's I1 QUIC signature triggers sing-box's protocol sniffer, which overrides the packet destination and breaks the tunnel
- **XUDP encoding** is used for UDP-over-TCP encapsulation with `h2mux` multiplexing and padding
- **Client and server sing-box versions must match** — a 1.11.x client connecting to a 1.13.0 server (or vice versa) will fail with multiplex stream errors

---

## Quick Comparison

| Transport | Protocol | Stealth Level | Speed | Works When |
|-----------|----------|--------------|-------|------------|
| WireGuard | UDP | None | Fastest | No DPI / permissive networks |
| AmneziaWG | UDP | High | Fast | DPI blocks WireGuard signature |
| VLESS Reality + AWG | TCP | Maximum | Moderate | All UDP blocked, strict DPI |
| ActiveProxy | TCP | Low | Slowest | Everything else fails |

---

## Status

- **Live and tested** on test40.ela.city — macOS and Jetson ARM64 (March 2, 2026)
- **Confirmed**: DPI sees TLS 1.3 to www.microsoft.com on port 8443
- **Confirmed**: AWG tunnel active through VLESS with 1-second handshakes
- **Confirmed**: HTTP traffic (`curl http://10.101.x.x:4200/`) works through VLESS Reality tunnel
- **Auto-cascade** and **manual selection** both working from UI
- **sing-box 1.13.0** required on all platforms — 1.11.x has critical XUDP/multiplex bugs
- **Install scripts** (`start-local.sh`, `install-arm.sh`) auto-install and auto-upgrade sing-box

### Known Limitations

- **ICMP ping** may not work through VLESS Reality tunnels (use HTTP/`curl` to test connectivity)
- **Jetson Go compiler**: System Go on JetPack is typically older than 1.24; the install script auto-installs Go 1.24.1 to `/usr/local/go`
- **sudo install**: Running `install-arm.sh` with `sudo` now correctly detects the real user's home directory to avoid creating duplicate installations under `/root`

---

*Built for PC2 by Elacity Labs. VLESS Reality integration inspired by community suggestion from EverlastingOS.*
