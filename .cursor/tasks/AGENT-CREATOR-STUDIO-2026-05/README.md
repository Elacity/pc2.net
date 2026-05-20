# Task: AI-Native Creator Studio (Monetisation Agent S1)

**Task ID**: `AGENT-CREATOR-STUDIO-2026-05`
**Created**: 2026-05-20
**Status**: **Proposed** — awaiting Sasha sign-off on [`PLAN.md`](./PLAN.md) §15
**Priority**: High (this is the v1.3.0 user-facing thrust per [`docs/core/ROADMAP.md`](../../../docs/core/ROADMAP.md) release-status snapshot)
**Branch**: `feat/t-1-telemetry-and-support` (this PR is doc-only; execution will fork a fresh branch after sign-off and after v1.2.8.0 ships)

## Description

Add a Monetisation Agent **mode** to the existing AI chat (sidebar + dedicated AI app, both backed by `UIAIChat.js`). In that mode, the agent walks creators through filling the same fields the Creator app's wizard collects today — in conversation form — then hands off to the existing Creator app for sign + mint.

Architectural model: **shared INTENT format, two presentations**. The agent owns a new `publish_intents` SQLite table (pre-encryption, user-intent fields only); the Creator app reads it via `puter.args.resumeIntent=<id>`, pre-fills its existing wizard, then runs encrypt + IPFS pin + mint **exactly as today**. No new mint pipeline, no new wallet code, no new on-chain artifact.

## Background

Per Sasha's direction 2026-05-19, the AGENTIC-PC2-MONETISATION mandate is parked; v1.3.0 is re-scoped to a focused first slice: conversational dDRM minting via the existing AI chat. This is "starting with minting" — pricing intelligence, batch packaging, royalty monitoring, and B2A negotiation are explicit S2/S3/S4 deferrals.

Mission framing: PC2 is the sovereign personal node; the Monetisation Agent is the AI layer that turns a creator's work into income on their behalf. S1 makes minting via Elacity dDRM as conversational as ChatGPT, with **zero loss of fidelity** vs the existing manual Creator-app flow.

## Requirements

See [`PLAN.md`](./PLAN.md) — the full design document. Headline:

- 6 read-only / intent-scoped agent tools (`analyze_file`, `list_my_channels`, `list_my_intents`, `update_intent`, `summarise_intent`, `open_creator_to_mint`) — see `PLAN.md` §7
- New `publish_intents` SQLite table + REST API mirroring the existing drafts API — see `PLAN.md` §6.2
- Chat-header mode picker (default General, toggle to "Monetisation Agent") — see `PLAN.md` §5.2 + §8.1
- 5-line addition to `elacity-creator/app.js` to handle `puter.args.resumeIntent` alongside the existing `resumeFromDraft()` — see `PLAN.md` §4
- One launch-gating regression test (NR-4): agent-built intent + Creator-built draft must produce byte-identical `publish_drafts` row + `opRawData` calldata — see `PLAN.md` §12 + AT-8

## Implementation plan

**This ticket is the planning ticket — it produces `PLAN.md` only.** Execution happens in a separate follow-up ticket after sign-off.

- [x] Reuse inventory across 4 substrate layers (AI runtime, dDRM packaging, wallet bridge, app-host/WASM) — `PLAN.md` §3
- [x] Architectural model + diagram (shared intent format, two presentations) — `PLAN.md` §6
- [x] Capture the `publish_drafts`-is-post-encryption discovery + introduce `publish_intents` correction — `PLAN.md` §6.2 + §16
- [x] 6-tool JSON-Schema definitions — `PLAN.md` §7
- [x] Side-by-side UX sketch + mode-picker UI — `PLAN.md` §8
- [x] Acceptance test list (AT-1 to AT-12) — `PLAN.md` §9
- [x] Mint-handoff Option A vs B decision matrix — `PLAN.md` §10
- [x] Risk register with detection signals — `PLAN.md` §11
- [x] No-regret items NR-1 to NR-4 — `PLAN.md` §12
- [x] Capability arc + S2/S3/S4 parking — `PLAN.md` §5.5 + §13
- [x] Persona / system prompt finalised text — `PLAN.md` §5.4
- [ ] **Sasha sign-off** — `PLAN.md` §15

## Acceptance criteria for this (planning) ticket

- `PLAN.md` is complete and self-contained — a contributor unfamiliar with the project should be able to read it and understand the design
- All claims about existing code cite a real file path or function name
- The `publish_intents` vs `publish_drafts` correction is clearly explained (this was the mid-execution discovery)
- The Option A vs Option B mint-handoff decision is presented with enough detail for Sasha to pick without a follow-up Q&A round
- NR-4 (the launch-gating regression test) is described precisely enough that the harness can be specced

## Files in this task folder

- [`PLAN.md`](./PLAN.md) — the design document
- [`README.md`](./README.md) — this file

## Files to modify (execution ticket, not this one)

To be specified in the execution follow-up ticket once Option A vs Option B is decided. The expected surface area (Option A) is summarised in `PLAN.md` §4 — six things, no more.

## Testing strategy

- Doc-only PR — no runtime tests apply. Lint check (`ReadLints`) on the markdown files only
- Internal links resolve; no references to the parked AGENTIC-PC2-MONETISATION mandate
- All cross-references to other PC2 paths (`pc2-node/...`, `src/gui/...`, `packages/access/...`) point to files that actually exist on the current branch

## Notes

- This ticket replaces the **AGENTIC-PC2-MONETISATION-2026-05** mandate as the v1.3.0 driving plan, per Sasha 2026-05-19. The AGENTIC mandate document is parked, not deleted, for historical context
- Branch hygiene: this doc-only PR lands on `feat/t-1-telemetry-and-support` because that's where the active session is. Execution branches separately **after** v1.2.8.0 is tagged
- The 4-line uncommitted edit to `docs/core/ROADMAP.md` (a leftover from the prior session's housekeeping pass) is committed alongside this task's PLAN.md + README.md in a single doc-only PR
- Cursor session continuity: this task is the resumption point after the prior session paused mid-execution. The synthesis source-of-truth is `/Users/mtk/.cursor/plans/agent-creator-studio_2cc543fd.plan.md` (read-only); `PLAN.md` here is its expanded, code-cited, sign-off-ready form
