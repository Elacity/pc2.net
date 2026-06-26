/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/validator-registration-card.js — BPoS supernode operator
 * card for the Dashboard pane. (Beta 3 rewrite — from phase-03 mock.)
 *
 * Replaces the alpha.27 "three-step Essentials guide" card with the
 * compact .bpos-card layout from enm-design-mocks/v2/phase-03-status.html
 * (variant D, lines ~742-760). Two visual states:
 *
 *   A) Not yet registered  → .enm-bpos-head with "Action required" chip +
 *                            .enm-bpos-cta-card prompting the operator to
 *                            copy their public key, open the Essentials
 *                            guide, and wait for chain confirmation.
 *                            .enm-bpos-signing-key block holds the pubkey
 *                            in a monospace <pre>, easy to read/select.
 *
 *   B) Registered, awaiting activation → "Ready to activate" chip +
 *                            single Activate button. ENM signs the
 *                            activation tx locally with the existing
 *                            keystore — no wallet round-trip.
 *
 * Once /producer reports state Active the card hides automatically; the
 * Identity sub-tab + maintenance row carry steady-state BPoS info.
 *
 * Architectural invariant (memory: feedback_enm_wallet_identity_only) —
 * ENM NEVER asks the browser wallet to sign anything. Registration is
 * signed in Elastos Essentials mobile. Activation is signed by
 * keystore.dat on this server via ela-cli. The browser wallet is
 * identity-only for ownership + audit attribution.
 *
 * Data sources:
 *   - GET /chains/:id            → coarse chain state (must be 'healthy')
 *   - GET /chains/:id/producer   → ourPubkey, state, enabled
 *   - POST /chains/:id/bpos/activate → activation tx (chain-side signed)
 *   - Visibility-paused poll on POLL_INTERVAL_MS refreshes /producer.
 *     (Push-driven refresh via chains:<chainId>:producer was speculatively
 *     wired in BP-D but the backend never published the topic; the resulting
 *     SSE 400 took down the shared EventSource for all topics, so it was
 *     removed in 0.2.0-beta.3.1. Restoring push refresh is a post-beta
 *     backlog item, gated on the backend actually publishing the topic.)
 *
 * alpha.28 invariants preserved:
 *   - _destroyed guard on every async .then/.catch resolution
 *   - encodeURIComponent on every dynamic path segment
 *   - 401-suppress on background fetches (boot path owns re-auth)
 *   - Conflict-envelope shape validation on 409 (batch 68 pattern)
 *   - Visibility-paused polling (batch 27/28 — stops while tab hidden)
 *   - enmRunOnce wrap on the activate button (double-click safe)
 *   - 401-disable-restore finalizer pattern (batch 60)
 *   - enmCopyButton factory for the public-key copy (alpha.29 batch 96)
 *   - 24×24 minimum touch-target floor on every actionable button
 *   - aria-labelledby on the card root + aria-live on the state chip
 */

