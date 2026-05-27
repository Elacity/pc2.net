/**
 * PC2 Secure-View Manager — parent-frame token bookkeeper.
 *
 * Backend owns the P-256 session keypair. The parent frame:
 *   1. Calls /lit/begin-session to obtain a delegation payload.
 *   2. Asks the user's wallet to `personal_sign` it (one prompt at session
 *      start — the cryptographic binding between wallet and server-side
 *      session key).
 *   3. Posts the signature to /lit/complete-session and receives an opaque
 *      bearer token.
 *   4. Persists the token in IndexedDB and hands it out to iframes via the
 *      `pc2_secureView_sign` RPC; iframes attach it as `sessionToken` /
 *      `Authorization: Bearer` on content requests.
 *   5. Pre-emptively renews via /lit/renew-session before delegation expiry
 *      (one fresh wallet sig — same server keypair, new timestamps + nonce).
 *
 * No keypair, no canonical-JSON signing, no ECDH unwrap in the browser. The
 * CEK lives only in Node heap inside BackendSessionView.
 */
(function initParentSecureView(globalScope) {
  'use strict';

  var LOG_TAG = '[PC2 SecureView]';
  function log()  { try { console.log.apply(console, [LOG_TAG].concat([].slice.call(arguments))); } catch (_) {} }
  function warn() { try { console.warn.apply(console, [LOG_TAG].concat([].slice.call(arguments))); } catch (_) {} }

  if (globalScope.pc2SecureView) {
    log('already initialized; skipping');
    return;
  }

  var SVS = globalScope.PC2SecureViewSession;
  if (!SVS) {
    warn('PC2SecureViewSession not loaded; secure-view disabled.');
    globalScope.pc2SecureView = {
      ensureSession: function () { return Promise.reject(new Error('PC2SecureViewSession not loaded')); },
      signRequest:   function () { return Promise.reject(new Error('PC2SecureViewSession not loaded')); },
      revoke:        function () { return Promise.resolve(); },
    };
    return;
  }

  // Seconds of grace before delegation expiry — pre-emptive renewal kicks
  // in when the cached token is within this window of expiry.
  var RENEWAL_GRACE_SECONDS = 60;
  var DEFAULT_CHAIN_ID = 8453;

  var EXTERNAL_WALLET_METHODS = ['metamask', 'walletconnect', 'coinbase'];

  /**
   * In-memory cache of the active session. Hydrated from IndexedDB at
   * bootstrap; cleared on renewal failures or wallet changes.
   */
  var sessionState = {
    bootstrapped:     false,
    bootstrapPromise: null,
    token:            null, // opaque bearer string from /complete-session
    sessionId:        null, // P-256 publicKey hex (server-issued)
    ownerAddress:     null, // wallet address that authorised the session
    expiresAt:        null, // unix seconds — matches delegation.expiresAt
  };

  // ── Wallet integration (unchanged from the keypair-era design) ──────────

  function isEmbeddedLogin() {
    var method = (globalScope.user && globalScope.user.login_method)
      || (globalScope.localStorage && globalScope.localStorage.getItem('pc2_login_method'))
      || '';
    if (EXTERNAL_WALLET_METHODS.indexOf(method) >= 0) return false;
    return true;
  }

  function getExternalProvider() {
    var p = globalScope.ethereum;
    if (!p) return null;
    if (p.isPC2WalletBridge) return p._underlying || null;
    return p;
  }

  function walletPersonalSign(canonical, signerAddr) {
    if (isEmbeddedLogin()) {
      log('walletPersonalSign: routing via embedded (Particle) provider');
      if (typeof globalScope.pc2RouteRpcToParticle !== 'function') {
        return Promise.reject(new Error('Embedded wallet not ready (pc2RouteRpcToParticle missing)'));
      }
      return globalScope.pc2RouteRpcToParticle('personal_sign', [canonical, signerAddr]);
    }
    log('walletPersonalSign: routing via external provider (window.ethereum)');
    var provider = getExternalProvider();
    if (!provider || typeof provider.request !== 'function') {
      return Promise.reject(new Error('No external wallet provider available'));
    }
    return provider.request({ method: 'personal_sign', params: [canonical, signerAddr] });
  }

  function getSignerAddress() {
    if (globalScope.user && globalScope.user.wallet_address) {
      return Promise.resolve(globalScope.user.wallet_address);
    }
    if (isEmbeddedLogin()) {
      if (typeof globalScope.pc2RouteRpcToParticle === 'function') {
        return globalScope.pc2RouteRpcToParticle('eth_accounts', []).then(function (accs) {
          return Array.isArray(accs) && accs.length ? accs[0] : null;
        });
      }
      return Promise.resolve(null);
    }
    var provider = getExternalProvider();
    if (!provider || typeof provider.request !== 'function') return Promise.resolve(null);
    return provider.request({ method: 'eth_accounts', params: [] }).then(function (accs) {
      if (Array.isArray(accs) && accs.length) return accs[0];
      return provider.request({ method: 'eth_requestAccounts', params: [] }).then(function (r2) {
        return Array.isArray(r2) && r2.length ? r2[0] : null;
      });
    });
  }

  function getAuthToken() {
    try {
      if (globalScope.auth_token) return globalScope.auth_token;
      if (globalScope.localStorage) {
        return globalScope.localStorage.getItem('auth_token') || '';
      }
    } catch (_) {}
    return '';
  }

  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    var token = getAuthToken();
    if (token && !opts.headers['Authorization']) {
      opts.headers['Authorization'] = 'Bearer ' + token;
    }
    if (!opts.credentials) opts.credentials = 'include';
    return globalScope.fetch(url, opts);
  }

  // ── Wallet prompt UX (external wallets only) ────────────────────────────
  //
  // EverlastingOS-class bug guard: when the user signs a delegation via an
  // external wallet (MetaMask / WalletConnect / Coinbase), the only cue is
  // the wallet's own popup. If the popup is blocked, sits in another window,
  // or is dismissed unread, the bundle never builds and every subsequent
  // open returns session_token_required — the user has no idea what went
  // wrong. We surface a bottom-right corner toast so the page itself cues
  // "your wallet is waiting on you" without a backdrop takeover.

  function describeWallet() {
    var loginMethod = ((globalScope.user || {}).login_method
      || (globalScope.localStorage && globalScope.localStorage.getItem('pc2_login_method'))
      || '').toLowerCase();
    if (loginMethod === 'metamask') return 'MetaMask';
    if (loginMethod === 'walletconnect') return 'your wallet app';
    if (loginMethod === 'coinbase') return 'Coinbase Wallet';
    return 'your wallet';
  }

  function showPromptOverlay(titleText) {
    if (isEmbeddedLogin()) return null;
    if (typeof globalScope.pc2ShowLoginStatusOverlay !== 'function') return null;
    var walletLabel = describeWallet();
    var overlay = globalScope.pc2ShowLoginStatusOverlay({
      id: 'pc2-secureview-delegation-overlay',
      title: titleText,
      message: 'Check ' + walletLabel + ' — one signature unlocks paid content.',
      hint: '',
      position: 'corner',
    });
    var t1 = setTimeout(function () {
      if (overlay && overlay.update) overlay.update({ hint: 'Still waiting — open ' + walletLabel + ' to approve.' });
    }, 8000);
    var t2 = setTimeout(function () {
      if (overlay && overlay.update) overlay.update({ hint: 'If your wallet didn’t prompt, the popup may have been blocked.' });
    }, 20000);
    return {
      hide: function () {
        clearTimeout(t1); clearTimeout(t2);
        if (overlay && overlay.hide) overlay.hide();
      },
    };
  }

  // ── Backend session lifecycle ───────────────────────────────────────────

  /**
   * Validate that a signer address resolved from the wallet matches what
   * the server expects from the PC2-authenticated session. Throws on
   * mismatch — bootstrap will be retried once the wallet selection is
   * corrected.
   */
  function resolveSignerOrThrow(expectedOwnerAddress) {
    return getSignerAddress().then(function (signerAddr) {
      if (!signerAddr) throw new Error('No wallet account available for signing');
      if (
        expectedOwnerAddress &&
        String(signerAddr).toLowerCase() !== String(expectedOwnerAddress).toLowerCase()
      ) {
        throw new Error('Wallet account does not match authenticated PC2 session');
      }
      return signerAddr;
    });
  }

  /**
   * /lit/complete-session — submit a wallet signature, receive bearer token.
   * Persists the result to IndexedDB and updates `sessionState`.
   */
  function completeSession(sessionId, delegationSig) {
    return authFetch('/api/storage/lit/complete-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, delegationSig: delegationSig }),
    }).then(function (resp) {
      log('completeSession: status=' + resp.status);
      if (!resp.ok) {
        return resp.text().then(function (body) { throw new Error('complete-session failed: ' + resp.status + ' ' + body); });
      }
      return resp.json();
    }).then(function (result) {
      sessionState.token     = result.token;
      sessionState.sessionId = result.sessionId;
      sessionState.expiresAt = result.expiresAt;
      return SVS.persistSession({
        token:     result.token,
        sessionId: result.sessionId,
        expiresAt: result.expiresAt,
      }).then(function () { return result; });
    });
  }

  /**
   * Full session creation flow:
   *   1. POST /lit/begin-session         → { sessionId, delegationCanonical }
   *   2. wallet.personal_sign(canonical) → delegationSig
   *   3. POST /lit/complete-session      → { token, expiresAt }
   *   4. Persist { token, sessionId, expiresAt } to IndexedDB.
   */
  function runSessionFlow(expectedOwnerAddress) {
    log('runSessionFlow: POST /api/storage/lit/begin-session');
    return authFetch('/api/storage/lit/begin-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId: DEFAULT_CHAIN_ID }),
    }).then(function (resp) {
      log('runSessionFlow: begin-session status=' + resp.status);
      if (!resp.ok) throw new Error('begin-session failed: ' + resp.status);
      return resp.json();
    }).then(function (data) {
      var sessionId = data && data.sessionId;
      var canonical = data && data.delegationCanonical;
      if (!sessionId || !canonical) throw new Error('begin-session returned invalid payload');

      sessionState.sessionId = sessionId;
      return resolveSignerOrThrow(expectedOwnerAddress).then(function (signerAddr) {
        sessionState.ownerAddress = signerAddr;
        log('runSessionFlow: requesting personal_sign (wallet prompt expected)…');
        var overlay = showPromptOverlay('Approve secure-view session');
        return walletPersonalSign(canonical, signerAddr).then(function (delegationSig) {
          if (overlay) overlay.hide();
          log('runSessionFlow: delegation signed, completing session');
          return completeSession(sessionId, delegationSig);
        }).catch(function (err) {
          if (overlay) overlay.hide();
          throw err;
        });
      });
    });
  }

  /**
   * Renew an existing session — same keypair, fresh delegation. Wallet
   * signs again (single prompt); no new keypair generation server-side.
   */
  function runRenewalFlow(sessionId, expectedOwnerAddress) {
    log('runRenewalFlow: POST /api/storage/lit/renew-session');
    return authFetch('/api/storage/lit/renew-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, chainId: DEFAULT_CHAIN_ID }),
    }).then(function (resp) {
      log('runRenewalFlow: renew-session status=' + resp.status);
      if (!resp.ok) throw new Error('renew-session failed: ' + resp.status);
      return resp.json();
    }).then(function (data) {
      var canonical = data && data.delegationCanonical;
      if (!canonical) throw new Error('renew-session returned invalid payload');
      return resolveSignerOrThrow(expectedOwnerAddress).then(function (signerAddr) {
        sessionState.ownerAddress = signerAddr;
        log('runRenewalFlow: requesting personal_sign for renewed delegation…');
        var overlay = showPromptOverlay('Renew secure-view session');
        return walletPersonalSign(canonical, signerAddr).then(function (delegationSig) {
          if (overlay) overlay.hide();
          return completeSession(sessionId, delegationSig);
        }).catch(function (err) {
          if (overlay) overlay.hide();
          throw err;
        });
      });
    });
  }

  /**
   * Idempotent bootstrap. Concurrent callers collapse into one promise so
   * the wallet is never prompted twice for the same session creation.
   * Resolves once `sessionState.token` is populated.
   */
  function bootstrap() {
    if (sessionState.bootstrapped && sessionState.token) {
      return Promise.resolve(sessionState);
    }
    if (sessionState.bootstrapPromise) {
      log('bootstrap: re-using in-flight bootstrap promise');
      return sessionState.bootstrapPromise;
    }

    log('bootstrap: hydrating from IndexedDB…');
    sessionState.bootstrapPromise = SVS.loadSession()
      .then(function (stored) {
        if (stored && stored.token) {
          log('bootstrap: restored cached token (no wallet prompt needed)');
          sessionState.token     = stored.token;
          sessionState.sessionId = stored.sessionId;
          sessionState.expiresAt = stored.expiresAt;
          return sessionState;
        }
        log('bootstrap: no usable cached token — running full session flow');
        return runSessionFlow(null);
      })
      .then(function () {
        sessionState.bootstrapped = true;
        sessionState.bootstrapPromise = null;
        return sessionState;
      })
      .catch(function (err) {
        warn('bootstrap: failed:', err && err.message);
        sessionState.bootstrapPromise = null;
        throw err;
      });
    return sessionState.bootstrapPromise;
  }

  /**
   * Return a valid token; renew pre-emptively if the cached one is within
   * `RENEWAL_GRACE_SECONDS` of expiry. Callers should treat the resolved
   * value as a fresh bearer token good for at least the grace window.
   */
  function getTokenOrRenew() {
    return bootstrap().then(function () {
      var now = Math.floor(Date.now() / 1000);
      var exp = sessionState.expiresAt || 0;
      if (exp && exp - now < RENEWAL_GRACE_SECONDS) {
        log('getTokenOrRenew: delegation within grace window — renewing');
        sessionState.bootstrapPromise = null;
        return runRenewalFlow(sessionState.sessionId, sessionState.ownerAddress).then(function () {
          return sessionState.token;
        });
      }
      return sessionState.token;
    });
  }

  /**
   * Iframe RPC handler (`pc2_secureView_sign`) — invoked by
   * pc2-wallet-bridge.js. With backend sessions, the parent frame no longer
   * signs anything; it just hands back the current bearer token so the
   * iframe can attach it to its API requests.
   *
   * Returns `{ token, sessionId }`. Keeps the `signRequest` name for
   * backward compatibility with `window.pc2SecureView.signRequest` callers.
   *
   * Accepts `{ refresh: true }` to force a hard reset: clears the cached
   * token (memory + IndexedDB) and re-bootstraps. Iframes call this after
   * a 401 `session_token_invalid` — the in-memory backend session may
   * have been lost across a server restart while the browser kept its
   * stale IndexedDB token.
   */
  function signRequest(params) {
    var refresh = !!(params && params.refresh);
    var prep;
    if (refresh) {
      log('signRequest: refresh requested — clearing cached token');
      prep = revoke();
    } else {
      prep = Promise.resolve();
    }
    return prep.then(function () {
      return getTokenOrRenew();
    }).then(function (token) {
      return { token: token, sessionId: sessionState.sessionId };
    });
  }

  /**
   * Local revoke: clear the cached token and IndexedDB record. There is no
   * server-side revoke for backend sessions (the token is the only way to
   * use the session; deleting it suffices). Legacy /revoke-session is no
   * longer wired up.
   */
  function revoke() {
    sessionState.bootstrapped     = false;
    sessionState.bootstrapPromise = null;
    sessionState.token            = null;
    sessionState.sessionId        = null;
    sessionState.ownerAddress     = null;
    sessionState.expiresAt        = null;
    return SVS.clearSession();
  }

  globalScope.pc2SecureView = {
    ensureSession: bootstrap,
    signRequest:   signRequest,
    revoke:        revoke,
    getToken:      getTokenOrRenew,
    getState:      function () {
      return {
        token:        sessionState.token,
        sessionId:    sessionState.sessionId,
        ownerAddress: sessionState.ownerAddress,
        expiresAt:    sessionState.expiresAt,
      };
    },
  };
  log('ready (parent secure-view manager installed)');
})(typeof window !== 'undefined' ? window : globalThis);
