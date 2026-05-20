# Task: Confine CEK custody to the WASM sandbox — eliminate V8 heap as a CEK custodian

**Task ID**: WASM-CEK-CUSTODY-2026-05-18
**Created**: 2026-05-18
**Status**: Proposed (pending threat-model sign-off — see "Decision required" below)
**Priority**: High (security hardening; touches the central CEK custody surface)
**Related**:
- [`CHIPOTLE-V3-UNIVERSAL-ACTIONS`](../CHIPOTLE-V3-UNIVERSAL-ACTIONS/CHIPOTLE-V3-UNIVERSAL-ACTIONS.md) — current encrypt/decrypt orchestration lives in JS
- [`MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE`](../MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.md) — touches the same delivery path; coordinate sequencing
- [`WASM-CRYPTO-HARDENING`](../WASM-CRYPTO-HARDENING/) — adjacent hardening track; share zeroize patterns
- [`SEC-2026-04-28-WAVE8-CHIPOTLE-HARDENING`](../SEC-2026-04-28-WAVE8-CHIPOTLE-HARDENING/) — prior CEK-binding work

## Description

Move CEK generation, the Lit Action call, ECDH envelope unwrap, ephemeral
P-256 key custody, and segment encrypt/decrypt entirely inside the existing
Rust WASM modules (`crates/cenc-encrypt`, `crates/cenc-decrypt`). Replace
the current JS-side CEK plumbing with opaque session handles. The CEK and
the ephemeral P-256 private key never cross the WASM ABI as parameters or
return values — they are born, used, and zeroized inside the sandbox.

The realistic security improvement targeted by this task is **eliminating
the V8 heap as a custodian of the CEK**. The CEK currently sits in
`session.cekBase64` for the lifetime of a playback session and is passed
as a base64 string into WASM on every segment call. After this work, JS
holds only an opaque `u32` session handle; the CEK is one Rust `Zeroizing<[u8;
16]>` field inside the WASM sandbox.

## Background

Irzhy raised the concern during the 2026-05-18 PSSH-compliance review:

> "ideally the CEK should never be passed over inter or intra-components
> communication. I'm wondering if that would be OK to process the Lit
> action within the rust-based wasm runtime instead of only calling
> externally. The ideal scenario would be: CEK and KID are generated
> within the wasm runtime, only return the relevant response that the
> others components require."

The instinct is correct and the existing Rust crates already do the
load-bearing cryptography; what's missing is the orchestration layer
(Lit call, ECDH unwrap, session lifecycle). Moving that in is a
mechanical lift, not a rewrite.

## Honest threat-model statement (must be in the design doc verbatim)

**JS can read WASM linear memory directly** via
`new Uint8Array(wasm.exports.memory.buffer)`. So "CEK never leaves WASM"
is true at the **ABI level** (no pass-by-parameter, no return values) but
not at the **process level** (a JS attacker with code execution in Node
can still scan the linear memory).

This task targets the ABI-level boundary, which is a real and meaningful
improvement, but the threat-model statement must be honest about what it
does and does not defend against. The doc must use the framing:

> "CEK is confined to the WASM sandbox with disciplined zeroization,
> eliminating the V8 heap as a long-lived custodian and closing the easy
> leak channels (logging, telemetry, accidental serialization, hooked
> fetch). It does NOT defend against an attacker with arbitrary code
> execution in the Node process; that requires a process-level boundary
> (subprocess sandbox, TEE, or hardware enclave) and is out of scope."

### Decision required before implementation starts

Pick one of the three threat-model tiers below. The task ships tier 1
by default; tier 2 is a follow-up phase; tier 3 is a different project.

| Tier | Boundary | What it defends against | Effort |
|---|---|---|---|
| **1 — ABI confinement** (default scope) | CEK never passes through the WASM↔JS ABI; zeroized on session close | Accidental leaks via V8 heap, logs, telemetry, JSON.stringify, unsophisticated dependency attacks (hooked fetch) | ~2-3 weeks |
| **2 — Hardened ABI confinement** (follow-up phase) | Tier 1 + host-import allowlist, memory-page locking where supported, leak-detection tests, panic-free zeroize | Sophisticated malicious dependency that knows where to look in linear memory | +2-3 weeks |
| **3 — Process-level confinement** (different project) | Separate subprocess with restricted IPC, or consumer-side TEE | Compromised Node process | Months; new architecture |