(function (root) {
    'use strict';

    var POLL_INTERVAL_MS = 30_000;
    var SHORT_POLL_MS    = 5_000;   // faster cadence while we're showing
                                    // and an imminent state flip is plausible

    // Map producer.state strings into render branches.
    // 0.2.0-beta.3.4 — phase-03 mock keeps the BPoS card PERSISTENT
    // for Active producers (with a success header + an Essentials
    // pointer note), instead of hiding it. STATE_ACTIVE is the new
    // steady-state render. STATE_HIDE remains for the cases where
    // the card legitimately shouldn't show (chain not healthy, or
    // operator isn't a BPoS node at all).
    var STATE_NEEDS_REGISTRATION = 'needs_registration';
    var STATE_NEEDS_ACTIVATION   = 'needs_activation';
    var STATE_ACTIVE             = 'active';
    var STATE_HIDE               = 'hide';

    // v0.5.229 (audit 2026-05-27) — Council branch states. CR Council
    // operators have a different on-chain registration path (via the CR
    // Committee, not via producer-register TX) and their states are NOT
    // a subset of BPoS states. Each STATE_COUNCIL_* maps to a distinct
    // render method below. Decision tree in _reconcile branches on
    // setupRole === 'council' / crMember.isCrMember first, then falls
    // back to BPoS states only when neither signal is present.
    var STATE_COUNCIL_ELECTED   = 'council_elected';   // on Committee, MemberState=Elected → producing
    var STATE_COUNCIL_INACTIVE  = 'council_inactive';  // on Committee, MemberState=Inactive
    var STATE_COUNCIL_IMPEACHED = 'council_impeached'; // on Committee, MemberState=Impeached / Returned / Terminated / Illegal
    var STATE_COUNCIL_NEXT_TERM = 'council_next_term'; // in next-term Committee (waiting for term boundary)
    var STATE_COUNCIL_UNCLAIMED = 'council_unclaimed'; // Council install, no current Committee match (e.g. operator unclaimed)
    var STATE_COUNCIL_NO_TERM   = 'council_no_term';   // Council install, Committee not in election period (between terms)

    function BposCard(opts) {
        if (!opts || !opts.api) {
            throw new TypeError('EnmBposCard: { api } required');
        }
        this.api           = opts.api;
        this.chainId       = opts.chainId || 'mainchain';
        this.notifications = opts.notifications || null;
        this.sse           = opts.sse || null;

        this.root = document.createElement('section');
        this.root.className = 'enm-bpos-card';
        this.root.hidden = true; // hidden until reconcile says "show me"
        // a11y — card-level region semantics. aria-labelledby points at
        // the head title we render in _render; aria-live="polite" on the
        // chip means a state transition (A → B) is announced once the
        // chip's text content changes.
        this.root.setAttribute('role', 'region');

        this._titleId = 'enm-bpos-title-' + Math.random().toString(36).slice(2, 8);
        this._chipId  = 'enm-bpos-chip-'  + Math.random().toString(36).slice(2, 8);

        this._renderedState = null;        // last state we rendered for
        this._lastPubkey    = null;
        this._pollIntervalMs = POLL_INTERVAL_MS;
        this._destroyed = false;
        this._pollPauser = null;
        this._pollTimer = null;
    }

    /**
     * Mount the card into the supplied parent and kick the initial
     * /producer fetch. Refreshes via the visibility-paused
     * POLL_INTERVAL_MS interval (see comment in mount body for the
     * removed SSE subscribe).
     *
     * @param {HTMLElement} parent
     * @returns {BposCard}
     */
    BposCard.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        var self = this;
        // Initial poll happens immediately; subsequent ones from the
        // visibility-paused interval below.
        this._poll();
        this._armPoll(POLL_INTERVAL_MS);

        // 0.2.0-beta.3.1 hotfix — the BP-D rewrite added a speculative
        // SSE subscribe on chains:<id>:producer, but the backend never
        // published that topic and its events route allowlist
        // (TOPIC_REGEX in routes/events.js) only accepts
        // status/logs/height. The 400 response from the shared
        // EventSource took down the whole channel (status +
        // notifications collateral damage). Push refresh stays a
        // post-beta backlog item; for now the POLL_INTERVAL_MS poll
        // armed above is the sole refresh source — adequate cadence
        // for the registration/activation state transitions this card
        // tracks (operator-driven, low frequency).
        return this;
    };

    /**
     * Force a fresh fetch of /chains/:id + /chains/:id/producer and
     * re-reconcile the card visibility. Safe to call externally
     * (technical-view's tools-gate poll re-uses the same data).
     */
    BposCard.prototype.refresh = function () {
        this._poll();
    };

    /**
     * Tear down the card, clear timers, unsubscribe from SSE, drop
     * the root element. Idempotent — safe to call twice.
     */
    BposCard.prototype.destroy = function () {
        this._destroyed = true;
        // 0.2.0-beta.3.1 hotfix — _unsubscribeProducer is gone (the SSE
        // subscribe was removed in mount(); see comment there).
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
    BposCard.prototype._armPoll = function (ms) {
        var self = this;
        if (this._pollPauser) {
            try { this._pollPauser.stop(); } catch (_) { /* idempotent */ }
            this._pollPauser = null;
        }
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
        if (typeof root !== 'undefined' && typeof root.enmUseVisibilityPause === 'function') {
            this._pollPauser = root.enmUseVisibilityPause(function () { self._poll(); }, ms);
        } else {
            this._pollTimer = setInterval(function () { self._poll(); }, ms);
        }
    };

    /** @private */
    BposCard.prototype._setPollInterval = function (ms) {
        if (this._pollIntervalMs === ms) { return; }
        this._pollIntervalMs = ms;
        this._armPoll(ms);
    };

    /** @private */
    BposCard.prototype._poll = function () {
        var self = this;
        // alpha.28.1 batch 48 — distinguish "not yet synced" (null + no
        // error flag) from "backend outage" (null + error flag). The
        // outage branch keeps the existing render rather than hiding,
        // so the operator doesn't get a false "all good" signal.
        var chainFailed = false;
        var producerFailed = false;
        var chainPath = '/chains/' + encodeURIComponent(this.chainId);
        var producerPath = chainPath + '/producer';
        // v0.5.229 — also fetch /system/identity so the card knows whether
        // this operator went through the Council install path (setupRole)
        // and whether they're a current CR Committee member (crMember).
        // Phase B added these fields; the card branches on them in
        // _reconcile to render the Council vs BPoS variant. /system/identity
        // is a hot path already polled by the dashboard's node-identity-card;
        // adding a duplicate fetch here is cheap (backend's
        // CrMembershipService caches 30s).
        var identityFailed = false;
        Promise.all([
            this.api.get(chainPath, { skipCache: true })
                .catch(function (err) {
                    // 401 = expired session; suppress operator-visible
                    // noise (boot path owns re-auth). Anything else
                    // flags as a real outage so _reconcile keeps the
                    // last-known-good UI.
                    if (!err || err.status !== 401) { chainFailed = true; }
                    return null;
                }),
            this.api.get(producerPath, { skipCache: true })
                .catch(function (err) {
                    if (!err || err.status !== 401) { producerFailed = true; }
                    return null;
                }),
            this.api.get('/system/identity', { skipCache: true })
                .catch(function (err) {
                    if (!err || err.status !== 401) { identityFailed = true; }
                    return null;
                }),
        ]).then(function (results) {
            if (self._destroyed) { return; }
            var chain    = results[0];
            var producer = results[1];
            var identity = results[2];
            if (chainFailed && producerFailed && identityFailed && !self.root.hidden) {
                // All three fetches failed — leave the last-known-good
                // render in place rather than misleading the operator
                // by hiding. The chain-card next to us already
                // surfaces the outage.
                return;
            }
            self._reconcile(chain, producer, identity);
        });
    };

    /**
     * Decide which branch (hide / not-registered / awaiting-activation)
     * to show and render it. The decision tree:
     *
     *   chain not 'healthy'                  → hide (chain-card carries it)
     *   producer.state === 'Active'          → hide (steady state, no CTA)
     *   producer.state set but not Active +
     *     producer.enabled and pubkey known  → STATE_NEEDS_ACTIVATION (B)
     *   producer.state empty/null +
     *     producer.enabled and pubkey known  → STATE_NEEDS_REGISTRATION (A)
     *
     * @private
     */
    BposCard.prototype._reconcile = function (chain, producer, identity) {
        // v0.5.210 — accept 'synced' as alive too (v0.5.203 unified the
        // backend state vocab; 'healthy' became 'synced'). Without this,
        // the BPoS card thought every alive chain was dead → producer-
        // registration UI gated wrong.
        var alive    = !!(chain && (chain.state === 'healthy' || chain.state === 'synced'));
        var pubkey   = (producer && producer.ourPubkey) || '';
        var pState   = producer && producer.state;
        var enabled  = !!(producer && producer.enabled);

        // v0.5.229 (audit 2026-05-27) — role gating. Council operators
        // arrive here with `setupRole === 'council'` AND/OR a non-null
        // crMember object from /system/identity. The card was originally
        // BPoS-only ("BPoS supernode: not yet registered"). Now it
        // branches: Council operators render Council-specific copy
        // (member state, nickname, on-duty hint); BPoS operators keep
        // the existing branches. Both can be true for the rare operator
        // who is BOTH a CR member and a BPoS producer — Council wins as
        // the primary identity since CRC arbiter slots are higher-tier
        // than BPoS slots in Elastos's DPoS rotation.
        var crMember = identity && identity.crMember;
        var setupRole = identity && identity.setupRole;
        var isCouncilContext = (setupRole === 'council')
            || !!(crMember && crMember.isCrMember);

        // Visibility gate. The card hides only when (a) chain isn't
        // alive (cards above this one already surface the outage), or
        // (b) the operator has neither a Council install nor a BPoS
        // operator role (a plain follower).
        var bposOperator = enabled || !!pubkey;
        if (!alive) { this._hideAndRest(); return; }
        if (!isCouncilContext && !bposOperator) { this._hideAndRest(); return; }

        // ----- COUNCIL BRANCH ------------------------------------------
        // Decision sub-tree for Council operators:
        //   crMember.isCrMember + state='Elected'        → COUNCIL_ELECTED
        //   crMember.isCrMember + state='Inactive'       → COUNCIL_INACTIVE
        //   crMember.isCrMember + state in {Impeached,
        //                Returned, Terminated, Illegal}  → COUNCIL_IMPEACHED
        //   crMember.isCrMember + inNextCommittee=true   → COUNCIL_NEXT_TERM
        //   setupRole='council' + no crMember matched +
        //     source='not-in-committee'                  → COUNCIL_UNCLAIMED
        //   setupRole='council' + source='no-active-
        //     committee'                                 → COUNCIL_NO_TERM
        //   setupRole='council' + source='error'         → render last-known
        //                                                  good (don't flicker)
        if (isCouncilContext) {
            this._lastCrMember = crMember || null;
            this._lastIdentity = identity;
            // v0.5.229d (P9 audit fix) — operator may be BOTH a CR Council
            // member AND a BPoS producer. Stash producer too so the
            // Council card can render the dual-role secondary line.
            this._lastProducer = producer || null;
            if (crMember && crMember.isCrMember) {
                var s = String(crMember.state || '').toLowerCase();
                if (crMember.inNextCommittee) {
                    this._show(STATE_COUNCIL_NEXT_TERM, pubkey);
                    return;
                }
                if (s === 'elected') {
                    this._show(STATE_COUNCIL_ELECTED, pubkey);
                    return;
                }
                if (s === 'inactive') {
                    this._show(STATE_COUNCIL_INACTIVE, pubkey);
                    return;
                }
                // Impeached / Returned / Terminated / Illegal → red banner.
                this._show(STATE_COUNCIL_IMPEACHED, pubkey);
                return;
            }
            // Council install, no current crMember match.
            if (crMember && crMember.source === 'no-active-committee') {
                this._show(STATE_COUNCIL_NO_TERM, pubkey);
                return;
            }
            if (crMember && crMember.source === 'error') {
                // Don't reshape on transient RPC failures. Keep the last
                // good render; the chain-card already shows the outage.
                return;
            }
            // Default Council fallback: install path but not bound to a
            // current Committee seat (most common when the operator has
            // unclaimed via Essentials, or hasn't claimed their node
            // pubkey yet via CRCouncilMemberClaimNode).
            this._show(STATE_COUNCIL_UNCLAIMED, pubkey);
            return;
        }

        // ----- BPoS BRANCH (existing behavior preserved) ---------------

        // 0.2.0-beta.3.4 — Active producer keeps the card visible with
        // a steady-state success-header render (per phase-03 mock).
        // 0.2.0-beta.3.7 — also stash the producer record so
        // _renderActive can read rank/votes/inactiveRounds and render
        // the .bpos-grid stats per phase-03 mock variant C.
        if (pState && String(pState).toLowerCase() === 'active') {
            this._lastProducer = producer;
            this._show(STATE_ACTIVE, pubkey);
            return;
        }

        // Registered but not Active → operator needs to tap Activate.
        // Registration absent → operator needs to copy their pubkey
        // and complete registration in Essentials.
        var nextState = pState
            ? STATE_NEEDS_ACTIVATION
            : STATE_NEEDS_REGISTRATION;

        // Focus continuity — if the card was hidden mid-activate and a
        // poll re-shows it, the Activate button's _runOnce finalizer
        // already restored the resting label. We only need to track
        // pubkey changes and re-render on state transitions.
        this._show(nextState, pubkey);
    };

    /** @private */
    BposCard.prototype._hideAndRest = function () {
        // a11y/focus — if the operator was focused inside the card when
        // a poll decided to hide it (e.g. on the Activate button or the
        // copy button), focus drops to body. Move it to a stable
        // landmark first so the next Tab makes sense.
        try {
            if (this.root && this.root.contains && this.root.contains(document.activeElement)) {
                var fallback = document.getElementById('enm-tech-pane-status')
                    || document.getElementById('enm-pane-dashboard')
                    || document.getElementById('enm-main');
                if (fallback && typeof fallback.focus === 'function') {
                    fallback.focus({ preventScroll: true });
                }
            }
        } catch (e) { /* DOM may not be live during teardown */ }
        this.root.hidden = true;
        // Slow back down — nothing is imminent.
        this._setPollInterval(POLL_INTERVAL_MS);
    };

    /** @private */
    BposCard.prototype._show = function (state, pubkey) {
        // Faster cadence while visible — operator is likely watching
        // for the registration / activation confirmation right now.
        this._setPollInterval(SHORT_POLL_MS);
        this.root.hidden = false;
        // v0.5.229d (P5 audit fix) — also force a re-render when the
        // underlying Council member data (impeachmentVotes, nickname
        // refresh, state flip) has changed between polls, even if the
        // bucket-level state hasn't. Pre-229d only the state-transition
        // path triggered _render; static-within-bucket changes were
        // silently dropped until something else flipped the bucket.
        // The signature compares the few fields a real-time operator
        // would care about; cheap and deterministic.
        var crMember = this._lastCrMember || null;
        var crSig = crMember
            ? (crMember.isCrMember + '|' + (crMember.state || '') + '|'
                + (crMember.impeachmentVotes || '') + '|'
                + (crMember.nickname || ''))
            : '';
        var crChanged = (crSig !== this._lastCrSig);
        if (this._renderedState !== state) {
            this._render(state);
            this._renderedState = state;
            this._lastCrSig = crSig;
        } else if (crChanged && this._renderedState
                   && String(this._renderedState).indexOf('council_') === 0) {
            // Same bucket but Council data changed — re-render to
            // reflect new nickname/state/impeachmentVotes.
            this._render(state);
            this._lastCrSig = crSig;
        } else if (state === STATE_ACTIVE) {
            // 0.2.0-beta.3.7 — when state stays ACTIVE across polls,
            // re-fill the stats grid in place. Rank/votes shift round
            // by round; pre-beta.3.7 the operator only saw the stats
            // they were rendered with on first poll until a different
            // state caused a full re-render.
            this._fillActiveStats(this._lastProducer);
        }
        if (pubkey && pubkey !== this._lastPubkey) {
            this._fillPubkey(pubkey);
            this._lastPubkey = pubkey;
        }
    };

    /**
     * Build the card body for the given state.
     *
     * State A (needs_registration):
     *   .enm-bpos-head            (accent icon + body + warn chip)
     *   .enm-bpos-cta-card        (help + copy-pubkey + open-essentials)
     *     .enm-bpos-signing-key   (pubkey <pre>)
     *   .enm-bpos-note            (info footnote, "card disappears…")
     *
     * State B (needs_activation):
     *   .enm-bpos-head            (success icon + body + ready chip)
     *   .enm-bpos-cta-card        (single Activate button)
     *
     * @private
     */
    BposCard.prototype._render = function (state) {
        // alpha.28 batch 33 — aria-labelledby points at the head-title
        // we emit inside .enm-bpos-head-body; update before innerHTML
        // is written so the AT tree sees the relation immediately.
        this.root.setAttribute('aria-labelledby', this._titleId);

        // v0.5.229 — Council branches first (CRC arbiter slots are
        // higher-tier than BPoS slots in the DPoS rotation).
        if (state === STATE_COUNCIL_ELECTED)   { this._renderCouncil('elected');   return; }
        if (state === STATE_COUNCIL_INACTIVE)  { this._renderCouncil('inactive');  return; }
        if (state === STATE_COUNCIL_IMPEACHED) { this._renderCouncil('impeached'); return; }
        if (state === STATE_COUNCIL_NEXT_TERM) { this._renderCouncil('next-term'); return; }
        if (state === STATE_COUNCIL_UNCLAIMED) { this._renderCouncil('unclaimed'); return; }
        if (state === STATE_COUNCIL_NO_TERM)   { this._renderCouncil('no-term');   return; }

        if (state === STATE_ACTIVE) {
            this._renderActive();
            return;
        }
        if (state === STATE_NEEDS_ACTIVATION) {
            this._renderActivation();
            return;
        }
        // Default (and the most common dashboard surface): not-registered.
        this._renderRegistration();
    };

    /**
     * v0.5.229 — render a Council-mode card for the 6 sub-states. Mirrors
     * the _renderActive / _renderActivation / _renderRegistration
     * structure (head + cta-card + note + sr-only pubkey span) but uses
     * Council vocabulary ("CR Council member", "CRC arbiter slot",
     * "claim node binding") instead of BPoS vocabulary ("supernode",
     * "register your supernode").
     *
     * Sub-state copy decisions:
     *   elected      — green success header, "On-duty when slot rotates in"
     *   inactive     — amber header, "Recoverable by activate-via-Essentials"
     *   impeached    — red header, terminal-ish (recovery is term-specific)
     *   next-term    — amber, "Elected, waiting for next Committee term"
     *   unclaimed    — amber, "Council install detected but pubkey not bound
     *                  on-chain — claim via Essentials"
     *   no-term      — gray, "Committee not currently in election period"
     */
    BposCard.prototype._renderCouncil = function (subState) {
        var t = root.enmTOrFallback;
        var titleId = this._titleId;
        var chipId  = this._chipId;
        var self = this;
        var cr = this._lastCrMember || null;

        // sub-state → copy + chip styling. Reused across the 6 branches
        // so the markup stays a single innerHTML template.
        var subMeta = {
            'elected':   { chipCls: 'success',    chipLabel: 'On-duty',  headBg: 'success' },
            'inactive':  { chipCls: 'warn',       chipLabel: 'Inactive', headBg: 'warn'    },
            'impeached': { chipCls: 'danger',     chipLabel: cr && cr.state ? cr.state : 'Impeached', headBg: 'danger' },
            'next-term': { chipCls: 'warn',       chipLabel: 'Next term', headBg: 'warn'   },
            'unclaimed': { chipCls: 'warn',       chipLabel: 'Unclaimed', headBg: 'warn'   },
            'no-term':   { chipCls: 'muted',      chipLabel: 'Between terms', headBg: 'muted' },
        }[subState] || { chipCls: 'muted', chipLabel: '—', headBg: 'muted' };

        // v0.5.229 patch — t() is enmTOrFallback which takes (key, vars),
        // NOT (key, fallback). A second-arg string is misread as vars
        // and missing keys render as the literal "[key]" placeholder
        // in the UI. Strings live in strings.js under council_card.*
        // (added in the same patch). Defensive fallback table below
        // catches the case where strings.js is older than this code.
        var titleKey = 'council_card.head_title_' + subState.replace('-', '_');
        var subKey   = 'council_card.head_sub_'   + subState.replace('-', '_');
        var FALLBACK_TITLES = {
            'elected':   'CR Council member — On-duty',
            'inactive':  'CR Council member — Inactive',
            'impeached': 'CR Council member — ' + (cr && cr.state ? cr.state : 'Impeached'),
            'next-term': 'CR Council member — Next term',
            'unclaimed': 'Council install — Not currently bound',
            'no-term':   'Council install — Committee between terms',
        };
        var FALLBACK_SUBS = {
            'elected':   'Your node is in the on-chain CR Committee arbiter slate. EVM sidechain mining + mainchain BPoS signing activate automatically when your slot rotates in.',
            'inactive':  'You are a CR Committee member but on-chain MemberState is Inactive (the chain skipped your slot for too many consecutive rounds). Node Manager can reactivate this for you — it signs the activation with your node key.',
            'impeached': 'Your CR Committee membership has been impeached, terminated, returned, or flagged illegal on-chain. The current term seat is lost; check Essentials for the specific reason and recovery options.',
            'next-term': 'You won the next CR Committee election. Your node will enter the arbiter slate when the next term begins.',
            'unclaimed': 'ENM detects a Council install but your node\'s public key is not currently bound to any CR Committee seat on-chain. If you intend to be a Council member, claim your node via Elastos Essentials (CRCouncilMemberClaimNode TX).',
            'no-term':   'The CR Council is not currently in an election period. No active Committee means no arbiter slots to fill — your node will be added when the next term begins.',
        };
        var rawTitle = t(titleKey);
        var rawSub   = t(subKey);
        // enmT returns "[key]" verbatim when the key is missing. Detect
        // that and fall through to the in-JS English instead.
        var headTitle = (rawTitle && rawTitle.indexOf('[') !== 0)
            ? rawTitle : (FALLBACK_TITLES[subState] || 'CR Council member');
        var headSub = (rawSub && rawSub.indexOf('[') !== 0)
            ? rawSub : (FALLBACK_SUBS[subState] || '');

        // Build the head + cta-card + optional info-grid markup.
        var infoRows = '';
        if (cr && (cr.nickname || cr.state || cr.cid)) {
            infoRows = ''
                + '<div class="enm-council-info-grid">'
                + (cr.nickname  ? '<div class="enm-council-info-cell"><div class="enm-council-info-label">Nickname</div><div class="enm-council-info-value">' + escapeHtml(cr.nickname) + '</div></div>' : '')
                + (cr.state     ? '<div class="enm-council-info-cell"><div class="enm-council-info-label">State</div><div class="enm-council-info-value">' + escapeHtml(cr.state) + '</div></div>' : '')
                + (typeof cr.index === 'number'
                    ? '<div class="enm-council-info-cell"><div class="enm-council-info-label">Index</div><div class="enm-council-info-value">' + cr.index + '</div></div>'
                    : '')
                + (cr.cid       ? '<div class="enm-council-info-cell enm-council-info-cell-wide"><div class="enm-council-info-label">CID</div><div class="enm-council-info-value enm-council-info-value-mono">' + escapeHtml(cr.cid) + '</div></div>' : '')
                + (cr.impeachmentVotes && cr.impeachmentVotes !== '0' ? '<div class="enm-council-info-cell"><div class="enm-council-info-label">Impeach votes</div><div class="enm-council-info-value">' + escapeHtml(cr.impeachmentVotes) + '</div></div>' : '')
                + '</div>';
        }

        // v0.5.229d (P9 audit fix) — dual-role secondary line. If this
        // operator is BOTH a CR Council member AND a BPoS producer
        // (the rare-but-legal case), surface the BPoS producer state
        // as a secondary line under the Council head. Council primacy
        // is preserved (Council outranks BPoS in DPoS rotation); BPoS
        // is informational.
        var dualRoleLine = '';
        if (this._lastProducer && this._lastProducer.state) {
            dualRoleLine = ''
                + '<div class="enm-bpos-head-dual-role" style="margin-top:4px;font-size:11px;color:var(--text-tertiary);">'
                +   'Also a BPoS producer · ' + escapeHtml(this._lastProducer.state)
                +   (this._lastProducer.rank != null ? (' · Rank #' + this._lastProducer.rank) : '')
                + '</div>';
        }

        // v0.5.248 (validator-readiness audit P1) — in-app reactivation CTA
        // for an Inactive CR Council member. ela's ActivateProducer tx
        // reactivates an Inactive CR member and is NODE-KEY signed
        // (activateproducertransaction.go:113/212), so ENM can submit it with
        // the keystore it already holds — no wallet / owner key. ONLY the
        // 'inactive' sub-state is recoverable in-app: Impeached/Returned/
        // Terminated are terminal for the term and Illegal is height-gated
        // on-chain, so those keep pointing operators to Essentials. The button
        // reuses _activate() → POST /chains/mainchain/bpos/activate.
        var ctaCard = '';
        if (subState === 'inactive') {
            var activateLabel = t('council_card.activate_btn');
            if (!activateLabel || activateLabel.indexOf('[') === 0) { activateLabel = 'Reactivate Council node'; }
            var activateExplain = t('council_card.activate_explainer');
            if (!activateExplain || activateExplain.indexOf('[') === 0) {
                activateExplain = 'Submits an on-chain activation signed with this node’s key (no wallet needed). Your node must be running and fully synced.';
            }
            ctaCard = ''
                + '<div class="enm-bpos-cta-card">'
                +   '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.45;">'
                +     escapeHtml(activateExplain)
                +   '</div>'
                +   '<button type="button" class="enm-btn enm-btn-primary enm-bpos-activate" '
                +     'id="enm-council-activate">'
                +     escapeHtml(activateLabel)
                +   '</button>'
                + '</div>';
        }

        this.root.innerHTML = ''
            + '<div class="enm-bpos-head enm-bpos-head-' + subMeta.headBg + '">'
            +   '<div class="enm-bpos-head-icon" aria-hidden="true">'
            +     '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" '
            +       'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">'
            +       '<polygon points="12 3 21 12 12 21 3 12"></polygon>'
            +     '</svg>'
            +   '</div>'
            +   '<div class="enm-bpos-head-body">'
            +     '<div class="enm-bpos-head-title" id="' + escapeAttr(titleId) + '">'
            +       escapeHtml(headTitle)
            +     '</div>'
            +     '<div class="enm-bpos-head-sub">'
            +       escapeHtml(headSub)
            +     '</div>'
            +     dualRoleLine
            +   '</div>'
            +   '<span class="enm-section-card-tag ' + subMeta.chipCls + '" id="' + escapeAttr(chipId) + '">'
            +     escapeHtml(subMeta.chipLabel)
            +   '</span>'
            + '</div>'
            + infoRows
            + ctaCard
            + '<span id="enm-bpos-pubkey" class="enm-sr-only" aria-hidden="true">'
            +   escapeHtml(t('common.loading'))
            + '</span>';

        // v0.5.248 — wire the reactivation button (inactive sub-state only).
        // Reuses _activate(), which enmRunOnce-wraps the click (double-click
        // safe), POSTs the activate route, toasts the result, and fast-polls
        // so the card re-renders to 'elected' once the chain confirms.
        if (subState === 'inactive') {
            var councilActivateBtn = this.root.querySelector('#enm-council-activate');
            if (councilActivateBtn) {
                councilActivateBtn.addEventListener('click', function () {
                    self._activate(councilActivateBtn);
                });
            }
        }
    };

    /**
     * 0.2.0-beta.3.4 — STATE_ACTIVE render. Operator's producer is on
     * chain AND in Active state; the card stays visible with a success
     * header + a footnote that points operators to Elastos Essentials
     * for the rewards/voting flow (per phase-03 mock).
     *
     * Stats grid (rank / votes / deposit) is intentionally NOT in this
     * pass — we don't yet expose those fields cleanly from /producer,
     * and rendering placeholders would be worse than nothing. Future
     * iteration can flesh it out when the data wiring lands.
     *
     * @private
     */
    BposCard.prototype._renderActive = function () {
        var t = root.enmTOrFallback;
        var titleId = this._titleId;
        var chipId  = this._chipId;

        // beta.3.40 — aligned to enm-design-mocks/v2/phase-03-status.html
        // variant C: head + 2-cell grid + note. The pre-3.40 6-cell stats
        // grid (rank/votes/dposv2/inactive/deposit/rewards/vote-threshold)
        // duplicated information already shown in the chip (rank) and
        // surfaced data the mock explicitly delegates to Essentials
        // (deposit/rewards/voting). The mock keeps the dashboard card
        // intentionally minimal.
        this.root.innerHTML = ''
            + '<div class="enm-bpos-head">'
                + '<div class="enm-bpos-head-icon" aria-hidden="true">'
                    + '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" '
                        + 'stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">'
                        + '<polygon points="12 3 21 12 12 21 3 12"></polygon>'
                    + '</svg>'
                + '</div>'
                + '<div class="enm-bpos-head-body">'
                    + '<div class="enm-bpos-head-title" id="' + escapeAttr(titleId) + '">'
                        + escapeHtml(t('bpos_card.head_title_active'))
                    + '</div>'
                    + '<div class="enm-bpos-head-sub">'
                        + escapeHtml(t('bpos_card.head_sub_active'))
                    + '</div>'
                + '</div>'
                // Chip text gets replaced every poll by _fillActiveStats
                // so rank stays current. Initial label is "Active".
                + '<span class="enm-bpos-head-chip" id="' + escapeAttr(chipId) + '" '
                    + 'role="status" aria-live="polite">'
                    + escapeHtml(t('bpos_card.chip_active'))
                + '</span>'
            + '</div>'
            // Mock variant C grid: two stats with metadata sub-labels.
            //   Votes        — total community votes (Current snapshot)
            //   Inactive rounds — N / 1440 + slashing-risk meta
            + '<div class="enm-bpos-grid">'
                + '<div class="enm-bpos-stat" data-stat="votes">'
                    + '<div class="enm-bpos-stat-label">' + escapeHtml(t('bpos_card.stat_votes')) + '</div>'
                    + '<div class="enm-bpos-stat-value" data-fill="votes">—</div>'
                    + '<div class="enm-bpos-stat-meta">' + escapeHtml(t('bpos_card.stat_votes_meta')) + '</div>'
                + '</div>'
                + '<div class="enm-bpos-stat" data-stat="inactiveRounds">'
                    + '<div class="enm-bpos-stat-label">' + escapeHtml(t('bpos_card.stat_inactive_rounds')) + '</div>'
                    + '<div class="enm-bpos-stat-value"><span data-fill="inactiveRounds">—</span><span class="enm-bpos-stat-value-suffix"> / 1440</span></div>'
                    + '<div class="enm-bpos-stat-meta" data-fill="inactiveRoundsMeta">' + escapeHtml(t('bpos_card.stat_inactive_rounds_meta_safe')) + '</div>'
                + '</div>'
            + '</div>'
            // beta.3.40 — dropped the .enm-bpos-vote-threshold sub-notice.
            // The mock keeps variant C minimal (votes + inactive rounds +
            // note); the "below 80K votes can't go on-duty" hint will
            // live in the Essentials guide instead of cluttering the
            // dashboard card. _fillActiveStats no longer touches a
            // voteThreshold slot.
            + '<div class="enm-bpos-note">'
                + escapeHtml(t('bpos_card.note_active'))
            + '</div>';

        // First fill from the cached producer record. Subsequent polls
        // call _fillActiveStats directly via _show.
        this._fillActiveStats(this._lastProducer);
    };

    /**
     * 0.2.0-beta.3.7 — populate the active-state stats grid + chip
     * rank suffix in place. Safe to call any number of times. Reads
     * fields off the producer record stashed by _reconcile.
     *
     * @private
     * @param {object|null} producer
     */
    BposCard.prototype._fillActiveStats = function (producer) {
        if (!producer) { return; }
        var t = root.enmTOrFallback;
        var chip = this.root.querySelector('#' + this._chipId);
        if (chip) {
            // Chip text: "Active · Rank #N" if rank known, else "Active".
            // Mock variant C shows "Active · Rank #42".
            if (producer.rank != null && producer.rank > 0) {
                chip.textContent = t('bpos_card.chip_active_rank', { rank: producer.rank });
            } else {
                chip.textContent = t('bpos_card.chip_active');
            }
        }
        function fmt(n) {
            if (n == null || !isFinite(n)) { return '—'; }
            if (typeof root !== 'undefined' && root.enmFormatNumber) {
                return root.enmFormatNumber(n);
            }
            return String(n);
        }
        // beta.3.40 — mock variant C uses BPoS votes total (post-fork).
        // Pre-3.40 we showed split DPoSv1/v2 — operator told us DPoS v1 is
        // noise on the BPoS-only dashboard. Sum both buckets into one
        // "Votes" cell so the operator sees the total relevant to
        // arbiter-set eligibility (≥80K).
        var v1 = (typeof producer.votes === 'number') ? producer.votes : 0;
        var v2 = (typeof producer.dposv2votes === 'number') ? producer.dposv2votes : 0;
        var totalVotes = v1 + v2;
        var inactive = (producer.inactiveRounds != null) ? producer.inactiveRounds : 0;
        // Slashing risk band — mock variant C says "No slashing risk"
        // when inactive rounds are well below 1440. Above ~720 (half-way)
        // we warn so the operator can investigate before slashing fires.
        var WARN_AT = 720;
        var inactiveMetaKey = (inactive >= WARN_AT)
            ? 'bpos_card.stat_inactive_rounds_meta_warn'
            : 'bpos_card.stat_inactive_rounds_meta_safe';

        var fillers = {
            votes:               fmt(totalVotes),
            inactiveRounds:      fmt(inactive),
            inactiveRoundsMeta:  t(inactiveMetaKey),
        };
        var nodes = this.root.querySelectorAll('[data-fill]');
        for (var i = 0; i < nodes.length; i += 1) {
            var key = nodes[i].getAttribute('data-fill');
            if (fillers[key] !== undefined) {
                nodes[i].textContent = fillers[key];
            }
        }
    };

    /**
     * 0.2.0-beta.3.12 — vote-threshold notice. Elastos DPoS consensus
     * requires ≥ 80,000 votes (combined `votes` + `dposv2votes`) for a
     * producer to be eligible for the arbiter set. Below threshold:
     * the producer's on-chain record is valid (so STATE_ACTIVE shows)
     * but they'll never go on-duty, never sign blocks, never earn
     * rotation rewards.
     *
     * Pre-beta.3.12 we silently showed "Inactive rounds: 0" with no
     * explanation — operators wondered why their registered, active
     * producer was idle. This explains it.
     *
     * @private
     * @param {HTMLElement} el     the .enm-bpos-vote-threshold container
     * @param {object}      producer  producer record from /producer
     */
    BposCard.prototype._renderVoteThreshold = function (el, producer) {
        if (!el || !producer) { return; }
        // BPoS uses DPoSv2 post-fork. Sum both buckets so operators on
        // either side of the transition see a meaningful figure. Both
        // can be null on a freshly-registered producer.
        var v1 = (typeof producer.votes === 'number') ? producer.votes : 0;
        var v2 = (typeof producer.dposv2votes === 'number') ? producer.dposv2votes : 0;
        var total = v1 + v2;
        var THRESHOLD = 80000;
        // If we don't have either field yet (backend latency), hide.
        if (producer.votes == null && producer.dposv2votes == null) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        if (total >= THRESHOLD) {
            // Producer is eligible for the arbiter set. No notice needed.
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        // Below threshold. Surface a clear, actionable message.
        var fmtN = (typeof root !== 'undefined' && root.enmFormatNumber)
            ? root.enmFormatNumber
            : function (n) { return String(n); };
        var needed = THRESHOLD - total;
        el.hidden = false;
        el.innerHTML = ''
            + '<div class="enm-bpos-vote-threshold-head">'
                + '<span class="enm-bpos-vote-threshold-icon" aria-hidden="true">⚠</span>'
                + '<div>'
                    + '<div class="enm-bpos-vote-threshold-title">'
                        + 'Below ' + fmtN(THRESHOLD) + '-vote threshold'
                    + '</div>'
                    + '<div class="enm-bpos-vote-threshold-body">'
                        + 'Current total: <b>' + fmtN(total) + '</b> votes '
                        + '(' + fmtN(v1) + ' DPoSv1 + ' + fmtN(v2) + ' DPoSv2). '
                        + 'Need <b>' + fmtN(needed) + '</b> more votes to enter the arbiter set. '
                        + 'Until then this producer will not be selected for block signing or rotation, '
                        + 'regardless of rank. Community votes accrue through Elastos Essentials.'
                    + '</div>'
                + '</div>'
            + '</div>';
    };

    /** @private */
    BposCard.prototype._renderRegistration = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var titleId = this._titleId;
        var chipId  = this._chipId;

        this.root.innerHTML = ''
            + '<div class="enm-bpos-head">'
                // beta.3.40 — mock variant D uses a HOLLOW ◇ diamond with
                // warning palette (var(--warning-bg) + var(--warning))
                // rather than the solid accent ◆ used for variant C. The
                // CSS modifier .enm-bpos-head-icon-warn flips both
                // background and color tokens; the inner SVG sets
                // fill="none" so only the stroke is visible.
                + '<div class="enm-bpos-head-icon enm-bpos-head-icon-warn" aria-hidden="true">'
                    + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" '
                        + 'stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">'
                        + '<polygon points="12 3 21 12 12 21 3 12"></polygon>'
                    + '</svg>'
                + '</div>'
                + '<div class="enm-bpos-head-body">'
                    + '<div class="enm-bpos-head-title" id="' + escapeAttr(titleId) + '">'
                        + escapeHtml(t('bpos_card.head_title_register'))
                    + '</div>'
                    + '<div class="enm-bpos-head-sub">'
                        + escapeHtml(t('bpos_card.head_sub_register'))
                    + '</div>'
                + '</div>'
                + '<span class="enm-bpos-head-chip warn" id="' + escapeAttr(chipId) + '" '
                    + 'role="status" aria-live="polite">'
                    + escapeHtml(t('bpos_card.chip_action_required'))
                + '</span>'
            + '</div>'

            // beta.3.40 — mock variant D structure: a single
            // .enm-bpos-cta-card with the prompt + two buttons (Primary
            // "View registration guide", secondary "Copy node public
            // key"). The pubkey moves INTO the .enm-bpos-note as a
            // labelled code block. Pre-3.40 we had three separate
            // elements (cta-row, signing-key block, note); the mock
            // collapses them into two for a cleaner visual hierarchy.
            + '<div class="enm-bpos-cta-card">'
                + '<p class="enm-bpos-cta-help">'
                    + escapeHtml(t('bpos_card.cta_help_register'))
                + '</p>'
                + '<div class="enm-bpos-cta-row">'
                    + '<button type="button" '
                        + 'class="enm-btn enm-btn-primary enm-bpos-open-essentials">'
                        + escapeHtml(t('bpos_card.view_guide_btn'))
                    + '</button>'
                    // Copy-pubkey button replaced post-render with the
                    // enmCopyButton factory (aria-hidden visible-span
                    // pattern + clipboard fallback).
                    + '<span class="enm-bpos-copy-slot"></span>'
                + '</div>'
            + '</div>'

            // v0.5.228 — the pubkey display block (label + <pre> + note)
            // duplicates the Node Identity card above (which now renders
            // the pubkey at primary visual weight). One source of truth
            // wins; the Copy button still works (the value resolver below
            // pulls from self._lastPubkey, no DOM dependency). A hidden
            // <span id="enm-bpos-pubkey"> stays so _fillPubkey is a true
            // no-op and getDisplayEl has something to fall back to if the
            // clipboard API ever fails (the copy button auto-selects it
            // off-screen — same UX outcome as before, no duplicated
            // pubkey on screen).
            + '<span id="enm-bpos-pubkey" class="enm-sr-only" aria-hidden="true">'
                + escapeHtml(t('common.loading'))
            + '</span>';

        // Replace the copy slot with the enmCopyButton factory. The
        // factory hands back a fully-wired <button> with aria-hidden
        // inner span + clipboard fallback + select-into-display
        // graceful degradation (alpha.29 batch 96 pattern).
        var pubkeyEl = this.root.querySelector('#enm-bpos-pubkey');
        var copyBtn;
        if (typeof root.enmCopyButton === 'function') {
            copyBtn = root.enmCopyButton({
                value: function () {
                    // Resolve fresh at click time so a /producer push
                    // that arrives between render and click hands the
                    // latest pubkey to the clipboard.
                    return self._lastPubkey || (pubkeyEl && pubkeyEl.textContent) || '';
                },
                label:        root.enmTOrFallback('bpos_card.copy_pubkey_btn'),
                copiedLabel:  root.enmTOrFallback('bpos_card.copied'),
                ariaLabel:    root.enmTOrFallback('bpos_card.copy_aria'),
                resetMs:      1200,
                notifications: self.notifications,
                failTitle:    root.enmTOrFallback('bpos_card.copy_fail_title'),
                failBody:     root.enmTOrFallback('bpos_card.copy_fail_body'),
                getDisplayEl: function () { return pubkeyEl; },
                // beta.3.40 — secondary button (not primary). Mock D's
                // primary action is "View registration guide"; the copy
                // is a follow-up tool, not the headline CTA.
                className:    'enm-bpos-copy-pubkey',
            });
        } else {
            // Defensive — utils.js failed to load. Provide a minimal
            // button so the card is still functional.
            copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'enm-btn enm-bpos-copy-pubkey';
            copyBtn.textContent = root.enmTOrFallback('bpos_card.copy_pubkey_btn');
            copyBtn.addEventListener('click', function () {
                var value = self._lastPubkey || (pubkeyEl && pubkeyEl.textContent) || '';
                if (!value) { return; }
                if (typeof root.enmCopyToClipboard === 'function') {
                    root.enmCopyToClipboard(String(value), {
                        notifications: self.notifications,
                        notifyOnSuccess: true,
                        successTitle: root.enmTOrFallback('bpos_card.copied'),
                    });
                } else if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(String(value)).then(function () {
                        if (self.notifications) {
                            self.notifications.info(
                                root.enmTOrFallback('bpos_card.copied'),
                                ''
                            );
                        }
                    }, function () { /* swallow — fallback already covered */ });
                }
            });
        }
        copyBtn.id = 'enm-bpos-copy-pubkey';
        var slot = this.root.querySelector('.enm-bpos-copy-slot');
        if (slot && slot.parentNode) { slot.parentNode.replaceChild(copyBtn, slot); }

        // "Open Essentials guide" — stub for Beta 3. Surfaces a
        // notifications.info with a brief deep-link instruction; the
        // actual `essentials://` deep link integration lands in a
        // follow-up. Memory: feedback_enm_wallet_identity_only — the
        // wallet is identity-only, no signing here.
        var essentialsBtn = this.root.querySelector('.enm-bpos-open-essentials');
        if (essentialsBtn) {
            essentialsBtn.addEventListener('click', function () {
                if (self._destroyed) { return; }
                if (self.notifications) {
                    self.notifications.info(
                        root.enmTOrFallback('bpos_card.essentials_guide_title'),
                        root.enmTOrFallback('bpos_card.essentials_guide_body')
                    );
                }
            });
        }
    };

    /** @private */
    BposCard.prototype._renderActivation = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var titleId = this._titleId;
        var chipId  = this._chipId;

        this.root.innerHTML = ''
            + '<div class="enm-bpos-head">'
                // Success palette icon — checkmark glyph. The same
                // .enm-bpos-head-icon CSS class with .success modifier
                // (the variant defined in the v2 mock at ~line 192).
                + '<div class="enm-bpos-head-icon success" aria-hidden="true">'
                    + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" '
                        + 'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" '
                        + 'stroke-linejoin="round">'
                        + '<polyline points="20 6 9 17 4 12"></polyline>'
                    + '</svg>'
                + '</div>'
                + '<div class="enm-bpos-head-body">'
                    + '<div class="enm-bpos-head-title" id="' + escapeAttr(titleId) + '">'
                        + escapeHtml(t('bpos_card.head_title_activation'))
                    + '</div>'
                    + '<div class="enm-bpos-head-sub">'
                        + escapeHtml(t('bpos_card.head_sub_activation'))
                    + '</div>'
                + '</div>'
                + '<span class="enm-bpos-head-chip" id="' + escapeAttr(chipId) + '" '
                    + 'role="status" aria-live="polite">'
                    + escapeHtml(t('bpos_card.chip_ready_to_activate'))
                + '</span>'
            + '</div>'

            + '<div class="enm-bpos-cta-card">'
                + '<button type="button" class="enm-btn enm-btn-primary enm-bpos-activate" '
                    + 'id="enm-bpos-activate">'
                    + escapeHtml(t('bpos_card.activate_btn'))
                + '</button>'
            + '</div>';

        var activateBtn = this.root.querySelector('#enm-bpos-activate');
        if (activateBtn) {
            activateBtn.addEventListener('click', function () {
                self._activate(activateBtn);
            });
        }
    };

    /**
     * POST /chains/:id/bpos/activate. enmRunOnce wraps the button so a
     * double-click can't fire the request twice; the finalizer clears
     * busy + disabled even if the promise rejects.
     *
     * @private
     * @param {HTMLButtonElement} btn
     */
    BposCard.prototype._activate = function (btn) {
        var self = this;
        var t = root.enmTOrFallback;
        var activatingLabel = t('bpos_card.activate_btn_active');
        var fallback = function (fn) { return fn(); };
        var runOnce = root.enmRunOnce || fallback;

        runOnce(btn, activatingLabel, function () {
            var path = '/chains/' + encodeURIComponent(self.chainId) + '/bpos/activate';
            return self.api.post(path).then(function () {
                // alpha.28.1 batch 86 — _destroyed guard on both
                // success and failure branches so a teardown mid-POST
                // doesn't mutate detached DOM.
                if (self._destroyed) { return; }
                if (self.notifications) {
                    self.notifications.info(
                        t('bpos_card.activate_ok_title'),
                        t('bpos_card.activate_ok_body')
                    );
                }
                // Force a fast re-poll so the card hides quickly when
                // /producer flips to Active on chain (we already have
                // SHORT_POLL_MS armed, but a manual kick removes the
                // up-to-5s lag).
                self._poll();
            }).catch(function (err) {
                if (self._destroyed) { return; }
                // 401 = expired session; boot path owns re-auth.
                if (err && err.status === 401) { return; }
                // alpha.28.1 batch 68 — conflict envelope shape
                // validation. The activate route returns 409 with
                // `{ conflicts: [{ severity, description, remediation }] }`
                // when the chain isn't ready (already-active, not-yet-
                // registered, deposit-unfunded, etc). Drop straight
                // into the critical-toast branch with the same
                // formatting chain-card uses for start/stop conflicts.
                if (err && err.body && Array.isArray(err.body.conflicts)
                    && err.body.conflicts.length > 0) {
                    var blockers = err.body.conflicts.filter(function (c) {
                        return c && c.severity === 'CRITICAL';
                    });
                    var summary = blockers.map(function (c) {
                        var firstStep = (c.remediation && c.remediation[0]);
                        var stepStr = (typeof firstStep === 'string' && firstStep.length > 0)
                            ? firstStep : '';
                        var descStr = (typeof c.description === 'string' && c.description.length > 0)
                            ? c.description : 'Activation blocked';
                        return '• ' + descStr + (stepStr ? ('\n   ' + stepStr) : '');
                    }).join('\n');
                    if (self.notifications) {
                        self.notifications.critical(
                            t('bpos_card.activate_conflict_title'),
                            summary
                        );
                    }
                    return;
                }
                if (self.notifications) {
                    self.notifications.warning(
                        t('bpos_card.activate_fail_title'),
                        (err && err.message) ? err.message : t('common.failed')
                    );
                }
            });
        });
    };

    /** @private */
    BposCard.prototype._fillPubkey = function (pubkey) {
        var el = this.root.querySelector('#enm-bpos-pubkey');
        if (el) { el.textContent = pubkey; }
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    // Beta 3 export name. The constructor is the BPoS operator card;
    // EnmValidatorRegistrationCard alias is retained for backward
    // compatibility with technical-view.js (which still calls
    // `new root.EnmValidatorRegistrationCard(common)`) and any other
    // consumer that hasn't migrated yet. Renaming the consumer site
    // is a follow-up; both names point at the same constructor today.
    root.EnmBposCard = BposCard;
    root.EnmValidatorRegistrationCard = BposCard;
}(typeof window !== 'undefined' ? window : globalThis));
