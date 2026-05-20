# Task: AI-Native Creator Studio (Monetisation Agent S1)

**Task ID**: `AGENT-CREATOR-STUDIO-2026-05`
**Created**: 2026-05-20
**Status**: **InProgress** — S1 implementation landing on `feat/t-1-telemetry-and-support`
**Priority**: High (this is the v1.3.0 user-facing thrust per [`docs/core/ROADMAP.md`](../../../docs/core/ROADMAP.md) release-status snapshot)
**Branch**: `feat/t-1-telemetry-and-support` (continuing the active session per Sasha 2026-05-20; no fresh branch fork)

### Mint-handoff decision (PLAN.md §10)
**Option A — `[Open in Creator]` only.** Decided 2026-05-20 by Sasha. No `[Mint now]` button in the chat for S1.
Rationale: ships in ~1 week vs ~1.5–2 for Option B, halves the R5 (drift) surface, and lets us layer a `[Mint now]` button on top in S2 with one extra ticket once we have real telemetry. The Creator app is the canonical UI for wallet signing in S1.

### S1 execution status (commits on `feat/t-1-telemetry-and-support`)
- [x] `2f170e229` — PLAN.md + README.md doc landing
- [x] `bd21cbdc3` — backend foundation (migration 34, REST `/api/intents`, 6 agent tools, ToolExecutor cases)
- [x] `f15b6b881` — frontend mode picker (`UIAIChat.js`) + Creator hand-off (`elacity-creator/app.js`) + Socket.IO directive (`UIDesktop.js`)
- [x] NR-4 regression test (`pc2-node/tests/unit/publish-intents-schema-and-mirror.test.js`, 7 assertions — passes locally)
- [ ] Live smoke pass on dev (drop file → chat through wizard → land on Creator confirmation page → mint)

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

### Planning (commit `2f170e229`)

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
- [x] **Option A vs Option B decision** — Option A chosen (see status block above)

### Execution (S1)

Backend (commit `bd21cbdc3`):
- [x] Migration 34: `publish_intents` table — `pc2-node/src/storage/migrations.ts` + `schema.sql`
- [x] DatabaseManager: `insertIntent` / `getIntentsByWallet` / `getIntentById` / `updateIntent` / `markIntentHandedOff` / `markIntentConsumed` / `deleteIntent` + `getChannelsByCreator`
- [x] REST API: `pc2-node/src/api/intents.ts` (POST / GET / GET-by-id / PUT / PATCH-status / DELETE) with field validation
- [x] Tool definitions: `pc2-node/src/services/ai/tools/MonetisationAgentTools.ts` — 6 tools per PLAN.md §7
- [x] Tool executor: 6 case clauses in `pc2-node/src/services/ai/tools/ToolExecutor.ts`
- [x] Tool registration: `AIChatService.ts` includes `monetisationAgentTools` in `allTools`

Frontend (commit `f15b6b881`):
- [x] Chat-mode picker: `src/gui/src/UI/AI/UIAIChat.js` (General / Monetisation Agent)
- [x] System-prompt injection on every send when monetisation mode is active
- [x] Socket.IO directive: `src/gui/src/UI/UIDesktop.js` listens for `monetisation.open_creator` and calls `launch_app`
- [x] Creator app: `puter.args.resumeIntent` handler + `resumeFromIntent(intentId)` + post-mint `markIntentConsumed` linkage in `pc2-node/data/test-apps/elacity-creator/app.js`

Tests:
- [x] NR-4 regression test (7 assertions, all passing) — `pc2-node/tests/unit/publish-intents-schema-and-mirror.test.js`

Remaining (pre-tag for v1.3.0):
- [ ] Live smoke on dev — drop a file in the side chat → talk through wizard fields → click "Open in Creator" → confirm pre-fill is identical to manual flow → mint → verify `publish_intents.status = consumed` with `consumed_draft_id` populated
- [ ] Multi-LLM verification — repeat smoke on at least 2 of {Claude-Sonnet, GPT-4o-mini, Gemini-Pro, local DeepSeek}
- [ ] CI green on `feat/t-1-telemetry-and-support` after these commits (tracking)