**This task scopes tiers 1 + 2.** Tier 3 is captured in the "Out of
scope" section as a pointer to a future architecture review.

## Current state verified (code reading, 2026-05-18)

| Surface | Where CEK lives today | After this task |
|---|---|---|
| Generation (encrypt) | `dashPackager.ts:265-270` — `crypto.randomBytes(16)` in JS | Rust `getrandom` inside `cenc-encrypt::encrypt_track` entry point |
| Passing to segment WASM (encrypt) | `dashPackager.ts:283-309` — `cek_b64` JSON command field on every segment | Internal to WASM; one `Zeroizing<[u8; 16]>` field, no ABI crossing |
| Lit Action call (encrypt) | `chipotle-client.ts` — JS fetch to proxy | WASM host import `http_post(url, body) -> response`; orchestration in Rust |
| ECDH envelope unwrap (decrypt) | `chipotle-client.ts::recoverCEKViaEnvelope` — JS-side P-256 keygen + AES-CBC unwrap | WASM `decrypt_session_open` allocates ephemeral key, calls Lit, unwraps internally; CEK never returns |
| Long-lived custody (decrypt) | `media.ts:632,650-657` — `session.cekBase64` held for playback session | Opaque `u32` session handle in JS; CEK in a Rust-side `SessionTable` keyed by handle |
| Passing to segment WASM (decrypt) | `media.ts:653-657` — `session.cekBase64` on every segment | Handle passed; CEK looked up inside WASM |
| Zeroize | Spotty — Rust crates zeroize their local copies; JS-side base64 string is GC'd whenever V8 decides | Explicit `decrypt_session_close(handle)` zeroizes; leak-detection test in CI |
| Ephemeral P-256 private key | `media.ts` generates via `crypto.subtle.generateKey` | Rust `p256::ecdh::EphemeralSecret` inside session record; public key returned for Lit call, private never crosses ABI |
| PKP signing on encrypt | In Lit TEE — unchanged | Unchanged |
| Composite hash computation | TEE — unchanged | Unchanged |

The crypto primitives are already in WASM (`crates/cenc-encrypt`,
`crates/cenc-decrypt`). What moves in is **orchestration**, not algorithms.

## The architecture

```
WASM module owns:
  - CEK generation (getrandom, AES-128 for media, AES-256 for non-media)
  - KID generation (getrandom, 16 or 32 bytes)
  - Ephemeral P-256 keypair (decrypt side, per-session)
  - HTTP call to Lit proxy (one host import: http_post)
  - ECDH envelope parse + unwrap
  - PSSH JSON assembly (uses crates/cenc-encrypt/src/pssh.rs)
  - Composite hash verification (post-Lit decrypt response)
  - Session table: handle -> { cek, eph_private_key, kid, created_at }
  - Segment encrypt + decrypt (already there)

WASM exports to JS (new):
  encrypt_track(
    plaintext_segments: bytes,
    authority: str, pkp_id: str, action_cid: str,
    chain_id: u32, rpc: str
  ) -> {
    kid: hex,
    pssh_box: bytes,           # ready for in-moov + root injection
    protection_data_json: str, # for MPD <cenc:pssh> sibling
    encrypted_init: bytes,
    encrypted_segments: bytes[],
  }
  # CEK lives for the duration of the call only, zeroized on return.

  decrypt_session_open(
    protection_data_json: str,
    session_bundle_json: str,    # delegation + request bundle from media.ts
    pkp_id: str,
    action_cid: str
  ) -> session_handle: u32       # opaque; rejects if Lit returns no CEK
  # CEK + ephemeral key stored in WASM session table, never returned.

  decrypt_segment(
    handle: u32,
    encrypted_bytes: bytes,
    init_segment: bytes        # for tenc IV size lookup
  ) -> cleartext_bytes: bytes
  # CEK is looked up by handle internally.

  decrypt_session_close(handle: u32) -> ()
  # Zeroizes CEK + ephemeral key; removes handle. Idempotent.

WASM host imports (new):
  http_post(
    url_ptr: *u8, url_len: u32,
    body_ptr: *u8, body_len: u32,
    out_status_ptr: *u32,
    out_body_ptr: **u8,
    out_body_len: *u32
  ) -> error_code: i32
  # The ONLY new attack surface. Bounded by URL allowlist (Lit proxy URL
  # constant); body is opaque to the host.
```

