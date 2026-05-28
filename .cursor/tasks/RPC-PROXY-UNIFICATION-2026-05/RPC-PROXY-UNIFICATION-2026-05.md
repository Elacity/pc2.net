# Task: RPC Pool Unification + Proxy URL Embed

**Task ID**: RPC-PROXY-UNIFICATION-2026-05
**Created**: 2026-05-28
**Status**: Agreed
**Priority**: High

## Description

Unify pc2-node's two duplicate Base-RPC source-of-truth lists into a single
config-driven pool, and route the PSSH-embedded RPC (used by Lit Action
access checks) through pc2-node's own `/api/rpc/base` proxy when the node
is publicly reachable.

Author: implementing per Irzhy's design suggestion ("use the internal proxy
as much as possible and make the rpc candidates configurable from settings
instead of hard-coded"). Co-designed by Sash + assistant after the
2026-05-28 video-playback incident.

## Background

Two parallel hardcoded RPC lists exist in pc2-node today:

| File | Constant | Used by |
|---|---|---|
| `pc2-node/src/utils/rpc.ts` | `DEFAULT_BASE_RPC_URLS` | Server-side ethers calls + the `rpc` field embedded into media PSSH at encode time |
| `pc2-node/src/static.ts` | `BASE_RPC_URLS` | The `/api/rpc/base` JSON-RPC proxy that the frontend (Particle, Market, Creator) already uses |

Consequences:

1. Drift — fixing an RPC issue in one list silently doesn't fix the other.
2. The PSSH-embedded RPC is a *single, public, often-keyed URL with no
   fallback*. The Lit Action's `gateway.hasAccessByContentId(...)` call
   does `.catch(() => false)`, so any 4xx/5xx from that single URL is
   silently converted to `access_denied`, even when the holder is on-chain.
3. Today's incident: the Tenderly URL at index 0 of `DEFAULT_BASE_RPC_URLS`
   ran out of quota, every video-playback access check returned
   `access_denied`, and EPUB playback (which used a different code path
   for the embedded RPC) kept working — masking the regression for hours.
4. Operators have no way to point pc2-node at custom RPCs without code
   changes (`SUPERNODE_RPC_URLS` env var exists but is undocumented and
   only addresses the prepend case, not the base list).

The two-stage hot-fix already landed earlier today:
- **A** ✅ — reorder `DEFAULT_BASE_RPC_URLS` so a key-less public RPC is
  index 0 (`pc2-node/src/utils/rpc.ts`). Future encodes are unblocked.
- **B** (operational) — Irzhy rotates the dead Tenderly key so pre-fix
  PSSHs play again.

This task is the proper, durable solution Irzhy proposed.

## Requirements

1. **Single source of truth for the Base-RPC pool.**
   `static.ts`'s `/api/rpc/base` proxy reads its candidate list from
   `pc2-node/src/utils/rpc.ts` (`getBaseRpcUrls()`), not from a private
   hardcoded array. The hardcoded list inside `utils/rpc.ts` shrinks to
   a final fallback only — operators are expected to configure via
   `config.blockchain.rpc_urls`.

2. **Configurable PSSH-embedded RPC.**
   Add `config.blockchain.public_proxy_url` (optional). When set, the
   media-encode pipeline (`dashPackager.ts`) and the non-media Lit call
   path (`storage.ts`) embed this URL into PSSH/conditions instead of a
   single public RPC. Operators of publicly-reachable nodes (e.g.
   `try.pc2.net`) point this at their own `/api/rpc/base` so Lit access
   checks benefit from caching, multi-RPC fallback and supernode
   prepend. Self-hosted nodes behind NAT leave it unset and the existing
   public-RPC fallback kicks in.

3. **No Lit-Action redeploy.**
   Per Irzhy's clarification: the Lit Action takes `rpc` as a parameter,
   so the only change required is what pc2-node sends as that parameter.
   The action's silent-fail behavior (`.catch(() => false)` →
   `access_denied`) is **not in scope here** — that becomes a follow-up
   security ticket once a Lit redeploy is on the agenda.

4. **Backward compatibility.**
   Pre-existing PSSH metadata that already has a hardcoded `rpc` URL
   continues to work as before — `media.ts` reads `encData.rpc` first
   and only falls back to `getBaseRpcUrl()` when the PSSH lacks a value.
   This change does not retroactively fix PSSHs minted before the
   reorder; that's owned by Option B (key rotation).

5. **Behavioral parity when `public_proxy_url` is absent.**
   Unset = identical behavior to today's hot-fix (publicnode-first).
   Self-hosters get the resilient public fallback, no NAT problems.

## Implementation Plan

- [ ] **Config schema.** Add `public_proxy_url?: string` to
      `pc2-node/src/config/loader.ts` under `blockchain`. Document the
      operator-facing semantics in a JSDoc block above the field.
