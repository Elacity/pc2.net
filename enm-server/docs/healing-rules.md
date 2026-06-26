# ENM v0.3 — Healing rules catalog

ENM's self-healing engine watches each chain's health snapshot every
30s and fires detection rules. Each rule has a tier that controls
what happens when it fires.

---

## Default state (v0.3)

**Only F1 is enabled by default.** F2-F19 are off until you opt in.

This is a deliberate change from v0.2, where every rule was on. v0.2
default installs saw F4 + F19 firing every 5 minutes for 8+ hours
during normal operation, drowning the audit log in spam. With F1-only,
default installs see exactly one audit event per actual incident.

To enable a rule:

```bash
curl -X POST -H "Authorization: Bearer <session-token>" \
  http://localhost:4180/api/enm/healing/rules/F4/enable
```

To list current rule states:

```bash
curl -H "Authorization: Bearer <session-token>" \
  http://localhost:4180/api/enm/healing/rules
```

The Settings tab will surface a per-rule toggle in v0.4.

---

## Tiers

| Tier | What happens when a rule fires |
|---|---|
| `AUTOMATED-SAFE` | Engine acts immediately. Logs to audit. No operator action. |
| `OWNER-CONFIRMS` | Engine creates a proposal. Notifies the operator. Action waits for confirm via the proposal card. |
| `CRITICAL-NOTIFY` | Engine notifies (toast + audit). Does NOT take action. |
| `NEVER-AUTOMATIC` | Engine notifies. Action is operator-driven, no auto-execution available. |

All tiers create an audit entry regardless of whether action was taken.

---

## Rule catalog

