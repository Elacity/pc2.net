# Elastos ELA · Mainnet recovery — honest log

**Audience:** exchange operators, council members, node operators.  
**Source posture:** what could have gone wrong, what each class of fix does, and how well it is proven today.  
**Updated:** 1 Aug 2026 — published scan band through **2,261,533**; chain tip ~**2,262,448** (public RPC); BPoS return 31 Jul at **2,261,186**.  
**Companion weekly:** [Community Update Jul 24–31 (#31)](https://github.com/Elacity/pc2.net/discussions/31).

> Living document. Status moves to **proven live** as each check passes. This is an honest log, not a victory lap: pending items stay pending until exercised.

---

## Status card

| Milestone | Value | When |
|---|---|---|
| Froze | **2,260,595** | 20 Jul, after the exploit |
| Rewound to | **2,260,450** | last safe block |
| Restarted | **2,260,451** | 29 Jul, proof of work |
| BPoS live | **2,261,186** | 31 Jul, consensus back |
| Gate one (live on every block) | **2,260,451** | Strict money / recovery rules |
| Gate two (not reached yet) | **2,265,000** | Revised DPoS reward / ELA-only mint engine |

**Live binary:** tag **v1.0.2** (v1.0.0 plus the PoW↔BPoS undo-mode restore fix). Operator toolkit: **Elastos.Node v1.2.2** (`ela preflight`, `ela consensus`, `ela rewound`, `binary`).

---

## Live scan complete (read-only)

Every block of the restarted chain has been read. A read-only pass over blocks **2,260,451 → 2,261,533** checked that no asset was paid out beyond what was paid in, that every block reward was real ELA of exactly the right amount, and that no amount fell outside the valid range. **Nothing was written to the chain.** The scan reruns automatically every half hour.

| Metric | Result |
|---|---|
| Blocks scanned (published band) | **1,083** (2,260,451–2,261,533) |
| Newly minted (that band) | **824.200905 ELA** — matches block rewards exactly, to the smallest unit |
| Distinct assets | **1** — ELA only, no invented asset |
| Violations found | **0** across every check run |
| Chain tip (Aug 1 polish) | **~2,262,448** — scan continues past the published band |

**Honest caveats:** traffic on the restarted chain has been light, so the per-transaction check had few value-moving transactions to test (every one passed). Some fixes cover events that have not happened yet (e.g. cross-chain transfers) — those stay **pending**, not claimed. Mint/violation figures above are for the **published complete band** only; do not extrapolate to tip without a new scan report.

---

## Fix inventory (87 correctness and security fixes)

| Bucket | Count |
|---|---|
| **All** | **87** |
| Proven live | **32** |
| Pending, live scan (need the right tx type) | **4** |
| Pending, block 2,265,000 | **2** |
| Proven on testnet | **48** |
| By design (deliberately not shipped as a hard reject) | **1** |

**Reading:** 32 are proven on the live chain by the recovery itself or by the scan. 4 wait for the kind of transaction that would exercise them. 2 switch on at **2,265,000**. The rest are attack and crash defenses a healthy chain never triggers — testnet is their proof.

---

## Fix groups (plain English)

### 1) Coins cannot be created from nothing (8)

Money must be conserved **for every asset type**, not just ELA, and the arithmetic must never quietly overflow. Most armed at **2,260,451**; one at **2,265,000**.

| Fix | Status |
|---|---|
| Every coin backed by real inputs (per-asset conservation; negative balance rejected) | **Proven live** |
| Block rewards paid in real ELA only (restore coinbase asset ID rule) | **Proven live** (3,249 coinbase outs = ELA) |
| Fee recorded on each tx counts only ELA | **Proven live** |
| Cross-chain amount check height-gated (does not break old blocks) | **Pending, live scan** |
| Overflow that let a tiny deposit claim billions (overflow-safe add) | **Pending, live scan** |
| Vote-size checks height-aware (do not re-judge old votes) | **Proven live** |
| Giant transfer misread in mempool (overflow-safe classify) | Proven on testnet |
| Reward-minting engine ELA-only fees | **Pending, block 2,265,000** |

### 2) Block rewards cannot be inflated (3)

CR / miner / arbiter split cannot be padded with a fake asset, pay an empty seat twice, or overflow.

| Fix | Status |
|---|---|
| Fake coins cannot inflate arbiter reward (~35%) | **Pending, block 2,265,000** |
| Empty arbiter seat cannot pay reward twice | Proven on testnet |
| Block-reward total cannot overflow | **Proven live** (1,083 blocks exact) |

### 3) Coinbase, identity registrations, cross-chain NFTs (10)

| Fix | Status |
|---|---|
| Reward cannot be spent before maturity (~100 blocks) | **Proven live** |
| Reward cannot pay quarantined / frozen address | **Proven live** |
| Cannot reuse old coinbase id to remint | **Proven live** |
| Same identity twice in one block | Proven on testnet |
| Conflicting council actions in one block | Proven on testnet |
| Destroy same NFT twice / reward redirect / wrong sidechain / malformed destroy halt | Proven on testnet |
| Strict previous-sponsor lock | **By design** — withdrawn (risk of unrecoverable split); non-blocking warning only |

### 4) Switching between BPoS and PoW safely (11)

Restart ran PoW then returned to BPoS at **2,261,186**.

| Fix | Status |
|---|---|
| Undo of RevertToPOW restores exact prior mode (not assume BPoS) | **Proven live** (v1.0.2) |
| Cannot force PoW by faking stall via timestamp | **Proven live** |
| Same stall verdict on every node (parent-based) | Proven on testnet |
| Fake confirmation refused on PoW restart legs | **Proven live** |
| Unknown RevertToPOW type rejected | **Proven live** |
| Emergency arbiter / mode change requires real signatures | **Proven live** |
| Signature rule keyed by **block height**, not tip (fresh sync safe) | **Proven live** |
| First gossip message structure-only (so BPoS round can start) | **Proven live** |
| Emergency change savepoint (rejected block leaves no residue) | Proven on testnet |
| Silent freeze at old block 409,956 on from-genesis sync | **Proven live** |
| Noisy false-error log every minute while waiting PoW | Proven on testnet |

### 5) Rewinding and bringing the chain back up (13)

One-time machinery for rewind to **2,260,450** and safe restart.

Highlights **proven live:** crash-safe journaled rewind; residue purge; tautology-free “rewind applied” gate; fsync durability; purge above-target mempool snapshots; read-only `preflight` / restart-check for exchanges; config-aware data folder; mainnet refuses to start with recovery settings off; bad node stopped before joining mesh; mining path honest about orphans; loud operator logs.

### 6) Validator set, council, cross-chain signatures (20)

Emergency commands need real signatures (**proven live** via BPoS return). Savepoints, lock hygiene, reorg undo restores exact state, double-sign evidence anti-gaming, Schnorr heights **pinned** on mainnet (**proven live** — overrides discarded). Combined-signature withdrawal path stays **off** / height-gated (**pending live scan** until a side-chain withdrawal). Wallet weak RNG / plaintext seed → rotate keys (testnet proof; not on-chain). Council deposit underflow mint blocked by per-asset backstop (**pending** until a refund tx). Contaminating working-tree feature confirmed **never in v1.0.2**.

### 7) Keeping nodes alive (22)

Availability / DoS / secret leak — not money mint:

- Public unauthenticated restart removed (**proven live**)
- Keystore password leak via profiler pages closed (**proven live**)
- Remote crash / memory exhaustion / peer hijack / unbounded pools — largely **proven on testnet** (healthy chain never exercises)

---

## Still to prove

### Waiting for the right transaction on live

1. Height-gated cross-chain amount check  
2. Overflow-safe cross-chain sum (tiny deposit → billions)  
3. Single-validator forged Schnorr withdrawal (path remains config-off)  
4. Council deposit inflated-refund backstop (strict per-asset already live)

### Confirm when chain reaches 2,265,000

1. Reward-minting engine ELA-only fees  
2. Arbiter reward from ELA-only fee total  

Because mainnet uses only ELA, honest producer reward should not change by even the smallest unit when gate two turns on — a steady reward across the crossing is the proof.

---

## Operator takeaways

1. **Recovery happened:** freeze → rewind → PoW restart → BPoS return.  
2. **Supply math so far is exact** on the restarted band (scan + auto re-run).  
3. **Do not claim “all vulns forever closed.”** Pending items wait for traffic or height.  
4. Use **Node v1.2.2** verbs before joining consensus; run **v1.0.2** (or later official) binary.  
5. Full per-fix narrative (what went wrong / what the fix does / proof) lives with the engineering recovery pack; this file is the public-honest index.

---

*Cadence: update when a new complete scan band is published, when gate two fires, or when a pending class is exercised on live. Last polish: 1 Aug 2026.*