- [ ] **default.json.** Leave `public_proxy_url` unset (keyless install
      = no embedded proxy). Add a brief comment-style note in any
      operator-facing docs about how to set it.
- [ ] **`utils/rpc.ts`.** Extend `initBaseRpcPool` to accept the
      `publicProxyUrl` plumb-through. Add `getPublicProxyUrl()` returning
      `string` (empty when unset). Keep all existing exports stable.
- [ ] **`index.ts`.** Pass `config.blockchain?.public_proxy_url` to
      `initBaseRpcPool`. Log it (when set) so operators can confirm at
      startup. Compute the supernode prepend the same way as today.
- [ ] **`static.ts`.** Replace local `BASE_RPC_URLS` with a call to
      `getBaseRpcUrls()` (or accept it as a param into the proxy
      registration). Remove duplicated supernode-prepend logic — it
      already happens inside `utils/rpc.ts`. Keep the per-method TTLs
      and caching unchanged.
- [ ] **`dashPackager.ts`.** Replace the boot-time
      `const DEFAULT_RPC = process.env.DDRM_RPC || getBaseRpcUrl();`
      with a function that, **per-encode**, prefers
      `getPublicProxyUrl() || process.env.DDRM_RPC || getBaseRpcUrl()`.
      Per-encode evaluation also fixes a pre-existing bug where
      `DEFAULT_RPC` is frozen at module load and never reflects rotation.
- [ ] **`storage.ts`.** In the non-media `recoverCEKEnvelope` path
      (`effectiveRpc`), apply the same precedence
      (`getPublicProxyUrl() || getBaseRpcUrl()`).
- [ ] **`chipotle-client.ts`.** The fallback at line 1489
      (`rpc: params.rpc || getBaseRpcUrl()`) becomes
      `rpc: params.rpc || getPublicProxyUrl() || getBaseRpcUrl()` so
      that any caller forgetting to specify also benefits.
- [ ] **Lints + manual smoke.** Confirm no lint errors. Verify that with
      `public_proxy_url` unset, the pool initialization log,
      `/api/rpc/base` behavior, and PSSH `rpc` field are unchanged
      from today's hot-fix state.

## Acceptance Criteria

- [ ] `config.blockchain.public_proxy_url` is documented in the loader
      schema and accepted by `loadConfig()` without breaking existing
      configs.
- [ ] When `public_proxy_url` is unset, every existing behavior is
      preserved bit-for-bit (no regression vs. today's reorder).
- [ ] When `public_proxy_url` is set:
  - PSSH `rpc` field on newly-encoded media equals `public_proxy_url`.
  - Non-media Lit-encrypt calls embed `public_proxy_url` as the RPC.
  - The pool itself does NOT prepend the proxy URL — it's a separate
    plumb-through, used only at PSSH/Lit-call sites.
- [ ] `static.ts` no longer holds its own `BASE_RPC_URLS` constant.
      `/api/rpc/base` consumes the same list as everything else
      pc2-node-internal.
- [ ] No `console.*` left behind, no lint errors, all existing
      `getBaseRpcUrl()` callers untouched (no API breakage).

## Files to Modify

- `pc2-node/src/config/loader.ts` (schema)
- `pc2-node/src/utils/rpc.ts` (init + new getter)
- `pc2-node/src/static.ts` (drop local list, share)
- `pc2-node/src/services/media/dashPackager.ts` (per-encode RPC choice)
- `pc2-node/src/api/storage.ts` (non-media Lit RPC choice)
- `pc2-node/src/api/chipotle-client.ts` (fallback chain)
- `pc2-node/src/index.ts` (init plumb-through)

## Files to Create

None.

## Testing Strategy

- **Unit-style sanity:** boot pc2-node with no user config → confirm
  pool log shows publicnode-first, `getPublicProxyUrl()` returns empty,
  `/api/rpc/base` proxies via the same list as `getBaseRpcUrls()`.
- **Integration:** mint a fresh video → inspect the resulting PSSH JSON
  → confirm `data.rpc` matches the configured proxy URL (when set) or
  the pool's index-0 entry (when unset). Play it back to confirm the
  Lit access check succeeds.
- **Compatibility:** play back a video minted *before* this change.
  Verify the existing PSSH-embedded RPC is still honored (no override).

## Notes

- The `.catch(() => false) → access_denied` silent-fail in the Lit
  Action remains a known issue. After this task lands, even if a single
  RPC fails the proxy will fail over, so the surface area shrinks
  dramatically — but a full fix needs a Lit Action redeploy and
  belongs to a separate task with Irzhy's review.
- The reorder of `DEFAULT_BASE_RPC_URLS` from earlier today is the
  ground-state for this task; the comment block I added there documents
  *why* index 0 must be key-less and rate-tolerant. That comment stays.
- For `try.pc2.net`, the operator setting will be:
  `"public_proxy_url": "https://try.pc2.net/api/rpc/base"`.