## Acceptance criteria (S1)

Planning:
- [x] `PLAN.md` is complete and self-contained — a contributor unfamiliar with the project can read it and understand the design
- [x] All claims about existing code cite a real file path or function name
- [x] The `publish_intents` vs `publish_drafts` correction is clearly explained
- [x] Option A vs Option B decision presented + Option A chosen

Execution (functional):
- [x] Agent-built `publish_intents` row mirrors the input-side columns of `publish_drafts` byte-for-byte (NR-4 enforced by static + behavioural tests)
- [x] State machine `draft → handed_off → consumed` works and the `consumed_draft_id` back-pointer preserves the audit trail
- [x] Mint pipeline UNCHANGED — the Creator app's encrypt + opRawData + sign + mint code path is the same whether the user dropped a file manually or came in via `resumeIntent`
- [x] Mode picker doesn't affect General-mode behaviour (system prompt only injected when monetisation mode is active)
- [ ] **Live smoke** — see implementation plan above (pre-tag gate)

## Files in this task folder

- [`PLAN.md`](./PLAN.md) — the design document
- [`README.md`](./README.md) — this file

## Files modified (S1 execution, all on `feat/t-1-telemetry-and-support`)

Backend:
- `pc2-node/src/storage/migrations.ts` (+59 LOC, version bump 33 → 34, migration 34 block)
- `pc2-node/src/storage/schema.sql` (+45 LOC, `publish_intents` CREATE + indexes)
- `pc2-node/src/storage/database.ts` (+173 LOC, intent CRUD + `getChannelsByCreator`)
- `pc2-node/src/api/intents.ts` (NEW, ~295 LOC)
- `pc2-node/src/api/index.ts` (+2 LOC, route registration)
- `pc2-node/src/services/ai/tools/MonetisationAgentTools.ts` (NEW, ~204 LOC)
- `pc2-node/src/services/ai/tools/ToolExecutor.ts` (+319 LOC, 6 case clauses + `decorateIntentRow` helper)
- `pc2-node/src/services/ai/AIChatService.ts` (+5 LOC, register `monetisationAgentTools` in `allTools`)

Frontend:
- `src/gui/src/UI/AI/UIAIChat.js` (+66 LOC, mode-state + picker UI + change handler + system-prompt injection)
- `src/gui/src/UI/UIDesktop.js` (+24 LOC, `monetisation.open_creator` Socket.IO handler)
- `pc2-node/data/test-apps/elacity-creator/app.js` (+95 LOC, `resumeFromIntent` + bootstrap branch + post-mint intent-consumed PATCH)

Tests:
- `pc2-node/tests/unit/publish-intents-schema-and-mirror.test.js` (NEW, 7 assertions covering NR-4)

## Testing strategy

- **Unit**: `npm run test:unit` — 21/21 passing (includes the 7 new NR-4 assertions). Run from `pc2-node/`.
- **Static analysis**: `tsc --noEmit` clean across the full pc2-node project. ESLint clean on all touched files.
- **Live smoke** (pre-tag, not yet run): drop a file in the side chat in Monetisation mode → talk through fields → `[Open in Creator]` → confirm pre-fill identical to manual flow → mint → verify `publish_intents.status = consumed` with `consumed_draft_id` populated.

## Notes

- This ticket replaces the **AGENTIC-PC2-MONETISATION-2026-05** mandate as the v1.3.0 driving plan, per Sasha 2026-05-19. The AGENTIC mandate document is parked, not deleted, for historical context.
- Branch hygiene: S1 lands on `feat/t-1-telemetry-and-support` per Sasha 2026-05-20 ("we are not trying to switch or create a new branch"). The v1.2.8.0 release path is unblocked — none of these commits touch the v1.2.8.0 telemetry/Health-app surface.
- Cursor session continuity: this task is the resumption point after the prior session paused mid-planning. `PLAN.md` here is the expanded, code-cited, sign-off-ready form.
