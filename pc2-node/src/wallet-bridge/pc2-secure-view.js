/**
 * PC2 Secure-View Manager — Parent-frame owner of the Option C
 * session-key delegation.
 *
 * Lives in the PC2 parent (top) frame alongside pc2-wallet-bridge.js.
 * Owns:
 *   1. The non-extractable P-256 ephemeral key (via PC2SecureViewSession).
 *   2. The 24h delegation signed by the user's wallet (one prompt at
 *      session start, ZERO prompts on subsequent asset opens).
 *   3. A silent per-asset signRequest({ kid }) called from iframes via
 *      window.ethereum.request({ method: 'pc2_secureView_sign' })
 *      handled by pc2-wallet-bridge.js.
 *
 * This file is the architectural counterpart of viewer.js's old
 * bootstrapSession() — moved out of the iframe so:
 *   - Wallet prompts only ever come from the top frame (works with
 *     wallet extensions that block iframe prompts).
 *   - Per-asset opens are silent ("double-click to open" UX).
 *   - One session covers all secure-view consumers (viewer, creator,
 *     future apps) on this PC2 origin.
 */
(function initParentSecureView(globalScope) {
  'use strict';

  var LOG_TAG = '[PC2 SecureView]';
  function log() { try { console.log.apply(console, [LOG_TAG].concat([].slice.call(arguments))); } catch (_) { } }
  function warn() { try { console.warn.apply(console, [LOG_TAG].concat([].slice.call(arguments))); } catch (_) { } }

  if (globalScope.pc2SecureView) {
    log('already initialized; skipping');
    return;
  }

  var SVS = globalScope.PC2SecureViewSession;
  if (!SVS) {
    warn('PC2SecureViewSession not loaded; secure-view disabled.');
    globalScope.pc2SecureView = {
      ensureSession: function () { return Promise.reject(new Error('PC2SecureViewSession not loaded')); },
      signRequest: function () { return Promise.reject(new Error('PC2SecureViewSession not loaded')); },
      revoke: function () { return Promise.resolve(); },
    };
    return;
  }

  var EXTERNAL_WALLET_METHODS = ['metamask', 'walletconnect', 'coinbase'];

  // In-memory session cache; on first call we hydrate from IndexedDB
  // (so reloads + new tabs reuse the same delegation until expiry).
  var sessionState = {
    bootstrapped: false,
    bootstrapPromise: null,
    delegationRecord: null, // { delegation, delegationCanonical, delegationSig, sessionPublicKey, ownerAddress, expiresAt }
    keyPair: null, // CryptoKeyPair (P-256, private key non-extractable)
  };

  function isEmbeddedLogin() {
    var method = (globalScope.user && globalScope.user.login_method)
      || (globalScope.localStorage && globalScope.localStorage.getItem('pc2_login_method'))
      || '';
    if (EXTERNAL_WALLET_METHODS.indexOf(method) >= 0) return false;
    return true;
  }

  // Locate the EIP-1193 provider for external wallets. We deliberately
  // do NOT do EIP-6963 here: pc2-wallet-bridge.js already discovers the
  // user's chosen provider and (for non-embedded login) the bridge's
  // own personal_sign path is reused below — but only by going through
  // window.ethereum. The user picks once at login; we follow that pick.
  function getExternalProvider() {
    var p = globalScope.ethereum;
    if (!p) return null;
    if (p.isPC2WalletBridge) {
      // Defensive: if the bridge installed itself as window.ethereum
      // (it shouldn't in the parent), reach through to the underlying
      // provider so we don't recurse.
      return p._underlying || null;
    }
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
    } catch (_) { }
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

  /**
   * Restore an existing session from IndexedDB if still valid.
   * Resolves to the cached state, or null if no usable session exists.
   */
  function tryRestoreSession() {
    log('tryRestoreSession: loading delegation from IndexedDB…');
    return SVS.getActiveDelegation().then(function (active) {
      if (!active) {
        log('tryRestoreSession: no active delegation (or expired)');
        return null;
      }
      log('tryRestoreSession: delegation found, expiresAt=' + active.expiresAt + ' actionIpfsId=' + active.delegation.actionIpfsId);

      // Cache-ownership gate. Server-side /secure-view refuses any
      // request whose delegation.ownerAddress does not match the
      // authenticated session. If the user logged out and back in
      // under a different wallet, the IndexedDB delegation is stale
      // and every non-media open will 403. Detect the mismatch here,
      // purge the cache, and let ensureSession() re-bootstrap under
      // the current wallet. Fall through on unknown current wallet
      // (window.user not populated yet) — the server 403 is still the
      // final authority.
      var currentWallet = (globalScope.user && globalScope.user.wallet_address) || '';
      var cachedOwner = (active.delegation && active.delegation.ownerAddress) || '';
      if (currentWallet && cachedOwner && currentWallet.toLowerCase() !== cachedOwner.toLowerCase()) {
        warn('tryRestoreSession: cached delegation owner does not match current session — purging (cached=' + cachedOwner.substring(0, 10) + '… current=' + currentWallet.substring(0, 10) + '…)');
        return SVS.revokeSession({}).then(function () { return null; });
      }

      // Action-CID staleness gate. The Lit Action self-checks
      //   del.actionIpfsId === jsParams.actionIpfsId
      // inside the TEE, so a delegation cached against a now-rotated
      // action CID will fail every secure-view call with the cryptic
      // "Lit Action denied" error until the delegation expires
      // (potentially months). Detect the mismatch up-front by asking
      // the server which CID it's bound to, purge the cache, and let
      // ensureSession() re-bootstrap with the current CID.
      // Fail-open: if /server-info is unreachable we keep the cache
      // and let the server be the final authority.
      var cachedActionCid = (active.delegation && active.delegation.actionIpfsId) || '';
      return authFetch('/api/storage/lit/server-info', { method: 'GET' })
        .then(function (resp) { return resp && resp.ok ? resp.json() : null; })
        .catch(function () { return null; })
        .then(function (serverInfo) {
          var serverActionCid = (serverInfo && serverInfo.actionCid) || '';
          if (serverActionCid && cachedActionCid && serverActionCid !== cachedActionCid) {
            warn('tryRestoreSession: cached delegation actionIpfsId is stale — purging (cached=' + cachedActionCid.substring(0, 12) + '… server=' + serverActionCid.substring(0, 12) + '…)');
            return SVS.revokeSession({}).then(function () { return null; });
          }
          return active;
        })
        .then(function (validatedActive) {
          if (!validatedActive) return null;
          return SVS.loadSessionKey().then(function (kp) {
            if (!kp) {
              log('tryRestoreSession: delegation present but session keypair missing — will re-delegate');
              return null;
            }
            log('tryRestoreSession: restored cached session (no wallet prompt needed)');
            sessionState.delegationRecord = validatedActive;
            sessionState.keyPair = kp;
            return sessionState;
          });
        });
    });
  }

  /**
   * Run the one-time delegation flow:
   *   1. Generate ephemeral P-256 key (private key non-extractable).
   *   2. POST sessionPublicKey to /lit/begin-session.
   *   3. personal_sign the canonical delegation with the user's wallet.
   *   4. POST { delegation, delegationSig } to /lit/complete-session.
   *   5. Persist key + delegation in IndexedDB.
   */
  function runDelegationFlow() {
    log('runDelegationFlow: generating ephemeral P-256 keypair…');
    return SVS.createEphemeralKey().then(function (kp) {
      log('runDelegationFlow: POST /api/storage/lit/begin-session');
      return authFetch('/api/storage/lit/begin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionPublicKey: kp.sessionPublicKey }),
      }).then(function (resp) {
        log('runDelegationFlow: begin-session status=' + resp.status);
        if (!resp.ok) throw new Error('begin-session failed: ' + resp.status);
        return resp.json();
      }).then(function (data) {
        var delegation = data && data.delegation;
        var canonical = data && data.delegationCanonical;
        if (!delegation || !canonical) throw new Error('begin-session returned invalid payload');
        var ownerAddress = delegation.ownerAddress;
        log('runDelegationFlow: resolving signer address (embedded=' + isEmbeddedLogin() + ', ownerAddress=' + ownerAddress + ')…');

        return getSignerAddress().then(function (signerAddr) {
          log('runDelegationFlow: signer resolved: ' + signerAddr);
          if (!signerAddr) throw new Error('No wallet account available for signing');
          if (String(signerAddr).toLowerCase() !== String(ownerAddress).toLowerCase()) {
            throw new Error('Wallet account does not match authenticated PC2 session');
          }
          log('runDelegationFlow: requesting personal_sign (wallet prompt expected)…');

          // EverlastingOS-class bug guard: when the user signs the one-time
          // 24h delegation via an EXTERNAL wallet (MetaMask / WalletConnect /
          // Coinbase), the only cue is the wallet's own popup. If the popup
          // is blocked, sits in another window, or is dismissed unread, the
          // bundle never builds and every subsequent open returns
          // session_bundle_required — the user has no idea what went wrong.
          //
          // We surface a parent-frame BOTTOM-RIGHT corner toast (same visual
          // pattern as buildWalletConnectPanel in UIWindowParticleSigning,
          // and as the email-login signature overlay from #21) so the page
          // itself cues "your wallet is waiting on you" — without a backdrop
          // takeover. For external wallets the wallet popup is already in
          // the browser-extension area (outside the page) or another window
          // entirely, so a fullscreen backdrop would add visual noise without
          // adding visibility. Embedded (Particle email/social) login already
          // gets forced-attention UI from UIWindowParticleSigning (centered
          // iframe + backdrop), so we deliberately skip the overlay there to
          // avoid stacking two cues on top of one another.
          //
          // Cleanup is mandatory on BOTH success and failure so a rejected /
          // cancelled signature never leaves a frozen overlay behind.
          var external = !isEmbeddedLogin();
          var loginMethod = ((globalScope.user || {}).login_method
            || (globalScope.localStorage && globalScope.localStorage.getItem('pc2_login_method'))
            || '').toLowerCase();
          var walletLabel = loginMethod === 'metamask' ? 'MetaMask'
            : loginMethod === 'walletconnect' ? 'your wallet app'
              : loginMethod === 'coinbase' ? 'Coinbase Wallet'
                : 'your wallet';

          var overlay = null;
          var hintTimer1 = null;
          var hintTimer2 = null;
          if (external && typeof globalScope.pc2ShowLoginStatusOverlay === 'function') {
            overlay = globalScope.pc2ShowLoginStatusOverlay({
              id: 'pc2-secureview-delegation-overlay',
              title: 'Approve secure-view session',
              message: 'Check ' + walletLabel + ' \u2014 one signature unlocks paid content for 24h.',
              hint: '',
              position: 'corner',
            });
            hintTimer1 = setTimeout(function () {
              if (overlay && overlay.update) {
                overlay.update({ hint: 'Still waiting \u2014 open ' + walletLabel + ' to approve.' });
              }
            }, 8000);
            hintTimer2 = setTimeout(function () {
              if (overlay && overlay.update) {
                overlay.update({ hint: 'If your wallet didn\u2019t prompt, the popup may have been blocked.' });
              }
            }, 20000);
          }
          function clearOverlay() {
            if (hintTimer1) { clearTimeout(hintTimer1); hintTimer1 = null; }
            if (hintTimer2) { clearTimeout(hintTimer2); hintTimer2 = null; }
            if (overlay && overlay.hide) { overlay.hide(); overlay = null; }
          }

          return walletPersonalSign(canonical, signerAddr).then(function (delegationSig) {
            clearOverlay();
            log('runDelegationFlow: delegation signed, POST /api/storage/lit/complete-session');
            return authFetch('/api/storage/lit/complete-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ delegation: canonical, delegationSig: delegationSig }),
            }).then(function (resp) {
              log('runDelegationFlow: complete-session status=' + resp.status);
              if (!resp.ok) throw new Error('complete-session failed: ' + resp.status);
              var record = {
                delegation: delegation,
                delegationCanonical: canonical,
                delegationSig: delegationSig,
                sessionPublicKey: kp.sessionPublicKey,
                ownerAddress: ownerAddress,
                expiresAt: delegation.expiresAt,
              };
              return Promise.all([
                SVS.saveSessionKey(kp.keyPair),
                SVS.persistDelegation(record),
              ]).then(function () {
                log('runDelegationFlow: session persisted to IndexedDB');
                sessionState.keyPair = kp.keyPair;
                sessionState.delegationRecord = record;
                return sessionState;
              });
            });
          }).catch(function (err) {
            // Cancelled / rejected / timed-out signature, or network failure
            // during complete-session. Tear down the overlay before
            // bubbling so the user isn't stuck behind a frozen modal.
            clearOverlay();
            throw err;
          });
        });
      });
    });
  }

  /**
   * Idempotent session bootstrap. Subsequent calls reuse the cached
   * promise so concurrent iframe requests collapse into a single
   * wallet prompt.
   */
  function ensureSession() {
    if (sessionState.bootstrapped && sessionState.delegationRecord && sessionState.keyPair) {
      return Promise.resolve(sessionState);
    }
    if (sessionState.bootstrapPromise) {
      log('ensureSession: re-using in-flight bootstrap promise');
      return sessionState.bootstrapPromise;
    }

    log('ensureSession: bootstrapping…');
    sessionState.bootstrapPromise = tryRestoreSession()
      .then(function (restored) { return restored || runDelegationFlow(); })
      .then(function (state) {
        log('ensureSession: bootstrap complete');
        sessionState.bootstrapped = true;
        sessionState.bootstrapPromise = null;
        return state;
      })
      .catch(function (err) {
        warn('ensureSession: bootstrap failed:', err && err.message);
        sessionState.bootstrapPromise = null;
        throw err;
      });

    return sessionState.bootstrapPromise;
  }

  /**
   * Sign a per-asset SecureViewRequest. Called by pc2-wallet-bridge.js
   * in response to pc2_secureView_sign RPC from iframes. Returns
   * { delegation, delegationSig, request, requestSig } — exactly the
   * canonical strings the server-side verifier expects.
   *
   * NOTE: actionIpfsId is bound into the delegation server-side, so we
   * always use the value from the persisted delegation, ignoring any
   * value the iframe might pass. This prevents an iframe from being
   * tricked into requesting a different action.
   */
  function signRequest(params) {
    if (!params || !params.kid) {
      return Promise.reject(new Error('signRequest requires kid'));
    }
    log('signRequest: kid=' + params.kid);
    return ensureSession().then(function (state) {
      var rec = state.delegationRecord;
      var kp = state.keyPair;
      if (!rec || !kp) throw new Error('Secure-view session not initialized');
      log('signRequest: signing request with ephemeral P-256 (actionIpfsId=' + rec.delegation.actionIpfsId + ')');
      return SVS.signRequest(kp, {
        kid: params.kid,
        actionIpfsId: rec.delegation.actionIpfsId,
      }).then(function (signed) {
        log('signRequest: bundle ready');
        return {
          delegation: rec.delegationCanonical,
          delegationSig: rec.delegationSig,
          request: signed.requestCanonical,
          requestSig: signed.requestSig,
        };
      });
    });
  }

  /**
   * Revoke the current session locally and tell the server to
   * blocklist the delegation nonce.
   */
  function revoke() {
    return SVS.revokeSession({
      serverRevokeUrl: '/api/storage/lit/revoke-session',
      fetch: function (url, opts) { return authFetch(url, opts); },
    }).then(function () {
      sessionState.bootstrapped = false;
      sessionState.bootstrapPromise = null;
      sessionState.delegationRecord = null;
      sessionState.keyPair = null;
    });
  }

  globalScope.pc2SecureView = {
    ensureSession: ensureSession,
    signRequest: signRequest,
    revoke: revoke,
    // Inspector for debugging / session indicator UI:
    getActiveDelegation: function () {
      return SVS.getActiveDelegation();
    },
  };
  log('ready (parent secure-view manager installed)');
})(typeof window !== 'undefined' ? window : globalThis);
