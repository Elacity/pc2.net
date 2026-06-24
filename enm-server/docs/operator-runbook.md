# ENM — Operator runbook

Walkthroughs for the most common operator tasks. For the "why"
behind these flows, see [architecture.md](architecture.md).

> **A note on UI vocabulary.** v0.4 introduced a friendly "Welcome
> Home" UI layer for first-time operators. References below to the
> *home view*, *settings drawer*, or *technical view* point to that
> layer. Power users still get the original v0.3 5-tab dashboard —
> it's nested inside the settings drawer under
> *For the technically curious → Show technical details*. See the
> [v0.4 upgrade guide](v0.4-upgrade-guide.md) for the v0.3→v0.4
> path translation.

---

## Fresh install (5 minutes)

Pre-reqs: a Linux box with PC2 already installed, Docker present, and
your operator wallet already claimed via the PC2 dashboard.

```bash
# 1. Run the ENM installer (adds enm-server to your existing compose stack).
bash <(curl -sSL https://raw.githubusercontent.com/4HM3DMD/pc2-testing/main/enm-server/scripts/install-enm.sh)

# 2. Open the PC2 dashboard.
open http://<your-server-ip>:4100   # or paste into your browser

# 3. Click the "Elastos Node Manager" launcher icon.
```

The first time you open ENM, you'll see the **Welcome screen** with a
single button: *Let's go →*. Tap it and you're in the **setup
conversation** — four cards walk you through:

1. **Card A — What do you want to do?**
   Two big tiles: *Earn rewards* (run a BPoS supernode) or
   *Help the network* (run a full node). The technical role name is
   shown right under the friendly carrot so you learn what you're
   actually configuring.
2. **Card B — Setting your ElastOS up.**
   Tap *Install now*. The chain client (the `ela` binary) downloads
   from `download.elastos.io` — usually under 2 minutes. Card auto-
   advances when the install finishes.
3. **Card C — Save your secret password** *(BPoS only — skipped for
   full-node)*. ENM generates a strong password for the keystore and
   shows it once. Copy it to your password manager. Tick
   *I've saved it somewhere safe* and tap *Continue*. We can't show
   it to you again.
4. **Card D — 🎉 You're all set!**
   ENM writes the config and starts the chain. Tap *Take me home*.

The **home view** (hero card) appears within a few seconds. The
illustration + headline change as the chain progresses:

- *Your ElastOS is waking up…* (starting)
- *Your ElastOS is catching up — about 9 min until fully synced* (syncing)
- *Your ElastOS is happy and earning* (healthy + BPoS) — green tone

---

## Upgrade ENM

```bash
cd ~/pc2
docker compose pull enm-server
docker compose up -d enm-server
```

ENM upgrades are non-disruptive to the chain — the ela process runs
as a child of enm-server but its state lives in `/data/enm/chains/`,
which is a host-mounted volume. The chain keeps its synced data across
container restarts.

To upgrade ela itself (e.g. when a new mainnet release ships):

1. Open ENM → tap the gear icon (top-right) →
   **For the technically curious → Show technical details**.
2. On the **Status** sub-tab, scroll to the Mainchain card and click
   **Stop**.
