# PC2 Network Architecture

## Think of it Like Telecom

**Supernodes are like carriers. Personal nodes are like phones.**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Traditional Telecom          │     PC2 Network               │
│   ─────────────────            │     ───────────               │
│                                │                               │
│   Carriers (AT&T, Verizon)     │     Supernodes (Council)      │
│   Route calls between phones   │     Route traffic to nodes    │
│   Own the infrastructure       │     Run the infrastructure    │
│                                │                               │
│   Your Phone                   │     Your Personal Node        │
│   Has a phone number           │     Has a DID + URL           │
│   Connects via carrier         │     Connects via supernode    │
│                                │                               │
└─────────────────────────────────────────────────────────────────┘
```

**The difference:** Anyone can become a carrier by running a supernode.

---

## It's a DHT Network (Distributed Hash Table)

**No central server. No single database. Fully decentralized.**

```
Traditional (Centralized)          DHT (Decentralized)
─────────────────────────          ───────────────────

     ┌─────────┐                   ┌───┐   ┌───┐   ┌───┐
     │ Central │                   │ A │◄─►│ B │◄─►│ C │
     │ Server  │                   └───┘   └───┘   └───┘
     └────┬────┘                      │       │       │
          │                           ▼       ▼       ▼
    ┌─────┼─────┐                  ┌───┐   ┌───┐   ┌───┐
    │     │     │                  │ D │◄─►│ E │◄─►│ F │
    ▼     ▼     ▼                  └───┘   └───┘   └───┘
  User  User  User                    Everyone connects
                                      to everyone
  If server dies,                  
  network dies.                    No single point of failure.
```

### How DHT Works

Each supernode stores **part** of the directory:

```
Supernode A stores: alice, bob, carol...
Supernode B stores: dave, emma, frank...
Supernode C stores: grace, henry, iris...

Looking for "emma"?
  → Ask any supernode
  → DHT routes to Supernode B
  → Returns emma's location
```

**Like a phone book split across all carriers** - no one carrier has the full list, but any carrier can find any number.

---

## The Network Structure

```
                         SUPERNODES
                  (DHT Network / "Carriers")
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Supernode A │◄───►│ Supernode B │◄───►│ Supernode C │
│ *.ela.city  │ DHT │ *.pc2.net   │ DHT │ *.ela.net   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                    PERSONAL NODES
                   (The "Phones")
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
   ┌───────┐           ┌───────┐           ┌───────┐
   │  VPS  │           │ Home  │           │  RPi  │
   └───────┘           └───────┘           └───────┘
   alice.ela.city      bob.pc2.net       carol.ela.net
```

---

## Active Proxy: Reach Nodes Behind Firewalls

**Problem:** Home networks block incoming connections (NAT/firewall).

```
Without Active Proxy:

Internet ──X──► [Firewall] ──► Home PC
                   │
            "Connection blocked!"
            
User can't reach your home node.
```

**Solution:** Active Proxy creates a tunnel through the supernode.

```
With Active Proxy:

                    ┌─────────────┐
                    │  Supernode  │
                    │   (Relay)   │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              │              ▼
         Internet          │         Home PC
         User              │         (behind firewall)
            │              │              │
            │         Encrypted           │
            │          Tunnel             │
            └──────────────┴──────────────┘

1. Home PC connects OUT to supernode (allowed by firewall)
2. Supernode holds the tunnel open
3. Internet user connects to supernode
4. Supernode relays traffic through tunnel to Home PC
```

### How It Works Step by Step

```
1. Your Raspberry Pi starts up (behind your home router)
         │
         ▼
2. Pi connects to supernode (outbound = allowed through firewall)
         │
         ▼
3. Supernode assigns tunnel: "proxy://supernode:8090/session123"
         │
         ▼
4. Pi registers: "carol" → proxy://supernode:8090/session123
         │
         ▼
5. User visits carol.ela.city
         │
         ▼
6. Gateway sees "carol" uses proxy, relays through tunnel
         │
         ▼
