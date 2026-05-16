# Capsule Readiness Audit — Executive Summary

> **Companion to**: [`CAPSULE_READINESS_REPORT.md`](./CAPSULE_READINESS_REPORT.md) (full audit data, methodology, 638-line per-module classification).
> **For**: Sasha, Anders (Runtime team), Ahmed (ENM), board narrative.
> **Reading time**: 3 minutes.
> **Status**: Audit-in-progress; **102 of 272 pc2-node modules classified (37.5%)**; **the ENTIRE `pc2-node/src/services/` subtree is now audited (71/71 modules across 13 nested subtrees)**, plus types/ (5/5), storage/ (8/8), utils/ (16/16), api/ sample (5/45). Strategy stable.
> **Updated**: 2026-05-16.

---

## TL;DR

pc2-node is **dramatically more capsule-ready than expected**. After auditing 102 modules across the entire `services/` subtree plus types/storage/utils/api-sample:

- **79% of audited modules are A or A- class** (capsule-ready or close to it)
- **The entire `services/` subtree is now audited (71/71)**: 38 A (54%), 13 A- (18%), 14 B (20%), 2 B- (3%), 1 C (1%)
- **The entire AI subtree is C-free** (26/26): 0 C
- **The entire dDRM/media subsystem is C-free** (8/8): 0 C. The Monetisation Agent's most critical dependency is structurally clean.
- **Only 2 modules in the whole codebase are deeply coupled** (C-class): `ConnectivityService` and `api/index.ts` — both mega-orchestrators that the Runtime architecture eliminates by design
- **THREE pieces of Runtime convergence infrastructure already exist in pc2-node**: (1) the 14-scope capability vocabulary, (2) HTTP-side capability enforcement, (3) **formal Runtime provider operation contracts with explicit pointers to the current pc2-node implementation of each operation**
- **`ContentSeedingService.ts` + `ContentIndexerService.ts` show the fix template** for the #1 cross-cutting blocker: type-only imports + dependency injection. Mechanical refactor; can be applied to 15+ other modules.
- **Migration is role-scoped, not subtree-scoped** — lift A-class leaves in parallel across all subtrees

Runtime convergence is **rename + repackage, not re-architect**. pc2-node was designed for capsule extraction from the start. The dual-track strategy from `AGENTIC-PC2-MONETISATION-2026-05` is supported by overwhelming empirical evidence.

---

## The six findings that matter

### Finding 1: The capability vocabulary already exists

`pc2-node/src/types/capabilities.ts` defines a 14-scope capability vocabulary (`storage:read`, `storage:write`, `ipfs:fetch`, `wallet:read`, `wallet:sign`, `drm:decrypt`, `drm:encrypt`, `compute:wasm`, `compute:ai`, `network:rpc`, `ipc:launch`, `ipc:message`, `identity:auth`, `ipfs:pin`). The file header states:

> *Single source of truth for capability scope names used across: AppManifest.capabilities, API key scopes, Wallet bridge method classification, Runtime v2 capability token `action` fields. These map 1:1 to ElastOS Runtime provider contract operations.*

**Implication**: pc2-node was designed from the start with Runtime convergence in mind. The vocabulary is in place. Whoever wrote this file was already thinking in capability-token terms.

### Finding 2: The capability ENFORCEMENT already exists

`pc2-node/src/api/middleware.ts` exports `requireCapability(scope: string)` middleware that gates HTTP routes using the Finding-1 vocabulary. Combined with `populatePrincipal()` and the `CapabilityPrincipal` interface, **pc2-node has a working capability-token enforcement layer at HTTP request time**.

**Implication**: We don't need to *invent* capability enforcement; we need to (a) extend it to non-HTTP entry points (websocket, IPC), and (b) port the enforcement layer into the Runtime substrate. The mental model already lives in pc2-node code.

### Finding 3: Runtime provider operation contracts already formalised

`pc2-node/src/services/providers/types.ts` (102 lines, pure TypeScript) declares 5 interfaces that **formalise the ElastOS Runtime's provider contract protocol**:
- `ProviderOperation` — the base fetch/store/list/delete interface mapping to the Runtime's stdin/stdout JSON protocol
- `DRMProvider extends ProviderOperation` — drm:decrypt, drm:encrypt, drm:verify-access, drm:render
- `StorageProvider extends ProviderOperation` — storage:read, storage:write, storage:pin, storage:ipfs-fetch
- `IdentityProvider extends ProviderOperation` — identity:auth, identity:resolve, identity:sign
- `ComputeProvider extends ProviderOperation` — compute:wasm, compute:ai-chat, compute:shell