JS-side after the change:

```ts
// Encrypt
const result = await wasmRuntime.encryptTrack(plaintextSegments, {
  authority, pkpId, actionCid, chainId, rpc,
});
// result.kid, result.psshBox, result.encryptedInit, result.encryptedSegments
// CEK is never in scope here.

// Decrypt
const handle = await wasmRuntime.decryptSessionOpen(
  protectionDataJson, sessionBundleJson, pkpId, actionCid,
);
// ... per segment ...
const cleartext = await wasmRuntime.decryptSegment(handle, encryptedBytes, initSeg);
// ... on session end ...
await wasmRuntime.decryptSessionClose(handle);
```

`session.cekBase64` field is **deleted**. `chipotle-client.ts`
`recoverCEKViaEnvelope()` and the `executeLitAction()` JS path
**delete** (for the media path; the non-media file-encryption path keeps
the JS-side route until a separate task moves it too — see "Phasing").

## Why this is safe

| # | Change | Read by our code? | Consequence if shipped |
|---|---|---|---|
| 1 | New WASM exports for orchestrated encrypt/decrypt | Yes — new caller path in `dashPackager.ts` and `media.ts` | Safe. Old paths kept under a feature flag during rollout. |
| 2 | Delete `session.cekBase64` field | Yes — `media.ts:632,650-657` | Replaced by opaque handle. Behavioural parity verified by integration test (same MPD + same input → same cleartext output, byte-equal). |
| 3 | New `http_post` host import | No production code today — net-new | Locked to Lit proxy URL constant (`LIT_ACTION_PROXY_URL` from `chipotle-client.ts`). Allowlist enforced host-side, NOT WASM-side, so a compromised WASM cannot reach arbitrary hosts. |
| 4 | Delete `recoverCEKViaEnvelope` from JS | Yes — `media.ts`, `storage.ts` use it | Replaced by `decrypt_session_open`. Non-media path (`storage.ts`) keeps the JS route in Phase 1; migrated in Phase 4. |
| 5 | Move PKP/ECDH crypto into Rust | No — same primitives, same wire format | The on-wire ECDH envelope shape is unchanged (`CHIPOTLE_V3_PROTOCOL.md` §5 is the contract). Rust + JS implementations both consume the same Lit response. |
| 6 | Session lifecycle: explicit `close()` | Adds discipline | Leak-detection test asserts handle count drops to zero after expected session ends. |

**Additional safety guarantees:**

- **No on-wire protocol changes.** The Lit Action call, the proxy
  contract, the v3.0 protection data JSON, the ECDH envelope format
  (`CHIPOTLE_V3_PROTOCOL.md` §5-§6) are all unchanged. This task moves
  WHERE the CEK lives, not WHAT it is or HOW it travels over the
  network.
- **No Lit Action changes.** The `universal-encrypt-chipotle.js` /
  `universal-decrypt-chipotle.js` files (and their pinned CIDs) are
  untouched.
- **No PSSH payload changes.** Coordinates cleanly with
  `MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE` which only touches box
  placement, not payload.
- **No supernode provision changes.** `LEGACY_NON_MEDIA_ACTION_CIDS`,
  `UNIVERSAL_*_CID` constants, and the Ed25519-signed provision envelope
  flow are untouched.
- **Backwards-compatible rollout** via feature flag
  (`WASM_CEK_CUSTODY=1`) — old JS path remains available until the new
  one passes a soak test in staging.

## Requirements

### Must-have (Tier 1 — ABI confinement)

