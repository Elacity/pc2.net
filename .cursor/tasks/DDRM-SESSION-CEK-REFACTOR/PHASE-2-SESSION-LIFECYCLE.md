# Phase 2: Client — Session Token Flow

**Status**: Not started
**Estimated effort**: ~2 hours
**Depends on**: Phase 1 (BackendSessionService endpoints live)
**Files**: `pc2-node/frontend/pc2-secure-view-session.js`, `pc2-node/frontend/pc2-secure-view.js`

---

## Context

With backend sessions, the client no longer generates or stores cryptographic key material.
The browser's only responsibility is:

1. Authenticate with the PC2 backend to get a delegation payload (backend generates the P-256 keypair).
2. Have the user's wallet sign the delegation — this is the ownership proof that binds the wallet
   address to the server-side session key. The Lit Action verifies this same signature independently.
3. Submit the wallet signature to the backend → receive an opaque bearer token.
4. Store the bearer token in IndexedDB; include it as `Authorization: Bearer <token>` on all
   subsequent content requests.
5. On delegation expiry: call `/lit/renew-session` → wallet re-signs → new token.

No WASM module is needed. No private key material ever enters the browser.

**Future**: ddrm WASM will gain P-256 support, enabling a browser to resume a server-generated P-256
session locally (client-side signing + ECDH from the WASM module). The server exports the P-256 seed
at that point. This is explicitly out of scope for this phase.