3. Scroll further to the **Maintenance** section → tap **Run** next to
   *Update binary*. This re-downloads the latest `ela` + `ela-cli`
   from `download.elastos.io` (mirrors `node.sh`'s `ela_update`).
4. When the download finishes, click **Start** on the Mainchain card.

(For most operators, this happens automatically when you tap
*Reinstall my node* in the settings drawer — that re-runs the setup
conversation and pulls the latest version.)

---

## Maintenance — power-user actions

The Status sub-tab inside the technical view has a **Maintenance**
section near the bottom. Three actions, mirroring the most common
`node.sh` commands operators historically ran by hand:

| Action | What it runs | When to use it |
|---|---|---|
| **Compact logs** | `POST /chains/mainchain/compact-logs` — gzips + purges `ela.log` per the rotation policy in chain config | "Free space now" — the daily cron does this anyway, but you can force it |
| **Update binary** | `POST /chains/mainchain/update` — calls `EnmBinaryDownloader.start()`, which mirrors `node.sh:1173 ela_update` | Pulling a new mainnet release. Stop the chain first. |
| **Reactivate BPoS supernode** | `POST /chains/mainchain/bpos/activate` — mirrors `node.sh:1590 ela_activate_bpos`, runs `ela-cli wallet buildtx producer activate --nodepublickey <pk>` then `wallet sendtx` | Your producer accumulated too many missed-rounds and the chain flipped you to `Inactive`. Without reactivation, you keep losing votes. |

The Reactivate button **also surfaces on the home hero card** when
the chain reports `producer.state === 'Inactive'`, so an avg-joe
operator sees "Reactivate my BPoS supernode" alongside the regular
"Pause my ElastOS" without ever opening the technical view.

### Where these commands run

Server-side. The keystore.dat ENM already manages is the producer
signing key — using it server-side is exactly what `node.sh` does.
This is in scope per
[Architectural Invariant #2](architecture.md#2-operator-wallet--identity-never-signs):
that invariant forbids *browser-wallet* signing (no WalletConnect /
Particle coupling), not all on-chain ops. The keystore password is
decrypted from `cfg.dpos.keystorePasswordEncrypted` via
`EnmEncryption` (same path the chain-start uses to unlock the
producer key on stdin).

### What's still externalized

`producer register v2` (initial BPoS registration) needs the 2,000
ELA deposit which lives in the operator's wallet, not on this
server. Same for CR member registration. Both still happen via
Essentials or `ela-cli` from a wallet machine — see the BPoS
registration walkthroughs above.

The lifecycle ops that DO need user-supplied amounts —
`producer vote` / `stake` / `unstake` / `claim`, and DPoS 2.0's
`returndeposit` (the v2 form of unregister) — are deferred to v0.5
when the wallet-aware UI ships.

---

## Recover from a botched setup

Most botched setups are partial-install state confusion. The fastest
fix is `--reset`, which stops the container, archives `enm-data/`, and
exits without touching pc2 or its data:

```bash
bash <(curl -sSL .../install-enm.sh) --reset
```

You'll see:

```
==> Reset mode — stopping enm-server and archiving state...
✓ Container stopped and removed
✓ Archived enm-data → /home/op/pc2/enm-data.bak.20260505123045

Reset complete. To reinstall, re-run this script without --reset:
  bash <(curl -sSL .../install-enm.sh)
```

Then re-run the installer normally. The wizard appears as if this were
a fresh install.

If you want to keep audit history, copy `enm.db` out of the archive
before the next install creates a new `enm-data/`:

```bash
cp /home/op/pc2/enm-data.bak.<ts>/enm.db /tmp/enm-audit-pre-reset.db
```

---

## BPoS supernode registration

ENM v0.3 holds your producer keystore on the server but does NOT sign
or broadcast the registration transaction (per
[architecture.md § Architectural Invariant #2](architecture.md#2-operator-wallet--identity-never-signs)).
Registration happens externally with one of two paths.

### Path A — Essentials mobile wallet (recommended)

1. On the ENM home view, scroll to the **Producer identity** card.
2. Tap **Open in Essentials**. Your phone receives a deep-link.
3. In Essentials, confirm the supernode name + URL + lock period.
4. Approve the on-chain transaction (requires 2,000 ELA in the deposit
   wallet associated with Essentials).
5. Within ~1 block, the hero card flips to *Your ElastOS is happy and
   earning* — and the technical view's BPoS sub-panel
   (Settings → Show technical details → Status) shows
   `Producer state: Pending → Active`.

### Path B — `ela-cli` from a separate box

Use this if you don't have Essentials, or if your deposit wallet is on
a different machine than ENM.

1. On the home view, scroll to the **Producer identity** card.
2. Expand **Register via CLI**. The card shows the templated command:

   ```bash
   ela-cli wallet buildtx producer register v2 \
     --nodepublickey 02a1b2c3...e9fa \
     --name "<your-supernode-name>" \
     --url "https://<your-supernode-url>" \
     --location 0 \
     --stakeuntil <current-height + lock-period> \
     --amount 2000 \
     --fee 0.000001
   ```

3. Fill in the placeholders. Run on the box that holds your deposit
   wallet. Sign and broadcast.
4. Verify on-chain by checking the BPoS sub-panel on ENM after one block.

---

## Daily ops

### Where do logs live?

- **enm-server logs** (the sidecar): `cd ~/pc2 && docker compose logs -f enm-server`
- **ela logs** (the chain): on-disk at
  `~/pc2/enm-data/chains/mainchain/logs/ela.log`. In the UI, open the
  settings drawer (gear icon) → *For the technically curious* →
  **Show technical details** → **Logs** sub-tab.
- **Audit log** (every healing decision + operator action): same path —
  Settings → Show technical details → **Audit** sub-tab. Filterable
  by chain / tier / time range. Export as JSON.

### What does each home view state mean?

The hero card on the home view turns one of four tones based on the
chain state:

| Tone | Hero says | Underlying state | What to do |
|---|---|---|---|
| Grey | *Your ElastOS isn't a node yet* | unconfigured | Tap **Set up my node** to launch the setup conversation |
| Grey | *Your ElastOS is taking a break* | stopped | Tap **Wake my ElastOS up** to start the chain |
| Amber | *Your ElastOS is waking up…* | starting | Wait ~10s |
| Amber | *Your ElastOS is catching up — about {N} min* | syncing | Wait — ETA shown |
| Amber | *Your ElastOS had a hiccup — fixing it now* | recovering | Wait — F1 auto-restart in progress |
| Green | *Your ElastOS is happy and earning* | healthy + BPoS | Nothing |
| Green | *Your ElastOS is happy and helping* | healthy + full-node | Nothing |
| Rose | *Your ElastOS is having trouble keeping up* | stalled | Tap **See what happened** to open the technical view |
| Rose | *Your ElastOS needs your attention* | error | Tap **See what happened**; check Logs sub-tab |

The role badge directly under the headline always shows
**BPoS supernode** or **Full node** so you know which mode your
ElastOS is running in.

### How do I update operator preferences?

Tap the **gear icon** (top-right). The settings drawer slides in with
four sections:

- **When to tell me** — notification toggles (help alerts, milestone
  celebrations, weekly summaries).
- **How my ElastOS behaves** — auto-restart on crash (default on, =
  healing rule F1), and *Try to fix problems without asking me* (= F2-F19
  opt-in, off by default).
- **Appearance** — theme switch (light / dark).
- **For the technically curious** — *Show technical details* opens
  the v0.3 dashboard with full settings: Network (external IP /
  hostname), Mainchain Advanced (log level, archive mode, RPC creds,
  WhiteIPList), General preferences.

The friendly toggles in the drawer save to localStorage (preference
sync to the backend ships in v0.5+). The technical-view Settings sub-
tab still writes to `enm.db` under `operator_preferences`.

### How do I see what healing has fired?

Settings → *For the technically curious* → **Show technical details**
→ **Audit** sub-tab. Default view shows the last 100 events. Filter by:

- Chain (currently only `mainchain`)
- Tier (`AUTOMATED-SAFE`, `OPERATOR-CONFIRM`, `MANUAL-ONLY`)
- Time range (from / to)

Export filtered results as JSON for incident postmortems.

---

## Common issues

### "ENM API unavailable" right after install

The container started but the API didn't come up within 60s. The
installer prints the last 30 lines of container logs. The most common
cause is the image didn't pull (network blip) — re-run the installer.

Manual investigation:

```bash
cd ~/pc2 && docker compose logs --tail=100 enm-server
```

If the logs show `EADDRINUSE: address already in use 0.0.0.0:4180`,
something else is on port 4180. Pass `--port 4181` to the installer.

### Mainchain card stuck on "Not configured" after wizard finished

Means the wizard didn't actually persist a config to disk. The
[Architectural Invariant #1](architecture.md#1-disk-is-the-source-of-truth)
self-heal would surface this as `coarseState=unconfigured` on next
boot.

Click **Configure** on the chain card to re-open the wizard inline.
The wizard pulls `/setup/state` and resumes at whichever step is
incomplete (install, keystore, or confirm).

If repeated wizard runs don't stick, run `--reset` and start fresh.

### F19 host-conflict alarms firing on every healing tick

This was a v0.2 bug — fixed in v0.3 backend. If you're still seeing
it on v0.3:

```bash
cd ~/pc2 && docker compose logs enm-server | grep -i "host conflict"
```

The v0.3 scanner treats `docker-proxy` as a benign holder for ports
ENM expects (because docker-proxy holding the host-side mapping is
exactly what we want — ela inside the container binds the inner port).
1-hour signature dedup means even legitimate conflicts only fire once
per hour, not 12×/hour.

If the alerts persist for a non-docker-proxy holder, that's a real
conflict. Identify it with:

```bash
sudo ss -ltnp '( sport = :20338 )'
```

…and stop the offending service, or pass `--no-bpos` to the installer
to bind ports to loopback only (full-node mode).

### Wizard install stalls > 30s on "preparing"

The installer is downloading a tarball from `download.elastos.io`. Slow
links can take a minute or two. If it stays at "preparing" with no
byte counter for > 60s, check container logs:

```bash
cd ~/pc2 && docker compose logs --tail=50 enm-server | grep -i download
```

You should see `EnmBinaryDownloader: GET https://download.elastos.io/...`.
If you see a network error, the upstream URL may have changed; file an
issue with the log line.

### "Mainchain installed but it's bugged it's not"

This was the v0.2 state divergence bug. v0.3's
[ChainState](../src/services/ChainState.js) reads disk truth on every
snapshot, so the dashboard cannot show "installed" while no binary
exists. If you see this on v0.3, please file an issue with:

- Output of `docker compose exec enm-server ls -la /data/enm/bin/mainchain/`
- Output of `curl http://localhost:4180/api/enm/chains/mainchain`
- The relevant container log section