1. **Encrypt path** (`crates/cenc-encrypt`):
   - New entry point `encrypt_track(...)` that generates CEK + KID,
     assembles PSSH, calls the Lit encrypt action via `http_post`, encrypts
     all segments, and returns everything **except** the CEK.
   - CEK is held in `Zeroizing<[u8; 16]>` (or 32) for the duration of the
     call only.
   - `dashPackager.ts` calls the new entry point; old per-segment WASM
     calls and JS-side CEK generation are gone for media.
2. **Decrypt path** (`crates/cenc-decrypt`):
   - New session table behind opaque `u32` handles.
   - `decrypt_session_open` does ephemeral P-256 keygen, builds session
     bundle, calls Lit decrypt via `http_post`, unwraps envelope, stores
     CEK + ephemeral key in the session record, returns handle.
   - `decrypt_segment(handle, ...)` looks up CEK by handle and decrypts.
   - `decrypt_session_close(handle)` zeroizes and removes the record.
   - `media.ts` uses handles; `session.cekBase64` field deleted.
3. **Host import contract** (one new host import, tightly bounded):
   - Signature: `http_post(url, body) -> (status, response_bytes)`.
   - Host-side URL allowlist: only `LIT_ACTION_PROXY_URL` is permitted.
     Any other URL returns an error to WASM. Allowlist is enforced in
     the JS host shim, not in WASM.
   - Request body is opaque to the host (pass-through bytes).
   - Response body is returned to WASM verbatim; host does not parse.
   - Timeout enforced host-side (30 s default).
4. **Zeroize discipline**:
   - All `Drop` impls on session records call `zeroize()` on CEK and
     ephemeral key material.
   - Session table close path is idempotent.
   - A `cargo test` asserts post-drop memory is zero for both fields.
5. **JS surface deletions** (media path only in Phase 1):
   - `session.cekBase64` field — gone.
   - `recoverCEKViaEnvelope()` — gone from the media call path
     (`media.ts`); the function may remain exported for `storage.ts`
     until Phase 4.
   - `executeLitAction()` for the media decrypt call — gone.
   - Any logging of `cekHex`, `cekBase64`, `cekB64` — already absent per
     `CHIPOTLE_V3_PROTOCOL.md` §11; re-grep to confirm.

### Must-have (Tier 2 — Hardened ABI confinement, follow-up phase)