Each interface's doc comment **explicitly enumerates which pc2-node functions currently implement each operation**. For example:

> *DRMProvider — Current implementations:*
> *- WASMRuntime.executeRenderer() → drm:render*
> *- WASMRuntime.executeDecryptOnly() → drm:decrypt*
> *- WASMRuntime.executeCENCDecrypt() → drm:decrypt-media*
> *- chipotle-client.recoverNonMediaCEK() → drm:decrypt (CEK recovery)*
> *- storage.ts /lit/secure-view → drm:decrypt + drm:render (composite)*

**Implication**: The Runtime migration is not a rewrite. The contracts exist; the implementations exist; the mappings are documented. Migration = rename pc2-node functions to match contract names + package as Rust crates. The capsule contract is the source of truth, and pc2-node code already conforms to it.

### Finding 4: Capsule readiness is role-based, not subtree-based

The pilot audit's framing ("AI is mostly A, connectivity is mostly C") turned out to be sampling artefact. After auditing 51 modules across 6 subtrees, the pattern is clear:

- **Pure utility / protocol / type leaves** → A-class everywhere
- **File-backed services with light direct-fs** → A- everywhere
- **Medium orchestrators wiring sibling services** → B everywhere
- **Mega-orchestrators with 40+ concrete imports** → C (only 2 modules; both will be retired by capsule architecture)

**Implication**: Runtime migration order is decoupled from subtree boundaries. The Runtime team can lift `boson-crypto` + `ai-providers` + `storage-migrations` **in parallel as their own crates**, not sequentially per-subtree. This unblocks parallel work.

### Finding 5: One refactor pattern dominates — and the fix template already exists in the codebase

The single biggest cross-cutting blocker is **"concrete class import where an interface should suffice"** — confirmed in **15+ modules** across the entire services/ subtree. Examples:
- `filesystem.ts` imports concrete `IPFSStorage` + `DatabaseManager`
- `api/wallet.ts` imports concrete `AgentKitExecutor`
- `BosonService` imports 7 concrete sibling services
- `metrics.ts` imports concrete `DatabaseManager`
- `MemoryConsolidator` + `ContextRetriever` + `AgentKitExecutor` import concrete service classes
- `ChannelBridge` imports 5 concrete classes (worst offender)
- `AppInstallService` + `ContentIntelligenceService` + `GatewayService` all import concrete `DatabaseManager`

**The fix template already exists**: `ContentSeedingService.ts` and `ContentIndexerService.ts` show how it should be done — `import type { IPFSStorage }`, `import type { DatabaseManager }`, `import type { Config }`, and use the actual instances via dependency injection. The refactor is mechanical: convert offending modules' import statements from concrete to type-only, then pass instances through constructors.

**The fix**: extract ~7-8 interfaces (`IFilesystemManager`, `IDatabaseManager`, `IIPFSStorage`, `IAIChatService`, `IAgentKitExecutor`, `IIdentityService`, `IParticleWalletProvider`, `IGatewayService`). One Phase 2 ticket. Improves the score of 15+ modules.

**Estimated effort**: 1 week of focused work, value-positive for PC2 v1 testability and Runtime migration alike.

### Finding 6: Only 2 modules are deeply coupled

After 102 audits across the entire services/ subtree plus types/storage/utils/api-sample, only **two** modules earn C-class:
- `pc2-node/src/services/boson/ConnectivityService.ts` (1,597 LOC, network-side mega-orchestrator with state machine and setter-injected services)
- `pc2-node/src/api/index.ts` (1,766 LOC, HTTP-side mega-orchestrator wiring 40+ siblings, ambient Express coupling)