**Session ownership proof**: the delegation canonical JSON contains `ownerAddress` (the user's wallet)
and `sessionPublicKey` (the backend P-256 public key). The wallet signature over this payload is the
cryptographic proof that `ownerAddress` authorises `sessionPublicKey`. The bearer token is a
server-side lookup convenience layered on top of this proof — it does not replace it.

---

## Session state (in-memory, `pc2-secure-view.js`)

```js
var sessionState = {
  bootstrapped:     false,
  bootstrapPromise: null,
  token:            null,  // opaque bearer token string
  sessionId:        null,  // = sessionPublicKey hex (P-256 uncompressed, 0x04...)
  ownerAddress:     null,  // from PC2 auth context
  expiresAt:        null,  // unix seconds
};
```

---

## Implementation

### 1. `pc2-secure-view-session.js` — replace with token-only helpers

The bulk of the old session file (keypair generation, WASM helpers, ECDH, `signRequest`,
`unwrapEnvelope`) is removed. What remains:

```js
(function (globalScope) {
  'use strict';

  var DB_NAME    = 'pc2-secure-view';
  var STORE_SESS = 'session';
  var TOKEN_SLOT = 'current';

  // ── IndexedDB helpers (unchanged) ────────────────────────────────────────

  function idbOpen() { /* same as before */ }
  function idbGet(store, key) { /* same as before */ }
  function idbSet(store, key, value) { /* same as before */ }
  function idbDel(store, key) { /* same as before */ }

  // ── Token persistence ────────────────────────────────────────────────────

  function persistSession(sessionRecord) {
    // sessionRecord: { token, sessionId, expiresAt }
    return idbSet(STORE_SESS, TOKEN_SLOT, sessionRecord);
  }

  function loadSession() {
    return idbGet(STORE_SESS, TOKEN_SLOT).then(function (rec) {
      if (!rec || !rec.token) return null;
      var now = Math.floor(Date.now() / 1000);
      if (rec.expiresAt && rec.expiresAt <= now) return null;  // expired
      return rec;
    });
  }

  function clearSession() {
    return idbDel(STORE_SESS, TOKEN_SLOT);
  }

  globalScope.PC2SecureViewSession = {
    persistSession:  persistSession,
    loadSession:     loadSession,
    clearSession:    clearSession,
  };

}(typeof globalThis !== 'undefined' ? globalThis : window));
```

---

### 2. `pc2-secure-view.js` — session creation and token storage

Replace `runDelegationFlow` with `runSessionFlow`. The wallet is asked to sign the delegation
payload exactly once. On renewal (delegation expired), only a fresh wallet signature is needed —
no new keypair, no page reload.

```js
/**
 * Full session creation flow:
 *  1. POST /lit/begin-session  → { sessionId, delegationCanonical }
 *  2. wallet.personal_sign(delegationCanonical) → delegationSig
 *  3. POST /lit/complete-session { sessionId, delegationSig } → { token, expiresAt }
 *  4. Persist { token, sessionId, expiresAt } in IndexedDB
 */
function runSessionFlow(ownerAddress) {
  return fetch('/lit/begin-session', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    // ownerAddress resolved server-side from PC2 auth context; send chainId only.
    body: JSON.stringify({ chainId: DEFAULT_CHAIN_ID }),
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var sessionId         = data.sessionId;
    var delegationCanonical = data.delegationCanonical;

    // Wallet signs the delegation — this establishes ownership.
    return walletPersonalSign(ownerAddress, delegationCanonical)
      .then(function (delegationSig) {
        return fetch('/lit/complete-session', {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, delegationSig: delegationSig }),
        });
      })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        return SVS.persistSession({
          token:     result.token,
          sessionId: result.sessionId,
          expiresAt: result.expiresAt,
        });
      });
  });
}

/**
 * Renew an existing session after delegation expiry.
 * Same keypair — only a fresh wallet signature is required. No wallet prompt for the keypair.
 */
function runRenewalFlow(sessionId, ownerAddress) {
  return fetch('/lit/renew-session', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId, chainId: DEFAULT_CHAIN_ID }),
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    return walletPersonalSign(ownerAddress, data.delegationCanonical);
  })
  .then(function (delegationSig) {
    return fetch('/lit/complete-session', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, delegationSig: delegationSig }),
    });
  })
  .then(function (r) { return r.json(); })
  .then(function (result) {
    return SVS.persistSession({
      token:     result.token,
      sessionId: result.sessionId,
      expiresAt: result.expiresAt,
    });
  });
}
```

---

### 3. `pc2-secure-view.js` — bootstrap

Replace `tryRestoreSession` + `runDelegationFlow` with a single `bootstrap` function:

```js
function bootstrap(ownerAddress) {
  if (sessionState.bootstrapPromise) return sessionState.bootstrapPromise;
  sessionState.bootstrapPromise = SVS.loadSession()
    .then(function (stored) {
      if (stored) {
        // Valid stored token — no wallet interaction needed.
        sessionState.token     = stored.token;
        sessionState.sessionId = stored.sessionId;
        sessionState.expiresAt = stored.expiresAt;
        sessionState.bootstrapped = true;
        return;
      }
      // No stored session or expired — full creation flow (one wallet prompt).
      return runSessionFlow(ownerAddress).then(function () {
        return SVS.loadSession();
      }).then(function (fresh) {
        sessionState.token     = fresh.token;
        sessionState.sessionId = fresh.sessionId;
        sessionState.expiresAt = fresh.expiresAt;
        sessionState.bootstrapped = true;
      });
    });
  return sessionState.bootstrapPromise;
}
```

---

### 4. `pc2-secure-view.js` — Authorization header on content requests

The `signRequest` handler (called by iframes via `pc2_secureView_sign`) changes completely.
The client no longer signs anything — it just returns the session token so the server can act:

```js
// Handle pc2_secureView_sign message from iframe
window.addEventListener('message', function (evt) {
  if (!evt.data || evt.data.type !== 'pc2_secureView_sign') return;

  bootstrap(sessionState.ownerAddress).then(function () {
    // Return the bearer token — server uses it to look up the session and sign the request.
    evt.source.postMessage({
      type:      'pc2_secureView_sign_response',
      token:     sessionState.token,
      sessionId: sessionState.sessionId,
    }, evt.origin);
  }).catch(function (err) {
    evt.source.postMessage({ type: 'pc2_secureView_sign_response', error: String(err) }, evt.origin);
  });
});
```

The `Authorization: Bearer <token>` header is applied by the content player / iframe before
making API requests to `/api/media/init` or `/api/storage/*`.

---

### 5. `pc2-secure-view.js` — delegation expiry recovery

Check `expiresAt` before returning the token. If within a grace window (e.g., 60 s),
pre-emptively renew:

```js
function getTokenOrRenew(ownerAddress) {
  var now = Math.floor(Date.now() / 1000);
  var GRACE = 60;
  if (sessionState.expiresAt && sessionState.expiresAt - now < GRACE) {
    // Delegation about to expire — renew (one wallet prompt for the new sig).
    sessionState.bootstrapPromise = null;  // force re-bootstrap after renewal
    return runRenewalFlow(sessionState.sessionId, ownerAddress).then(function () {
      return SVS.loadSession();
    }).then(function (fresh) {
      sessionState.token     = fresh.token;
      sessionState.sessionId = fresh.sessionId;
      sessionState.expiresAt = fresh.expiresAt;
      return sessionState.token;
    });
  }
  return Promise.resolve(sessionState.token);
}
```

---

## Checklist

- [ ] `pc2-secure-view-session.js` rewritten — only `persistSession`, `loadSession`, `clearSession`; all keypair/WASM/signing code removed
- [ ] `pc2-secure-view.js` `runSessionFlow` added — `/lit/begin-session` → wallet sign → `/lit/complete-session` → persist token
- [ ] `pc2-secure-view.js` `runRenewalFlow` added — `/lit/renew-session` → wallet sign → `/lit/complete-session` → persist token
- [ ] `pc2-secure-view.js` `bootstrap` replaces `tryRestoreSession` + `runDelegationFlow`
- [ ] `pc2_secureView_sign` handler returns `{ token, sessionId }` (no delegation bundle)
- [ ] `getTokenOrRenew` handles pre-emptive renewal within 60 s of expiry
- [ ] `/lit/begin-session` POST no longer sends `sessionPublicKey`, `actionIpfsId`, or `coveredAddresses`
- [ ] Manual browser test: full flow — session created, token stored in IndexedDB, content plays
- [ ] Manual browser test: page reload — token loaded from IndexedDB, no wallet prompt
- [ ] Manual browser test: delegation expiry — wallet prompted for renewal sig only (no new keypair)