6. **Host-import hardening**:
   - URL allowlist enforced via a build-time constant, not a runtime
     setting (no env override).
   - Response body size cap (16 MB) to prevent OOM via crafted Lit
     response.
   - Request body sanity check (must be valid UTF-8 JSON; rejected
     otherwise so a buggy WASM can't exfiltrate raw memory).
7. **Memory-page locking where supported**:
   - On Linux, `mlock` the WASM linear memory pages holding session
     records. Best-effort; log a warning if unsupported (macOS, sandbox
     contexts) but do not fail.
8. **Leak-detection test in CI**:
   - Long-running test opens N sessions, runs M segment decrypts, closes
     them, asserts the session table is empty and a probe of the
     allocator reports no leaked Zeroizing buffers.
9. **Panic-free zeroize**:
   - All session-table mutations are panic-safe (no half-zeroized
     state). Use `catch_unwind` on the WASM boundary so a panic doesn't
     skip the drop chain.

### Opportunistic

10. **CEK custody audit doc** under `docs/core/` enumerating every
    surface the CEK can reach, before and after. Becomes the
    authoritative reference for future hardening reviews.

### Deferred (out of scope here, captured for follow-up)

- Non-media file encryption path (`storage.ts`) — same migration, but
  the file-encryption flow has different chunking and session shape; do
  it as a separate task once the media path is stable.
- Tier 3 (process-level confinement) — separate architectural review.
- Moving cleartext sample handoff into WASM (i.e. WASM owns MediaSource
  via a host import) — much bigger surface; not in scope.

## Implementation Plan

### Phase 1 — Encrypt-side orchestration in WASM

- [ ] Add `http_post` host import shim in
      `pc2-node/src/services/wasm/runtime.ts` (or wherever
      `executeCENCEncrypt` lives). Allowlist `LIT_ACTION_PROXY_URL` only.
      30 s timeout, 16 MB response cap.
- [ ] Add `encrypt_track` entry point in `crates/cenc-encrypt/src/lib.rs`:
      orchestrates CEK/KID gen → Lit call → segment encrypt → return.
      CEK in `Zeroizing<[u8; 16]>` for call duration.
- [ ] Reuse existing `crates/cenc-encrypt/src/pssh.rs::build_elacity_pssh`
      for the PSSH box; coordinate placement with
      `MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE` Phase 1.
- [ ] Wire `dashPackager.ts::packageDASH` to the new entry point behind
      `WASM_CEK_CUSTODY=1` feature flag. Old path stays available under
      flag-off.
- [ ] Delete JS-side `crypto.randomBytes(16)` for CEK and the per-segment
      `cek_b64` plumbing when flag is on.
- [ ] Integration test: identical input → byte-equal output between flag
      on and flag off. Asserts behavioural parity.

### Phase 2 — Decrypt-side session table in WASM

- [ ] Add session table in `crates/cenc-decrypt/src/session.rs` (new
      file): `HashMap<u32, SessionRecord>` with `Zeroizing` fields and a
      `Drop` impl.
- [ ] Add `decrypt_session_open` / `decrypt_segment` / `decrypt_session_close`
      entry points to `crates/cenc-decrypt/src/lib.rs::process()` (or as
      separate exports).
- [ ] Move ECDH envelope unwrap from JS into Rust (port
      `chipotle-client.ts::recoverCEKViaEnvelope` to Rust using the
      `p256` and `aes` crates already in the workspace).
- [ ] Move ephemeral P-256 keygen into the session-open path.
- [ ] Wire `media.ts:630-657` to handles when flag is on; remove
      `session.cekBase64` field and `initSegments` cache reshape if
      needed (init segments now flow through the session table too).
- [ ] Integration test: full segment-by-segment playback session with
      handle lifecycle; verify cleartext output is byte-equal to the
      pre-change path.

### Phase 3 — Tier 2 hardening

- [ ] Host-import URL allowlist becomes a build-time constant; remove
      any runtime override path.
- [ ] Response body size cap + request body sanity check.
- [ ] `mlock` linear memory pages on Linux (best-effort, log on
      unsupported platforms).
- [ ] Leak-detection test in CI.
- [ ] `catch_unwind` boundary on session-mutating exports.

### Phase 4 — Migrate non-media path (separate PR, optional within this task)

- [ ] Mirror Phase 1+2 for `storage.ts` non-media encrypt/decrypt.
- [ ] Delete `recoverCEKViaEnvelope()` and `executeLitAction()` from JS
      entirely once both call sites are migrated.
- [ ] Delete `chipotle-client.ts` Lit-call surface (keep proxy URL
      constant for the WASM host-import allowlist).

### Phase 5 — Docs

- [ ] Update `docs/core/CHIPOTLE_V3_PROTOCOL.md`:
  - §3 (Encryption Flow) and §4 (Decryption Flow) — diagrams now show
    WASM as the orchestrator; JS only sees handles and ciphertext.
  - §8 (Execution Transport) — Lit proxy is called from WASM via host
    import, not from `chipotle-client.ts`.
  - §11 (Security Properties) — add explicit "CEK ABI confinement"
    property with the honest threat-model statement from this task.
  - §13 (File Map) — update file roles.
- [ ] Create `docs/core/CEK_CUSTODY_AUDIT.md` with the before/after
      surface enumeration from this task's "Current state verified"
      section.
- [ ] Cross-link from `WASM-CRYPTO-HARDENING` task.

## Acceptance Criteria

1. `npm run build` + `cargo build --release --target wasm32-*` — no errors.
2. `npm test` + `cargo test` — all passing including new session-table,
   zeroize-on-drop, and leak-detection tests.
3. **CEK surface audit** (hard requirement): `grep -rn 'cek\|CEK' pc2-node/src/`
   returns only:
   - Comments and log lines that explicitly note the CEK is opaque
     (length / SHA-prefix only — same rule as today per §11).
   - Type definitions for the WASM handle and the host-import shim.
   - **Zero** references to `cekBase64`, `cekHex`, raw CEK strings, or
     CEK-bearing function parameters in the media path.
4. **Behavioural parity** (hard requirement): for a fixed input video and
   fixed Lit response, `WASM_CEK_CUSTODY=0` and `WASM_CEK_CUSTODY=1`
   produce byte-identical packaged init segments, byte-identical
   encrypted segments, and byte-identical cleartext on decrypt.
5. **Host-import allowlist test**: a unit test attempts `http_post` to
   a non-allowlisted URL and asserts an error is returned to WASM (and
   no network call is made from the host).
6. **Zeroize-on-drop test**: a unit test allocates a session, captures a
   pointer to the CEK field, calls `decrypt_session_close`, and asserts
   the memory is zero (or has been freed, depending on allocator
   behaviour — use a custom test allocator).
7. **Leak-detection test**: 1000 open/close cycles report zero leaked
   handles and zero leaked Zeroizing buffers.
8. **End-to-end smoke**: full mint → play → CEK decrypt cycle on a
   fresh workspace passes with `WASM_CEK_CUSTODY=1` set in
   `pc2-node/.env.test`.
9. **Lit proxy contract unchanged**: capture the HTTP request body sent
   to the proxy under both flags; they must be byte-identical (proves
   no wire-level regression).
10. **Honest threat-model statement** is present in
    `CHIPOTLE_V3_PROTOCOL.md` §11 and `CEK_CUSTODY_AUDIT.md`, using the
    wording locked in the "Honest threat-model statement" section above.

## Files Modified (planned)

| File | Change |
|---|---|
| `pc2-node/src/services/wasm/runtime.ts` | Add `http_post` host import with URL allowlist + timeout + size cap. |
| `pc2-node/src/services/media/dashPackager.ts` | Behind feature flag: replace JS-side CEK gen + per-segment WASM calls with single `encrypt_track` call. Old path retained until flag flips. |
| `pc2-node/src/api/media.ts` | Behind feature flag: replace `session.cekBase64` + `recoverCEKViaEnvelope` + per-segment decrypt WASM calls with session-handle API. |
| `pc2-node/src/api/chipotle-client.ts` | Mark `recoverCEKViaEnvelope` and `executeLitAction` deprecated; keep usable until Phase 4. |
| `pc2-node/crates/cenc-encrypt/src/lib.rs` | New `encrypt_track` entry point + orchestration. |
| `pc2-node/crates/cenc-decrypt/src/lib.rs` | New session-handle exports + ECDH unwrap orchestration. |
| `pc2-node/crates/cenc-decrypt/src/session.rs` | **NEW** — session table, Zeroize impls, lifecycle. |
| `pc2-node/crates/cenc-decrypt/src/ecdh_unwrap.rs` | **NEW** — port of `recoverCEKViaEnvelope` to Rust. |
| `docs/core/CHIPOTLE_V3_PROTOCOL.md` | §3, §4, §8, §11, §13 updates per Phase 5. |
| `docs/core/CEK_CUSTODY_AUDIT.md` | **NEW** — before/after surface enumeration. |

## Files Created

| File | Purpose |
|---|---|
| `pc2-node/crates/cenc-decrypt/src/session.rs` | Session table behind opaque handles, Zeroize-on-drop. |
| `pc2-node/crates/cenc-decrypt/src/ecdh_unwrap.rs` | Rust port of ECDH envelope unwrap (P-256 + AES-CBC-256). |
| `pc2-node/tests/wasm/cek-custody-parity.test.ts` | Byte-equal parity assertion between `WASM_CEK_CUSTODY=0` and `=1`. |
| `pc2-node/tests/wasm/host-import-allowlist.test.ts` | URL allowlist enforcement. |
| `pc2-node/crates/cenc-decrypt/tests/session_lifecycle.rs` | Open/close/leak detection + zeroize-on-drop. |
| `docs/core/CEK_CUSTODY_AUDIT.md` | Authoritative CEK surface reference. |

## Testing Strategy

- **Rust unit (new)**: session table CRUD, zeroize-on-drop with custom
  allocator probe, ECDH unwrap round-trip against a fixed Lit response
  fixture, panic-safety on the session-mutating exports.
- **JS unit (new)**: host-import allowlist enforcement, timeout, size
  cap behaviour.
- **Integration (new)**: behavioural-parity test fixture — same input,
  same Lit mock, byte-equal output under both flag values.
- **CEK-surface grep gate** in CI: a script that fails the build if any
  new file under `pc2-node/src/` introduces a reference to raw CEK
  material in the media path.
- **Leak-detection** in CI: 1000-cycle open/close test.
- **End-to-end smoke**: existing media smoke matrix re-run with flag on.
- **Lit-wire-equality** test: capture HTTP body sent to proxy under
  both flags, assert byte-equal.

## Out of scope (explicitly)

- Non-media file encryption (`storage.ts`) path — Phase 4 is optional
  within this task; can be split.
- Tier 3 (process-level confinement) — separate architectural project.
- Moving cleartext sample handoff into WASM — much bigger surface; not
  in scope.
- Changes to the Lit Action source files or their CIDs.
- Changes to the supernode provision envelope or the Ed25519 signing
  chain.
- Changes to the v3.0 protection data JSON schema or the ECDH envelope
  wire format (`CHIPOTLE_V3_PROTOCOL.md` §5-§6).
- Changes to the Chipotle proxy or its URL.

## Risks flagged

1. **Host-import is the new attack surface.** A bug in the allowlist
   or in the size/timeout caps undoes the security argument. Mitigation:
   build-time constant URL, hardcoded caps, dedicated allowlist test in
   CI, code-review gate on any change to `runtime.ts` host imports.
2. **WASM panics in session-mutating paths could skip zeroize.**
   Mitigation: `catch_unwind` boundary in Phase 3; panic-free invariants
   asserted by tests.
3. **Memory growth from leaked handles.** A bug in lifecycle management
   = held CEKs forever. Mitigation: leak-detection test + a 1-hour
   handle TTL with automatic close.
4. **Feature-flag rollout complexity.** Maintaining two code paths
   doubles surface temporarily. Mitigation: time-box the parallel
   period to 2 sprints max; delete old path immediately after soak.
5. **Lit proxy unavailability surfaces differently.** Today a fetch
   error is a JS exception; in WASM it's an `http_post` error code.
   Mitigation: define a structured error enum at the WASM boundary and
   map to the existing user-facing error messages.
6. **Reading the linear memory is still possible.** The honest
   threat-model statement (above) addresses this; it must not be quietly
   walked back during implementation. PR reviewers gate on the wording
   being intact in §11.
7. **The non-media path drifts during the media-only Phase 1.** During
   Phases 1-3 the two paths use different CEK-custody models. Mitigation:
   commit to Phase 4 within the same release cycle, or explicitly
   document the dual model.

## Scheduling / release target

- **Not in v1.2.x** — feature scope locked.
- **Target: v1.3 (Tier 1 + Tier 2)** for media path. Non-media migration
  (Phase 4) optionally in v1.3.x, otherwise v1.4.
- Blocks on: threat-model tier sign-off (see "Decision required" above).
  Implementation should NOT start until the tier is locked in writing.

## Notes

- The Lit Action TEE-side architecture is **completely unchanged**.
  This task only moves WHERE on the caller side the CEK is held; the
  TEE still produces the same response in the same format.
- The on-IPFS data shape (PSSH JSON, MPD, init segment) is unchanged.
  Co-shipped with `MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE` which
  touches box placement, not payload.
- The feature flag (`WASM_CEK_CUSTODY=1`) is a short-lived rollout
  scaffold, not a long-term operator dial. Delete after soak.
- **Decision artifact**: pin the chosen threat-model tier (1, 1+2, or 3)
  in this task's status header before any code lands. Default proposed:
  Tier 1 + Tier 2 in this task; Tier 3 deferred to a separate
  architectural review.
- **Coordination with `WASM-CRYPTO-HARDENING`**: that task likely already
  defines the Zeroize patterns and the test allocator we need. Reuse,
  don't reinvent.