7. Request reaches your Pi, response goes back through tunnel
```

### Why Active Proxy Matters

| Without Active Proxy | With Active Proxy |
|---------------------|-------------------|
| Need public IP | Works behind any firewall |
| Need to configure router | Zero configuration |
| VPS required ($5-20/mo) | Raspberry Pi at home (free) |
| ISP can block ports | Unstoppable (uses standard HTTPS) |

**Active Proxy = True sovereignty from home hardware.**

---

## What Supernodes Provide (Carrier Services)

| Service | Telecom Equivalent | What It Does |
|---------|-------------------|--------------|
| **Boson DHT** | Phone directory | Decentralized lookup - finds where nodes are |
| **Active Proxy** | Cell tower relay | Tunnels traffic to nodes behind firewalls |
| **Web Gateway** | Call routing | Routes `alice.ela.city` to Alice's node |

---

## Two Ways to Connect

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   DIRECT CONNECTION              ACTIVE PROXY CONNECTION        │
│   (VPS with public IP)           (Home/RPi behind firewall)     │
│                                                                 │
│   User                           User                           │
│     │                              │                            │
│     ▼                              ▼                            │
│   Gateway                        Gateway                        │
│     │                              │                            │
│     ▼                              ▼                            │
│   Your VPS ◄── direct ──      Supernode                         │
│                                    │                            │
│                                    ▼ (tunnel)                   │
│                                 Your RPi ◄── behind firewall    │
│                                                                 │
│   Fastest                        Works anywhere                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Access Flow

```
1. User visits alice.ela.city
         │
         ▼
2. DNS routes to Supernode (any supernode works)
         │
         ▼
3. Supernode queries DHT: "Where is alice?"
         │
         ▼
4. DHT returns: "alice is at proxy://supernode:8090/xyz"
         │
         ▼
5. Gateway relays through Active Proxy tunnel
         │
         ▼
6. Alice's content is served (from her home Raspberry Pi!)
```

---

## Why More Supernodes = Better Network

Just like telecom:
- **One carrier** → single point of failure
- **Multiple carriers** → redundancy, competition, coverage

```
Today (2 supernodes):
    Supernode A ←──► Supernode B
         │               │
       DHT             DHT
       sync            sync

Tomorrow (Council runs supernodes):
    Supernode A ←──► Supernode B ←──► Supernode C ←──► Supernode D
         │               │               │               │
       Users           Users           Users           Users
       
    DHT spreads across all. Any node can find any user.
```

---

## Why Council Should Run Supernodes

| Reason | Benefit |
|--------|---------|
| **Network resilience** | More carriers = no single point of failure |
| **Geographic coverage** | Regional supernodes = faster local access |
| **Domain ownership** | Run `*.ela.net` or your own domain |
| **Decentralization** | No one entity controls the network |
| **DHT capacity** | More supernodes = more DHT storage |
| **Active Proxy capacity** | More relays = more home users supported |
| **Low cost** | ~$10/month for a VPS |

---

## What Users Get

- **Identity**: `did:boson:NodeId` (stored in DHT, owned by you)
- **Recovery phrase**: 24 words (backup your identity)
- **URL**: `username.ela.city` (registered in DHT)
- **Home hosting**: Run from Raspberry Pi behind firewall (via Active Proxy)
- **Full ownership**: Your data stays on your node

---

## The Key Difference from Telecom

| Traditional | PC2 |
|-------------|-----|
| Carriers own infrastructure | Council/community runs supernodes |
| Centralized database | DHT (decentralized, no single owner) |
| You rent a phone number | You own your DID forever (in DHT) |
| Data stored on carrier servers | Data stored on YOUR node |
| Carrier can cut you off | No one can revoke your identity |
| Need carrier's permission | Run from home via Active Proxy |

---

## Business Models for Carriers (Supernodes)

**The base network is free. Premium services generate revenue.**

| Service | What It Is | Revenue Model |
|---------|-----------|---------------|
| **Custom Domains** | `alice.mycompany.com` instead of `alice.ela.city` | Monthly fee |
| **Guaranteed Uptime** | SLA for businesses | Enterprise subscription |
| **Priority Bandwidth** | Faster Active Proxy for video/streaming | Bandwidth tiers |
| **IPFS Pinning** | Supernode stores user files redundantly | Storage fees |
| **AI Compute** | Run AI models on supernode infrastructure | Compute credits |
| **White-label Gateway** | Company runs gateway under their brand | Setup + monthly fee |

### How Payments Could Work

```
User pays with ELA → Supernode operator receives ELA → Network grows
```

- Creates **utility for ELA token**
- Operators earn for providing infrastructure
- Users only pay for premium features they want

### The Free Tier Always Exists

| Free | Paid |
|------|------|
| `username.ela.city` | `username.yourdomain.com` |
| Shared Active Proxy | Dedicated bandwidth |
| Best-effort uptime | SLA guarantees |
| Community support | Priority support |

**Anyone can run a free supernode.** Premium is optional.

---

## Summary

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   DHT Network     = No central authority                       │
│   Active Proxy    = Run from home (behind firewall)            │
│   Web Gateway     = Friendly URLs (alice.ela.city)             │
│   Supernodes      = Council runs the infrastructure            │
│   Personal Nodes  = Users own their data                       │
│                                                                │
│   Result: Decentralized cloud that anyone can join.            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

*Supernodes are the carriers. DHT is the directory. Active Proxy is the tunnel. You are the owner.*

*Presented by Elacity Labs*