| ID | Tier | Default | What it detects | What action gets proposed |
|---|---|---|---|---|
| **F1** | AUTOMATED-SAFE | **on** | Process exited unexpectedly (no manual stop, exit code != 0 or signal) | Auto-restart the chain |
| **F2** | AUTOMATED-SAFE | off | RPC unreachable for ≥ 2 min despite process being alive | Restart the chain |
| **F3** | AUTOMATED-SAFE | off | Peer count = 0 for ≥ 5 min | Restart the chain to re-bootstrap peer discovery |
| **F4** | OWNER-CONFIRMS | off | Sync stalled — height has not advanced for ≥ 10 min while peers > 0 | Restart with `--reset-peers` flag |
| **F5** | OWNER-CONFIRMS | off | Disk space < 10 GB free (CRITICAL if < 5 GB) | Operator decides: archive logs, expand volume, or stop |
| **F6** | OWNER-CONFIRMS | off | Process killed by OOM (SIGKILL with no manual stop) | Raise memory limit in chain config |
| **F7** | OWNER-CONFIRMS | off | Port conflict detected at chain-start time | Stop the conflicting process; or change ENM-side port mapping |
| **F8** | OWNER-CONFIRMS | off | Binary version on disk doesn't match expected upstream version | Reinstall binary via wizard |
| **F9** | OWNER-CONFIRMS | off | Config file failed Joi validation on load | Operator opens Settings → Mainchain Advanced and corrects |
| **F10** | OWNER-CONFIRMS | off | Chain config exists but RPC password is empty/unset | Generate a new RPC password and re-encrypt |
| **F11** | CRITICAL-NOTIFY | off | BPoS arbiter rotation stuck on this node's slot | Operator inspects ela logs; may file an issue with Elastos core |
| **F12** | NEVER-AUTOMATIC | off | BPoS producer is in `Inactive` state and approaching forced-inactive penalty (≥ 1300 of 1440 missed rounds) | Operator restores producer status manually (chain RPC) |
| **F13** | OWNER-CONFIRMS | off | Host clock skew exceeds 2s (well below ELA's 4.2s tolerance) | Sync via ntpd / chrony; operator runs the suggested command |
| **F16** | CRITICAL-NOTIFY | off | Peer count = 0 for ≥ 10 min (extends F3's 5 min auto-restart) | Suggest peer fallback list; check DNS seeds |
| **F18** | CRITICAL-NOTIFY | off | BPoS-mode chain has outbound peers > 0 but inbound peers = 0 for ≥ 5 min | Operator opens firewall / NAT for inbound chain ports |
| **F19** | CRITICAL-NOTIFY | off | Host conflict detected at runtime (something other than docker-proxy bound the chain ports) | Operator stops the conflicting service |

`F14`, `F15`, `F17` are reserved.

---

## Rule details

### F1 — process exited unexpectedly

**Why on by default.** Without F1, a transient crash (segfault, OOM,
host reboot mid-run) leaves the chain offline indefinitely. F1 is
cheap (single restart attempt with exponential backoff) and matches
operator intuition: "if the chain dies on its own, bring it back."

**What it does NOT do.** F1 doesn't loop forever. After 5 failed
restart attempts inside a 10-minute window, F1 stops trying and
escalates to a `CRITICAL-NOTIFY` so the operator gets paged. This
prevents thrash on a hard failure (e.g., corrupted database).

**Pre-conditions.** F1 only fires if `manualStop=false` (i.e., the
operator didn't click Stop) and `lastExit.code !== 0`. Operator-driven
stops never trigger F1.

### F2, F3 — RPC + peer health

These are paired with F1 for "active" liveness checking. F1 catches
process crashes; F2 catches the case where the process is alive but
hung; F3 catches the case where the process is healthy but the peer
network is gone (DNS seeds down, firewall change).

**Why off by default.** Restarting on every transient RPC blip or
empty peer count was the largest source of v0.2 audit spam. Enable F2
+ F3 if you have aggressive uptime SLAs and have audited that your
network is stable enough to avoid false positives.

### F4 — sync stalled

**Why off by default.** Mainnet sync has natural pauses when the chain
catches up to a sparse block. v0.2 fired F4 in those cases too,
producing 12 events/hour at peak. Enable F4 only after you've watched
your node's sync pattern for a few hours.

**Owner-confirms.** F4's proposed action (`--reset-peers` restart) is
intrusive: it drops all current peers and re-bootstraps. The operator
should confirm before this happens.

### F5 — disk space

Fires when free space on `/data/enm/`'s filesystem drops below 10 GB
(WARNING) or 5 GB (CRITICAL). The audit entry includes the current
free GB so the operator can graph the trend.

**Why off by default.** Operators with separate monitoring already
get alerted via Prometheus/Grafana. ENM's F5 is a backstop, not a
primary alert.

### F6 — OOM kill

Detects when ela was killed by the OOM killer (exit signal 9 with
`oom_score` evidence in `/proc`). Distinct from F1 because the
remediation is "raise memory limit", not "just restart" — restarting
into the same memory cap will get OOM-killed again.

### F7 — port conflict at chain start

Catches the case where the operator clicked Start but ela can't bind
its ports. This is `OWNER-CONFIRMS` rather than auto-restart because
the resolution is to stop the OTHER process, not ela.

### F8 — binary version mismatch

Fires when `ela --version` on disk doesn't match the expected upstream
version (per `EnmBinaryDownloader`'s catalog). Often benign — operator
hand-installed a newer binary — but worth flagging.

### F9, F10 — config integrity

F9 fires if the config file fails Joi validation when loaded
(corrupted, hand-edited badly). F10 fires if the config exists but
`rpc.passwordEncrypted` is empty (a v0.1-era state that breaks
authenticated RPC).

### F11, F12, F18 — BPoS-specific

Only meaningful for chains running in BPoS mode. F11 flags arbiter
rotation getting stuck on this node (rare but indicates a producer
software bug). F12 is the most operator-relevant: tracks
`inactiveRounds` toward the forced-inactive penalty at 1440 missed
rounds. F18 flags inbound-peer starvation (firewall closed, NAT
broken, ISP blocking inbound).

### F13 — clock skew

If your host clock drifts > 2s, BPoS consensus may reject your
proposed blocks. Enable F13 if you don't already monitor clock skew
externally.

### F16 — extended peer-zero

A second-stage version of F3 that fires after 10 minutes of zero
peers (vs. F3's 5 minutes). Different action: instead of restarting,
it suggests a fallback peer list (since DNS seeds are evidently down
or unreachable from this host).

### F19 — host conflict at runtime

The companion to F7's "at start" check. F19 polls every 60s for any
new process binding ports we expect to own. The v0.3 implementation
treats `docker-proxy` as benign (it's expected to hold the host-side
mappings) and dedups identical events within a 1h window. With
`--no-bpos`, F19 only watches the loopback bindings.

---

## Audit log severity levels

Each fired rule produces an audit entry. Severity comes from the rule's
`severity` field:

| Severity | When |
|---|---|
| INFO | Non-actionable observations (very rare in healing — usually only auto-restart success messages) |
| WARNING | Something that needs attention but doesn't require immediate action |
| CRITICAL | Likely impacts chain operation; operator should act soon |

The `notification.criticalAck` operator preference (Settings → General)
controls whether CRITICAL events require explicit acknowledgement
before they auto-dismiss.

---

## Adding a new rule (developer notes)

1. Add a `detectFnXX(snap)` function to
   [services/HealthRules.js](../src/services/HealthRules.js) that
   returns either `null` (no detection) or a structured object with
   `ruleId`, `tier`, `severity`, `summary`, `detail`.
2. Register it in `runAll()` with a guard:
   `if (isRuleEnabled('FXX')) { results.push(detectFXX(snap)); }`.
3. Add the rule to `DEFAULT_ENABLED` (default `false` unless you have
   strong evidence the rule has near-zero false positives).
4. Add a row to the rule catalog table above.
5. If `OWNER-CONFIRMS`, add a UI confirmation prompt to
   [components/proposal-card.js](../../src/backend/apps/elastos-node-manager/js/components/proposal-card.js).