Both are the same architectural pattern on opposite sides of the codebase. Both will be **retired**, not refactored, by capsule architecture (capsules don't have single mega-entry-points by design).

**Implication**: the "PC2-as-monolith" problem is concentrated in 2 files. The other 100 audited modules are either capsule-shape already (81) or one bounded refactor away (19).

---

## The strategic verdict

After 51 modules of empirical data:

**Phase 1 (immediate, blocking nothing)**: Mac launcher ships. Stable for 48-72h.

**Phase 2 (post-Mac, ~3-4 weeks of bounded work)**:
- **(a) Runtime team can begin lifting A-class leaves as crates in parallel**: `boson-crypto`, `boson-protocol`, `ai-providers`, `storage-migrations`, `types-capabilities`. Low coordination cost; leaves don't change shape.
- **(b) PC2 team can refactor B-class orchestrators in bounded chunks** (~15-20 days total):
  - `AIChatService` split (~3-5 days)
  - `ToolExecutor` split + capability injection (~4-5 days)
  - `BosonService` interface extraction (~1-2 days)
  - `filesystem.ts` + `indexer.ts` interface extraction (~1-2 days)
  - Cross-cutting "concrete-class → interface" refactor (~1 week — touches 9+ modules)
- **(c) Both C-class mega-orchestrators** wait for Runtime substrate; their eventual redesign retires the mega-orchestrator pattern altogether.

**Phase 3 (Q4 2026 onwards)**: ConnectivityService + api/index.ts redesign happens as the Runtime substrate matures. The 2 mega-orchestrators are the last things to migrate, by design.

---

## What this changes about the AGENTIC-PC2-MONETISATION mandate

The mandate's dual-track strategy is **supported with stronger empirical backing**:

1. **Track 1 (PC2 v1 evolution)**: Work in the AI leaf modules is NOT throw-away. Those modules already match the capsule shape; they migrate cleanly.
2. **Track 2 (Runtime convergence)**: Runtime is **not future-tense**. The vocabulary, enforcement layer, and module shape are already partly in place. Convergence is incremental extension, not greenfield rewrite.
3. **The 8 new Rust crates identified in mandate v1.1 §7.5** are now cross-referenced to specific pc2-node modules (all confirmed):
   - `dDRM-renderer` capsule — sources directly from `services/wasm/WASMRuntime.ts` (A-, 7/10) which already implements drm:render, drm:decrypt, drm:decrypt-media
   - `dDRM-packager` capsule — sources from `services/media/{mpdGenerator, mpdParser, sessionManager, mp4split, fingerprint, dashPackager, encoder, bento4}` (3 A, 2 A-, 3 B; no C)
   - `boson-crypto` capsule — sources directly from `services/boson/CryptoBox.ts` (A, 9/10)
   - `boson-protocol` capsule — sources directly from `services/boson/ProxyProtocol.ts` (A, 10/10)
   - `ai-providers` capsule — sources from `services/ai/providers/*.ts` (all A-class)
   - `ai-tools` capsule — sources from `services/ai/tools/{AgentKitTools, CanvasTools, FilesystemTools, SettingsTools, SkillsTools, WalletTools}` (all 10/10 A) + ToolExecutor (B-, needs split)
   - `storage-migrations` capsule — sources from `storage/migrations.ts` (A, 9/10)
   - `sandbox` capsule — sources from `services/sandbox/SandboxManager.ts` (A-, 7/10) — Firecracker integration already POC'd
   - `wallet` capsule — sources from `services/wallet/ParticleWalletProvider.ts` (A, 9/10)
   - `gateway-channels` capsule — sources from `services/gateway/channels/{WhatsAppChannel, TelegramChannel}` (both A, 10/10)
   - `terminal` capsule — sources from `services/terminal/TerminalService.ts` (A-, 7/10)
   - `update` capsule — sources from `services/UpdateService.ts` (B, 6/10) — needs split
   - `vpn` capsule — sources from `services/{vless, wireguard}` (all A-, 7/10)

---

## What we DON'T yet know

- 62% of pc2-node/src is still unaudited (170 modules remaining). Distribution may shift as more modules come in (though pattern is now well-established — recent batches consistently confirm existing pattern counts rather than discovering new shapes).
- The 40 remaining `api/` HTTP handlers are predicted to be ~70% B / 25% A- / 5% C but unverified.
- WebSocket subtree (`websocket/*`) has 4 modules; not yet sampled.
- `sdk/`, `auth/`, `config/` subtrees not yet sampled.
- Top-level `pc2-node/src/*.ts` files (~10 files: index.ts, setup, etc.) not yet audited.

**Audit completion plan**: 37.5% coverage achieved tonight. ≥50% achievable in another ~2 hours of audit time (one more batch). ≥80% by end of week if focused. The remaining ~170 modules are ~6-8 hours of analyst-time at current pace.

---

## What you do with this document

- **Sasha**: skim Finding 3 + 4 + the strategic verdict. Decide whether to commit to the (a)(b)(c) phasing for Phase 2.
- **Anders / Runtime team**: skim Findings 1 + 2 (the capability infra already exists) + the strategic verdict (a). Identify which A-class crates to lift first.
- **Ahmed / ENM**: skim Finding 1 + the cross-reference table at the bottom. The ENM integration path inherits from the same capability vocabulary.
- **Board narrative**: TL;DR + the strategic verdict. The story is "pc2-node was architected for Runtime convergence from the start; the migration is bounded and parallelisable".
