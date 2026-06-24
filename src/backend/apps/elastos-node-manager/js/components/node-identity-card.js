/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/node-identity-card.js — always-on "who is this node on-chain"
 * card for the Dashboard pane. (Beta 3.14 — see below for the truth-
 * correction the previous beta.3.13 copy needed.)
 *
 * Surfaces two concepts the operator needs in one glance:
 *
 *   1. Node public key (consensus signing identity)
 *        Always shown when a keystore exists. Monospace, copiable.
 *        Operators paste this into Elastos Essentials to register a
 *        producer (the Essentials wallet there signs the deposit tx
 *        AND becomes the owner of the producer entry). Without a
 *        public key, a producer cannot be registered — this is the
 *        most important value on the card.
 *
 *   2. Node signing address (derived from the keystore)
 *        The address derived from the same keystore.dat the node
 *        uses to sign block proposals and DPoS round consensus
 *        messages. This is a CONSENSUS SIGNING IDENTITY only —
 *        it does NOT hold funds and does NOT receive BPoS rewards.
 *        We show its live balance (which will typically be 0) as a
 *        sanity check, not because it accrues anything.
 *
 *        Block rewards go to the OWNER's address — the address
 *        derived from the OwnerPublicKey in the producer-registration
 *        transaction (typically the Essentials wallet that registered
 *        this supernode). The owner claims those rewards by signing
 *        a DPoSV2ClaimReward transaction from Essentials.
 *
 *        Sources (verified against Elastos.ELA HEAD):
 *          - dpos/state/arbitrators.go:732-801 — rewards credited to
 *            getOwnerKeyStandardProgramHash(producer.OwnerPublicKey())
 *          - core/types/payload/producerinfo.go:24-35 — OwnerKey vs
 *            NodePublicKey distinction
 *          - servers/interfaces.go:2317-2347 — dposv2rewardinfo is
 *            keyed by the owner-derived stake address, not the node key
 *
 *   3. Producer summary, when registered (BPoS-only)
 *        State, vote totals (v1 + v2), deposit balance, claimable
 *        rewards. Read-only — registration, voting, and reward
 *        claiming all happen in Essentials.
 *
 *   CR Council fields are intentionally omitted per operator
 *   preference (this card is for BPoS / signing-key operators).
 *
 *   The PC2 operator-login wallet is intentionally NOT shown — it
 *   was on beta.3.13 but operator feedback was "not needed", and
 *   it conflated two distinct identities (ENM auth vs on-chain
 *   producer ownership) in a way that wasn't useful.
 *
 * Data source: GET /api/enm/system/identity (best-effort backend
 * that gracefully degrades each section to null on RPC failure).
 *
 * Polling cadence: 60s, visibility-paused. Balances + rewards
 * change on every claim/vote tx, but rarely fast enough to need
 * tighter polling.
 *
 * alpha.28 invariants preserved:
 *   - _destroyed guard on every async .then resolution
 *   - 401-suppress on background fetches (boot path owns re-auth)
 *   - Visibility-paused polling
 *   - enmCopyButton factory for every copy interaction
 *   - aria-labelledby on the card root
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 60_000;

    function NodeIdentityCard(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('EnmNodeIdentityCard: { api } required');
        }
        this.api           = opts.api;
        this.notifications = opts.notifications || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-card enm-identity-card';
        this.root.setAttribute('role', 'region');
        this._titleId = 'enm-identity-title-' + Math.random().toString(36).slice(2, 8);
        this.root.setAttribute('aria-labelledby', this._titleId);

        // Skeleton — replaced on first poll resolution.
        this.root.innerHTML =
            '<header class="enm-identity-head">'
            + '<h3 id="' + this._titleId + '">Node identity</h3>'
            + '<p class="enm-stub" style="margin:0;text-align:left;padding:0">'
            + 'Reading keystore and on-chain identity…'
            + '</p>'
            + '</header>';

        this._destroyed   = false;
        this._pollPauser  = null;
        this._pollTimer   = null;
        this._lastPayload = null;
        this._lastHtml    = null;  // v0.5.191 — render-dedup cache
    }

    NodeIdentityCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        var self = this;
        // v0.5.223 audit Phase 12 (AUDIT-FLOW-NI05, P2) — attach stale
        // indicator. Marks fresh on successful poll, stale after 30s of
        // failed polls. Pre-v0.5.223 transient errors left the card with
        // stale data + no operator-visible signal.
        if (typeof root.enmStaleIndicator === 'function') {
            this._staleIndicator = root.enmStaleIndicator(this.root, { staleAfterMs: 30000 });
        }
        this._poll();
        if (typeof root.enmUseVisibilityPause === 'function') {
            this._pollPauser = root.enmUseVisibilityPause(
                function () { self._poll(); }, POLL_INTERVAL_MS
            );
        } else {
            this._pollTimer = setInterval(function () { self._poll(); }, POLL_INTERVAL_MS);
        }
        return this;
    };

    NodeIdentityCard.prototype.refresh = function () { this._poll(); };

    NodeIdentityCard.prototype.destroy = function () {
        if (this._staleIndicator && typeof this._staleIndicator.destroy === 'function') {
            try { this._staleIndicator.destroy(); } catch (_) { /* idempotent */ }
            this._staleIndicator = null;
        }
        this._destroyed = true;
        if (this._pollPauser) {
            try { this._pollPauser.stop(); } catch (_) { /* idempotent */ }
            this._pollPauser = null;
        }
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
    };

    /** @private */
    NodeIdentityCard.prototype._poll = function () {
        var self = this;
        this.api.get('/system/identity').then(function (env) {
            if (self._destroyed) { return; }
            var payload = (env && env.data) || env || {};
            self._lastPayload = payload;
            self._render(payload);
            if (self._staleIndicator) { self._staleIndicator.markFresh(); }
        }).catch(function (err) {
            if (self._destroyed) { return; }
            // 401-suppress — boot path owns re-auth (alpha.28 batch 60-61).
            if (err && err.status === 401) { return; }
            // v0.5.223 audit Phase 12 — mark stale on non-401 errors so
            // operator sees data may not be current.
            if (self._staleIndicator) { self._staleIndicator.markStale(); }
            // Keep the last good render; only fall back to a skeleton if
            // we never had one. Avoids the card blinking on transient
            // backend hiccups.
            if (!self._lastPayload) {
                self.root.innerHTML =
                    '<header class="enm-identity-head">'
                    + '<h3 id="' + self._titleId + '">Node identity</h3>'
                    + '<p class="enm-stub" style="margin:0;text-align:left;padding:0">'
                    + 'Couldn’t read identity — retrying every 60s.'
                    + ' <button type="button" class="enm-link-button" data-action="identity-retry-now"'
                    + ' style="margin-left:6px;">Try now</button>'
                    + '</p>'
                    + '</header>';
                // v0.5.212 — wire the retry button so the operator isn't
                // locked into the 60s polling cadence after a transient
                // /system/identity failure.
                var retryBtn = self.root.querySelector('[data-action="identity-retry-now"]');
                if (retryBtn) {
                    retryBtn.addEventListener('click', function () {
                        if (self._destroyed) { return; }
                        retryBtn.disabled = true;
                        retryBtn.textContent = 'Trying…';
                        self._poll();
                    });
                }
            }
        });
    };

    /** @private — escape user-displayed strings into HTML-safe form */
    function esc(s) {
        if (s == null) { return ''; }
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[c];
        });
    }

    /** @private — format ELA balance string with thousands sep + 4-decimal cap */
    function fmtEla(value) {
        if (value == null || value === '') { return null; }
        var n = parseFloat(value);
        if (!isFinite(n)) { return null; }
        // 4 decimals max; chain returns up to 8 but the trailing zeros
        // are visual noise on the dashboard.
        var fixed = n.toFixed(4).replace(/\.?0+$/, '');
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.') + ' ELA';
    }

    /** @private — producer state → chip class + label */
    function stateChip(state) {
        if (!state) { return null; }
        var s = String(state).toLowerCase();
        var className = 'enm-identity-chip enm-identity-chip-neutral';
        if (s === 'active')      { className = 'enm-identity-chip enm-identity-chip-success'; }
        else if (s === 'pending' || s === 'returned') { className = 'enm-identity-chip enm-identity-chip-warning'; }
        else if (s === 'illegal' || s === 'inactive' || s === 'canceled') { className = 'enm-identity-chip enm-identity-chip-danger'; }
        return { className: className, label: state };
    }

    /** @private */
    NodeIdentityCard.prototype._render = function (data) {
        var ks       = data.keystore || {};
        var producer = data.producer || null;
        // beta.3.14: PC2 operator-login wallet intentionally not
        // rendered. The previous beta.3.13 row conflated ENM auth
        // identity with on-chain producer ownership and operator
        // feedback was "not needed".
        var pubkey   = ks.publicKey || null;
        var addr     = ks.address || null;
        // beta.3.15: balance line dropped from this card. The node
        // signing address never holds funds (see truth note below),
        // and the RPC method we were calling (getbalancebyaddr)
        // isn't even on the JSON-RPC interface — it's REST-only at
        // /api/v1/asset/balances/:addr. Showing "0 ELA" or "Balance
        // unavailable" added noise without information.

        // 0.5.106 audit Session 106 — flip the registration-prompt
        // copy off once the producer is registered on-chain. Pre-0.5.106
        // the header subtitle + pubkey pill + pubkey hint always told
        // the operator to "Paste this into Essentials when registering
        // your supernode" — useless prompt for someone whose producer
        // entry already exists. The post-registration view should
        // reframe the pubkey as a value to KEEP (for node migration)
        // rather than to SHARE (for first-time registration).
        var isRegistered = !!(producer && producer.state);

        // v0.5.229 (audit 2026-05-27) — Council-mode branch. Council
        // operators have a DIFFERENT registration path (CR Council
        // election via Essentials + CRCouncilMemberClaimNode TX); the
        // word "supernode" is BPoS-specific vocabulary and is wrong
        // for Council members. Branch the header subtitle and the
        // pubkey hint on isCrMember / setupRole, picking Council
        // wording when either is true.
        var crMember = data.crMember || null;
        var setupRole = data.setupRole || 'unknown';
        var isCouncilContext = (setupRole === 'council')
            || !!(crMember && crMember.isCrMember);
        var isCouncilBound = !!(crMember && crMember.isCrMember);

        var html = '';

        // ----- Header ------------------------------------------------
        var subtitle;
        if (isCouncilContext) {
            // Council operator subtitle. Three variants: bound to current
            // Committee, bound to next, or installed-but-unbound (re-claim
            // required).
            if (isCouncilBound) {
                subtitle = 'The consensus-signing identity for this node\'s '
                    + 'CR Council seat. Mining + signing activate automatically '
                    + 'when the on-chain arbiter slate rotates your slot in. '
                    + 'Keep this public key safe — it identifies your seat.';
            } else {
                subtitle = 'The consensus-signing identity this node uses on-chain. '
                    + 'Bind this public key to your <strong>CR Council seat</strong> '
                    + 'via Elastos Essentials (CRCouncilMemberClaimNode) — once the '
                    + 'binding confirms, the chain enrolls your node in the arbiter '
                    + 'slate automatically.';
            }
        } else if (isRegistered) {
            subtitle = 'The consensus-signing identity this node uses on-chain. '
                + 'Block rewards are credited to the <strong>Essentials wallet</strong> that '
                + 'registered the producer, not to anything shown on this card.';
        } else {
            subtitle = 'The consensus-signing identity this node uses on-chain. '
                + 'Paste the public key below into <strong>Elastos Essentials</strong> '
                + 'when registering as a BPoS producer — the Essentials wallet that '
                + 'signs the registration becomes the producer owner and is where '
                + 'all block rewards are credited.';
        }
        html += '<header class="enm-identity-head">'
            + '<h3 id="' + this._titleId + '">Node identity</h3>'
            + '<p class="enm-identity-subtitle">'
            + subtitle
            + '</p>'
            + '</header>';

        // ----- Node public key (only meaningful when keystore exists) -----
        // v0.5.228 — public key is the PRIMARY identity surface. It's what
        // gets shared with Essentials, what stakers vote on, and what
        // appears on every explorer. The signing address below is
        // operationally internal — useful for debugging but never
        // share-worthy. We render the pubkey with the --primary modifier
        // (larger value font, accent ring, bigger copy button) and the
        // signing address with --secondary (smaller, muted, compact) so
        // an operator's eye lands on the pubkey first by an order of
        // magnitude.
        if (ks.exists && pubkey) {
            // v0.5.229 — Council-mode pill + hint take precedence over BPoS
            // copy when the operator is in a Council context. Council seats
            // are higher-tier than BPoS slots on Elastos so we surface the
            // Council-specific copy first.
            var pubkeyPill;
            var pubkeyHint;
            if (isCouncilContext) {
                if (isCouncilBound) {
                    pubkeyPill = '<span class="enm-identity-row-pill">Bound to Council seat</span>';
                    pubkeyHint = 'This pubkey is bound to your CR Council seat. Save it if you '
                        + 'ever need to migrate the node — restoring keystore.dat preserves '
                        + 'this identity, so the Council binding stays intact without a new '
                        + 'CRCouncilMemberClaimNode TX.';
                } else {
                    pubkeyPill = '<span class="enm-identity-row-pill enm-identity-row-pill-action">Claim via Essentials</span>';
                    pubkeyHint = 'Paste this into Essentials → CR Council → Claim node. The '
                        + 'CRCouncilMemberClaimNode TX binds this public key to your CR seat; '
                        + 'once confirmed, the chain enrolls you in the arbiter slate.';
                }
            } else if (isRegistered) {
                pubkeyPill = '<span class="enm-identity-row-pill">Registered</span>';
                pubkeyHint = 'Save this if you need to migrate the node to a different server — '
                  + 'restoring keystore.dat preserves this identity, so you keep the '
                  + 'existing producer registration without re-registering.';
            } else {
                pubkeyPill = '<span class="enm-identity-row-pill enm-identity-row-pill-action">Share with Essentials</span>';
                pubkeyHint = 'Paste this into Essentials when registering as a BPoS producer. '
                  + 'The Essentials wallet signing the registration becomes the producer owner.';
            }
            html += '<div class="enm-identity-row enm-identity-pubkey-row enm-identity-row-actionable enm-identity-row--primary">'
                + '<div class="enm-identity-row-head">'
                +   '<span class="enm-identity-row-label">Node public key</span>'
                +   pubkeyPill
                +   '<span class="enm-identity-row-hint">' + pubkeyHint + '</span>'
                + '</div>'
                + '<div class="enm-identity-value-stack">'
                +   '<code class="enm-identity-value enm-identity-pubkey" data-fill="pubkey"></code>'
                +   '<span class="enm-identity-copy-slot" data-copy="pubkey" data-copy-value="' + esc(pubkey) + '"></span>'
                + '</div>'
                + '</div>';
        }

        // ----- Node signing address (keystore-derived) ------------
        // beta.3.14 truth-correction: this address is a CONSENSUS
        // SIGNING IDENTITY only. It does NOT hold funds and does
        // NOT receive BPoS rewards. Rewards go to the OwnerPublicKey-
        // derived stake address (the Essentials wallet that
        // registered the producer). Verified against Elastos.ELA
        // HEAD: dpos/state/arbitrators.go:732-801,
        // servers/interfaces.go:2317-2347.
        //
        // beta.3.39 — dropped the "DPoSV2ClaimReward transaction"
        // mechanic from the dashboard note. The dashboard isn't the
        // place to explain the on-chain reward-claim flow; that
        // belongs in the Essentials walkthrough docs. Operators
        // told us this card "doesn't look nice and shows DPoS v1
        // rewards which is not needed" — simpler copy wins.
        if (ks.exists && addr) {
            html += '<div class="enm-identity-row enm-identity-addr-row enm-identity-row-informational enm-identity-row--secondary">'
                + '<div class="enm-identity-row-head">'
                +   '<span class="enm-identity-row-label">Node signing address</span>'
                +   '<span class="enm-identity-row-pill">Internal · do not share</span>'
                +   '<span class="enm-identity-row-hint">Derived from the keystore. Signs block proposals during your producer&rsquo;s on-duty rounds. Does not hold funds and does not receive rewards.</span>'
                + '</div>'
                + '<div class="enm-identity-value-stack">'
                +   '<code class="enm-identity-value enm-identity-addr" data-fill="addr"></code>'
                +   '<span class="enm-identity-copy-slot" data-copy="addr" data-copy-value="' + esc(addr) + '"></span>'
                + '</div>'
                + '</div>';
        }

        // beta.3.14 -- operator-login wallet row dropped (was the PC2
        // session wallet from data.walletAddress; operator feedback
        // was "not needed").

        // ----- Keystore-missing helper -----------------------------
        // 0.5.106 audit Session 106 — pre-0.5.106 the copy was
        // "Keystore not generated yet. Finish the setup wizard to
        // create the producer keystore" — but the dashboard only
        // renders AFTER setup completes, so this branch always means
        // the keystore was lost AFTER setup (manual delete, disk
        // failure, restore-from-backup that skipped keystore.dat). The
        // recovery actions are different (restore vs re-setup), so the
        // copy now reflects the actual root cause + offers both paths.
        if (!ks.exists) {
            html += '<div class="enm-identity-empty">'
                + '<strong>Keystore not detected on disk.</strong> The keystore file may have '
                + 'been moved or deleted since setup completed. Restore it from a backup '
                + 'via <strong>Settings &rsaquo; Security</strong>, or — if you no longer have '
                + 'a backup and accept losing your existing on-chain producer registration — '
                + 'reset and regenerate a fresh keystore from the same Settings tab.'
                + '</div>';
        }

        // ----- Producer details (only when registered on-chain) ----
        if (producer && (producer.state || producer.votes || producer.dposv2votes)) {
            var chip = stateChip(producer.state);
            html += '<div class="enm-identity-producer">'
                + '<div class="enm-identity-producer-head">'
                +   '<span class="enm-identity-row-label">On-chain producer</span>'
                +   (chip ? '<span class="' + chip.className + '">' + esc(chip.label) + '</span>' : '')
                + '</div>'
                + '<div class="enm-identity-producer-grid">'
                +   (producer.nickname ? ('<div class="enm-identity-stat"><span class="enm-identity-stat-label">Name</span><span class="enm-identity-stat-value">' + esc(producer.nickname) + '</span></div>') : '')
                // beta.3.39 — "Votes (DPoS v1)" stat dropped. Operator
                // told us DPoS v1 references are noise on a BPoS-only
                // dashboard; the v1 protocol has been superseded since
                // the BPoS upgrade and showing the legacy total
                // misleads operators into thinking it matters.
                +   '<div class="enm-identity-stat">'
                +     '<span class="enm-identity-stat-label">BPoS votes</span>'
                +     '<span class="enm-identity-stat-value">' + esc(producer.dposv2votes || '0') + '</span>'
                +   '</div>'
                +   (producer.deposit != null ? (
                    '<div class="enm-identity-stat">'
                +     '<span class="enm-identity-stat-label">Owner stake (locked)</span>'
                +     '<span class="enm-identity-stat-value">' + esc(fmtEla(producer.deposit) || (producer.deposit + ' ELA')) + '</span>'
                +   '</div>'
                  ) : '')
                /* beta.3.15: "Claimable rewards" stat removed. The
                   actual RPC method is dposv2rewardinfo and it's keyed
                   by the OWNER address (derived from ownerpublickey
                   via PrefixDPoSV2 conversion in
                   servers/interfaces.go:2317-2347). We don't do that
                   derivation client-side yet — operator can read
                   claimable rewards directly in Essentials. */
                + '</div>'
                + '</div>';
        }

        // v0.5.191 perf — skip the rebuild when the poll produced identical
        // markup (the common steady state — the signing identity + producer
        // registration rarely change). MUST early-return before the copy-button
        // mount below, which appends (not replaces) — re-running it on unchanged
        // DOM would stack duplicate copy buttons. Every render-relevant value
        // (pubkey, addr via data-copy-value, producer state/votes/deposit) is
        // already encoded in `html`.
        if (html === this._lastHtml) { return; }
        this._lastHtml = html;
        this.root.innerHTML = html;

        // Fill long monospace values via textContent (avoid wrapping
        // them in innerHTML — they don't escape edge cases as cleanly,
        // and textContent makes copy-by-selection deterministic).
        if (pubkey) {
            var elPk = this.root.querySelector('[data-fill="pubkey"]');
            if (elPk) { elPk.textContent = pubkey; }
        }
        if (addr) {
            var elAd = this.root.querySelector('[data-fill="addr"]');
            if (elAd) { elAd.textContent = addr; }
        }

        // Mount copy buttons via the shared factory. Each slot carries
        // its value in data-copy-value (already HTML-escaped); we
        // resolve it as a function so a stale closure can't leak.
        if (typeof root.enmCopyButton === 'function') {
            var slots = this.root.querySelectorAll('.enm-identity-copy-slot');
            for (var i = 0; i < slots.length; i++) {
                (function (slot) {
                    var value = slot.getAttribute('data-copy-value') || '';
                    if (!value) { return; }
                    var btn = root.enmCopyButton({
                        value: value,
                        label: 'Copy',
                        ariaLabel: 'Copy ' + (slot.dataset.copy || 'value'),
                        notifications: null, // copy success is the visual swap; toast would be noise
                        className: 'enm-identity-copy-btn',
                    });
                    slot.appendChild(btn);
                })(slots[i]);
            }
        }
    };

    root.EnmNodeIdentityCard = NodeIdentityCard;
}(window));
