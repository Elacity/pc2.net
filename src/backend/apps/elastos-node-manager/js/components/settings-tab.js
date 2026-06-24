/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/settings-tab.js — Beta 3 rewrite (phase-04).
 *
 * Mirrors enm-design-mocks/v2/phase-04-settings.html structure:
 *   - .enm-settings-wrap = grid 200px 1fr on wide; 1fr on narrow/compact.
 *   - Wide nav rail (.enm-settings-nav, sticky) is hidden on narrow/compact
 *     by a CSS rule on .enm-app[data-app-size]; an alternate pill row
 *     (.enm-settings-pills) takes its place. Both are rendered, CSS hides
 *     one based on viewport.
 *   - Three sections only: Network · Mainchain Advanced · General.
 *     Danger-Zone UI dropped per phase-04 mock. The wipe methods stay as
 *     dead code (DELETE /api/installed-apps/...) for a future surface.
 *     RPC reveal-only panel dropped — credentials merged into Advanced.
 *   - Per-section Save → three separate PUT /config/{network,mainchain,
 *     general} endpoints. There is no global Apply.
 *
 * alpha.28 behavioural carry-over still applies:
 *   - _destroyed guard on every .then/.catch (batch 16, 51, 95).
 *   - 401 suppression — boot path owns re-auth; no scary toast (batch 51).
 *   - enmRunOnce on every Save button (utils.js runOnce) — disables +
 *     swaps label "Saving…" then restores in .finally so a slow backend
 *     can never double-save.
 *   - .finally re-enables disabled state regardless of resolve/reject
 *     (alpha.28 batch 60 finalizer pattern).
 *   - ARIA: role="tablist" on the nav, role="tab" on items, role="tabpanel"
 *     on each section-card, aria-selected reflected on nav + pills,
 *     role="status" on every foot status, role="alert" on error states.
 *   - Locked 127.0.0.1 chip — chip[data-locked="true"] renders 🔒 instead
 *     of remove × and refuses removal. setValue auto-merges the locked
 *     entries so the backend can never drop it. Backend has a defence in
 *     depth anyway.
 *   - No-op-on-save-when-no-changes guard for whitelist / RPC enabled
 *     (alpha.20).
 *   - CJK IME isComposing guard on the chip Enter handler (batch 18).
 *   - Multi-value paste handler (batch 18).
 *   - Detect-now writes inline mono result next to the button (not a save).
 *   - Empty-on-manual validation block on _saveNetwork (batch 85).
 *
 * Lifecycle: same shape as alpha.27 — constructor builds shell, mount()
 * attaches + refreshes, destroy() detaches + flips _destroyed.
 */

(function (root) {
    'use strict';

    // IPv4 / IPv6 / CIDR validation — server has the authoritative joi
    // schema, this is for inline UX feedback only.
    //
    // 0.2.0-beta.3.7 — phase-04 mock's whitelist help copy says "IPv4
    // or IPv6". Pre-beta.3.7 the regex only accepted IPv4 + optional
    // /0–/32 prefix; operators trying to add an IPv6 address (e.g.
    // `2001:db8::1` or `fe80::/64`) saw the validation flash red even
    // though the backend would have accepted the entry. The IPv4 path
    // stays unchanged; the IPv6 alternative is a deliberately permissive
    // match (full address, ::-compressed, and optional /0–128 prefix)
    // — strict RFC validation belongs on the backend joi schema, this
    // is just to keep obviously-malformed input out of the chip-input.
    var IPV4_OR_CIDR = '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\\/(?:[0-9]|[12][0-9]|3[0-2]))?';
    var IPV6_OR_CIDR = '(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}'    // 8 full groups
        + '|(?:[0-9A-Fa-f]{1,4}:){1,7}:'                              // leading groups + ::
        + '|(?:[0-9A-Fa-f]{1,4}:){1,6}(?::[0-9A-Fa-f]{1,4})'          // 1-6 groups :: 1 group
        + '|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}'
        + '|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}'
        + '|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}'
        + '|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}'
        + '|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6})'
        + '|:(?:(?::[0-9A-Fa-f]{1,4}){1,7}|:)';
    var IP_OR_CIDR_RE = new RegExp(
        '^(?:'
        + IPV4_OR_CIDR
        + '|(?:' + IPV6_OR_CIDR + ')(?:\\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?'
        + ')$'
    );

    /**
     * beta.3.94 (Wave M2.6) — enmT lookup with an English fallback.
     * Returns the strings.js key value when present, otherwise the
     * passed fallback (with {var} substitution applied to both). Used
     * by the M2.5 per-class settings stubs so they render the right
     * copy even if strings.js hasn't loaded yet (test rigs, defensive
     * boot). Matches the same helper in multi-chain-overview.js to
     * keep behavior consistent across both M2 components.
     */
    function _tFb(key, fallback, vars) {
        var t = root.enmTOrFallback || root.enmT;
        if (typeof t !== 'function') { return _formatVars(fallback, vars); }
        var v = t(key, vars);
        if (!v || v === key || v === ('[' + key + ']')) {
            return _formatVars(fallback, vars);
        }
        return v;
    }
    function _formatVars(s, vars) {
        if (!vars) { return s; }
        return String(s).replace(/\{([a-zA-Z0-9_]+)\}/g, function (m, name) {
            return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
        });
    }

    // beta.3.93 (Wave M2.5) — frontend mirror of ChainAdapter.CHAIN_ID_
    // TO_CLASS (M1.1) for static class lookup when the caller hasn't
    // passed chainClass explicitly. Used by the constructor to route
    // _renderShell → per-class mount method without waiting for a server
    // roundtrip. No ECO entry per H3.
    // P1.6 (v0.5.189) — single source of truth in utils.js (root.enmChainClass);
    // was a verbatim duplicate of the same map in app.js + chain-card.js.
    var CHAIN_ID_TO_CLASS = root.enmChainClass;

    function SettingsTab(opts) {
        if (!opts || !opts.api || !opts.notifications) {
            throw new TypeError('SettingsTab: { api, notifications } required');
        }
        this.api = opts.api;
        this.notifications = opts.notifications;
        // beta.3.93 (M2.5) — per-chain Settings. chainId defaults to
        // 'mainchain' so the pre-3.93 single-chain callers (which never
        // passed chainId) keep working. chainClass falls back to the
        // static lookup so the dispatcher can route to the right per-
        // class mount method without waiting for a server roundtrip.
        this.chainId = (opts && opts.chainId) || 'mainchain';
        this.chainClass = (opts && opts.chainClass)
            || CHAIN_ID_TO_CLASS[this.chainId]
            || 'A'; // Defensive — assume Class A behavior when class unknown.
        this.root = document.createElement('section');
        this.root.className = 'enm-settings-wrap';
        // Surface the active chain + class on the root so CSS can layer
        // per-class styles + tests can assert which path mounted.
        this.root.dataset.chainId = this.chainId;
        this.root.dataset.chainClass = this.chainClass;
        this._cfg = null;
        this._creds = null;
        this._destroyed = false;
        this._activeKey = 'network';
        this._sections = {};
        this._navItems = {};
        this._pills = {};
        // v0.5.237 — Settings is now GLOBAL (one settings area for the whole
        // node), no longer scoped per-chain. The chain-selector that used to
        // scope Settings to a single chain was removed; ALL sidechain
        // configuration now lives in the shared "Sidechain settings" section
        // of this one shell (reward + sync for every EVM, read-only validator
        // status, and a per-chain peers/bootnodes accordion). So every
        // instance renders the full global shell regardless of the
        // chainId/chainClass it was constructed with.
        //
        // The old per-class mounts (_mountEvmSidechainSettings / _renderClassBForm
        // / _mountOracleSettings / _mountArbiterSettings / _mountSpvSettings)
        // are now unreachable and are removed in the Phase 5 dead-code cleanup.
        this._mountMainchainSettings();
    }

    SettingsTab.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        // beta.3.93 (M2.5) — only Class A has refresh logic today
        // (loads /config + /config/rpc/credentials). The B/C/D/E stubs
        // are static markup; calling refresh() would hit endpoints that
        // either 501 or aren't relevant. M3.3+ wires per-class refresh.
        if (this.chainClass === 'A') {
            this.refresh();
        }
        return this;
    };

    /**
     * beta.3.93 (Wave M2.5) — Class A (mainchain) settings mount.
     *
     * Today's full 7-card settings layout: Access · Identity · Security ·
     * Network · Alerts · Storage · Advanced · Danger. Identical to the
     * pre-3.93 _renderShell behavior — this is a rename + dispatch
     * indirection, not a layout change.
     *
     * @private
     */
    SettingsTab.prototype._mountMainchainSettings = function () {
        this._renderShell();
    };

    SettingsTab.prototype.destroy = function () {
        this._destroyed = true;
        // BP-E audit fix — tear down the chip-input's internal flash-
        // invalid timer so a 900ms-late border-reset can't fire on a
        // detached input after the pane unmounts (e.g. operator clicked
        // Save then immediately switched tabs).
        if (this._adv && this._adv.whiteIp
            && typeof this._adv.whiteIp.destroy === 'function') {
            try { this._adv.whiteIp.destroy(); } catch (_) { /* idempotent */ }
        }
        // v0.5.176 — stop the Network peers panel's poll + detach it.
        // (Legacy single-panel handle from the removed _renderClassBForm path;
        // kept defensively until that dead method is deleted in Phase 5.)
        if (this._peersPanel && typeof this._peersPanel.destroy === 'function') {
            try { this._peersPanel.destroy(); } catch (_) { /* idempotent */ }
            this._peersPanel = null;
        }
        // v0.5.237 — tear down the per-chain EVM peers panels mounted in the
        // consolidated Sidechain settings accordion (esc/eid/pg). One panel
        // per opened accordion; loop so none leaks its /peers poll timer.
        if (this._evmShared && Array.isArray(this._evmShared.peersPanels)) {
            this._evmShared.peersPanels.forEach(function (p) {
                if (p && typeof p.destroy === 'function') {
                    try { p.destroy(); } catch (_) { /* idempotent */ }
                }
            });
            this._evmShared.peersPanels = [];
        }
        if (this.root.parentNode) { this.root.parentNode.removeChild(this.root); }
    };

    /**
     * @private
     * Fetch /config + /config/rpc/credentials/mainchain in parallel so the
     * Advanced section's whitelist + RPC user populate on first paint.
     * Both endpoints are owner-gated; 401s are suppressed because the boot
     * path drives re-auth.
     */
    /**
     * @param {string} [scope]  'network' / 'advanced' / 'general' to
     *   re-hydrate only that section. Omit to re-hydrate all three.
     *
     * 0.2.0-beta.3.9 — scoped refresh. Pre-beta.3.9, the post-save
     * .then() called refresh() (no scope) which wiped pending edits in
     * the two un-saved sections. Operator now keeps their work-in-
     * progress across saves.
     */
    SettingsTab.prototype.refresh = function (scope) {
        var self = this;
        this.api.get('/config', { skipCache: true }).then(function (data) {
            if (self._destroyed) { return; }
            self._cfg = data && data.config;
            self._fillForm(scope);
            // beta.3.18 — clean every section the refresh touched.
            // Without `scope` we clean every section after a full
            // /config reload (initial mount or external refresh).
            SECTION_KEYS.forEach(function (k) {
                if (!scope || scope === k) { self._markClean(k); }
            });
        }).catch(function (err) {
            if (self._destroyed) { return; }
            if (err && err.status === 401) { return; }
            self.notifications.show({
                id: 'settings-config-load-fail',
                severity: 'warning',
                title: 'Failed to load config',
                body: err.message || String(err),
            });
        });
        this._loadCreds();
    };

    /**
     * @private
     * Shell: nav (wide) + pills (narrow/compact, hidden by CSS on wide) +
     * content host. All three sections built up-front; only the active one
     * is visible. Pane switching just toggles [hidden] on the section-cards
     * and the .active class on the nav/pill items.
     */
    SettingsTab.prototype._renderShell = function () {
        var t = root.enmTOrFallback;
        var self = this;

        // Nav rail (column 1 on wide). role=tablist for AT.
        this._navEl = document.createElement('aside');
        this._navEl.className = 'enm-settings-nav';
        this._navEl.setAttribute('role', 'tablist');
        this._navEl.setAttribute('aria-label', 'Settings sections');

        var navHead = document.createElement('div');
        navHead.className = 'enm-settings-nav-head';
        navHead.textContent = t('settings.nav_label_config') || 'Configuration';
        this._navEl.appendChild(navHead);

        // Pills (alt nav for narrow/compact). Same role pattern. Hidden by
        // CSS on wide via .enm-app[data-app-size] not being set.
        this._pillsEl = document.createElement('div');
        this._pillsEl.className = 'enm-settings-pills';
        this._pillsEl.setAttribute('role', 'tablist');
        this._pillsEl.setAttribute('aria-label', 'Settings sections');

        // Content host (column 2).
        this._contentEl = document.createElement('div');
        this._contentEl.className = 'enm-settings-content';

        // beta.3.18 — Phase 1 IA reshape. Five task-oriented sections in
        // the order an operator opens them. The schema-dump (Network /
        // Mainchain Advanced / General) is gone; each section now groups
        // by what the operator is trying to DO. The previous knobs are
        // redistributed:
        //   Access   ← (NEW) RPC whitelist (was Advanced) + RPC creds collapsed
        //   Security ← anti-snipe (was General) + healing toggle (was General) +
        //              critical-ack (was General), with explainer copy
        //   Network  ← IP detect (unchanged)
        //   Storage  ← audit retention (was General)
        //   Advanced ← (warning banner) + log level / memory / archive
        //              (always visible per operator option (2b), with
        //              "don't change unless you know why" banner).
        // v0.5.245 (BL-2) — sections are grouped under nav-rail subheaders.
        // Same 9 sections, just ordered into 4 task-oriented groups so the
        // rail reads as a short outline instead of a flat list. `group` marks
        // the subheader each item falls under; consecutive same-group items
        // share one header. (Default active section stays keyed — 'network' —
        // so this reorder doesn't change where Settings opens.)
        var nav = [
            { key: 'identity', glyph: '◉', group: t('settings.nav_group_node'),        label: t('settings.heading_identity'), build: this._buildIdentitySection },
            { key: 'security', glyph: '◈', group: t('settings.nav_group_node'),        label: t('settings.heading_security'), build: this._buildSecuritySection },
            { key: 'network',  glyph: '⇄', group: t('settings.nav_group_network'),     label: t('settings.heading_network'),  build: this._buildNetworkSection },
            { key: 'access',   glyph: '⇆', group: t('settings.nav_group_network'),     label: t('settings.heading_access'),   build: this._buildAccessSection },
            // v0.5.228 — EVM chains (shared): reward address, mining, sync mode
            // across all three EVM sidechains. Grouped with Network as the
            // chain-facing config area; per-chain overrides live on each
            // chain's dashboard card.
            { key: 'evm',      glyph: '◧', group: t('settings.nav_group_network'),     label: t('settings.heading_evm_shared'), build: this._buildEvmSharedSection },
            // beta.3.19 — Alerts: when the dashboard health detectors fire.
            { key: 'alerts',   glyph: '⚑', group: t('settings.nav_group_maintenance'), label: t('settings.heading_alerts'),   build: this._buildAlertsSection },
            { key: 'storage',  glyph: '◳', group: t('settings.nav_group_maintenance'), label: t('settings.heading_storage'),  build: this._buildStorageSection },
            { key: 'advanced', glyph: '⚙', group: t('settings.nav_group_maintenance'), label: t('settings.heading_advanced'), build: this._buildAdvancedSection },
            // beta.3.33 — Danger Zone. Update / chain-resync / uninstall /
            // nuke. Red-accented; each card is action-driven with a typed
            // confirmation gate.
            { key: 'danger',   glyph: '⚠', group: t('settings.nav_group_danger'),     label: t('settings.heading_danger'),   build: this._buildDangerSection },
        ];
        var lastNavGroup = null;
        nav.forEach(function (item) {
            // v0.5.245 (BL-2) — emit a group subheader into the wide rail when
            // the group changes. Decorative (aria-hidden): the rail is a
            // tablist and each section card carries its own accessible
            // heading, so the visual grouping is for sighted users; AT still
            // navigates the role=tab buttons directly.
            if (item.group && item.group !== lastNavGroup) {
                var grp = document.createElement('div');
                grp.className = 'enm-settings-nav-group';
                grp.setAttribute('aria-hidden', 'true');
                grp.textContent = item.group;
                self._navEl.appendChild(grp);
                lastNavGroup = item.group;
            }
            // Nav item (wide rail).
            var navBtn = document.createElement('button');
            navBtn.type = 'button';
            navBtn.className = 'enm-settings-nav-item';
            navBtn.setAttribute('role', 'tab');
            navBtn.dataset.key = item.key;
            var navGlyph = document.createElement('span');
            navGlyph.className = 'enm-settings-nav-glyph';
            navGlyph.setAttribute('aria-hidden', 'true');
            navGlyph.textContent = item.glyph;
            navBtn.appendChild(navGlyph);
            navBtn.appendChild(document.createTextNode(item.label));
            navBtn.addEventListener('click', function () { self._activate(item.key); });
            self._navEl.appendChild(navBtn);
            self._navItems[item.key] = navBtn;

            // Pill (narrow/compact alt).
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'enm-settings-pill';
            pill.setAttribute('role', 'tab');
            pill.dataset.key = item.key;
            pill.textContent = item.glyph + ' ' + item.label;
            pill.addEventListener('click', function () { self._activate(item.key); });
            self._pillsEl.appendChild(pill);
            self._pills[item.key] = pill;

            // Section card.
            var section = item.build.call(self, t);
            section.setAttribute('role', 'tabpanel');
            section.setAttribute('aria-labelledby', 'enm-section-h-' + item.key);
            self._contentEl.appendChild(section);
            self._sections[item.key] = section;
        });

        this.root.appendChild(this._navEl);
        this.root.appendChild(this._pillsEl);
        this.root.appendChild(this._contentEl);

        // 0.2.0-beta.3.8 — wire delegated change/input listeners so each
        // section's "Restart required" / "No restart needed" tag flips
        // to "Unsaved changes" when its body has dirty form state.
        // Cleared by _markClean() on successful save and on refresh()
        // (hydrating from /config is the canonical clean state).
        this._wireDirtyTracking();

        this._activate(this._activeKey);
    };

    /**
     * 0.2.0-beta.3.8 — attach input/change listeners to each section's
     * body element so changes anywhere inside the section's form rows
     * flip its tag to "Unsaved changes". Single listener per section
     * via event delegation; each fires `setDirty(true)` exactly once
     * per dirty transition, then re-checks against a "snapshot of clean"
     * is intentionally NOT done — once dirty, the tag stays warning
     * until Save (or Revert via refresh()) clears it. Operators can
     * be on the safe side and Save explicitly; we don't try to detect
     * "operator changed X then changed X back" as clean.
     *
     * @private
     */
    // beta.3.18 — section keys map 1:1 to instance properties. Cleaner
    // than the alphabet-soup `key === 'advanced' ? 'adv' : ...` chain
    // and easier to extend when more sections land in later phases.
    // beta.3.19 — Alerts section inserted between Network and Storage
    // (it's about when-to-notify, sits between the access/network and
    // the data-at-rest sections).
    var SECTION_KEYS = ['access', 'identity', 'security', 'network', 'alerts', 'storage', 'advanced', 'evm', 'danger'];
    SettingsTab.prototype._sectionRef = function (key) {
        return this['_' + key];
    };

    SettingsTab.prototype._wireDirtyTracking = function () {
        var self = this;
        var handler = function (sectionKey) {
            return function () {
                var sec = self._sectionRef(sectionKey);
                if (sec && typeof sec.setDirty === 'function') {
                    sec.setDirty(true);
                }
            };
        };
        // Attach to each section's BODY el so events bubble up from
        // any contained form control (input, select, button, toggle).
        SECTION_KEYS.forEach(function (key) {
            var sec = self._sectionRef(key);
            if (!sec || !sec.body) { return; }
            sec.body.addEventListener('input',  handler(key));
            sec.body.addEventListener('change', handler(key));
            // Buttons inside the body (toggle, segmented) emit `click`
            // when state changes; also count those.
            sec.body.addEventListener('click',  handler(key));
        });
    };

    /**
     * 0.2.0-beta.3.8 — flip a section back to clean. Called from
     * refresh() after /config hydration and from each section's Save
     * .then() after a successful PUT.
     *
     * @private
     * @param {string} key  one of SECTION_KEYS (access/security/network/storage/advanced)
     */
    SettingsTab.prototype._markClean = function (key) {
        var sec = this._sectionRef(key);
        if (sec && typeof sec.setDirty === 'function') {
            sec.setDirty(false);
        }
    };

    /**
     * @private
     * Activate a section: toggle [hidden] on the other section-cards,
     * mirror .active class + aria-selected onto nav + pill.
     */
    SettingsTab.prototype._activate = function (key) {
        if (!this._sections[key]) { return; }
        this._activeKey = key;
        Object.keys(this._sections).forEach(function (k) {
            this._sections[k].hidden = (k !== key);
        }, this);
        Object.keys(this._navItems).forEach(function (k) {
            var active = (k === key);
            this._navItems[k].classList.toggle('active', active);
            this._navItems[k].setAttribute('aria-selected', active ? 'true' : 'false');
            this._pills[k].classList.toggle('active', active);
            this._pills[k].setAttribute('aria-selected', active ? 'true' : 'false');
        }, this);
        // beta.3.20 — refresh disk usage when the operator opens the
        // Storage section so they see current sizes + the latest auto-
        // backup time without having to reload the whole tab.
        if (key === 'storage' && typeof this._refreshStorageUsage === 'function') {
            this._refreshStorageUsage();
        }
        // beta.3.21 — same for Security: refresh the rules list +
        // activity table on every section activation. Cheap (two
        // small GETs) and operators expect "what just ran" to be
        // current when they look.
        if (key === 'security') {
            if (typeof this._refreshHealingRules === 'function') {
                this._refreshHealingRules();
            }
            if (typeof this._refreshHealingActivity === 'function') {
                this._refreshHealingActivity();
            }
            // beta.3.78 — snapshot panel removed; no refresh needed.
        }
        // beta.3.33 — Danger Zone: pull latest version info from GitHub
        // each time the section opens so the operator never sees a stale
        // "no update available" while one's actually published.
        if (key === 'danger' && typeof this._refreshUpdateInfo === 'function') {
            this._refreshUpdateInfo();
        }
        // v0.5.232 — repaint the Resync sub-card based on the operator's
        // current setupRole (Council vs BPoS). Idempotent.
        if (key === 'danger' && typeof this._refreshDangerResyncCard === 'function') {
            this._refreshDangerResyncCard();
        }
        // beta.3.43 — Identity tab: refresh /identity (current cached
        // pubkey + address, producer state, keystore-exists flag) so the
        // operator sees current info on every entry.
        if (key === 'identity' && typeof this._refreshIdentity === 'function') {
            this._refreshIdentity();
        }
        // v0.5.228 — EVM shared tab: re-fetch /chains/{esc,eid,pg} on
        // every activation so the values + divergence indicator reflect
        // any changes made from per-chain cards since the last visit.
        if (key === 'evm' && typeof this._refreshEvmShared === 'function') {
            this._refreshEvmShared();
        }
    };

    // -----------------------------------------------------------------
    // Section: Network
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildNetworkSection = function (t) {
        var self = this;
        // 0.5.34 audit Session 34 — dropped helpCodes config-path leak
        // ('chains.mainchain.dpos.ipAddressMode' + 'ipAddressManual').
        // Operators don't edit the config file directly; the "Restart
        // required" warn-tag already conveys the save consequence.
        // 0.5.139 audit Session 139 — wire up settings.network_intro per
        // the same pattern as the other 5 sections (access, identity,
        // security, alerts, storage, advanced all use t('settings.X_intro')).
        // Pre-0.5.139 the Network section was the lone outlier using
        // hardcoded inline English ("Tells other DPoS peers which IP to
        // dial this node at. Save requires a chain restart."). The
        // strings.js network_intro has the better operator-friendly copy
        // ("How DPoS peers reach this node. Set once at first boot; only
        // change if your public IP moves.") and was sitting orphan.
        var sec = makeSection({
            id: 'network',
            icon: '⇄',
            title: t('settings.heading_network'),
            help: t('settings.network_intro'),
            tag: { kind: 'warn', label: 'Restart required' },
        });
        this._network = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };

        // Row 1 — IP mode segmented control.
        var seg = makeSeg({
            options: [
                { value: 'auto',   label: 'Auto-detect' },
                { value: 'manual', label: 'Manual' },
            ],
            value: 'auto',
            onChange: function (v) { self._onNetworkModeChange(v); },
        });
        this._network.seg = seg;
        // 0.5.34 audit Session 34 — dropped helpCodes HTTP-path leak
        // ('GET /system/extip'). Operators don't curl this endpoint;
        // they want to know what the two modes do, not the API behind
        // the probe. Same Session 33 leak-fix pattern.
        sec.body.appendChild(makeFormRow({
            label: 'External IP detection',
            help: 'Auto: ENM detects the external IP automatically on each restart. Manual: pin a fixed address.',
            control: seg.el,
        }));

        // Row 2 — Manual IP input (disabled when mode === auto).
        this._network.manualInput = makeInput({
            type: 'text',
            placeholder: 'e.g. 203.0.113.14',
            mono: true,
            ariaLabel: 'Manual IP address',
            describedById: 'enm-net-status',
        });
        this._network.manualInput.setAttribute('autocomplete', 'off');
        this._network.manualInput.setAttribute('spellcheck', 'false');
        this._network.manualInput.setAttribute('autocapitalize', 'off');
        this._network.manualInput.setAttribute('autocorrect', 'off');
        this._network.manualRow = makeFormRow({
            label: 'Manual IP address',
            help: 'Enabled only when mode is Manual. IPv4 or IPv6.',
            control: this._network.manualInput,
            disabled: true,
        });
        sec.body.appendChild(this._network.manualRow);

        // Row 3 — Detect now button (no save).
        var detectBtn = document.createElement('button');
        detectBtn.type = 'button';
        detectBtn.className = 'enm-btn';
        detectBtn.textContent = t('settings.ip_detect_btn');
        this._network.detectBtn = detectBtn;
        this._network.detectResult = document.createElement('span');
        this._network.detectResult.className = 'enm-detect-result';
        var detectGroup = document.createElement('div');
        detectGroup.className = 'enm-form-inline';
        detectGroup.appendChild(detectBtn);
        detectGroup.appendChild(this._network.detectResult);
        detectBtn.addEventListener('click', function () { self._detectIp(); });
        sec.body.appendChild(makeFormRow({
            label: 'Detect now',
            help: 'One-shot probe. Shows the result inline without saving.',
            control: detectGroup,
        }));

        // Foot status node — also gets the id described by the manual
        // input so AT links error text to the offending field.
        sec.statusEl.id = 'enm-net-status';

        sec.saveBtn.addEventListener('click', function () { self._saveNetwork(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('network'); });

        return sec.card;
    };

    /** @private — Manual IP row is gated on seg state. */
    SettingsTab.prototype._onNetworkModeChange = function (mode) {
        // 0.2.0-beta.3.4 hotfix — belt-and-suspenders guard. makeSeg's
        // initial paint no longer fires onChange (post-beta.3.4), but
        // if a future refactor reintroduces the racy pattern this
        // guard surfaces it as a no-op rather than letting the
        // SettingsTab constructor throw mid-build and leave a blank
        // pane.
        if (!this._network || !this._network.manualRow) { return; }
        var disabled = (mode !== 'manual');
        this._network.manualRow.setAttribute('data-disabled', disabled ? 'true' : 'false');
    };

    /** @private */
    SettingsTab.prototype._detectIp = function () {
        var t = root.enmTOrFallback;
        var self = this;
        this._network.detectResult.textContent = t('settings.ip_detecting');
        this._network.detectResult.classList.remove('ok', 'err');
        this.api.get('/system/extip', { skipCache: true }).then(function (data) {
            if (self._destroyed) { return; }
            if (data && data.ok && data.ip) {
                self._network.detectResult.textContent =
                    t('settings.ip_detected', { ip: data.ip });
                self._network.detectResult.classList.add('ok');
            } else {
                var reason = (data && data.reason) || t('settings.ip_detect_unknown');
                self._network.detectResult.textContent =
                    t('settings.ip_detect_failed', { reason: reason });
                self._network.detectResult.classList.add('err');
            }
        }).catch(function (err) {
            if (self._destroyed) { return; }
            if (err && err.status === 401) { return; }
            self._network.detectResult.textContent = t('settings.ip_detect_failed', {
                reason: err.message || String(err),
            });
            self._network.detectResult.classList.add('err');
        });
    };

    /** @private */
    SettingsTab.prototype._saveNetwork = function () {
        var t = root.enmTOrFallback;
        var self = this;
        // Clear stale aria-invalid (batch 85).
        this._network.manualInput.removeAttribute('aria-invalid');

        var mode = this._network.seg.getValue();
        var manualValue = this._network.manualInput.value.trim();

        // Manual mode requires a value — block the PUT inline.
        if (mode === 'manual' && manualValue.length === 0) {
            setStatus(this._network.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.err_ip_required') }));
            this._network.manualInput.setAttribute('aria-invalid', 'true');
            try { this._network.manualInput.focus({ preventScroll: true }); }
            catch (e) { this._network.manualInput.focus(); }
            return;
        }

        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(this._network.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(this._network.saveBtn, savingLabel, function () {
            return self.api.put('/config/network',
                { mode: mode, manualValue: manualValue })
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(self._network.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self.refresh('network');
                    // beta.3.18 — Network change needs a chain restart
                    // before peers see the new IP. Prompt the operator.
                    self._promptRestartIfNeeded('network');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(self._network.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    // -----------------------------------------------------------------
    // Section: Mainchain Advanced
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildAdvancedSection = function (t) {
        var self = this;
        var sec = makeSection({
            id: 'advanced',
            icon: '⚙',
            title: t('settings.heading_advanced'),
            help: t('settings.advanced_intro'),
            tag: { kind: 'warn', label: 'Restart required' },
        });
        this._advanced = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };
        // beta.3.18 backward-compat alias — _saveAdvanced and _fillAdvanced
        // refer to this._adv historically. Both reshaping paths now hit
        // this._advanced; keep the alias so a stray reference doesn't
        // throw mid-refresh.
        this._adv = this._advanced;

        // beta.3.18 — operator chose option (2b): the dangerous knobs
        // are always visible at the bottom of Settings, but only behind
        // an explicit "don't touch this" warning banner. This makes
        // them discoverable without making them tempting.
        var warn = document.createElement('div');
        warn.className = 'enm-advanced-warning';
        var warnIcon = document.createElement('div');
        warnIcon.className = 'enm-advanced-warning-icon';
        warnIcon.setAttribute('aria-hidden', 'true');
        warnIcon.textContent = '⚠';
        var warnBody = document.createElement('div');
        warnBody.className = 'enm-advanced-warning-body';
        var warnTitle = document.createElement('div');
        warnTitle.className = 'enm-advanced-warning-title';
        warnTitle.textContent = t('settings.advanced_warn_title');
        var warnText = document.createElement('div');
        warnText.className = 'enm-advanced-warning-text';
        warnText.textContent = t('settings.advanced_warn_body');
        warnBody.appendChild(warnTitle);
        warnBody.appendChild(warnText);
        warn.appendChild(warnIcon);
        warn.appendChild(warnBody);
        sec.body.appendChild(warn);

        // v0.5.228 — Stage-sync card moved to Settings → Danger Zone
        // (operator directive 2026-05-26: the staged-start orchestrator is
        // destructive — pins the host at near-full CPU for hours, runs
        // per-chain start calls — and must require explicit opt-in via a
        // Danger Zone toggle, not auto-reveal based on host detection).
        // Previous home: this section, auto-revealed when enmHostLimits.
        // isConstrained returned true. New home: Danger Zone sub-card 3b.

        // Row 1 — Log level.
        this._advanced.logLevel = makeSelectWrap({
            options: [
                { value: 'debug', label: 'debug' },
                { value: 'info',  label: 'info' },
                { value: 'warn',  label: 'warn' },
                { value: 'error', label: 'error' },
            ],
            value: 'info',
        });
        sec.body.appendChild(makeFormRow({
            label: 'Log level',
            help: 'Mapped to the ela.conf ',
            helpCodes: ['PrintLevel'],
            helpSuffix: ' setting. Default (info) is right for almost everyone.',
            control: this._advanced.logLevel.el,
        }));

        // Row 2 — Archive mode toggle.
        this._advanced.archiveMode = makeToggleRow({
            initial: false,
            getLabel: function (on) {
                return on
                    ? { title: 'On · keep full block history',
                        sub: 'Disk-heavy. Recommended only if an explorer needs it.' }
                    : { title: 'Off · prune historical blocks',
                        sub: 'Recommended for most operators.' };
            },
        });
        sec.body.appendChild(makeFormRow({
            label: 'Archive mode',
            help: 'Keeps full historical block data instead of pruning. Disk-heavy.',
            control: this._advanced.archiveMode.el,
        }));

        // Row 3 — Memory limit with MB suffix.
        this._advanced.memory = makeInputSuffix({
            type: 'number',
            value: '4096',
            min: 512,
            max: 32768,
            step: 1,
            mono: true,
            suffix: 'MB',
            ariaLabel: 'Memory limit in megabytes',
            describedById: 'enm-adv-status',
        });
        sec.body.appendChild(makeFormRow({
            label: 'Memory limit',
            help: 'Per-process cap. Range 512 – 32,768 MB. Default 4,096.',
            control: this._advanced.memory.el,
        }));

        sec.statusEl.id = 'enm-adv-status';

        sec.saveBtn.addEventListener('click', function () { self._saveAdvanced(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('advanced'); });

        return sec.card;
    };

    // -----------------------------------------------------------------
    // Section: EVM chains (shared) — v0.5.228
    //
    // Operator directive 2026-05-27: "the multi EVM shared settings for
    // all services isn't there either". Pre-228 every EVM setting was
    // per-chain only, so changing one knob (reward address, sync mode)
    // across the Council quartet required 3 separate trips into 3
    // separate chain cards. This section is the single source of truth
    // for settings that are typically homogeneous across the EVMs.
    //
    // Data flow:
    //   - Activation triggers _refreshEvmShared, which fires 3 parallel
    //     GET /chains/{esc,eid,pg} requests.
    //   - The response shape includes miner.{rewardAddress,enabled} and
    //     sync.mode (when present on the cfg).
    //   - "All three match" → shared input + green "✓ same on all".
    //   - "Diverged"        → input shows nothing (so a save doesn't
    //                         silently overwrite without explicit intent)
    //                         and a warning lists the per-chain values.
    //   - "Apply" issues 3 sequential PUT /chains/X/class-b-config
    //     requests; partial failure surfaces ok/fail counts inline so
    //     the operator can retry just the failed chains from per-chain.
    //
    // Per-chain overrides (bootnodes, ports, binary version, the
    // auto-generated EVM keystore account) still live in the dashboard
    // EVM cards — this section is for the homogeneous knobs only.
    // -----------------------------------------------------------------
    var EVM_SHARED_CHAINS = ['esc', 'eid', 'pg'];

    SettingsTab.prototype._buildEvmSharedSection = function (t) {
        var self = this;

        var card = document.createElement('section');
        card.className = 'enm-section-card enm-section-evm-shared';

        var head = document.createElement('div');
        head.className = 'enm-section-card-head';
        var icon = document.createElement('div');
        icon.className = 'enm-section-card-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '◧';
        head.appendChild(icon);
        var headbody = document.createElement('div');
        headbody.className = 'enm-section-card-headbody';
        var title = document.createElement('div');
        title.className = 'enm-section-card-title';
        title.id = 'enm-section-h-evm';
        title.textContent = t('settings.heading_evm_shared');
        headbody.appendChild(title);
        var help = document.createElement('div');
        help.className = 'enm-section-card-help';
        help.textContent = t('settings.evm_shared_intro');
        headbody.appendChild(help);
        head.appendChild(headbody);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'enm-section-card-body';
        card.appendChild(body);

        this._evmShared = {
            card: card,
            body: body,
            // No section-level save — each row has its own Apply button.
            setDirty: function () {},
            // Latest snapshot of {chainId → {rewardAddress, enabled, syncMode}}
            // populated by _refreshEvmShared; null until first fetch resolves.
            latest: null,
        };

        // --- Reward address row -----------------------------------------
        var rewardCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.evm_shared_reward_title'),
            help:  t('settings.evm_shared_reward_help'),
        });
        body.appendChild(rewardCard.el);
        var rewardInputId = 'enm-evm-shared-reward-input';
        var rewardInputWrap = document.createElement('div');
        rewardInputWrap.className = 'enm-evm-shared-input-row';
        rewardInputWrap.innerHTML = ''
            + '<label class="enm-sr-only" for="' + rewardInputId + '">'
            +   _h(t('settings.evm_shared_reward_title')) + '</label>'
            + '<input type="text" id="' + rewardInputId
            +   '" class="enm-input enm-mono enm-evm-shared-input"'
            +   ' autocomplete="off" spellcheck="false" inputmode="text"'
            +   ' placeholder="' + _h(t('settings.evm_shared_reward_placeholder')) + '">';
        rewardCard.body.appendChild(rewardInputWrap);
        var rewardStatusEl = document.createElement('div');
        rewardStatusEl.className = 'enm-evm-shared-status';
        rewardStatusEl.setAttribute('role', 'status');
        rewardStatusEl.setAttribute('aria-live', 'polite');
        rewardStatusEl.textContent = t('settings.evm_shared_reward_loading');
        rewardCard.body.appendChild(rewardStatusEl);
        var rewardBtn = document.createElement('button');
        rewardBtn.type = 'button';
        rewardBtn.className = 'enm-btn enm-btn-primary';
        rewardBtn.textContent = t('settings.evm_shared_reward_apply_btn');
        rewardBtn.disabled = true;  // enabled when latest loads
        rewardCard.foot.appendChild(rewardBtn);
        var rewardInputEl = rewardInputWrap.querySelector('input');
        rewardInputEl.addEventListener('click', function () {
            // First click on the input clears the divergence-blocked empty
            // state so the operator knows they can type freely.
            rewardInputEl.removeAttribute('readonly');
        });
        rewardBtn.addEventListener('click', function () {
            self._applyEvmSharedReward(rewardInputEl.value, rewardBtn, rewardStatusEl);
        });
        this._evmShared.reward = {
            input: rewardInputEl,
            status: rewardStatusEl,
            btn: rewardBtn,
        };

        // --- Mining state row -------------------------------------------
        // Read-only summary per chain. Bulk mining toggle is intentionally
        // deferred — flipping mining is a structural change (validator vs
        // follower) that warrants per-chain confirmation, not a bulk swap.
        var miningCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.evm_shared_mining_title'),
            help:  t('settings.evm_shared_mining_help'),
        });
        body.appendChild(miningCard.el);
        var miningGrid = document.createElement('div');
        miningGrid.className = 'enm-evm-shared-mining-grid';
        EVM_SHARED_CHAINS.forEach(function (cid) {
            var cell = document.createElement('div');
            cell.className = 'enm-evm-shared-mining-cell';
            cell.dataset.chain = cid;
            cell.innerHTML = ''
                + '<span class="enm-evm-shared-mining-name">' + _h(cid) + '</span>'
                + '<span class="enm-evm-shared-mining-pill" data-mining="?">—</span>';
            miningGrid.appendChild(cell);
        });
        miningCard.body.appendChild(miningGrid);
        var miningStatusEl = document.createElement('div');
        miningStatusEl.className = 'enm-evm-shared-status';
        miningStatusEl.setAttribute('role', 'status');
        miningCard.body.appendChild(miningStatusEl);
        this._evmShared.mining = {
            grid: miningGrid,
            status: miningStatusEl,
        };

        // --- Sync mode row ----------------------------------------------
        var syncCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.evm_shared_sync_title'),
            help:  t('settings.evm_shared_sync_help'),
        });
        body.appendChild(syncCard.el);
        var syncSelectWrap = document.createElement('div');
        syncSelectWrap.className = 'enm-evm-shared-input-row';
        // v0.5.235 — fast removed; validator-grade full is the default.
        syncSelectWrap.innerHTML = ''
            + '<select class="enm-select enm-evm-shared-select" aria-label="Sync mode">'
            +   '<option value="full">full</option>'
            +   '<option value="archive">archive</option>'
            + '</select>';
        syncCard.body.appendChild(syncSelectWrap);
        var syncStatusEl = document.createElement('div');
        syncStatusEl.className = 'enm-evm-shared-status';
        syncStatusEl.setAttribute('role', 'status');
        syncStatusEl.setAttribute('aria-live', 'polite');
        syncStatusEl.textContent = t('settings.evm_shared_reward_loading');
        syncCard.body.appendChild(syncStatusEl);
        var syncBtn = document.createElement('button');
        syncBtn.type = 'button';
        syncBtn.className = 'enm-btn enm-btn-primary';
        syncBtn.textContent = t('settings.evm_shared_sync_apply_btn');
        syncBtn.disabled = true;
        syncCard.foot.appendChild(syncBtn);
        var syncSelectEl = syncSelectWrap.querySelector('select');
        syncBtn.addEventListener('click', function () {
            self._applyEvmSharedSync(syncSelectEl.value, syncBtn, syncStatusEl);
        });
        this._evmShared.sync = {
            select: syncSelectEl,
            status: syncStatusEl,
            btn: syncBtn,
        };

        // --- Peers & bootnodes (per chain) ------------------------------
        // v0.5.237 — peers/bootnodes are genuinely per-chain (each EVM keeps
        // its own enode set), so they get a per-chain collapsible accordion
        // here inside the single Sidechain settings tab. Each <details> lazily
        // mounts an EnmPeersPanel the first time it's opened, so collapsed
        // chains never poll. This replaces the per-chain peers panel that used
        // to live in _renderClassBForm — reached only via the removed chain
        // selector.
        var peersCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.evm_shared_peers_title'),
            help:  t('settings.evm_shared_peers_help'),
        });
        body.appendChild(peersCard.el);
        this._evmShared.peersMounts = {};
        this._evmShared.peersPanels = [];
        this._evmShared.peersWired = {};
        EVM_SHARED_CHAINS.forEach(function (cid) {
            var det = document.createElement('details');
            det.className = 'enm-evm-shared-peers-accordion';
            det.dataset.chain = cid;
            var sum = document.createElement('summary');
            sum.className = 'enm-evm-shared-peers-summary';
            sum.textContent = _tFb('chain_name.' + cid, cid);
            det.appendChild(sum);
            var mount = document.createElement('div');
            mount.className = 'enm-evm-shared-peers-mount';
            det.appendChild(mount);
            peersCard.body.appendChild(det);
            self._evmShared.peersMounts[cid] = mount;
            // Lazy-mount the panel the first time this accordion opens.
            det.addEventListener('toggle', function () {
                if (det.open) { self._mountEvmPeersPanel(cid); }
            });
        });

        // --- Per-chain footer note --------------------------------------
        var footer = document.createElement('div');
        footer.className = 'enm-evm-shared-footer-note';
        footer.textContent = t('settings.evm_shared_perchain_footer');
        body.appendChild(footer);

        return card;
    };

    /**
     * v0.5.237 — lazily mount the per-chain EnmPeersPanel for one EVM
     * sidechain (esc/eid/pg) inside its Sidechain-settings accordion.
     * Idempotent — mounts at most once per chain (gated by peersWired) so
     * re-opening the accordion doesn't stack panels or duplicate polls.
     * @private
     * @param {string} chainId — esc | eid | pg
     */
    SettingsTab.prototype._mountEvmPeersPanel = function (chainId) {
        if (!this._evmShared || !this._evmShared.peersMounts) { return; }
        if (this._evmShared.peersWired[chainId]) { return; }
        var mount = this._evmShared.peersMounts[chainId];
        if (!mount || !root.EnmPeersPanel) { return; }
        var panel = new root.EnmPeersPanel({
            api: this.api,
            chainId: chainId,
            notifications: this.notifications,
        });
        panel.mount(mount);
        this._evmShared.peersPanels.push(panel);
        this._evmShared.peersWired[chainId] = true;
    };

    /**
     * Fetch /chains/{esc,eid,pg} in parallel and fill the shared
     * settings UI based on whether values match or diverge.
     * @private
     */
    SettingsTab.prototype._refreshEvmShared = function () {
        var self = this;
        if (!this._evmShared || !this.api) { return; }

        Promise.all(EVM_SHARED_CHAINS.map(function (cid) {
            return self.api.get('/chains/' + cid).then(function (env) {
                var d = (env && env.result) || (env && env.data) || env || {};
                return {
                    chainId: cid,
                    rewardAddress: (d.miner && d.miner.rewardAddress) || '',
                    // v0.5.228d (audit follow-up) — keep `enabled` for
                    // back-compat (older readers) but the authoritative
                    // value for the mining-row pills is `chainState`,
                    // attached by GET /chains/:id when the adapter is
                    // class B. Null/undefined means we couldn't reach
                    // the mainchain RPC to derive it — the renderer
                    // treats that as 'unknown' (showing "Detecting…")
                    // rather than guessing "On" or "Off".
                    enabled: !!(d.miner && d.miner.enabled),
                    chainState: (d.miner && d.miner.chainState) || null,
                    // sync.mode isn't currently returned by /chains/:id;
                    // when missing we treat as 'full' (v0.5.235 default —
                    // fast sync removed). A future backend pass should add
                    // sync.mode to the response.
                    syncMode: (d.sync && d.sync.mode && d.sync.mode !== 'fast') ? d.sync.mode : 'full',
                    ok: true,
                };
            }).catch(function () {
                return { chainId: cid, ok: false };
            });
        })).then(function (results) {
            if (self._destroyed) { return; }
            self._evmShared.latest = results;
            self._fillEvmShared(results);
        });
    };

    /** @private */
    SettingsTab.prototype._fillEvmShared = function (results) {
        var t = root.enmTOrFallback || root.enmT || function (k) { return k; };
        if (!this._evmShared) { return; }

        // --- Reward address ---------------------------------------------
        // v0.5.228 patch — split the "all failed" case out FIRST. Pre-patch
        // a wholly-failed fetch silently passed through allEmpty=true (the
        // vacuous `[].every` truthiness) and rendered "No reward address
        // set on any chain" — a lie that made operators think their setup
        // values were wiped. Now we explicitly say "Couldn't read from
        // chains" so the operator knows it's a transport problem, not a
        // missing-data problem, and can retry instead of re-entering the
        // address.
        var ok = results.filter(function (r) { return r.ok; });
        var failedCount = results.length - ok.length;
        var values = ok.map(function (r) { return r.rewardAddress; });
        var allEmpty = ok.length > 0 && values.every(function (v) { return !v; });
        var allMatch = ok.length > 0 && values.every(function (v) { return v === values[0] && !!v; });
        var reward = this._evmShared.reward;
        if (reward) {
            if (ok.length === 0) {
                // Hard failure across all 3 chains — most likely auth lapsed
                // or the backend is mid-restart. Don't fake an "unset" state.
                reward.input.value = '';
                reward.btn.disabled = true;
                reward.status.textContent = 'Could not read from chains (' + failedCount + ' of '
                    + results.length + ' failed). Try refreshing this section, or check the dashboard '
                    + 'for chain connectivity.';
                reward.status.className = 'enm-evm-shared-status is-err';
            } else {
                reward.btn.disabled = false;
                if (allMatch) {
                    reward.input.value = values[0];
                    var matchMsg = t('settings.evm_shared_reward_shared');
                    if (failedCount > 0) {
                        matchMsg += ' (' + failedCount + ' of ' + results.length
                            + ' chains didn\'t respond — refresh to retry)';
                    }
                    reward.status.textContent = matchMsg;
                    reward.status.className = 'enm-evm-shared-status is-ok';
                } else if (allEmpty) {
                    reward.input.value = '';
                    reward.status.textContent = t('settings.evm_shared_reward_unset');
                    reward.status.className = 'enm-evm-shared-status is-warn';
                } else {
                    var summary = ok.map(function (r) {
                        return r.chainId + '=' + (r.rewardAddress ? (r.rewardAddress.slice(0, 6) + '…' + r.rewardAddress.slice(-4)) : '(unset)');
                    }).join(', ');
                    reward.input.value = '';  // intentionally blank to require explicit input
                    reward.status.textContent = t('settings.evm_shared_reward_diverged')
                        .replace('{summary}', summary);
                    reward.status.className = 'enm-evm-shared-status is-warn';
                }
            }
        }

        // --- Validator status (per-chain pills) -------------------------
        // v0.5.228d (audit follow-up) — render the same 5-state taxonomy
        // the dashboard EVM card + the per-chain Validator-status badge
        // use, sourced from miner.chainState (attached to GET /chains/:id
        // for class B chains; see chainStateFromRole in routes/chains.js).
        // Pre-228d the pills binary-mapped miner.enabled → "On" / "Off",
        // which (a) failed to distinguish Standby from Inactive, (b) lied
        // when the on-disk cfg.miner.enabled diverged from the live
        // arbiter slate after a Council binding, and (c) reinforced the
        // operator-toggle mental model that we're explicitly retiring.
        var PILL_LABELS = {
            'on-duty':  { text: 'On-duty',   dataState: 'on-duty'  },
            'standby':  { text: 'Standby',   dataState: 'standby'  },
            'inactive': { text: 'Inactive',  dataState: 'off'      },
            'unknown':  { text: 'Detecting', dataState: '?'        },
            'follower': { text: 'Follower',  dataState: 'off'      },
        };
        var mining = this._evmShared.mining;
        if (mining) {
            var stateCounts = { 'on-duty': 0, 'standby': 0, 'inactive': 0, 'unknown': 0, 'follower': 0 };
            var cells = mining.grid.querySelectorAll('.enm-evm-shared-mining-cell');
            Array.prototype.forEach.call(cells, function (cell) {
                var cid = cell.dataset.chain;
                var r = results.find(function (rr) { return rr.chainId === cid; });
                var pill = cell.querySelector('.enm-evm-shared-mining-pill');
                if (!r || !r.ok) {
                    pill.textContent = '—';
                    pill.dataset.mining = '?';
                    return;
                }
                // Prefer chainState from /chains/:id. If absent (older
                // backend), fall back to the legacy enabled→on/off map
                // so the pill still renders something honest.
                var s = r.chainState
                    || (r.enabled ? 'on-duty' : 'inactive');
                stateCounts[s] = (stateCounts[s] || 0) + 1;
                var meta = PILL_LABELS[s] || PILL_LABELS.inactive;
                pill.textContent = meta.text;
                pill.dataset.mining = meta.dataState;
            });
            // Plain-English summary line over the same taxonomy. Wording
            // explicitly distances mining from being an operator choice.
            var summary;
            if (stateCounts['on-duty'] === 3) {
                summary = 'All three EVMs are on-duty — producing blocks this rotation. '
                    + 'Rewards land at the reward address above.';
            } else if (stateCounts.inactive + stateCounts.follower === 3) {
                summary = 'All three EVMs are inactive — this node is not in the current arbiter slate, '
                    + 'so it does not produce blocks. The reward address above stays configured '
                    + 'for when (or if) the on-chain Council binding includes this node.';
            } else if (stateCounts.unknown === 3) {
                summary = 'Detecting — couldn\'t read the on-chain arbiter slate yet '
                    + '(mainchain RPC may still be warming up). Refreshes on every chain start.';
            } else {
                var parts = [];
                if (stateCounts['on-duty']) { parts.push(stateCounts['on-duty'] + ' on-duty'); }
                if (stateCounts.standby)   { parts.push(stateCounts.standby   + ' standby'); }
                if (stateCounts.inactive)  { parts.push(stateCounts.inactive  + ' inactive'); }
                if (stateCounts.unknown)   { parts.push(stateCounts.unknown   + ' detecting'); }
                if (stateCounts.follower)  { parts.push(stateCounts.follower  + ' follower'); }
                summary = parts.join(', ')
                    + '. Validator status is derived from the on-chain arbiter slate, not '
                    + 'operator-set. ENM re-checks on every chain start.';
            }
            mining.status.textContent = summary;
            mining.status.className = 'enm-evm-shared-status';
        }

        // --- Sync mode --------------------------------------------------
        var modes = ok.map(function (r) { return r.syncMode; });
        var syncAllMatch = modes.length > 0 && modes.every(function (m) { return m === modes[0]; });
        var sync = this._evmShared.sync;
        if (sync) {
            sync.btn.disabled = false;
            if (syncAllMatch) {
                sync.select.value = modes[0];
                sync.status.textContent = t('settings.evm_shared_sync_shared')
                    .replace('{mode}', modes[0]);
                sync.status.className = 'enm-evm-shared-status is-ok';
            } else {
                var sm = ok.map(function (r) { return r.chainId + '=' + r.syncMode; }).join(', ');
                sync.status.textContent = t('settings.evm_shared_sync_diverged')
                    .replace('{summary}', sm);
                sync.status.className = 'enm-evm-shared-status is-warn';
            }
        }
    };

    /** @private — write rewardAddress to all 3 EVM chains in parallel. */
    SettingsTab.prototype._applyEvmSharedReward = function (raw, btn, statusEl) {
        var self = this;
        var t = root.enmTOrFallback || root.enmT || function (k) { return k; };
        // Client-side validation via enmEthAddress.check (same path the
        // per-chain EVM card uses). Empty value clears the override on
        // all 3 chains; non-empty must pass EIP-55 + format.
        var payload;
        var trimmed = String(raw || '').trim();
        if (trimmed === '') {
            payload = '';
        } else {
            var rootScope = (typeof window !== 'undefined') ? window : globalThis;
            var check = (rootScope.enmEthAddress && rootScope.enmEthAddress.check)
                ? rootScope.enmEthAddress.check(trimmed)
                : null;
            if (!check) {
                statusEl.textContent = t('settings.evm_shared_reward_validation_err');
                statusEl.className = 'enm-evm-shared-status is-err';
                return;
            }
            if (!check.ok) {
                if (check.error === 'eip55_checksum') {
                    statusEl.textContent = t('settings.evm_shared_reward_eip55_err')
                        .replace('{suggested}', check.suggested);
                } else {
                    statusEl.textContent = t('settings.evm_shared_reward_validation_err');
                }
                statusEl.className = 'enm-evm-shared-status is-err';
                return;
            }
            payload = check.normalized;
        }

        var doApply = function () {
            var done = 0;
            var failed = [];
            statusEl.textContent = t('settings.evm_shared_reward_apply_progress').replace('{done}', 0);
            statusEl.className = 'enm-evm-shared-status';
            return Promise.all(EVM_SHARED_CHAINS.map(function (cid) {
                return self.api.put('/chains/' + cid + '/class-b-config', {
                    miner: { rewardAddress: payload },
                }).then(function () {
                    done += 1;
                    statusEl.textContent = t('settings.evm_shared_reward_apply_progress')
                        .replace('{done}', done);
                }).catch(function () {
                    failed.push(cid);
                });
            })).then(function () {
                if (failed.length === 0) {
                    statusEl.textContent = t('settings.evm_shared_reward_apply_ok');
                    statusEl.className = 'enm-evm-shared-status is-ok';
                } else {
                    statusEl.textContent = t('settings.evm_shared_reward_apply_partial')
                        .replace('{okCount}', 3 - failed.length)
                        .replace('{failed}', failed.join(', '));
                    statusEl.className = 'enm-evm-shared-status is-err';
                }
                // Re-fetch so the divergence summary reflects post-save state.
                self._refreshEvmShared();
            });
        };
        var rootScope = (typeof window !== 'undefined') ? window : globalThis;
        if (typeof rootScope.enmRunOnce === 'function' && btn) {
            rootScope.enmRunOnce(btn, 'Saving…', doApply);
        } else {
            doApply();
        }
    };

    /** @private — write sync.mode to all 3 EVM chains in parallel. */
    SettingsTab.prototype._applyEvmSharedSync = function (mode, btn, statusEl) {
        var self = this;
        var t = root.enmTOrFallback || root.enmT || function (k) { return k; };
        // v0.5.235 — fast removed; coerce any legacy 'fast' to 'full'.
        if (mode === 'fast') { mode = 'full'; }
        if (['full', 'archive'].indexOf(mode) < 0) {
            statusEl.textContent = 'Invalid sync mode.';
            statusEl.className = 'enm-evm-shared-status is-err';
            return;
        }
        var doApply = function () {
            var done = 0;
            var failed = [];
            statusEl.textContent = t('settings.evm_shared_reward_apply_progress').replace('{done}', 0);
            statusEl.className = 'enm-evm-shared-status';
            return Promise.all(EVM_SHARED_CHAINS.map(function (cid) {
                return self.api.put('/chains/' + cid + '/class-b-config', {
                    sync: { mode: mode },
                }).then(function () {
                    done += 1;
                    statusEl.textContent = t('settings.evm_shared_reward_apply_progress')
                        .replace('{done}', done);
                }).catch(function () {
                    failed.push(cid);
                });
            })).then(function () {
                if (failed.length === 0) {
                    statusEl.textContent = t('settings.evm_shared_reward_apply_ok');
                    statusEl.className = 'enm-evm-shared-status is-ok';
                } else {
                    statusEl.textContent = t('settings.evm_shared_reward_apply_partial')
                        .replace('{okCount}', 3 - failed.length)
                        .replace('{failed}', failed.join(', '));
                    statusEl.className = 'enm-evm-shared-status is-err';
                }
                self._refreshEvmShared();
            });
        };
        var rootScope = (typeof window !== 'undefined') ? window : globalThis;
        if (typeof rootScope.enmRunOnce === 'function' && btn) {
            rootScope.enmRunOnce(btn, 'Saving…', doApply);
        } else {
            doApply();
        }
    };

    // -----------------------------------------------------------------
    // Section: Danger Zone (beta.3.33 — NEW)
    //   Four destructive actions backed by /api/enm/maintenance/*:
    //     1. Update ENM extension       (no typed gate — operator-clicked)
    //     2. Chain resync               (gate: type chainId, e.g. "mainchain")
    //     3. App removal                (gate: type "remove")
    //     4. Nuclear wipe               (gate: type "WIPE EVERYTHING")
    //
    //   Each is its own self-contained sub-card. No section-level Save/
    //   Revert — each card has its own action button.
    // -----------------------------------------------------------------
    SettingsTab.prototype._buildDangerSection = function (t) {
        var self = this;

        // Outer section card. We don't use makeSection() here because
        // the Save/Revert footer doesn't fit the destructive-action
        // pattern — each sub-card has its own button.
        var card = document.createElement('section');
        card.className = 'enm-section-card enm-section-danger';

        var head = document.createElement('div');
        head.className = 'enm-section-card-head';
        var icon = document.createElement('div');
        icon.className = 'enm-section-card-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '⚠';
        head.appendChild(icon);
        var headbody = document.createElement('div');
        headbody.className = 'enm-section-card-headbody';
        var title = document.createElement('div');
        title.className = 'enm-section-card-title';
        title.id = 'enm-section-h-danger';
        title.textContent = t('settings.heading_danger');
        headbody.appendChild(title);
        var help = document.createElement('div');
        help.className = 'enm-section-card-help';
        help.textContent = t('settings.danger_intro');
        headbody.appendChild(help);
        head.appendChild(headbody);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'enm-section-card-body';
        card.appendChild(body);

        // Track danger-zone elements on the instance for hydration.
        this._danger = {
            card: card,
            body: body,
            // setDirty no-op so the wireDirtyTracking call doesn't blow up.
            // Danger Zone never has unsaved state.
            setDirty: function () {},
        };

        // ---------- Sub-card 1: Update ----------
        var updateCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.danger_update_title'),
            help: t('settings.danger_update_help'),
        });
        body.appendChild(updateCard.el);
        // Version info row (current / latest / published) — hydrated
        // from GET /maintenance/check-update on section activation.
        var versionRow = document.createElement('div');
        versionRow.className = 'enm-danger-versionrow';
        var verCurrent = document.createElement('div');
        verCurrent.className = 'enm-danger-versioncell';
        verCurrent.innerHTML = '<div class="enm-danger-versionlabel">'
            + _h(t('settings.danger_update_current_label'))
            + '</div><div class="enm-danger-versionval" data-current>—</div>';
        var verLatest = document.createElement('div');
        verLatest.className = 'enm-danger-versioncell';
        verLatest.innerHTML = '<div class="enm-danger-versionlabel">'
            + _h(t('settings.danger_update_latest_label'))
            + '</div><div class="enm-danger-versionval" data-latest>—</div>';
        versionRow.appendChild(verCurrent);
        versionRow.appendChild(verLatest);
        updateCard.body.appendChild(versionRow);
        // Update button + status.
        var updateBtn = document.createElement('button');
        updateBtn.type = 'button';
        updateBtn.className = 'enm-btn enm-btn-primary';
        updateBtn.textContent = t('settings.danger_update_btn');
        updateBtn.disabled = true;  // enabled once check-update returns updateAvailable
        var updateStatus = document.createElement('div');
        updateStatus.className = 'enm-danger-status';
        updateStatus.setAttribute('role', 'status');
        updateStatus.setAttribute('aria-live', 'polite');
        updateCard.foot.appendChild(updateStatus);
        updateCard.foot.appendChild(updateBtn);
        this._danger.update = {
            card: updateCard.el,
            currentEl: verCurrent.querySelector('[data-current]'),
            latestEl: verLatest.querySelector('[data-latest]'),
            btn: updateBtn,
            status: updateStatus,
            tag: null,  // set by _refreshUpdateInfo
        };
        updateBtn.addEventListener('click', function () { self._doUpdate(); });

        // ---------- Sub-card 2: Resync chains (v0.5.232, mode-aware) ----------
        // Pre-v0.5.232 this card was hard-coded to mainchain, which broke
        // Council operators (couldn't resync EID/ESC/PG from the UI). Now
        // the card paints differently based on cfg setupRole:
        //   - BPoS: single "Resync Main chain" button (Main chain is the
        //     only chain with chaindata on a BPoS supernode)
        //   - Council: checkbox list of {Main chain, ESC, EID, PG} (the 4
        //     chains with chaindata; Arbiter + oracles are services, no
        //     chaindata to wipe). Default all checked.
        // Mode lookup happens on section activation via _refreshDangerResyncCard
        // (calls /system/identity).
        var resyncCard = _buildDangerCard({
            kind: 'warn',
            title: t('settings.danger_resync_title'),
            help: t('settings.danger_resync_help'),
        });
        body.appendChild(resyncCard.el);
        // Mode container — _refreshDangerResyncCard re-renders this inner
        // body once setupRole is known.
        var resyncModeContainer = document.createElement('div');
        resyncModeContainer.className = 'enm-danger-resync-modes';
        resyncCard.body.appendChild(resyncModeContainer);
        var resyncStatus = document.createElement('div');
        resyncStatus.className = 'enm-danger-status';
        resyncStatus.setAttribute('role', 'status');
        resyncStatus.setAttribute('aria-live', 'polite');
        resyncCard.foot.appendChild(resyncStatus);
        // Track the resync card so _refreshDangerResyncCard can repaint.
        this._danger.resync = {
            card: resyncCard.el,
            modeContainer: resyncModeContainer,
            foot: resyncCard.foot,
            status: resyncStatus,
            // Populated by the mode-specific render path:
            mode: null,              // 'bpos' | 'council' | null until known
            checkboxes: {},          // council only — chainId → input
            confirm: null,
            btn: null,
        };

        // ---------- Sub-card 3b: Staged chain resume (v0.5.228) ----------
        // Operator directive 2026-05-26 — staged chain start is a destructive
        // operation (pins the host at near-full CPU for hours; per-chain
        // start API calls; not safe on a host that needs to stay responsive
        // for other workloads). Gated behind an explicit enable/disable
        // toggle that persists to localStorage so the operator's decision
        // sticks across reloads. Previously auto-revealed in Advanced based
        // on enmHostLimits.isConstrained — that auto-reveal is now removed.
        var stageCard = _buildDangerCard({
            kind: 'warn',
            title: t('settings.danger_stage_title'),
            help: t('settings.danger_stage_help'),
        });
        body.appendChild(stageCard.el);
        var stageWarn = document.createElement('div');
        stageWarn.className = 'enm-danger-warning';
        stageWarn.textContent = t('settings.danger_stage_warn');
        stageCard.body.appendChild(stageWarn);

        // Persisted enable/disable toggle. Default OFF.
        var STAGE_LS_KEY = 'enm:danger:staged-resume:enabled';
        function stageReadEnabled() {
            try {
                return window.localStorage.getItem(STAGE_LS_KEY) === '1';
            } catch (_) { return false; }
        }
        function stageWriteEnabled(on) {
            try {
                if (on) {
                    window.localStorage.setItem(STAGE_LS_KEY, '1');
                } else {
                    window.localStorage.removeItem(STAGE_LS_KEY);
                }
            } catch (_) { /* private mode / quota — toggle is in-memory only */ }
        }

        var stageToggleRow = document.createElement('div');
        stageToggleRow.className = 'enm-danger-toggle-row';
        var stageToggleLabel = document.createElement('label');
        stageToggleLabel.className = 'enm-danger-toggle-label';
        var stageToggleInput = document.createElement('input');
        stageToggleInput.type = 'checkbox';
        stageToggleInput.className = 'enm-danger-toggle-input';
        stageToggleInput.checked = stageReadEnabled();
        var stageToggleText = document.createElement('span');
        stageToggleText.className = 'enm-danger-toggle-text';
        stageToggleText.textContent = t('settings.danger_stage_enable_label');
        var stageToggleSub = document.createElement('span');
        stageToggleSub.className = 'enm-danger-toggle-sub';
        stageToggleSub.textContent = stageToggleInput.checked
            ? t('settings.danger_stage_enabled_sub')
            : t('settings.danger_stage_disabled_sub');
        stageToggleLabel.appendChild(stageToggleInput);
        stageToggleLabel.appendChild(stageToggleText);
        stageToggleRow.appendChild(stageToggleLabel);
        stageToggleRow.appendChild(stageToggleSub);
        stageCard.body.appendChild(stageToggleRow);

        // Controls row — hidden until the toggle is on.
        var stageControls = document.createElement('div');
        stageControls.className = 'enm-danger-stage-controls';
        stageControls.hidden = !stageToggleInput.checked;
        var stageStartBtn = document.createElement('button');
        stageStartBtn.type = 'button';
        stageStartBtn.className = 'enm-btn enm-btn-primary';
        stageStartBtn.textContent = t('settings.danger_stage_start_btn');
        var stagePauseBtn = document.createElement('button');
        stagePauseBtn.type = 'button';
        stagePauseBtn.className = 'enm-btn';
        stagePauseBtn.textContent = t('settings.danger_stage_pause_btn');
        stagePauseBtn.hidden = true;
        var stageResumeBtn = document.createElement('button');
        stageResumeBtn.type = 'button';
        stageResumeBtn.className = 'enm-btn';
        stageResumeBtn.textContent = t('settings.danger_stage_resume_btn');
        stageResumeBtn.hidden = true;
        var stageCancelBtn = document.createElement('button');
        stageCancelBtn.type = 'button';
        stageCancelBtn.className = 'enm-btn enm-btn-danger';
        stageCancelBtn.textContent = t('settings.danger_stage_cancel_btn');
        stageCancelBtn.hidden = true;
        stageControls.appendChild(stageStartBtn);
        stageControls.appendChild(stagePauseBtn);
        stageControls.appendChild(stageResumeBtn);
        stageControls.appendChild(stageCancelBtn);
        stageCard.body.appendChild(stageControls);

        var stageStatusEl = document.createElement('div');
        stageStatusEl.className = 'enm-danger-status';
        stageStatusEl.setAttribute('role', 'status');
        stageStatusEl.setAttribute('aria-live', 'polite');
        stageStatusEl.textContent = stageToggleInput.checked
            ? t('settings.danger_stage_idle')
            : t('settings.danger_stage_locked');
        stageCard.foot.appendChild(stageStatusEl);

        // Default chain order — matches the Council install plan.
        var STAGE_CHAIN_ORDER = [
            'mainchain', 'esc', 'eid', 'pg',
            'arbiter', 'esc-oracle', 'eid-oracle', 'pg-oracle',
        ];
        var stageInstance = null;

        // Tiny string-template helper — replaces {chain} / {minutes} / etc.
        function stageFormat(key, vars) {
            var s = t('settings.' + key) || '';
            if (!vars) { return s; }
            return s.replace(/\{(\w+)\}/g, function (_m, k) {
                return (vars[k] == null) ? '' : String(vars[k]);
            });
        }

        function stageHandlePhase(ev) {
            var msg = '';
            switch (ev.phase) {
                case 'starting':
                    msg = stageFormat('danger_stage_phase_starting',
                        { chain: ev.chainId || '?' });
                    break;
                case 'waiting':
                    msg = stageFormat('danger_stage_phase_waiting',
                        { chain: ev.chainId || '?', minutes: ev.elapsedMinutes });
                    break;
                case 'synced':
                    msg = stageFormat('danger_stage_phase_synced', {
                        chain: ev.chainId || '?',
                        next: (ev.remainingChains && ev.remainingChains[0]) || 'done',
                    });
                    break;
                case 'timeout':
                    msg = stageFormat('danger_stage_phase_timeout',
                        { chain: ev.chainId || '?' });
                    break;
                case 'complete':
                    msg = t('settings.danger_stage_phase_complete');
                    break;
                case 'paused':
                    msg = t('settings.danger_stage_phase_paused');
                    break;
                case 'resumed':
                    msg = t('settings.danger_stage_phase_resumed');
                    break;
                case 'cancelled':
                    msg = t('settings.danger_stage_phase_cancelled');
                    break;
                case 'error':
                    msg = stageFormat('danger_stage_phase_error',
                        { message: (ev.error && ev.error.message) || 'unknown' });
                    break;
            }
            stageStatusEl.textContent = msg;
            // Toggle button visibility based on phase.
            if (ev.phase === 'starting' || ev.phase === 'waiting' || ev.phase === 'resumed') {
                stageStartBtn.hidden = true;
                stagePauseBtn.hidden = false;
                stageResumeBtn.hidden = true;
                stageCancelBtn.hidden = false;
            } else if (ev.phase === 'paused') {
                stageStartBtn.hidden = true;
                stagePauseBtn.hidden = true;
                stageResumeBtn.hidden = false;
                stageCancelBtn.hidden = false;
            } else if (ev.phase === 'complete' || ev.phase === 'cancelled' || ev.phase === 'error') {
                stageStartBtn.hidden = false;
                stagePauseBtn.hidden = true;
                stageResumeBtn.hidden = true;
                stageCancelBtn.hidden = true;
                stageInstance = null;
            }
        }

        stageToggleInput.addEventListener('change', function () {
            var on = !!stageToggleInput.checked;
            stageWriteEnabled(on);
            stageToggleSub.textContent = on
                ? t('settings.danger_stage_enabled_sub')
                : t('settings.danger_stage_disabled_sub');
            stageControls.hidden = !on;
            if (!on) {
                // Turning off mid-orchestration — cancel anything running.
                if (stageInstance) { try { stageInstance.cancel(); } catch (_) {} stageInstance = null; }
                stageStatusEl.textContent = t('settings.danger_stage_locked');
                stageStartBtn.hidden = false;
                stagePauseBtn.hidden = true;
                stageResumeBtn.hidden = true;
                stageCancelBtn.hidden = true;
            } else {
                stageStatusEl.textContent = t('settings.danger_stage_idle');
            }
        });

        stageStartBtn.addEventListener('click', function () {
            if (!stageToggleInput.checked) { return; }  // guard — UI was bypassed
            if (typeof root.EnmStageSync !== 'function') {
                stageStatusEl.textContent = t('settings.danger_stage_helper_missing');
                return;
            }
            stageInstance = new root.EnmStageSync({
                api: self.api,
                chainOrder: STAGE_CHAIN_ORDER,
                onPhase: stageHandlePhase,
            });
            stageInstance.start();
        });
        stagePauseBtn.addEventListener('click', function () {
            if (stageInstance) { stageInstance.pause(); }
        });
        stageResumeBtn.addEventListener('click', function () {
            if (stageInstance) { stageInstance.resume(); }
        });
        stageCancelBtn.addEventListener('click', function () {
            if (stageInstance) { stageInstance.cancel(); }
        });

        this._danger.stage = {
            card: stageCard.el,
            toggle: stageToggleInput,
            controls: stageControls,
            status: stageStatusEl,
            startBtn: stageStartBtn,
            getInstance: function () { return stageInstance; },
        };

        // ---------- Sub-card 4: Reset ENM (full wipe + in-place restart) ----------
        // v0.5.232 — replaces the old "Nuke" + "Remove app" + "Reset keystore"
        // cards. Wipes ALL data (chain data, keystore, nodekey, settings,
        // audit log) and restarts ENM in place via pc2-node's process
        // supervisor — the bundle is preserved, so the iframe never
        // serves the orphan-pc2 root content that caused the "another
        // pc2 inside the app" symptom. After 200 OK, the frontend
        // location.reload's so the wizard appears automatically.
        var resetCard = _buildDangerCard({
            kind: 'critical',
            title: t('settings.danger_reset_title'),
            help: t('settings.danger_reset_help'),
        });
        body.appendChild(resetCard.el);
        var resetWarn = document.createElement('div');
        resetWarn.className = 'enm-danger-warning';
        resetWarn.textContent = t('settings.danger_reset_warning');
        resetCard.body.appendChild(resetWarn);
        var resetConfirm = _buildTypedConfirm({
            label: t('settings.danger_reset_confirm_label'),
            placeholder: 'RESET EVERYTHING',
            expected: 'RESET EVERYTHING',
            // Case-sensitive — matches the backend gate exactly.
            caseSensitive: true,
        });
        resetCard.body.appendChild(resetConfirm.el);
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'enm-btn enm-btn-danger';
        resetBtn.textContent = t('settings.danger_reset_btn');
        resetBtn.disabled = true;
        var resetStatus = document.createElement('div');
        resetStatus.className = 'enm-danger-status';
        resetStatus.setAttribute('role', 'status');
        resetStatus.setAttribute('aria-live', 'polite');
        resetCard.foot.appendChild(resetStatus);
        resetCard.foot.appendChild(resetBtn);
        resetConfirm.input.addEventListener('input', function () {
            resetBtn.disabled = !resetConfirm.matches();
        });
        resetBtn.addEventListener('click', function () {
            self._doResetEverything(resetConfirm.input.value);
        });
        this._danger.reset = {
            confirm: resetConfirm, btn: resetBtn, status: resetStatus,
        };

        return card;
    };

    /**
     * v0.5.232 — Paint the Resync sub-card based on the operator's
     * setupRole. Called on Danger Zone section activation, idempotent.
     * BPoS gets a single "Resync Main chain" button; Council gets a
     * checkbox list of {mainchain, esc, eid, pg} with "Resync selected"
     * + a static "RESYNC" typed-confirm gate.
     */
    SettingsTab.prototype._refreshDangerResyncCard = function () {
        var self = this;
        var t = root.enmTOrFallback;
        if (!self._danger || !self._danger.resync) { return; }
        var pane = self._danger.resync;
        // Wipe previous render so consecutive activations don't accumulate.
        pane.modeContainer.innerHTML = '';
        pane.checkboxes = {};
        pane.confirm = null;
        pane.btn = null;
        self.api.get('/system/identity', { skipCache: true })
            .then(function (resp) {
                if (self._destroyed) { return; }
                var r = (resp && resp.result) || resp || {};
                var role = r.setupRole || 'unknown';
                pane.mode = role === 'council' ? 'council' : 'bpos';
                if (pane.mode === 'council') {
                    _paintCouncilResync(self, pane, t);
                } else {
                    _paintBposResync(self, pane, t);
                }
            })
            .catch(function () {
                if (self._destroyed) { return; }
                // Fail safe: assume BPoS (single mainchain button) — least
                // surprising default for any operator who ever set up ENM.
                pane.mode = 'bpos';
                _paintBposResync(self, pane, t);
            });
    };

    function _paintBposResync(self, pane, t) {
        // Single-chain (BPoS) — typed-confirm "mainchain", single button.
        var help = document.createElement('div');
        help.className = 'enm-danger-resync-help';
        help.textContent = t('settings.danger_resync_bpos_help');
        pane.modeContainer.appendChild(help);
        var confirm = _buildTypedConfirm({
            label: t('settings.danger_resync_bpos_confirm_label'),
            placeholder: 'mainchain',
            expected: 'mainchain',
        });
        pane.modeContainer.appendChild(confirm.el);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-btn enm-btn-danger';
        btn.textContent = t('settings.danger_resync_bpos_btn');
        btn.disabled = true;
        pane.foot.appendChild(btn);
        confirm.input.addEventListener('input', function () {
            btn.disabled = !confirm.matches();
        });
        btn.addEventListener('click', function () {
            self._doChainResync({ chainIds: ['mainchain'], confirm: confirm.input.value });
        });
        pane.confirm = confirm;
        pane.btn = btn;
    }

    function _paintCouncilResync(self, pane, t) {
        // Multi-chain (Council) — checkbox list of {mainchain, esc, eid, pg}
        // + static "RESYNC" typed-confirm + single "Resync selected" button.
        var help = document.createElement('div');
        help.className = 'enm-danger-resync-help';
        help.textContent = t('settings.danger_resync_council_help');
        pane.modeContainer.appendChild(help);
        var list = document.createElement('div');
        list.className = 'enm-danger-resync-checklist';
        // v0.5.234 — canonical UI display names. Verified against the rest
        // of the app: "Main chain" (space, capital M only) for ELA; "ESC
        // (Smart Chain)" / "EID (Identity Chain)" for those two EVMs; just
        // "PG" with NO parenthetical for PG — PG is a PUBLIC EVM PBFT
        // sidechain, not a privacy chain (see strings.js line ~438 / Session
        // 28 comment fixing the previously wrong "PG (private chain)" label).
        var COUNCIL_CHAINS = [
            { id: 'mainchain', label: 'Main chain' },
            { id: 'esc',       label: 'ESC (Smart Chain)' },
            { id: 'eid',       label: 'EID (Identity Chain)' },
            { id: 'pg',        label: 'PG' },
        ];
        COUNCIL_CHAINS.forEach(function (c) {
            var row = document.createElement('label');
            row.className = 'enm-danger-resync-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true; // default all selected
            cb.dataset.chainId = c.id;
            var span = document.createElement('span');
            span.textContent = c.label;
            row.appendChild(cb);
            row.appendChild(span);
            list.appendChild(row);
            pane.checkboxes[c.id] = cb;
        });
        pane.modeContainer.appendChild(list);
        var confirm = _buildTypedConfirm({
            label: t('settings.danger_resync_council_confirm_label'),
            placeholder: 'RESYNC',
            expected: 'RESYNC',
            caseSensitive: true,
        });
        pane.modeContainer.appendChild(confirm.el);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-btn enm-btn-danger';
        btn.textContent = t('settings.danger_resync_council_btn');
        btn.disabled = true;
        pane.foot.appendChild(btn);
        function refreshGate() {
            var anyChecked = COUNCIL_CHAINS.some(function (c) {
                return pane.checkboxes[c.id] && pane.checkboxes[c.id].checked;
            });
            btn.disabled = !(anyChecked && confirm.matches());
        }
        confirm.input.addEventListener('input', refreshGate);
        Object.keys(pane.checkboxes).forEach(function (id) {
            pane.checkboxes[id].addEventListener('change', refreshGate);
        });
        btn.addEventListener('click', function () {
            var picked = COUNCIL_CHAINS
                .filter(function (c) { return pane.checkboxes[c.id] && pane.checkboxes[c.id].checked; })
                .map(function (c) { return c.id; });
            self._doChainResync({ chainIds: picked, confirm: confirm.input.value });
        });
        pane.confirm = confirm;
        pane.btn = btn;
    }

    /**
     * Render an update-info refresh against /maintenance/check-update.
     * Called on Danger Zone activation; idempotent if hit multiple
     * times during a single visit.
     */
    SettingsTab.prototype._refreshUpdateInfo = function () {
        var self = this;
        var t = root.enmTOrFallback;
        if (!self._danger || !self._danger.update) { return; }
        var u = self._danger.update;
        u.status.textContent = t('common.loading') || 'Loading…';
        u.status.classList.remove('ok', 'err');
        self.api.get('/maintenance/check-update', { skipCache: true })
            .then(function (resp) {
                if (self._destroyed) { return; }
                var r = (resp && resp.result) || resp || {};
                u.currentEl.textContent = r.current || '—';
                u.latestEl.textContent = r.latest || '—';
                if (r.error) {
                    u.status.textContent = t('settings.danger_update_error') + ' ' + r.error;
                    u.status.classList.add('err');
                    u.btn.disabled = true;
                    return;
                }
                if (r.updateAvailable && r.tag) {
                    u.tag = r.tag;
                    u.btn.disabled = false;
                    u.status.textContent = t('settings.danger_update_available');
                    u.status.classList.add('ok');
                } else {
                    u.btn.disabled = true;
                    u.status.textContent = t('settings.danger_update_uptodate');
                    u.status.classList.remove('err');
                }
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                u.status.textContent = (err && err.message) || 'Update check failed.';
                u.status.classList.add('err');
            });
    };

    SettingsTab.prototype._doUpdate = function () {
        var self = this;
        var t = root.enmTOrFallback;
        var u = self._danger.update;
        if (!u.tag) { return; }
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm(t('settings.danger_update_confirm_dialog'))) { return; }
        }
        u.status.textContent = t('settings.danger_update_in_progress');
        u.status.classList.remove('ok', 'err');
        return root.enmRunOnce(u.btn, t('settings.danger_update_in_progress'), function () {
            return self.api.post('/maintenance/update', { tag: u.tag })
                .then(function () {
                    if (self._destroyed) { return; }
                    u.status.textContent = t('settings.danger_update_queued');
                    u.status.classList.add('ok');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    // 0.5.130 audit Session 130 — silence on 401 so a
                    // mid-update session expiry doesn't paint a stuck red
                    // "Update failed.: Unauthorized" while the login overlay
                    // is taking over. Matches _refreshUpdateInfo line 1578.
                    if (err && err.status === 401) { return; }
                    u.status.textContent = (err && err.message) || 'Update failed.';
                    u.status.classList.add('err');
                });
        });
    };

    /**
     * v0.5.232 — Submit a chain resync. Accepts the new object shape
     * { chainIds:[], confirm:string }. Posts to /maintenance/chain-resync.
     * Status appears in the shared resync-card status element. Caller
     * has already enforced the typed-confirm gate.
     */
    SettingsTab.prototype._doChainResync = function (opts) {
        var self = this;
        var t = root.enmTOrFallback;
        var pane = self._danger.resync;
        if (!pane || !pane.btn) { return; }
        var body = {
            chainIds: opts && opts.chainIds ? opts.chainIds : [],
            confirm: opts && opts.confirm ? opts.confirm : '',
        };
        if (body.chainIds.length === 0) {
            pane.status.textContent = t('settings.danger_resync_no_selection') || 'Pick at least one chain.';
            pane.status.classList.add('err');
            return;
        }
        pane.status.textContent = t('settings.danger_resync_in_progress');
        pane.status.classList.remove('ok', 'err');
        return root.enmRunOnce(pane.btn, t('settings.danger_resync_in_progress'), function () {
            return self.api.post('/maintenance/chain-resync', body)
                .then(function (resp) {
                    if (self._destroyed) { return; }
                    var r = (resp && resp.result) || resp || {};
                    pane.status.textContent = r.message || t('settings.danger_resync_ok');
                    pane.status.classList.add('ok');
                    if (pane.confirm && pane.confirm.input) { pane.confirm.input.value = ''; }
                    pane.btn.disabled = true;
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    // 0.5.130 audit Session 130 — silence on 401, see _doUpdate.
                    if (err && err.status === 401) { return; }
                    pane.status.textContent = (err && err.message) || 'Resync failed.';
                    pane.status.classList.add('err');
                });
        });
    };

    /**
     * v0.5.232 — Submit a full reset (POST /maintenance/reset-everything).
     * On 200 OK, schedule a location.reload() after 6 seconds so the
     * setup wizard appears as soon as pc2-node respawns ENM. Replaces
     * the old _doUninstall + _doNuke (both routes return 410 Gone now).
     */
    SettingsTab.prototype._doResetEverything = function (confirmText) {
        var self = this;
        var t = root.enmTOrFallback;
        var s = self._danger.reset;
        if (!s) { return; }
        s.status.textContent = t('settings.danger_reset_in_progress');
        s.status.classList.remove('ok', 'err');
        return root.enmRunOnce(s.btn, t('settings.danger_reset_in_progress'), function () {
            return self.api.post('/maintenance/reset-everything', { confirm: confirmText })
                .then(function (resp) {
                    if (self._destroyed) { return; }
                    var r = (resp && resp.result) || resp || {};
                    s.status.textContent = r.message || t('settings.danger_reset_queued');
                    s.status.classList.add('ok');
                    // v0.5.232 — auto-reload after ~6s so the setup wizard
                    // appears once pc2-node respawns ENM. The teardown
                    // script's own 2s sleep + ENM's own boot is usually
                    // <5s; we give a small margin then reload. The boot
                    // guard in app.js will retry /health if the iframe
                    // happens to hit a brief window where ENM isn't up
                    // yet — belt-and-suspenders.
                    setTimeout(function () {
                        try { window.location.reload(); }
                        catch (_) { /* iframe sandbox edge case */ }
                    }, 6000);
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    s.status.textContent = (err && err.message) || 'Reset failed.';
                    s.status.classList.add('err');
                });
        });
    };

    /**
     * Build a sub-card inside the Danger Zone section. kind is one of
     * 'info' / 'warn' / 'critical' — drives accent colour via CSS.
     */
    function _buildDangerCard(opts) {
        var el = document.createElement('div');
        el.className = 'enm-danger-card enm-danger-' + (opts.kind || 'warn');
        var head = document.createElement('div');
        head.className = 'enm-danger-card-head';
        var h = document.createElement('div');
        h.className = 'enm-danger-card-title';
        h.textContent = opts.title || '';
        head.appendChild(h);
        if (opts.help) {
            var helpEl = document.createElement('div');
            helpEl.className = 'enm-danger-card-help';
            helpEl.textContent = opts.help;
            head.appendChild(helpEl);
        }
        el.appendChild(head);
        var body = document.createElement('div');
        body.className = 'enm-danger-card-body';
        el.appendChild(body);
        var foot = document.createElement('div');
        foot.className = 'enm-danger-card-foot';
        el.appendChild(foot);
        return { el: el, body: body, foot: foot };
    }

    /**
     * Type-to-confirm input row. The button caller wires its own
     * `disabled = !matches()` on the input event. caseSensitive
     * defaults to false (matches what most operators expect for
     * "type the chain name").
     */
    function _buildTypedConfirm(opts) {
        var row = document.createElement('div');
        row.className = 'enm-danger-typedconfirm';
        var lbl = document.createElement('label');
        lbl.className = 'enm-danger-typedconfirm-label';
        var inputId = 'enm-danger-confirm-' + Math.random().toString(36).slice(2, 8);
        lbl.htmlFor = inputId;
        lbl.textContent = opts.label || '';
        row.appendChild(lbl);
        var input = document.createElement('input');
        input.type = 'text';
        input.id = inputId;
        input.className = 'enm-input enm-danger-typedconfirm-input';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = opts.placeholder || '';
        row.appendChild(input);
        function matches() {
            var v = input.value || '';
            return opts.caseSensitive
                ? (v === opts.expected)
                : (v.toLowerCase() === String(opts.expected || '').toLowerCase());
        }
        return { el: row, input: input, matches: matches };
    }

    /** HTML-escape — small helper for innerHTML use sites in this section. */
    function _h(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // -----------------------------------------------------------------
    // Section: Identity (beta.3.43 — NEW)
    //
    //   Cards in this section:
    //     1. Current identity — pubkey + address + producer chip
    //     2. Unlock — visible only when keystoreExists && !identity
    //                 (operator entered password recovers cache)
    //     3. Backup — one-click download of keystore.dat
    //     4. Import — file picker + password + typed "import"
    //                 (slashing-risk modal if producer locked-in)
    //     5. Reset  — typed "reset keystore" + anti-snipe (if set)
    //                 (slashing-risk modal if producer locked-in;
    //                 password reveal inline after success)
    //
    //   Refreshes via GET /identity on every section activation. No
    //   chain restart needed at the section level — destructive ops
    //   handle chain stop/start themselves server-side.
    // -----------------------------------------------------------------
    SettingsTab.prototype._buildIdentitySection = function (t) {
        var self = this;
        var card = document.createElement('section');
        card.className = 'enm-section-card enm-section-identity';

        // Head — same shape as Danger Zone.
        var head = document.createElement('div');
        head.className = 'enm-section-card-head';
        var icon = document.createElement('div');
        icon.className = 'enm-section-card-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '◉';
        head.appendChild(icon);
        var headbody = document.createElement('div');
        headbody.className = 'enm-section-card-headbody';
        var title = document.createElement('div');
        title.className = 'enm-section-card-title';
        title.id = 'enm-section-h-identity';
        title.textContent = t('settings.heading_identity');
        headbody.appendChild(title);
        var help = document.createElement('div');
        help.className = 'enm-section-card-help';
        help.textContent = t('settings.identity_intro');
        headbody.appendChild(help);
        head.appendChild(headbody);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'enm-section-card-body';
        card.appendChild(body);

        this._identity = {
            card: card,
            body: body,
            setDirty: function () {},  // identity actions don't dirty-track
        };

        // ----- Card 1: Current identity (always shown) ----------------
        var currentCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.identity_current_title'),
            help:  t('settings.identity_current_help'),
        });
        body.appendChild(currentCard.el);
        var idGrid = document.createElement('div');
        idGrid.className = 'enm-identity-grid';
        // v0.5.228 — public key is the PRIMARY identity (what gets shared
        // with Essentials, what stakers vote on, what shows up on every
        // explorer). Signing address is operationally internal and visually
        // demoted. Modifier classes on each row drive the size/weight
        // hierarchy in styles.css (pubkey row gets a larger value font + a
        // "Share with Essentials" pill above it; address row gets a
        // smaller value font + an "Internal · do not share" pill).
        // v0.5.229d (P2 audit fix) — the pubkey pill text was hardcoded
        // "Share with Essentials" (BPoS-only language). For Council
        // operators it should read "Claim via Essentials" or "Bound to
        // Council seat". We can't know which until /system/identity
        // resolves, so render a neutral default ("Public key") and let
        // _fillForm rewrite the pill text + class once the response
        // lands. data-fill="pubkey-pill" tags the slot for the fill.
        idGrid.innerHTML =
            '<div class="enm-identity-grid-row enm-identity-grid-row--primary" data-key="pubkey">'
              + '<div class="enm-identity-grid-label">'
                + _h(t('settings.identity_pubkey_label'))
                + '<span class="enm-identity-grid-pill enm-identity-grid-pill-action" data-fill="pubkey-pill">Public key</span>'
              + '</div>'
              + '<code class="enm-identity-grid-value enm-mono" data-fill="pubkey">—</code>'
              + '<span class="enm-identity-grid-copy" data-copy="pubkey"></span>'
            + '</div>'
            + '<div class="enm-identity-grid-row enm-identity-grid-row--secondary" data-key="address">'
              + '<div class="enm-identity-grid-label">'
                + _h(t('settings.identity_address_label'))
                + '<span class="enm-identity-grid-pill">Internal</span>'
              + '</div>'
              + '<code class="enm-identity-grid-value enm-mono" data-fill="address">—</code>'
              + '<span class="enm-identity-grid-copy" data-copy="address"></span>'
            + '</div>'
            + '<div class="enm-identity-grid-row" data-key="producer">'
              + '<div class="enm-identity-grid-label">'
                + _h(t('settings.identity_producer_label'))
              + '</div>'
              + '<span class="enm-identity-grid-value" data-fill="producer">—</span>'
            + '</div>';
        currentCard.body.appendChild(idGrid);
        this._identity.currentCard = currentCard.el;
        this._identity.pubkeyEl = idGrid.querySelector('[data-fill="pubkey"]');
        this._identity.addressEl = idGrid.querySelector('[data-fill="address"]');
        this._identity.producerEl = idGrid.querySelector('[data-fill="producer"]');
        this._identity.pubkeyCopySlot = idGrid.querySelector('[data-copy="pubkey"]');
        this._identity.addressCopySlot = idGrid.querySelector('[data-copy="address"]');

        // ----- Card 2: Unlock (shown when cache missing) --------------
        var unlockCard = _buildDangerCard({
            kind: 'warn',
            title: t('settings.identity_unlock_title'),
            help:  t('settings.identity_unlock_help'),
        });
        unlockCard.el.hidden = true;
        body.appendChild(unlockCard.el);
        var unlockInput = document.createElement('input');
        unlockInput.type = 'password';
        unlockInput.className = 'enm-input enm-danger-typedconfirm-input';
        unlockInput.autocomplete = 'current-password';
        unlockInput.placeholder = t('settings.identity_unlock_placeholder');
        unlockCard.body.appendChild(_wrapLabel(t('settings.identity_unlock_label'), unlockInput));
        var unlockBtn = document.createElement('button');
        unlockBtn.type = 'button';
        unlockBtn.className = 'enm-btn enm-btn-primary';
        unlockBtn.textContent = t('settings.identity_unlock_btn');
        var unlockStatus = _statusEl();
        unlockCard.foot.appendChild(unlockStatus);
        unlockCard.foot.appendChild(unlockBtn);
        unlockBtn.addEventListener('click', function () {
            self._doIdentityUnlock(unlockInput, unlockStatus);
        });
        this._identity.unlockCard = unlockCard.el;
        this._identity.unlockInput = unlockInput;
        this._identity.unlockBtn = unlockBtn;
        this._identity.unlockStatus = unlockStatus;

        // ----- Card 3: Backup (always shown) --------------------------
        var backupCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.identity_backup_title'),
            help:  t('settings.identity_backup_help'),
        });
        body.appendChild(backupCard.el);
        var backupBtn = document.createElement('button');
        backupBtn.type = 'button';
        backupBtn.className = 'enm-btn enm-btn-primary';
        backupBtn.textContent = t('settings.identity_backup_btn');
        var backupStatus = _statusEl();
        backupCard.foot.appendChild(backupStatus);
        backupCard.foot.appendChild(backupBtn);
        backupBtn.addEventListener('click', function () {
            self._doIdentityBackup(backupBtn, backupStatus);
        });
        this._identity.backupCard = backupCard.el;
        this._identity.backupBtn = backupBtn;
        this._identity.backupStatus = backupStatus;

        // ----- Card 4: Import -----------------------------------------
        var importCard = _buildDangerCard({
            kind: 'warn',
            title: t('settings.identity_import_title'),
            help:  t('settings.identity_import_help'),
        });
        body.appendChild(importCard.el);
        var importWarn = document.createElement('div');
        importWarn.className = 'enm-danger-warning';
        importWarn.hidden = true;
        importWarn.textContent = t('settings.identity_slashing_warning');
        importCard.body.appendChild(importWarn);
        var importFile = document.createElement('input');
        importFile.type = 'file';
        // v0.5.216 audit Phase 2 (AUDIT-FLOW-I02, P1) — broadened from
        // '.dat,application/octet-stream' which hid .json keystores
        // exported by Elastos Essentials / ENM v0.4.x in the file
        // picker. Operators concluded their backup was the wrong format
        // when in reality it was just an extension mismatch. Backend
        // /identity/import validates the file contents regardless of
        // extension, so widening the picker is safe + operator-friendly.
        importFile.accept = '.dat,.json,application/octet-stream,application/json';
        importFile.className = 'enm-input';
        importCard.body.appendChild(_wrapLabel(t('settings.identity_import_file_label'), importFile));
        var importPassword = document.createElement('input');
        importPassword.type = 'password';
        importPassword.className = 'enm-input enm-danger-typedconfirm-input';
        importPassword.autocomplete = 'current-password';
        importPassword.placeholder = t('settings.identity_import_password_placeholder');
        importCard.body.appendChild(_wrapLabel(t('settings.identity_import_password_label'), importPassword));
        var importConfirm = _buildTypedConfirm({
            label: t('settings.identity_import_confirm_label'),
            placeholder: 'import',
            expected: 'import',
            caseSensitive: false,
        });
        importCard.body.appendChild(importConfirm.el);
        var importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'enm-btn enm-btn-danger';
        importBtn.textContent = t('settings.identity_import_btn');
        importBtn.disabled = true;
        var importStatus = _statusEl();
        importCard.foot.appendChild(importStatus);
        importCard.foot.appendChild(importBtn);
        function refreshImportBtn() {
            importBtn.disabled = !(importFile.files && importFile.files.length > 0
                && importPassword.value.length > 0
                && importConfirm.matches());
        }
        importFile.addEventListener('change', refreshImportBtn);
        importPassword.addEventListener('input', refreshImportBtn);
        importConfirm.input.addEventListener('input', refreshImportBtn);
        importBtn.addEventListener('click', function () {
            self._doIdentityImport(importFile, importPassword, importBtn, importStatus, importWarn);
        });
        this._identity.importCard = importCard.el;
        this._identity.importFile = importFile;
        this._identity.importPassword = importPassword;
        this._identity.importConfirm = importConfirm;
        this._identity.importBtn = importBtn;
        this._identity.importStatus = importStatus;
        this._identity.importWarn = importWarn;

        // ----- Card 5: Reset -----------------------------------------
        // v0.5.232 — REMOVED. The standalone "reset keystore" was a footgun:
        // rotating the key without wiping chain data orphans the on-chain
        // producer/CR registration (new pubkey doesn't match), and the
        // operator still has to re-walk wizard cards anyway. The new
        // Settings → Danger Zone → Reset ENM card wipes keystore + chain
        // data in one atomic flow. Server-side POST /identity/reset now
        // returns 410 Gone — see routes/identity.js for the operator-
        // facing message that points them to the unified reset.

        // ----- Card 6: Server integrity (beta.3.46) -------------------
        // Quiet by default — collapsed, only runs when expanded. Cached
        // server-side response so opening + closing repeatedly is cheap.
        // Honest about what we can't detect (hypervisor-level threats).
        var integrityCard = _buildDangerCard({
            kind: 'info',
            title: t('settings.identity_integrity_title'),
            help: t('settings.identity_integrity_help'),
        });
        body.appendChild(integrityCard.el);
        var integritySummary = document.createElement('div');
        integritySummary.className = 'enm-integrity-summary';
        integritySummary.innerHTML =
            '<span class="enm-integrity-summary-status" data-fill="status">'
              + _h(t('settings.identity_integrity_collapsed'))
            + '</span>';
        integrityCard.body.appendChild(integritySummary);
        var integrityDetails = document.createElement('div');
        integrityDetails.className = 'enm-integrity-details';
        integrityDetails.hidden = true;
        integrityCard.body.appendChild(integrityDetails);
        var integrityScope = document.createElement('div');
        integrityScope.className = 'enm-integrity-scope';
        integrityScope.textContent = t('settings.identity_integrity_scope_note');
        integrityScope.hidden = true;
        integrityCard.body.appendChild(integrityScope);
        var integrityExpandBtn = document.createElement('button');
        integrityExpandBtn.type = 'button';
        integrityExpandBtn.className = 'enm-btn';
        integrityExpandBtn.textContent = t('settings.identity_integrity_run_btn');
        var integrityRebaselineBtn = document.createElement('button');
        integrityRebaselineBtn.type = 'button';
        integrityRebaselineBtn.className = 'enm-btn';
        integrityRebaselineBtn.textContent = t('settings.identity_integrity_rebaseline_btn');
        integrityRebaselineBtn.hidden = true;
        var integrityStatus = _statusEl();
        integrityCard.foot.appendChild(integrityStatus);
        integrityCard.foot.appendChild(integrityRebaselineBtn);
        integrityCard.foot.appendChild(integrityExpandBtn);
        integrityExpandBtn.addEventListener('click', function () {
            self._doIntegrityRun(integritySummary, integrityDetails, integrityScope,
                integrityRebaselineBtn, integrityStatus, integrityExpandBtn);
        });
        integrityRebaselineBtn.addEventListener('click', function () {
            self._doIntegrityRebaseline(integrityRebaselineBtn, integrityStatus,
                integritySummary, integrityDetails, integrityScope, integrityExpandBtn);
        });
        this._identity.integrity = {
            card: integrityCard.el,
            summary: integritySummary,
            details: integrityDetails,
            scope: integrityScope,
            runBtn: integrityExpandBtn,
            rebaselineBtn: integrityRebaselineBtn,
            status: integrityStatus,
        };

        // -------------------------------------------------------------
        // v0.5.229 (Phase F) — Role-debug panel.
        //
        // Collapsed-by-default card that, when expanded, hits
        // GET /system/role-debug and dumps the raw chain RPC responses
        // + ENM's parsed view side-by-side. Designed so the operator
        // can copy a JSON dump for support, or (just as important) so
        // a future Council operator hitting the next-class-of-bug like
        // the v228 currentarbiters typo can spot the mismatch in
        // seconds without re-reading ENM source.
        //
        // "Copy debug JSON" puts the full payload on the clipboard
        // (best-effort; falls back to a textarea select for older
        // browsers). Sensitive fields: this endpoint already filters
        // /listcurrentcrs to just the operator's own member record
        // (server-side), so we're not exposing other members' PII.
        // -------------------------------------------------------------
        var debugCard = _buildDangerCard({
            kind: 'info',
            title: 'Role debug',
            help: 'Raw RPC responses ENM uses to decide your on-chain role '
                + '(Council / BPoS / follower) plus ENM\'s parsed view of each. '
                + 'Useful when the Validator status badge says something different '
                + 'than you expect — paste the JSON in a support ticket and a '
                + 'developer can compare ENM\'s read vs the chain\'s truth side-by-side.',
        });
        body.appendChild(debugCard.el);
        var debugStatus = document.createElement('div');
        debugStatus.className = 'enm-danger-status';
        debugStatus.setAttribute('role', 'status');
        debugStatus.setAttribute('aria-live', 'polite');
        debugStatus.textContent = 'Collapsed. Click "Refresh" to read live state.';
        debugCard.body.appendChild(debugStatus);
        var debugPre = document.createElement('pre');
        debugPre.className = 'enm-role-debug-pre';
        debugPre.hidden = true;
        debugPre.style.maxHeight = '400px';
        debugPre.style.overflow = 'auto';
        debugPre.style.fontSize = '11px';
        debugPre.style.fontFamily = 'var(--font-mono)';
        debugPre.style.background = 'var(--bg-elevated)';
        debugPre.style.border = '1px solid var(--border-subtle)';
        debugPre.style.borderRadius = 'var(--r-sm)';
        debugPre.style.padding = 'var(--sp-3)';
        debugPre.style.whiteSpace = 'pre-wrap';
        debugPre.style.wordBreak = 'break-word';
        debugCard.body.appendChild(debugPre);
        var debugRefreshBtn = document.createElement('button');
        debugRefreshBtn.type = 'button';
        debugRefreshBtn.className = 'enm-btn';
        debugRefreshBtn.textContent = 'Refresh debug info';
        debugCard.foot.appendChild(debugRefreshBtn);
        var debugCopyBtn = document.createElement('button');
        debugCopyBtn.type = 'button';
        debugCopyBtn.className = 'enm-btn enm-btn-primary';
        debugCopyBtn.textContent = 'Copy JSON';
        debugCopyBtn.disabled = true;
        debugCard.foot.appendChild(debugCopyBtn);
        var debugPayload = null;
        debugRefreshBtn.addEventListener('click', function () {
            debugStatus.textContent = 'Reading on-chain state…';
            debugStatus.className = 'enm-danger-status';
            self.api.get('/system/role-debug').then(function (env) {
                if (self._destroyed) { return; }
                debugPayload = (env && env.result) || (env && env.data) || env;
                debugPre.hidden = false;
                debugPre.textContent = JSON.stringify(debugPayload, null, 2);
                debugCopyBtn.disabled = false;
                debugStatus.textContent = 'Fetched at ' + (debugPayload.summary && debugPayload.summary.lastChecked || '?');
                debugStatus.className = 'enm-danger-status is-ok';
            }).catch(function (err) {
                if (self._destroyed) { return; }
                debugStatus.textContent = 'Failed: ' + ((err && err.message) || String(err));
                debugStatus.className = 'enm-danger-status is-err';
            });
        });
        debugCopyBtn.addEventListener('click', function () {
            if (!debugPayload) { return; }
            var text = JSON.stringify(debugPayload, null, 2);
            if (root.enmCopyToClipboard) {
                root.enmCopyToClipboard(text, { notifications: self.notifications });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                    debugStatus.textContent = 'Copied to clipboard.';
                }).catch(function () {
                    debugStatus.textContent = 'Copy failed — select the JSON manually and Cmd+C.';
                });
            }
        });

        return card;
    };

    /**
     * Run the integrity check on demand. Renders the summary status +
     * per-check details. Cached server-side so repeated clicks are
     * cheap.
     */
    SettingsTab.prototype._doIntegrityRun = function (
        summary, details, scope, rebaselineBtn, status, runBtn
    ) {
        var self = this;
        var t = root.enmTOrFallback;
        status.textContent = t('settings.identity_integrity_running');
        status.classList.remove('ok', 'err');
        return root.enmRunOnce(runBtn,
            t('settings.identity_integrity_running'),
            function () {
                return self.api.get('/identity/integrity', { skipCache: true })
                    .then(function (resp) {
                        if (self._destroyed) { return; }
                        var r = (resp && resp.result) || resp || {};
                        self._renderIntegrity(summary, details, scope, rebaselineBtn, r);
                        details.hidden = false;
                        scope.hidden = false;
                        status.textContent = '';
                    })
                    .catch(function (err) {
                        if (self._destroyed) { return; }
                        // 0.5.131 audit Session 131 — silence on 401, see _refreshIdentity line 2221.
                        if (err && err.status === 401) { return; }
                        status.textContent = (err && err.message) || 'Integrity check failed.';
                        status.classList.add('err');
                    });
            });
    };

    /**
     * Render the summary + per-check rows from a runAll() response.
     */
    SettingsTab.prototype._renderIntegrity = function (
        summary, details, scope, rebaselineBtn, r
    ) {
        var t = root.enmTOrFallback;
        var s = r.summary || {};
        var sumEl = summary.querySelector('[data-fill="status"]');
        var label;
        if (s.status === 'ok')        { label = t('settings.identity_integrity_summary_ok'); }
        else if (s.status === 'warn') { label = t('settings.identity_integrity_summary_warn'); }
        else if (s.status === 'fail') { label = t('settings.identity_integrity_summary_fail'); }
        else                          { label = t('settings.identity_integrity_summary_unknown'); }
        sumEl.textContent = label;
        sumEl.className = 'enm-integrity-summary-status enm-integrity-' + (s.status || 'unknown');

        // Drift detected → expose the Re-baseline button so the operator
        // can mark the new state as the new trusted baseline.
        rebaselineBtn.hidden = !(s.warn > 0 || s.fail > 0);

        // Render per-check rows.
        var rows = (r.checks || []).map(function (c) {
            var statusGlyph = c.status === 'ok'      ? '✓'
                            : c.status === 'warn'    ? '⚠'
                            : c.status === 'fail'    ? '✗'
                            :                          '?';
            return ''
                + '<div class="enm-integrity-row enm-integrity-' + _h(c.status) + '">'
                  + '<span class="enm-integrity-row-glyph" aria-hidden="true">' + _h(statusGlyph) + '</span>'
                  + '<div class="enm-integrity-row-body">'
                    + '<div class="enm-integrity-row-label">' + _h(c.label) + '</div>'
                    + '<div class="enm-integrity-row-detail">' + _h(c.detail || '') + '</div>'
                  + '</div>'
                + '</div>';
        }).join('');
        details.innerHTML = rows;
    };

    /**
     * Re-capture the integrity baseline. Operator-blessed action
     * (you ran a legitimate update, this is the new trusted state).
     */
    SettingsTab.prototype._doIntegrityRebaseline = function (
        rebaselineBtn, status, summary, details, scope, runBtn
    ) {
        var self = this;
        var t = root.enmTOrFallback;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm(t('settings.identity_integrity_rebaseline_confirm'))) { return; }
        }
        status.textContent = t('settings.identity_integrity_rebaseline_running');
        status.classList.remove('ok', 'err');
        return root.enmRunOnce(rebaselineBtn,
            t('settings.identity_integrity_rebaseline_running'),
            function () {
                return self.api.post('/identity/integrity/rebaseline', {})
                    .then(function () {
                        if (self._destroyed) { return; }
                        // Re-run check to confirm everything reads green.
                        return self.api.get('/identity/integrity', { skipCache: true })
                            .then(function (resp) {
                                if (self._destroyed) { return; }
                                var r = (resp && resp.result) || resp || {};
                                self._renderIntegrity(summary, details, scope, rebaselineBtn, r);
                                status.textContent = t('settings.identity_integrity_rebaseline_ok');
                                status.classList.add('ok');
                            });
                    })
                    .catch(function (err) {
                        if (self._destroyed) { return; }
                        // 0.5.131 audit Session 131 — silence on 401, see _refreshIdentity line 2221.
                        if (err && err.status === 401) { return; }
                        status.textContent = (err && err.message) || 'Rebaseline failed.';
                        status.classList.add('err');
                    });
            });
    };

    /**
     * Refresh /identity state. Populates the Current identity grid;
     * shows/hides the Unlock card based on identityCacheMissing;
     * shows/hides the slashing-risk warning on Import + Reset based
     * on producer state.
     */
    SettingsTab.prototype._refreshIdentity = function () {
        var self = this;
        var t = root.enmTOrFallback;
        if (!self._identity) { return; }
        // v0.5.232 — the _resetRevealPendingAck guard is gone with the
        // identity reset card itself (folded into Settings → Reset ENM).
        self.api.get('/identity', { skipCache: true })
            .then(function (resp) {
                if (self._destroyed) { return; }
                var r = (resp && resp.result) || resp || {};
                self._identityState = r;
                var id = r.identity || {};
                self._identity.pubkeyEl.textContent = id.publicKey || '—';
                self._identity.addressEl.textContent = id.address || '—';
                // v0.5.229d (P2 audit fix) — rewrite the pubkey pill based
                // on the Council/BPoS context. Pre-229d the pill always
                // read "Share with Essentials" (BPoS-only). Now branches:
                //   crMember.isCrMember=true → "Bound to Council seat"
                //   setupRole='council'      → "Claim via Essentials"
                //   else                     → "Share with Essentials"
                var crMember = r.crMember || null;
                var setupRole = r.setupRole || 'unknown';
                var pubkeyPillEl = self._identity.card
                    && self._identity.card.querySelector('[data-fill="pubkey-pill"]');
                if (pubkeyPillEl) {
                    if (crMember && crMember.isCrMember) {
                        pubkeyPillEl.textContent = 'Bound to Council seat';
                    } else if (setupRole === 'council') {
                        pubkeyPillEl.textContent = 'Claim via Essentials';
                    } else {
                        pubkeyPillEl.textContent = 'Share with Essentials';
                    }
                }
                // Producer chip — surface CR Council state when known,
                // BPoS state otherwise, falling through to "Not registered".
                // Pre-229d a Council operator who'd never registered as
                // BPoS saw "Not registered yet" here despite being a CR
                // member — wrong on its face.
                var p = r.producer || null;
                var prodText;
                if (crMember && crMember.isCrMember) {
                    prodText = 'CR Council member · ' + (crMember.state || 'Elected')
                        + (crMember.nickname ? (' · ' + crMember.nickname) : '');
                    if (p && p.state) {
                        // Operator is BOTH a Council member AND a BPoS producer
                        prodText += ' (also BPoS · ' + p.state + ')';
                    }
                } else if (p && p.state) {
                    prodText = p.rank != null ? (p.state + ' · Rank #' + p.rank) : p.state;
                } else if (setupRole === 'council') {
                    prodText = 'Council install — not currently bound (claim via Essentials)';
                } else {
                    prodText = t('settings.identity_producer_unregistered');
                }
                self._identity.producerEl.textContent = prodText;
                // Unlock card is visible only when keystore exists but
                // we don't have its identity cached yet.
                self._identity.unlockCard.hidden = !r.identityCacheMissing;
                // Slashing-risk callout on the keystore-import card (the
                // only destructive identity card left after v0.5.232 —
                // the standalone reset card was retired).
                var lockedIn = !!(p && (p.state === 'Active' || p.state === 'Pending'));
                self._identity.importWarn.hidden = !lockedIn;
                // Wire copy buttons (idempotent).
                self._wireIdentityCopyButtons(id);
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                self._identity.pubkeyEl.textContent = '—';
                self._identity.addressEl.textContent = '—';
                self._identity.producerEl.textContent =
                    (err && err.message) || 'Identity unavailable.';
            });
    };

    /** Mount copy buttons for the current identity rows. */
    SettingsTab.prototype._wireIdentityCopyButtons = function (id) {
        var slots = [
            { slot: this._identity.pubkeyCopySlot, value: id.publicKey, key: 'pubkey' },
            { slot: this._identity.addressCopySlot, value: id.address, key: 'address' },
        ];
        var t = root.enmTOrFallback;
        for (var i = 0; i < slots.length; i++) {
            (function (s) {
                if (!s.slot) { return; }
                // Clear any prior content (re-renders on refresh).
                while (s.slot.firstChild) { s.slot.removeChild(s.slot.firstChild); }
                if (!s.value) { return; }
                if (typeof root.enmCopyButton === 'function') {
                    var btn = root.enmCopyButton({
                        value: s.value,
                        label: 'Copy',
                        copiedLabel: 'Copied!',
                        ariaLabel: 'Copy ' + s.key,
                        notifications: null,
                        className: 'enm-identity-copy-btn',
                    });
                    s.slot.appendChild(btn);
                }
            })(slots[i]);
        }
    };

    /** POST /identity/unlock with the operator's password. */
    SettingsTab.prototype._doIdentityUnlock = function (input, status) {
        var self = this;
        var t = root.enmTOrFallback;
        var pw = input.value;
        if (!pw) {
            status.textContent = t('settings.identity_password_required');
            status.classList.remove('ok');
            status.classList.add('err');
            return;
        }
        status.textContent = t('common.saving') || 'Saving…';
        status.classList.remove('ok', 'err');
        return root.enmRunOnce(this._identity.unlockBtn,
            t('common.saving') || 'Saving…',
            function () {
                return self.api.post('/identity/unlock', { password: pw })
                    .then(function () {
                        if (self._destroyed) { return; }
                        input.value = '';
                        status.textContent = t('settings.identity_unlock_ok');
                        status.classList.add('ok');
                        // beta.3.44 — invalidate the dashboard's Node
                        // Identity card cache so it picks up the just-
                        // unlocked pubkey on its next poll without
                        // needing a full page reload.
                        if (typeof self.api.invalidate === 'function') {
                            try { self.api.invalidate('/system/identity'); }
                            catch (_) { /* api client may not expose invalidate */ }
                        }
                        self._refreshIdentity();
                    })
                    .catch(function (err) {
                        if (self._destroyed) { return; }
                        // 0.5.131 audit Session 131 — silence on 401, see _refreshIdentity line 2221.
                        if (err && err.status === 401) { return; }
                        status.textContent = (err && err.message) || 'Unlock failed.';
                        status.classList.add('err');
                    });
            });
    };

    /** GET /identity/backup as a blob and trigger a download. */
    SettingsTab.prototype._doIdentityBackup = function (btn, status) {
        var self = this;
        var t = root.enmTOrFallback;
        status.textContent = t('settings.identity_backup_running');
        status.classList.remove('ok', 'err');
        return root.enmRunOnce(btn,
            t('settings.identity_backup_running'),
            function () {
                // self.api.get returns parsed JSON — for a binary file
                // we use fetch directly, with the same Bearer header
                // the API client builds.
                var base = (self.api && self.api.base) || '';
                var token = self.api && self.api.token;
                var headers = { 'Accept': 'application/octet-stream' };
                if (token) { headers['Authorization'] = 'Bearer ' + token; }
                return fetch(base + '/identity/backup', { headers: headers })
                    .then(function (r) {
                        if (!r.ok) {
                            return r.text().then(function (txt) {
                                // 0.5.128 audit Session 128 — parse the
                                // error envelope before throwing. Pre-
                                // 0.5.128 we threw `new Error(txt)` with
                                // the RAW response body — but identity
                                // routes (Session 64/81 audits) emit
                                // `errorBody({...})` which is JSON like
                                // {"success":false,"error":"No keystore on
                                // disk yet — finish the setup wizard first."}
                                // Operator saw the literal JSON envelope in
                                // the status text. Now: try JSON.parse,
                                // extract `.error` field, fall back to raw
                                // text, fall back to HTTP status. Matches
                                // the pattern _doIdentityImport at line
                                // ~2374 already uses correctly.
                                var msg = txt;
                                if (txt) {
                                    try {
                                        var parsed = JSON.parse(txt);
                                        if (parsed && parsed.error) {
                                            msg = parsed.error;
                                        }
                                    } catch (_) { /* not JSON — keep raw */ }
                                }
                                // 0.5.131 audit Session 131 — attach r.status to
                                // the thrown Error so the catch below can apply
                                // the same 401 silencer that every api-client
                                // catch in this file uses. Raw fetch bypasses
                                // the api client, so we have to thread status
                                // through manually.
                                var e = new Error(msg || ('HTTP ' + r.status));
                                e.status = r.status;
                                throw e;
                            });
                        }
                        var dispo = r.headers.get('Content-Disposition') || '';
                        var m = /filename="([^"]+)"/.exec(dispo);
                        // v0.5.216 audit Phase 2 (AUDIT-FLOW-I07, P2) —
                        // sanitize the Content-Disposition filename
                        // before handing it to the browser's download
                        // API. Pre-v0.5.216 a backend bug (or MitM on a
                        // misconfigured endpoint) could ship a filename
                        // like '../etc/passwd' or 'malicious.exe' and
                        // the browser would honor it. Defense in depth:
                        // strip path separators + odd chars, cap length.
                        var rawName = m ? m[1] : 'keystore-backup.dat';
                        var name = rawName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
                        if (!name) { name = 'keystore-backup.dat'; }
                        return r.blob().then(function (blob) { return { blob: blob, name: name }; });
                    })
                    .then(function (d) {
                        var url = URL.createObjectURL(d.blob);
                        var a = document.createElement('a');
                        a.href = url; a.download = d.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        status.textContent = t('settings.identity_backup_ok')
                            .replace('{name}', d.name);
                        status.classList.add('ok');
                    })
                    .catch(function (err) {
                        if (self._destroyed) { return; }
                        // 0.5.131 audit Session 131 — silence on 401. The
                        // .status was attached above when we threw on !r.ok.
                        if (err && err.status === 401) { return; }
                        status.textContent = (err && err.message) || 'Backup failed.';
                        status.classList.add('err');
                    });
            });
    };

    /** POST /identity/import with the picked file + password + force. */
    SettingsTab.prototype._doIdentityImport = function (fileInput, pwInput, btn, status, warnEl) {
        var self = this;
        var t = root.enmTOrFallback;
        var file = fileInput.files && fileInput.files[0];
        if (!file) {
            status.textContent = t('settings.identity_import_no_file');
            status.classList.remove('ok'); status.classList.add('err');
            return;
        }
        // v0.5.217 audit Phase 3 (AUDIT-FLOW-I06, P2) — native confirm()
        // removed. The typed-confirm gate ("import") + the import button
        // already-disabled-unless-typed-confirm-matches state are
        // sufficient defense-in-depth; the native browser dialog was
        // jarring + inconsistent with the rest of ENM's UX.
        status.textContent = t('settings.identity_import_running');
        status.classList.remove('ok', 'err');
        // Whether to force = whether the slashing-risk warning is visible
        // (operator is acknowledging by clicking even after the warning).
        var force = !warnEl.hidden;
        return root.enmRunOnce(btn,
            t('settings.identity_import_running'),
            function () {
                return file.arrayBuffer().then(function (ab) {
                    var base = (self.api && self.api.base) || '';
                    var token = self.api && self.api.token;
                    var headers = {
                        'Content-Type': 'application/octet-stream',
                        'X-Keystore-Password': pwInput.value,
                        'X-Keystore-Confirm': 'import',
                    };
                    if (force) { headers['X-Keystore-Force'] = 'true'; }
                    if (token) { headers['Authorization'] = 'Bearer ' + token; }
                    return fetch(base + '/identity/import', {
                        method: 'POST',
                        headers: headers,
                        body: ab,
                    }).then(function (r) {
                        return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
                    });
                }).then(function (res) {
                    if (self._destroyed) { return; }
                    if (!res.ok) {
                        // 0.5.131 audit Session 131 — silence on 401. Raw fetch
                        // bypasses the api client's session-expiry handling;
                        // login overlay takes over, no need to paint stuck red
                        // "Unauthorized" in status.
                        if (res.status === 401) { return; }
                        var msg = (res.body && res.body.error) || ('HTTP ' + res.status);
                        status.textContent = msg;
                        status.classList.add('err');
                        return;
                    }
                    pwInput.value = '';
                    fileInput.value = '';
                    status.textContent = t('settings.identity_import_ok');
                    status.classList.add('ok');
                    if (typeof self.api.invalidate === 'function') {
                        try { self.api.invalidate('/system/identity'); }
                        catch (_) { /* ignore */ }
                    }
                    self._refreshIdentity();
                }).catch(function (err) {
                    if (self._destroyed) { return; }
                    status.textContent = (err && err.message) || 'Import failed.';
                    status.classList.add('err');
                });
            });
    };

    /** POST /identity/reset with the typed confirm + optional anti-snipe. */
    // v0.5.232 — SettingsTab.prototype._doIdentityReset removed. The
    // standalone keystore-reset flow was folded into Settings → Reset
    // ENM (see _doResetEverything below). The 150-line method that lived
    // here, including the reveal-ack flow with last-4 anti-typo gate, is
    // preserved in git history (commit b19c15bf and earlier) for any
    // future work that needs to revive a narrower rotation path.

    /** Build a labelled control row used inside Identity sub-cards. */
    function _wrapLabel(labelText, control) {
        var row = document.createElement('div');
        row.className = 'enm-identity-row';
        var lbl = document.createElement('label');
        lbl.className = 'enm-identity-row-label-form';
        lbl.textContent = labelText;
        row.appendChild(lbl);
        row.appendChild(control);
        return row;
    }
    function _statusEl() {
        var el = document.createElement('div');
        el.className = 'enm-danger-status';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        return el;
    }

    // -----------------------------------------------------------------
    // Section: Access (beta.3.18 — NEW)
    //   RPC whitelist + RPC creds (user/password). All three move out
    //   of the old "Mainchain Advanced" since they're access-control
    //   concerns, not runtime tuning. Saves via PUT /config/mainchain
    //   (same backend endpoint; partial body is supported per the
    //   alpha.28 _saveRpcEnabled dead-code comment).
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildAccessSection = function (t) {
        var self = this;
        var sec = makeSection({
            id: 'access',
            icon: '⇆',
            title: t('settings.heading_access'),
            help: t('settings.access_intro'),
            tag: { kind: 'warn', label: 'Restart required' },
        });
        this._access = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };

        // Row 0 — master enable (v0.5.246). RPC and the read-only fleet-
        // monitoring endpoint stay loopback-only until this is on. Wires the
        // formerly-dead toggle; without it neither external RPC nor the monitor
        // can ever be opened from the UI.
        this._access.enabled = makeToggleRow({
            initial: false,
            getLabel: function (on) {
                return on
                    ? { title: 'On · external access enabled',
                        sub: 'Whitelisted IPs (below) with the RPC credentials can reach the node.' }
                    : { title: 'Off · loopback only (default)',
                        sub: 'RPC and the monitoring endpoint are not reachable from the network.' };
            },
            onChange: function () { if (self._access && self._access.setDirty) { self._access.setDirty(true); } },
        });
        sec.body.appendChild(makeFormRow({
            label: 'External access',
            help: 'Master switch. When on, the node’s JSON-RPC and a read-only whole-node monitoring endpoint become reachable from the Allowed IPs below and require the RPC credentials. Off keeps everything loopback-only.',
            control: this._access.enabled.el,
        }));

        // Row 1 — IP whitelist (chip input with locked loopback). This
        // is the one knob the operator told us actually mattered, so
        // it's the first thing in the first section.
        this._access.whiteIp = makeChipInput({
            locked: ['127.0.0.1'],
            placeholder: t('settings.rpc_white_add_placeholder'),
            ariaLabel: 'Add IP address or CIDR to whitelist',
        });
        sec.body.appendChild(makeFormRow({
            label: 'Allowed IPs',
            help: 'Anyone on these IPs (or CIDR ranges) can hit the JSON-RPC. 127.0.0.1 stays locked so ENM doesn’t lose access to its own RPC. Whitelisted IPs still need the credentials below to authenticate.',
            control: this._access.whiteIp.el,
        }));

        // Row 2 — RPC user.
        this._access.rpcUser = makeInput({
            type: 'text',
            value: 'ela',
            mono: true,
            ariaLabel: 'RPC user',
            describedById: 'enm-access-status',
        });
        this._access.rpcUser.setAttribute('pattern', '[A-Za-z0-9]+');
        this._access.rpcUser.setAttribute('autocomplete', 'username');
        this._access.rpcUser.setAttribute('spellcheck', 'false');
        this._access.rpcUser.setAttribute('autocapitalize', 'off');
        this._access.rpcUser.title = t('settings.rpc_user_tooltip');
        sec.body.appendChild(makeFormRow({
            label: 'RPC user',
            help: 'Basic-Auth principal. Default (ela) is fine unless you have a reason to change it.',
            control: this._access.rpcUser,
        }));

        // Row 3 — RPC password (secret field with show/hide).
        this._access.rpcPasswordField = makeSecretField({
            ariaLabel: 'RPC password',
            placeholder: t('settings.rpc_password_placeholder_set'),
        });
        sec.body.appendChild(makeFormRow({
            label: 'RPC password',
            help: 'Stored encrypted on disk. Leave blank to keep the current one; type a new value to rotate.',
            control: this._access.rpcPasswordField.el,
        }));

        // Fleet-monitoring note (v0.5.246). The same whitelist + RPC
        // credentials also gate a read-only whole-node status feed (every chain
        // + service, version, active/sync). Text + URL host filled by
        // _fillCreds once the LAN URLs are known.
        var monNote = document.createElement('p');
        monNote.style.cssText = 'margin-top:10px; font-size:12px; line-height:1.5; color: var(--text-tertiary);';
        monNote.textContent = 'Monitoring: when enabled, a read-only whole-node status feed (every chain & service, version, active/sync) is served at :20920/status, reachable from the Allowed IPs using the RPC user/password above.';
        this._access.monitorNote = monNote;
        sec.body.appendChild(monNote);

        sec.statusEl.id = 'enm-access-status';

        sec.saveBtn.addEventListener('click', function () { self._saveAccess(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('access'); });

        return sec.card;
    };

    // -----------------------------------------------------------------
    // Section: Security (beta.3.18 — NEW)
    //   Anti-snipe password (was in General) + healing toggle (was in
    //   General) + critical-ack (was in General). All recontextualized
    //   with "what this protects" callouts. Two backend endpoints:
    //   POST /config/anti-snipe-password (its own button row) and
    //   PUT /config/general (criticalRequiresAck + autoExecuteSafe).
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildSecuritySection = function (t) {
        var self = this;
        var sec = makeSection({
            id: 'security',
            icon: '◈',
            title: t('settings.heading_security'),
            help: t('settings.security_intro'),
            tag: { kind: 'success', label: 'No restart needed' },
        });
        this._security = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };

        // Row 1 — Anti-snipe password (set / clear) with a "what this
        // protects" callout above it so operators understand WHY the
        // password is worth setting.
        var antiSnipeCallout = document.createElement('div');
        antiSnipeCallout.className = 'enm-security-callout';
        var antiSnipeCalloutHead = document.createElement('div');
        antiSnipeCalloutHead.className = 'enm-security-callout-head';
        antiSnipeCalloutHead.textContent = t('settings.anti_snipe_what');
        var antiSnipeCalloutBody = document.createElement('div');
        antiSnipeCalloutBody.className = 'enm-security-callout-body';
        antiSnipeCalloutBody.textContent = t('settings.anti_snipe_what_body');
        antiSnipeCallout.appendChild(antiSnipeCalloutHead);
        antiSnipeCallout.appendChild(antiSnipeCalloutBody);
        sec.body.appendChild(antiSnipeCallout);

        this._security.antiSnipeField = makeSecretField({
            ariaLabel: 'Anti-snipe password',
            placeholder: t('settings.anti_snipe_placeholder_unset'),
        });
        sec.body.appendChild(makeFormRow({
            label: 'Anti-snipe password',
            help: 'Optional. When set, high-stakes healing actions need this password to execute. Leave blank when typing a NEW password to keep the current one.',
            control: this._security.antiSnipeField.el,
        }));
        // Inline button row for Set + Clear (independent of the
        // section's main Save button — backend uses a dedicated
        // POST /config/anti-snipe-password endpoint).
        var antiSnipeActions = document.createElement('div');
        antiSnipeActions.className = 'enm-form-inline';
        this._security.antiSnipeSaveBtn = document.createElement('button');
        this._security.antiSnipeSaveBtn.type = 'button';
        this._security.antiSnipeSaveBtn.className = 'enm-btn';
        this._security.antiSnipeSaveBtn.textContent = t('settings.anti_snipe_set_btn');
        this._security.antiSnipeClearBtn = document.createElement('button');
        this._security.antiSnipeClearBtn.type = 'button';
        this._security.antiSnipeClearBtn.className = 'enm-btn enm-btn-danger';
        this._security.antiSnipeClearBtn.textContent = t('settings.anti_snipe_clear_btn');
        this._security.antiSnipeClearBtn.hidden = true;
        this._security.antiSnipeStatus = document.createElement('span');
        this._security.antiSnipeStatus.className = 'enm-detect-result';
        antiSnipeActions.appendChild(this._security.antiSnipeSaveBtn);
        antiSnipeActions.appendChild(this._security.antiSnipeClearBtn);
        antiSnipeActions.appendChild(this._security.antiSnipeStatus);
        sec.body.appendChild(makeFormRow({
            label: 'Apply password',
            help: 'Saves immediately on click — bypasses the section Save.',
            control: antiSnipeActions,
        }));
        this._security.antiSnipeSaveBtn.addEventListener('click', function () { self._saveAntiSnipe(); });
        this._security.antiSnipeClearBtn.addEventListener('click', function () { self._clearAntiSnipe(); });

        // Row 2 — Auto-execute safe healing (with a callout).
        var healingCallout = document.createElement('div');
        healingCallout.className = 'enm-security-callout';
        var healingHead = document.createElement('div');
        healingHead.className = 'enm-security-callout-head';
        healingHead.textContent = t('settings.healing_what');
        var healingBody = document.createElement('div');
        healingBody.className = 'enm-security-callout-body';
        healingBody.textContent = t('settings.healing_what_body');
        healingCallout.appendChild(healingHead);
        healingCallout.appendChild(healingBody);
        sec.body.appendChild(healingCallout);

        this._security.autoSafe = makeToggleRow({
            initial: true,
            getLabel: function (on) {
                return on
                    ? { title: 'On · auto-execute safe healing',
                        sub: 'Restart-on-crash, rotate logs, reload config — handled automatically.' }
                    : { title: 'Off · every action waits for the operator',
                        sub: 'Even AUTOMATED-SAFE playbooks need a manual confirm.' };
            },
        });
        sec.body.appendChild(makeFormRow({
            label: 'Auto-execute safe healing',
            help: 'If a healing playbook is tagged safe, ENM runs it without asking. Unsafe playbooks always wait for the operator.',
            control: this._security.autoSafe.el,
        }));

        // beta.3.21 — Phase 4 visibility. Two collapsible panels under
        // the toggle (beta.3.23 — operator feedback: the previous
        // shape ate too much vertical space on mobile). Both use a
        // <details> element so they're closed by default; the
        // <summary> shows a count breakdown at a glance, and the
        // operator can expand for the full list / table.
        //   1. Rules list (what auto-runs, what asks first, what only
        //      raises alerts). Populated by GET /healing/rules.
        //   2. Recent activity table (last ~30 rows from
        //      GET /healing/history). Both panels are read-only —
        //      operator can't toggle individual rules from here. Per
        //      directive #4 ("no manual"), the section just shows
        //      what the toggle controls and what it has done.
        var rulesDetails = document.createElement('details');
        rulesDetails.className = 'enm-healing-details';
        var rulesSummary = document.createElement('summary');
        rulesSummary.className = 'enm-healing-details-summary';
        rulesSummary.textContent = t('settings.healing_rules_heading') + ' · …';
        rulesDetails.appendChild(rulesSummary);
        var rulesHost = document.createElement('div');
        rulesHost.className = 'enm-healing-rules-host';
        rulesHost.setAttribute('aria-live', 'polite');
        rulesHost.textContent = '…';
        rulesDetails.appendChild(rulesHost);
        sec.body.appendChild(rulesDetails);
        this._security.rulesHost = rulesHost;
        this._security.rulesSummary = rulesSummary;

        var activityDetails = document.createElement('details');
        activityDetails.className = 'enm-healing-details';
        var activitySummary = document.createElement('summary');
        activitySummary.className = 'enm-healing-details-summary';
        activitySummary.textContent = t('settings.healing_activity_heading') + ' · …';
        activityDetails.appendChild(activitySummary);
        var activityHost = document.createElement('div');
        activityHost.className = 'enm-healing-activity-host';
        activityHost.setAttribute('aria-live', 'polite');
        activityHost.textContent = '…';
        activityDetails.appendChild(activityHost);
        sec.body.appendChild(activityDetails);
        this._security.activityHost = activityHost;
        this._security.activitySummary = activitySummary;

        // beta.3.78 — snapshot panel removed. The auto-heal snapshot
        // service was deleted server-side; the panel + take/restore
        // actions had no backend to talk to. F22 (DPoS desync) is now
        // surfaced as a critical alert with manual recovery steps —
        // see the Activity (audit) tab when it fires.

        // Row 3 — Critical alerts require ack (with a callout).
        var ackCallout = document.createElement('div');
        ackCallout.className = 'enm-security-callout';
        var ackHead = document.createElement('div');
        ackHead.className = 'enm-security-callout-head';
        ackHead.textContent = t('settings.critical_ack_what');
        var ackBody = document.createElement('div');
        ackBody.className = 'enm-security-callout-body';
        ackBody.textContent = t('settings.critical_ack_what_body');
        ackCallout.appendChild(ackHead);
        ackCallout.appendChild(ackBody);
        sec.body.appendChild(ackCallout);

        this._security.criticalAck = makeToggleRow({
            initial: true,
            getLabel: function (on) {
                return on
                    ? { title: 'On · require explicit ack',
                        sub: 'Recommended. Keeps slashing-risk alerts sticky.' }
                    : { title: 'Off · auto-dismiss after view',
                        sub: 'Critical alerts stop being sticky.' };
            },
        });
        sec.body.appendChild(makeFormRow({
            label: 'Critical alerts require ack',
            help: 'Critical events stay visible in the alerts strip until you explicitly dismiss them. Off = auto-dismiss after view.',
            control: this._security.criticalAck.el,
        }));

        sec.statusEl.id = 'enm-security-status';

        sec.saveBtn.addEventListener('click', function () { self._saveSecurity(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('security'); });

        // beta.3.21 — initial load for the two visibility panels.
        // They also re-load whenever the operator opens the Security
        // tab (hooked in _activate).
        this._refreshHealingRules();
        this._refreshHealingActivity();
        // beta.3.78 — _refreshSnapshotStatus call removed with the panel.

        return sec.card;
    };

    /* beta.3.78 — _refreshSnapshotStatus / _renderSnapshotStatus /
     * _handleSnapshotTake / _handleSnapshotRestore methods removed
     * along with the snapshot UI panel. The server-side EnmStateSnapshot
     * service is gone; these handlers had nothing to call. F22 alerts
     * surface manual recovery steps via the Activity tab instead. */
    // (no-op placeholder kept so any external caller referencing the old
    //  names by string lookup fails loudly rather than silently. None of
    //  the in-tree code path should hit these — every call site is gone.)
    SettingsTab.prototype._refreshSnapshotStatus = function () { /* removed */ };
    SettingsTab.prototype._renderSnapshotStatus  = function () { /* removed */ };
    SettingsTab.prototype._handleSnapshotTake    = function () { /* removed */ };
    SettingsTab.prototype._handleSnapshotRestore = function () { /* removed */ };
    // Marker placeholder so the long deletion below is greppable.
    SettingsTab.prototype._snapshotMethodsRemovedInBeta378 = function () {
        return; /* original body deleted — bypass to reach the next method */
    };

    /**
     * beta.3.21 — fetch GET /healing/rules and render the grouped
     * rule list under the auto-execute toggle.
     * @private
     */
    SettingsTab.prototype._refreshHealingRules = function () {
        var self = this;
        var t = root.enmTOrFallback;
        if (!this._security || !this._security.rulesHost) { return; }
        var host = this._security.rulesHost;
        host.textContent = '…';
        this.api.get('/healing/rules', { skipCache: true })
            .then(function (env) {
                if (self._destroyed) { return; }
                var data = (env && env.result) || env || {};
                var rules = Array.isArray(data.rules) ? data.rules : [];
                self._paintHealingRules(host, rules);
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                host.textContent = t('settings.healing_rules_load_failed');
            });
    };

    /**
     * beta.3.23 — flat compact rule list. Previous shape (3 stacked
     * groups, each with a help paragraph + per-rule card with title +
     * description) ate too much vertical space on mobile. New shape:
     * a single list with a tier-color dot prefix per rule. Each row
     * is a <details> so the operator can tap to see the description
     * if they care; collapsed rows are one line each. Summary on the
     * containing details element gives the count breakdown so the
     * operator knows what's behind the collapse before they tap.
     * @private
     */
    SettingsTab.prototype._paintHealingRules = function (host, rules) {
        var t = root.enmTOrFallback;
        host.innerHTML = '';
        if (!rules || rules.length === 0) {
            host.textContent = t('settings.healing_rules_load_failed');
            return;
        }
        // Count per tier for the summary line.
        var counts = { auto: 0, owner: 0, critical: 0 };
        for (var i = 0; i < rules.length; i += 1) {
            var r = rules[i];
            if (r.tier === 'AUTOMATED_SAFE') { counts.auto += 1; }
            else if (r.tier === 'OWNER_CONFIRMS') { counts.owner += 1; }
            else { counts.critical += 1; } // CRITICAL_NOTIFY + NEVER_AUTOMATIC
        }
        // Update the outer <details> summary to show the breakdown.
        if (this._security && this._security.rulesSummary) {
            this._security.rulesSummary.textContent =
                t('settings.healing_rules_heading') + ' · '
                + counts.auto + ' ' + t('settings.healing_tier_auto') + ' · '
                + counts.owner + ' ' + t('settings.healing_tier_owner') + ' · '
                + counts.critical + ' ' + t('settings.healing_tier_critical');
        }

        // Short help paragraph above the list.
        var help = document.createElement('div');
        help.className = 'enm-healing-rules-help';
        help.textContent = t('settings.healing_rules_help');
        host.appendChild(help);

        // Order: AUTO first (most operator-relevant), then OWNER, then
        // CRITICAL/NEVER. Within each tier, original declaration order
        // (F1, F2, F3, …) is preserved by the backend so we don't
        // re-sort.
        var orderedRules = rules.slice().sort(function (a, b) {
            var tierOrder = { AUTOMATED_SAFE: 0, OWNER_CONFIRMS: 1, CRITICAL_NOTIFY: 2, NEVER_AUTOMATIC: 3 };
            var ta = tierOrder[a.tier] != null ? tierOrder[a.tier] : 9;
            var tb = tierOrder[b.tier] != null ? tierOrder[b.tier] : 9;
            if (ta !== tb) { return ta - tb; }
            // Same tier → preserve backend order via numeric suffix
            // on ruleId (F1, F2, F10, F19 …).
            var na = parseInt(String(a.ruleId).replace(/[^0-9]/g, ''), 10) || 0;
            var nb = parseInt(String(b.ruleId).replace(/[^0-9]/g, ''), 10) || 0;
            return na - nb;
        });

        var list = document.createElement('ul');
        list.className = 'enm-healing-rules-list';
        for (var j = 0; j < orderedRules.length; j += 1) {
            var rule = orderedRules[j];
            var tone = (rule.tier === 'AUTOMATED_SAFE') ? 'auto'
                : (rule.tier === 'OWNER_CONFIRMS') ? 'owner'
                : 'critical';
            var li = document.createElement('li');
            li.className = 'enm-healing-rules-item enm-healing-rules-item-' + tone;
            if (!rule.currentlyEnabled) {
                li.classList.add('enm-healing-rules-item-disabled');
            }

            // Each rule is itself a tiny <details> so the description
            // is hidden by default — operator taps the title row to
            // expand. The closed state is single-line.
            var ruleDetails = document.createElement('details');
            ruleDetails.className = 'enm-healing-rules-row';
            var ruleSummary = document.createElement('summary');
            ruleSummary.className = 'enm-healing-rules-row-summary';

            var dot = document.createElement('span');
            dot.className = 'enm-healing-rules-dot enm-healing-rules-dot-' + tone;
            dot.setAttribute('aria-hidden', 'true');
            ruleSummary.appendChild(dot);

            var idBadge = document.createElement('span');
            idBadge.className = 'enm-healing-rules-id';
            idBadge.textContent = rule.ruleId;
            ruleSummary.appendChild(idBadge);

            var titleEl = document.createElement('span');
            titleEl.className = 'enm-healing-rules-title';
            titleEl.textContent = rule.title || rule.ruleId;
            ruleSummary.appendChild(titleEl);

            // beta.3.76 — operator-facing per-rule on/off toggle.
            // Backend persists via PUT /config/healing and HealthChecker
            // pushes the map into HealthRules.setRuleEnabled on its
            // next ≤5s tick. The handler is wired to a span (not a
            // <button> inside the <summary>) to dodge the native
            // <summary> click semantics that would expand/collapse the
            // <details> when the toggle is clicked. Stop propagation +
            // role=switch + keyboard support keep it accessible.
            var toggle = document.createElement('span');
            toggle.className = 'enm-healing-rules-toggle';
            toggle.setAttribute('role', 'switch');
            toggle.setAttribute('aria-checked', rule.currentlyEnabled ? 'true' : 'false');
            toggle.setAttribute('tabindex', '0');
            toggle.setAttribute('data-rule-id', rule.ruleId);
            toggle.setAttribute(
                'aria-label',
                (rule.currentlyEnabled ? 'Disable' : 'Enable') + ' rule ' + rule.ruleId,
            );
            toggle.textContent = rule.currentlyEnabled ? 'on' : 'off';
            if (!rule.currentlyEnabled) { toggle.classList.add('enm-healing-rules-toggle-off'); }
            // 0.5.19 audit Session 19 — thread rule.title through so the
            // success / failure toasts in _toggleHealingRule can show
            // "F18 (No inbound peers) is now off" instead of bare "F18".
            // Friendly title shipped by backend /healing/rules already
            // and rendered on this same row at idBadge + titleEl above.
            (function (toggle, ruleId, ruleTitle, currentlyEnabled) {
                function handleFlip(ev) {
                    if (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                    }
                    self._toggleHealingRule(ruleId, ruleTitle, !currentlyEnabled, toggle);
                }
                toggle.addEventListener('click', handleFlip);
                toggle.addEventListener('keydown', function (ev) {
                    if (ev.key === ' ' || ev.key === 'Enter') { handleFlip(ev); }
                });
            }(toggle, rule.ruleId, rule.title || rule.ruleId, rule.currentlyEnabled));
            ruleSummary.appendChild(toggle);

            ruleDetails.appendChild(ruleSummary);

            var desc = document.createElement('div');
            desc.className = 'enm-healing-rules-desc';
            desc.textContent = rule.description || '';
            ruleDetails.appendChild(desc);

            li.appendChild(ruleDetails);
            list.appendChild(li);
        }
        host.appendChild(list);
    };

    /**
     * beta.3.76 — flip a single F-rule on/off.
     * PUT /config/healing with a single-key body so other persisted
     * overrides remain intact (the route is additive — keys absent from
     * the body are not cleared). On success, refresh the rules list so
     * the next render reflects the new state.
     * @private
     */
    // 0.5.19 audit Session 19 — new `ruleTitle` param so toasts can
    // include the operator-friendly label alongside the F-code. The
    // toggle wiring in _paintHealingRules now passes rule.title (or
    // the ruleId as fallback). Pre-0.5.19 the signature was
    // (ruleId, nextEnabled, toggleEl) and toasts said bare "F18 is
    // now off" — operators dismissing toasts hours later had no idea
    // which rule they had toggled.
    SettingsTab.prototype._toggleHealingRule = function (ruleId, ruleTitle, nextEnabled, toggleEl) {
        var self = this;
        // v0.5.215 audit (AUDIT-FLOW-H01, P0) — restored from dead-on-arrival
        // state. Pre-v0.5.215 this guard referenced this.services.api which
        // was never assigned in the constructor (this.api is the canonical
        // field — see line 116). Every healing toggle click was a silent
        // no-op: the early-return fired before any API call or UI flip,
        // leaving operators with NO functional kill switch for misbehaving
        // F-rules (critical given the C19 F2 restart-loop history).
        if (!this.api || typeof this.api.put !== 'function') {
            return;
        }
        // Compose the toast label once. If the title is the same as the
        // ruleId (no backend title) we render just the code to avoid
        // "F18 (F18) is now off".
        var ruleLabel = (ruleTitle && ruleTitle !== ruleId)
            ? (ruleId + ' (' + ruleTitle + ')')
            : ruleId;
        // Optimistic UI flip — restore on error.
        var prevText = toggleEl.textContent;
        var prevChecked = toggleEl.getAttribute('aria-checked');
        toggleEl.textContent = nextEnabled ? 'on' : 'off';
        toggleEl.setAttribute('aria-checked', nextEnabled ? 'true' : 'false');
        toggleEl.classList.toggle('enm-healing-rules-toggle-off', !nextEnabled);
        var body = { enabledRules: {} };
        body.enabledRules[ruleId] = !!nextEnabled;
        this.api.put('/config/healing', body)
            .then(function () {
                if (self.notifications) {
                    self.notifications.show({
                        severity: 'info',
                        title: ruleLabel + ' is now ' + (nextEnabled ? 'on' : 'off'),
                        body: 'The healing engine will pick up this change within ~5 s.',
                    });
                }
                // Re-render so the disabled-style class flips on the <li>
                // wrapper too (visual dim). Backend push completes async
                // so the rendered state will match within a tick.
                self._refreshHealingRules();
            })
            .catch(function (err) {
                toggleEl.textContent = prevText;
                toggleEl.setAttribute('aria-checked', prevChecked);
                toggleEl.classList.toggle(
                    'enm-healing-rules-toggle-off',
                    prevChecked !== 'true',
                );
                // 0.5.129 audit Session 129 — silence the toast on 401 so
                // session-expiry mid-toggle doesn't flash a stale
                // "Failed to update F<n>" while the login overlay is
                // appearing. The optimistic-UI rollback above still runs
                // (correct — the rule wasn't actually saved). Matches the
                // 401 silencer in _saveAntiSnipe / _clearAntiSnipe /
                // _saveSecurity / _refreshHealingRules / _refreshHealingActivity.
                if (err && err.status === 401) { return; }
                var msg = (err && err.message) || String(err);
                if (self.notifications) {
                    self.notifications.show({
                        severity: 'warning',
                        title: 'Failed to update ' + ruleLabel,
                        body: msg,
                    });
                }
            });
    };

    /**
     * beta.3.21 — fetch GET /healing/history and render the recent-
     * activity table. Compact 4-column shape (When / Rule / Action /
     * Outcome). Max ~30 rows; no pagination — the table is meant for
     * a glance, not a deep dive. The full audit log lives in the
     * Audit tab.
     * @private
     */
    SettingsTab.prototype._refreshHealingActivity = function () {
        var self = this;
        var t = root.enmTOrFallback;
        if (!this._security || !this._security.activityHost) { return; }
        var host = this._security.activityHost;
        host.textContent = '…';
        this.api.get('/healing/history?limit=30', { skipCache: true })
            .then(function (env) {
                if (self._destroyed) { return; }
                var data = (env && env.result) || env || {};
                var rows = Array.isArray(data.proposals) ? data.proposals : [];
                self._paintHealingActivity(host, rows);
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                host.textContent = t('settings.healing_activity_load_failed');
            });
    };

    /** @private */
    SettingsTab.prototype._paintHealingActivity = function (host, rows) {
        var t = root.enmTOrFallback;
        host.innerHTML = '';
        // beta.3.23 — update the outer <details> summary so the
        // operator sees the count without expanding. Empty state is
        // explicit so they're not left wondering whether it failed
        // to load.
        var n = Array.isArray(rows) ? rows.length : 0;
        if (this._security && this._security.activitySummary) {
            var noun = (n === 1) ? 'event' : 'events';
            this._security.activitySummary.textContent =
                t('settings.healing_activity_heading') + ' · ' + n + ' ' + noun;
        }
        if (!rows || rows.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'enm-healing-activity-empty';
            empty.textContent = t('settings.healing_activity_empty');
            host.appendChild(empty);
            return;
        }
        var table = document.createElement('table');
        table.className = 'enm-healing-activity-table';
        var thead = document.createElement('thead');
        var headRow = document.createElement('tr');
        ['healing_activity_col_when', 'healing_activity_col_rule',
         'healing_activity_col_action', 'healing_activity_col_outcome'].forEach(function (k) {
            var th = document.createElement('th');
            th.textContent = t('settings.' + k);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        var tbody = document.createElement('tbody');
        for (var i = 0; i < rows.length; i += 1) {
            var r = rows[i];
            var tr = document.createElement('tr');
            // When — use executedAt if present, else approvedAt, else proposedAt.
            var when = r.executed_at || r.executedAt
                    || r.approved_at || r.approvedAt
                    || r.rejected_at || r.rejectedAt
                    || r.proposed_at || r.proposedAt;
            var whenTd = document.createElement('td');
            whenTd.className = 'enm-healing-activity-when';
            whenTd.textContent = when ? relativeTime(toMs(when)) : '—';
            tr.appendChild(whenTd);
            // Rule.
            var ruleTd = document.createElement('td');
            ruleTd.className = 'enm-healing-activity-rule';
            ruleTd.textContent = r.rule_id || r.ruleId || '—';
            tr.appendChild(ruleTd);
            // Action.
            var actionTd = document.createElement('td');
            actionTd.className = 'enm-healing-activity-action';
            actionTd.textContent = r.summary_action || r.summaryAction || '—';
            tr.appendChild(actionTd);
            // Outcome — coarse badge derived from status + outcome.
            var outcomeTd = document.createElement('td');
            outcomeTd.className = 'enm-healing-activity-outcome';
            var status = (r.status || '').toLowerCase();
            var outcomeKind = 'pending';
            var outcomeLabel = t('settings.healing_status_pending');
            if (r.executed_at || r.executedAt) {
                outcomeKind = 'executed';
                outcomeLabel = t('settings.healing_status_executed');
                if (r.outcome === 'failed') {
                    outcomeKind = 'failed';
                    outcomeLabel = t('settings.healing_status_failed');
                }
            } else if (r.rejected_at || r.rejectedAt || status === 'rejected') {
                outcomeKind = 'rejected';
                outcomeLabel = t('settings.healing_status_rejected');
            } else if (r.approved_at || r.approvedAt || status === 'approved') {
                outcomeKind = 'approved';
                outcomeLabel = t('settings.healing_status_approved');
            } else if (status === 'expired') {
                outcomeKind = 'expired';
                outcomeLabel = t('settings.healing_status_expired');
            }
            var badge = document.createElement('span');
            badge.className = 'enm-healing-activity-badge enm-healing-activity-badge-' + outcomeKind;
            badge.textContent = outcomeLabel;
            outcomeTd.appendChild(badge);
            tr.appendChild(outcomeTd);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        host.appendChild(table);
    };

    // -----------------------------------------------------------------
    // Section: Storage (beta.3.18 — NEW)
    //   Audit retention (was in General). Future Phase 3 will add log
    //   retention + keystore backup. Saves via PUT /config/general.
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildStorageSection = function (t) {
        var self = this;
        var sec = makeSection({
            id: 'storage',
            icon: '◳',
            title: t('settings.heading_storage'),
            help: t('settings.storage_intro'),
            tag: { kind: 'success', label: 'No restart needed' },
        });
        this._storage = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };

        // ----- Disk usage panel (read-only, top of section) -----------
        // beta.3.20 — surfaces a live breakdown of where disk is going.
        // Hydrated by _refreshStorageUsage() via GET /system/storage on
        // section mount + on section activation. Operator never has to
        // ssh + du.
        var diskPanel = document.createElement('div');
        diskPanel.className = 'enm-storage-disk-panel';
        var diskHead = document.createElement('div');
        diskHead.className = 'enm-storage-disk-head';
        var diskHeadLabel = document.createElement('div');
        diskHeadLabel.className = 'enm-storage-disk-head-label';
        diskHeadLabel.textContent = t('settings.storage_disk_label');
        var diskHeadHelp = document.createElement('div');
        diskHeadHelp.className = 'enm-storage-disk-head-help';
        diskHeadHelp.textContent = t('settings.storage_disk_help');
        diskHead.appendChild(diskHeadLabel);
        diskHead.appendChild(diskHeadHelp);
        diskPanel.appendChild(diskHead);
        // Four-cell grid: chain data, logs, audit, backups. Plus a
        // total row at the bottom. Values fill in via _refreshStorageUsage.
        var diskGrid = document.createElement('div');
        diskGrid.className = 'enm-storage-disk-grid';
        var diskKeys = [
            { key: 'chainData', label: t('settings.storage_disk_chain_data') },
            { key: 'logs',      label: t('settings.storage_disk_logs') },
            { key: 'auditDb',   label: t('settings.storage_disk_audit') },
            { key: 'backups',   label: t('settings.storage_disk_backups') },
        ];
        this._storage.diskCells = {};
        diskKeys.forEach(function (item) {
            var cell = document.createElement('div');
            cell.className = 'enm-storage-disk-cell';
            var label = document.createElement('div');
            label.className = 'enm-storage-disk-cell-label';
            label.textContent = item.label;
            var value = document.createElement('div');
            value.className = 'enm-storage-disk-cell-value';
            value.textContent = '—';
            cell.appendChild(label);
            cell.appendChild(value);
            diskGrid.appendChild(cell);
            self._storage.diskCells[item.key] = value;
        });
        diskPanel.appendChild(diskGrid);
        var diskTotal = document.createElement('div');
        diskTotal.className = 'enm-storage-disk-total';
        var diskTotalLabel = document.createElement('span');
        diskTotalLabel.className = 'enm-storage-disk-total-label';
        diskTotalLabel.textContent = t('settings.storage_disk_total');
        var diskTotalValue = document.createElement('span');
        diskTotalValue.className = 'enm-storage-disk-total-value';
        diskTotalValue.textContent = '—';
        diskTotal.appendChild(diskTotalLabel);
        diskTotal.appendChild(diskTotalValue);
        diskPanel.appendChild(diskTotal);
        this._storage.diskTotal = diskTotalValue;
        sec.body.appendChild(diskPanel);

        // ----- Audit retention (existing knob) ------------------------
        this._storage.auditRetention = makeInputSuffix({
            type: 'number',
            value: '365',
            min: 0,
            max: 3650,
            step: 1,
            mono: true,
            suffix: 'days',
            ariaLabel: 'Audit retention in days',
            describedById: 'enm-storage-status',
        });
        sec.body.appendChild(makeFormRow({
            label: 'Audit retention',
            help: 'How long ENM keeps audit-log entries. ',
            helpCodes: ['0'],
            helpSuffix: ' = forever. Range 0 – 3,650 days.',
            control: this._storage.auditRetention.el,
        }));

        // ----- Log retention policy (NEW Phase 3) ---------------------
        this._storage.logGzip = makeInputSuffix({
            type: 'number',
            value: '7',
            min: 1,
            max: 365,
            step: 1,
            mono: true,
            suffix: 'days',
            ariaLabel: 'Log compress age in days',
            describedById: 'enm-storage-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.storage_log_gzip_label'),
            help: t('settings.storage_log_gzip_help'),
            control: this._storage.logGzip.el,
        }));

        this._storage.logRetention = makeInputSuffix({
            type: 'number',
            value: '30',
            min: 1,
            max: 3650,
            step: 1,
            mono: true,
            suffix: 'days',
            ariaLabel: 'Log retention in days',
            describedById: 'enm-storage-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.storage_log_retention_label'),
            help: t('settings.storage_log_retention_help'),
            control: this._storage.logRetention.el,
        }));

        // ----- Keystore backup section (NEW Phase 3) -----------------
        var backupCallout = document.createElement('div');
        backupCallout.className = 'enm-storage-backup-callout';
        var backupCalloutHead = document.createElement('div');
        backupCalloutHead.className = 'enm-storage-backup-callout-head';
        backupCalloutHead.textContent = t('settings.storage_backup_section_label');
        var backupCalloutBody = document.createElement('div');
        backupCalloutBody.className = 'enm-storage-backup-callout-body';
        backupCalloutBody.textContent = t('settings.storage_backup_section_help');
        backupCallout.appendChild(backupCalloutHead);
        backupCallout.appendChild(backupCalloutBody);
        sec.body.appendChild(backupCallout);

        this._storage.backupInterval = makeInputSuffix({
            type: 'number',
            value: '7',
            min: 1,
            max: 90,
            step: 1,
            mono: true,
            suffix: 'days',
            ariaLabel: 'Keystore backup interval in days',
            describedById: 'enm-storage-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.storage_backup_interval_label'),
            help: t('settings.storage_backup_interval_help'),
            control: this._storage.backupInterval.el,
        }));

        this._storage.backupKeep = makeInputSuffix({
            type: 'number',
            value: '4',
            min: 1,
            max: 50,
            step: 1,
            mono: true,
            suffix: 'copies',
            ariaLabel: 'Keystore backup keep count',
            describedById: 'enm-storage-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.storage_backup_keep_label'),
            help: t('settings.storage_backup_keep_help'),
            control: this._storage.backupKeep.el,
        }));

        // Read-only status row showing last backup + path.
        this._storage.backupStatusEl = document.createElement('div');
        this._storage.backupStatusEl.className = 'enm-storage-backup-status';
        this._storage.backupStatusEl.innerHTML = '—';
        sec.body.appendChild(makeFormRow({
            label: t('settings.storage_backup_status_label'),
            help: '',
            control: this._storage.backupStatusEl,
        }));

        sec.statusEl.id = 'enm-storage-status';

        sec.saveBtn.addEventListener('click', function () { self._saveStorage(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('storage'); });

        // Initial fetch of /system/storage to fill disk panel + backup
        // status. Quiet failure — the section is still useful with the
        // form fields alone.
        this._refreshStorageUsage();

        return sec.card;
    };

    /**
     * beta.3.20 — fetch /system/storage and paint the disk-usage
     * panel + backup-status line. Safe to call repeatedly; the
     * section is hydrated on mount and on every activation, so the
     * data is fresh whenever the operator opens this tab.
     * @private
     */
    SettingsTab.prototype._refreshStorageUsage = function () {
        var self = this;
        if (!this._storage || !this._storage.diskCells) { return; }
        // Show a loading placeholder while the GET resolves.
        Object.keys(this._storage.diskCells).forEach(function (k) {
            self._storage.diskCells[k].textContent = '…';
        });
        this._storage.diskTotal.textContent = '…';
        this.api.get('/system/storage', { skipCache: true })
            .then(function (env) {
                if (self._destroyed) { return; }
                var data = (env && env.result) || env || {};
                var mb = data.diskMb || {};
                self._storage.diskCells.chainData.textContent = fmtMb(mb.chainData);
                self._storage.diskCells.logs.textContent      = fmtMb(mb.logs);
                self._storage.diskCells.auditDb.textContent   = fmtMb(mb.auditDb);
                self._storage.diskCells.backups.textContent   = fmtMb(mb.backups);
                self._storage.diskTotal.textContent           = fmtMb(mb.total);
                // Hydrate the backup-status line.
                self._paintBackupStatus(data.backup);
                // Mirror server-current rotation values into the inputs
                // so they don't desync with /system/storage (which
                // reads cfg.global.logRotation directly).
                var lr = data.logRotation || {};
                if (Number.isFinite(lr.gzipAfterDays)) {
                    self._storage.logGzip.input.value = String(lr.gzipAfterDays);
                }
                if (Number.isFinite(lr.purgeAfterDays)) {
                    self._storage.logRetention.input.value = String(lr.purgeAfterDays);
                }
                var b = data.backup || {};
                if (Number.isFinite(b.intervalDays)) {
                    self._storage.backupInterval.input.value = String(b.intervalDays);
                }
                if (Number.isFinite(b.keepCount)) {
                    self._storage.backupKeep.input.value = String(b.keepCount);
                }
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                Object.keys(self._storage.diskCells).forEach(function (k) {
                    self._storage.diskCells[k].textContent = '—';
                });
                self._storage.diskTotal.textContent = '—';
            });
    };

    /** @private */
    SettingsTab.prototype._paintBackupStatus = function (b) {
        var t = root.enmTOrFallback;
        if (!this._storage || !this._storage.backupStatusEl) { return; }
        var el = this._storage.backupStatusEl;
        if (!b) {
            el.textContent = '—';
            return;
        }
        if (!b.keystorePresent) {
            el.innerHTML = '';
            el.textContent = t('settings.storage_backup_no_keystore');
            return;
        }
        if (Number.isFinite(b.lastAt) && b.lastAt > 0) {
            var when = relativeTime(b.lastAt);
            var pathStr = b.lastPath || '?';
            // Caller-supplied HTML uses <strong> and <code> — pass via
            // innerHTML but with escaped substitutions.
            el.innerHTML = t('settings.storage_backup_last', {
                when: escapeHtml(when),
                path: escapeHtml(pathStr),
            });
            if (b.backupDir) {
                var hint = document.createElement('div');
                hint.className = 'enm-storage-backup-dir-hint';
                hint.innerHTML = t('settings.storage_backup_dir_hint',
                    { dir: escapeHtml(b.backupDir) });
                el.appendChild(hint);
            }
            return;
        }
        el.innerHTML = '';
        el.textContent = t('settings.storage_backup_last_never');
    };

    // -----------------------------------------------------------------
    // Section: Alerts (beta.3.19 — Phase 2)
    //   Operator-tunable thresholds for the dashboard health detectors:
    //   disk-warn / disk-critical (GB free) + peer-zero grace +
    //   sync-stall grace (both in minutes). Backend pushes these into
    //   HealthRules.setThresholds() on each tick — no chain restart.
    // -----------------------------------------------------------------
    /** @private */
    SettingsTab.prototype._buildAlertsSection = function (t) {
        var self = this;
        var sec = makeSection({
            id: 'alerts',
            icon: '⚑',
            title: t('settings.heading_alerts'),
            help: t('settings.alerts_intro'),
            tag: { kind: 'success', label: 'No restart needed' },
        });
        this._alerts = {
            card: sec.card,
            body: sec.body,
            statusEl: sec.statusEl,
            saveBtn: sec.saveBtn,
            revertBtn: sec.revertBtn,
            setDirty: sec.setDirty,
        };

        // Row 1 — Disk-warn threshold (GB free).
        this._alerts.diskWarn = makeInputSuffix({
            type: 'number',
            value: '20',
            min: 10,
            max: 10000,
            step: 1,
            mono: true,
            suffix: 'GB free',
            ariaLabel: 'Disk-warn threshold in gigabytes free',
            describedById: 'enm-alerts-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.alerts_disk_warn_label'),
            help: t('settings.alerts_disk_warn_help'),
            control: this._alerts.diskWarn.el,
        }));

        // Row 2 — Disk-critical threshold.
        this._alerts.diskCritical = makeInputSuffix({
            type: 'number',
            value: '5',
            min: 1,
            max: 10000,
            step: 1,
            mono: true,
            suffix: 'GB free',
            ariaLabel: 'Disk-critical threshold in gigabytes free',
            describedById: 'enm-alerts-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.alerts_disk_critical_label'),
            help: t('settings.alerts_disk_critical_help'),
            control: this._alerts.diskCritical.el,
        }));

        // Row 3 — Peer-zero grace minutes.
        this._alerts.peerGrace = makeInputSuffix({
            type: 'number',
            value: '5',
            min: 1,
            max: 120,
            step: 1,
            mono: true,
            suffix: 'minutes',
            ariaLabel: 'Peer-zero alert grace in minutes',
            describedById: 'enm-alerts-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.alerts_peer_grace_label'),
            help: t('settings.alerts_peer_grace_help'),
            control: this._alerts.peerGrace.el,
        }));

        // Row 4 — Sync-stall grace minutes.
        this._alerts.syncGrace = makeInputSuffix({
            type: 'number',
            value: '10',
            min: 1,
            max: 240,
            step: 1,
            mono: true,
            suffix: 'minutes',
            ariaLabel: 'Sync-stall alert grace in minutes',
            describedById: 'enm-alerts-status',
        });
        sec.body.appendChild(makeFormRow({
            label: t('settings.alerts_sync_grace_label'),
            help: t('settings.alerts_sync_grace_help'),
            control: this._alerts.syncGrace.el,
        }));

        sec.statusEl.id = 'enm-alerts-status';

        sec.saveBtn.addEventListener('click', function () { self._saveAlerts(); });
        sec.revertBtn.addEventListener('click', function () { self.refresh('alerts'); });

        return sec.card;
    };

    /**
     * beta.3.19 — save Alerts thresholds. Backend:
     * PUT /config/notifications. No chain restart required —
     * HealthChecker picks up the new values on its next tick.
     * @private
     */
    SettingsTab.prototype._saveAlerts = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var a = this._alerts;
        // Clear stale aria-invalid hints.
        a.diskWarn.input.removeAttribute('aria-invalid');
        a.diskCritical.input.removeAttribute('aria-invalid');
        a.peerGrace.input.removeAttribute('aria-invalid');
        a.syncGrace.input.removeAttribute('aria-invalid');

        var diskWarn = parseInt(a.diskWarn.input.value, 10);
        var diskCrit = parseInt(a.diskCritical.input.value, 10);
        var peerMin  = parseInt(a.peerGrace.input.value, 10);
        var syncMin  = parseInt(a.syncGrace.input.value, 10);

        if (!Number.isInteger(diskWarn) || diskWarn < 10 || diskWarn > 10000) {
            setStatus(a.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.alerts_err_disk_warn') }));
            a.diskWarn.input.setAttribute('aria-invalid', 'true');
            try { a.diskWarn.input.focus({ preventScroll: true }); }
            catch (e) { a.diskWarn.input.focus(); }
            return;
        }
        // Critical must be valid AND strictly less than warn (matches the
        // Joi cross-field check on the backend).
        if (!Number.isInteger(diskCrit) || diskCrit < 1 || diskCrit > 10000
            || diskCrit >= diskWarn) {
            setStatus(a.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.alerts_err_disk_critical') }));
            a.diskCritical.input.setAttribute('aria-invalid', 'true');
            try { a.diskCritical.input.focus({ preventScroll: true }); }
            catch (e) { a.diskCritical.input.focus(); }
            return;
        }
        if (!Number.isInteger(peerMin) || peerMin < 1 || peerMin > 120) {
            setStatus(a.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.alerts_err_peer_grace') }));
            a.peerGrace.input.setAttribute('aria-invalid', 'true');
            try { a.peerGrace.input.focus({ preventScroll: true }); }
            catch (e) { a.peerGrace.input.focus(); }
            return;
        }
        if (!Number.isInteger(syncMin) || syncMin < 1 || syncMin > 240) {
            setStatus(a.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.alerts_err_sync_grace') }));
            a.syncGrace.input.setAttribute('aria-invalid', 'true');
            try { a.syncGrace.input.focus({ preventScroll: true }); }
            catch (e) { a.syncGrace.input.focus(); }
            return;
        }
        // v0.5.222 audit Phase 9 (XFLOW-13, AUDIT-FLOW-AL03) — sync-stall
        // grace MUST be >= peer-grace. Syncing requires peers first, so
        // peer-zero alert should fire BEFORE sync-stall alert. Pre-v0.5.222
        // operator could save peerGrace=10 + syncGrace=5 (backward) and
        // the sync-stall alert would fire while the peer-zero alert
        // hadn't yet triggered — confusing escalation order.
        if (syncMin < peerMin) {
            setStatus(a.statusEl, 'error',
                'Sync-stall grace (' + syncMin + 'm) must be greater than or equal to '
                + 'peer-zero grace (' + peerMin + 'm). Syncing requires peers first.');
            a.syncGrace.input.setAttribute('aria-invalid', 'true');
            try { a.syncGrace.input.focus({ preventScroll: true }); }
            catch (e) { a.syncGrace.input.focus(); }
            return;
        }

        var body = {
            diskFreeWarnGb: diskWarn,
            diskFreeCriticalGb: diskCrit,
            peerZeroGraceMin: peerMin,
            syncStallGraceMin: syncMin,
        };
        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(a.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(a.saveBtn, savingLabel, function () {
            return self.api.put('/config/notifications', body)
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(a.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self.refresh('alerts');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(a.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    /**
     * @private
     * Fetch /config/rpc/credentials/mainchain to populate the whitelist
     * chips, RPC user, and the password-placeholder hint. The same
     * endpoint also returns URLs + the rpc enabled flag — those parts of
     * the response are intentionally ignored by Beta 3 (the reveal panel
     * is dropped per phase-04 mock). _saveRpcEnabled remains below as
     * dead-code documentation of the partial-PUT shape.
     */
    SettingsTab.prototype._loadCreds = function () {
        var self = this;
        this.api.get('/config/rpc/credentials/mainchain', { skipCache: true })
            .then(function (data) {
                if (self._destroyed) { return; }
                self._creds = data || null;
                self._fillCreds();
            })
            .catch(function (err) {
                if (self._destroyed) { return; }
                if (err && err.status === 401) { return; }
                // Non-fatal — _fillForm's /config response still gives us
                // enough to render. Whitelist will fall back to the locked
                // loopback default.
            });
    };

    /** beta.3.18 — _fillCreds rebased onto the Access section. */
    SettingsTab.prototype._fillCreds = function () {
        if (!this._access || !this._creds) { return; }
        var d = this._creds;
        if (Array.isArray(d.whiteIPList)) {
            this._access.whiteIp.setValue(d.whiteIPList);
        }
        if (typeof d.user === 'string' && d.user.length > 0
            && (!this._access.rpcUser.value || this._access.rpcUser.value === 'ela')) {
            this._access.rpcUser.value = d.user;
        }
        // v0.5.246 — reflect the saved master-enable state + fill the monitor
        // URL host from the LAN URLs the creds endpoint already returns.
        if (this._access.enabled && typeof this._access.enabled.setValue === 'function') {
            this._access.enabled.setValue(!!d.enabled);
        }
        if (this._access.monitorNote) {
            var host = 'your node’s IP';
            if (Array.isArray(d.lanUrls) && d.lanUrls.length) {
                var hm = /^https?:\/\/([^:/]+)/.exec(String(d.lanUrls[0]));
                if (hm) { host = hm[1]; }
            }
            this._access.monitorNote.textContent =
                'Monitoring: when enabled, a read-only whole-node status feed — every chain & service, '
                + 'version, and active/sync — is served at http://' + host + ':20920/status, reachable from '
                + 'the Allowed IPs using the RPC user/password above. Point your fleet monitor there.';
        }
    };

    /** @private */
    SettingsTab.prototype._saveAdvanced = function () {
        var t = root.enmTOrFallback;
        var self = this;
        // Clear any stale aria-invalid hints from a previous failed save
        // (batch 30).
        this._advanced.memory.input.removeAttribute('aria-invalid');

        // Inline client-side validation parity with the joi schema, so
        // the operator sees the problem before the round-trip.
        var memMb = parseInt(this._advanced.memory.input.value, 10);
        if (!Number.isInteger(memMb) || memMb < 512 || memMb > 32768) {
            setStatus(this._advanced.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.err_memory_range') }));
            this._advanced.memory.input.setAttribute('aria-invalid', 'true');
            try { this._advanced.memory.input.focus({ preventScroll: true }); }
            catch (e) { this._advanced.memory.input.focus(); }
            return;
        }

        // beta.3.18 — Advanced now ONLY owns log/memory/archive. RPC
        // user/password/whitelist moved to the Access section + are
        // saved via _saveAccess (also PUT /config/mainchain; partial
        // body, backend merges).
        var body = {
            logLevel: this._advanced.logLevel.getValue(),
            archiveMode: this._advanced.archiveMode.getValue(),
            memoryLimitMb: memMb,
        };

        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(this._advanced.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(this._advanced.saveBtn, savingLabel, function () {
            return self.api.put('/config/mainchain', body)
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(self._advanced.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self.refresh('advanced');
                    self._promptRestartIfNeeded('advanced');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(self._advanced.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    /**
     * beta.3.18 — save Access section (RPC user / password / whitelist).
     * Same backend endpoint as _saveAdvanced (PUT /config/mainchain) but
     * carries a different subset of the body. Partial PUT is supported
     * by the backend route.
     * @private
     */
    SettingsTab.prototype._saveAccess = function () {
        var t = root.enmTOrFallback;
        var self = this;
        this._access.rpcUser.removeAttribute('aria-invalid');

        var rpcUser = this._access.rpcUser.value.trim();
        if (rpcUser.length === 0 || !/^[A-Za-z0-9]+$/.test(rpcUser)) {
            setStatus(this._access.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.err_rpc_user') }));
            this._access.rpcUser.setAttribute('aria-invalid', 'true');
            try { this._access.rpcUser.focus({ preventScroll: true }); }
            catch (e) { this._access.rpcUser.focus(); }
            return;
        }

        var body = {
            rpcUser: rpcUser,
            whiteIPList: this._access.whiteIp.getValue(),
        };
        // v0.5.246 — master enable. Without rpcEnabled the backend keeps RPC
        // loopback-only and the monitor endpoint never binds. Enabling requires
        // a password (backend precondition); the catch below surfaces that.
        if (this._access.enabled && typeof this._access.enabled.getValue === 'function') {
            body.rpcEnabled = this._access.enabled.getValue();
        }
        // RPC password is only sent if the operator typed something so
        // they can edit other Access knobs without re-typing it
        // (carried over from alpha.28 _saveAdvanced behavior).
        var pw = this._access.rpcPasswordField.input.value;
        if (pw && pw.length > 0) { body.rpcPassword = pw; }

        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(this._access.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(this._access.saveBtn, savingLabel, function () {
            return self.api.put('/config/mainchain', body)
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(self._access.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self._access.rpcPasswordField.input.value = '';
                    self.refresh('access');
                    self._promptRestartIfNeeded('access');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(self._access.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    // Beta 3 — phase-04 mock dropped the RPC reveal-only panel and the
    // Danger-Zone surface. The API methods stay below as dead code so a
    // future surface can wire them up without rediscovering the partial-
    // PUT shapes:
    //
    //   PUT /config/mainchain { rpcEnabled: bool }     ← master toggle
    //   PUT /config/mainchain { whiteIPList: string[] } ← partial whitelist
    //   GET /config/rpc/credentials/mainchain          ← URLs + creds
    //   DELETE /api/installed-apps/<name>?purge=true   ← danger-zone wipe
    //
    // The consolidated _saveAdvanced above PUTs every mainchain field in
    // one shot, so rpcEnabled + whiteIPList no longer need their own
    // dedicated save buttons; the data lives in the same /config/mainchain
    // body. _loadCreds above still hits the GET endpoint to hydrate the
    // whitelist chips.
    //
    // SettingsTab.prototype._saveRpcEnabled = function (enabled) {
    //     return this.api.put('/config/mainchain', { rpcEnabled: enabled });
    // };
    //
    // SettingsTab.prototype._saveWhitelist = function () {
    //     var list = this._adv.whiteIp.getValue();
    //     return this.api.put('/config/mainchain', { whiteIPList: list });
    // };
    //
    // SettingsTab.prototype._renderCredsPanel = function () {
    //     // Alpha.27 rendered .enm-rpc-creds-panel with URLs + creds +
    //     // RPC enable toggle. Beta 3 merges credentials into the Mainchain
    //     // Advanced section's form and drops the URL panel entirely.
    // };
    //
    // SettingsTab.prototype._doWipe = function () { /* see alpha.27 */ };
    // SettingsTab.prototype._handleWipeSuccess = function () { /* idem */ };
    // SettingsTab.prototype._handleWipeFailure = function () { /* idem */ };

    /**
     * beta.3.18 — POST a new anti-snipe password. Rebased onto
     * this._security.antiSnipeField from the Security section build.
     */
    SettingsTab.prototype._saveAntiSnipe = function () {
        var self = this;
        var t = root.enmTOrFallback;
        var s = this._security;
        var password = s.antiSnipeField.input.value;
        if (typeof password !== 'string' || password.length < 8) {
            s.antiSnipeStatus.textContent = t('settings.anti_snipe_min_length');
            s.antiSnipeStatus.classList.remove('ok');
            s.antiSnipeStatus.classList.add('err');
            try { s.antiSnipeField.input.focus({ preventScroll: true }); }
            catch (e) { s.antiSnipeField.input.focus(); }
            return;
        }
        s.antiSnipeStatus.textContent = t('common.saving') || 'Saving…';
        s.antiSnipeStatus.classList.remove('ok', 'err');
        return root.enmRunOnce(s.antiSnipeSaveBtn, t('common.saving') || 'Saving…', function () {
            return self.api.post('/config/anti-snipe-password', { password: password })
                .then(function () {
                    if (self._destroyed) { return; }
                    s.antiSnipeField.input.value = '';
                    s.antiSnipeStatus.textContent = t('settings.anti_snipe_saved');
                    s.antiSnipeStatus.classList.add('ok');
                    s.antiSnipeClearBtn.hidden = false;
                    s.antiSnipeField.input.placeholder = t('settings.anti_snipe_placeholder_set');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    s.antiSnipeStatus.textContent = (err && err.message) || 'Save failed.';
                    s.antiSnipeStatus.classList.add('err');
                });
        });
    };

    /** beta.3.18 — POST empty-string password to clear the hash. */
    SettingsTab.prototype._clearAntiSnipe = function () {
        var self = this;
        var t = root.enmTOrFallback;
        var s = this._security;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            if (!window.confirm(t('settings.anti_snipe_clear_confirm'))) {
                return;
            }
        }
        s.antiSnipeStatus.textContent = t('common.saving') || 'Saving…';
        s.antiSnipeStatus.classList.remove('ok', 'err');
        return root.enmRunOnce(s.antiSnipeClearBtn, t('common.saving') || 'Saving…', function () {
            return self.api.post('/config/anti-snipe-password', { password: '' })
                .then(function () {
                    if (self._destroyed) { return; }
                    s.antiSnipeStatus.textContent = t('settings.anti_snipe_cleared');
                    s.antiSnipeStatus.classList.add('ok');
                    s.antiSnipeClearBtn.hidden = true;
                    s.antiSnipeField.input.placeholder = t('settings.anti_snipe_placeholder_unset');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    s.antiSnipeStatus.textContent = (err && err.message) || 'Clear failed.';
                    s.antiSnipeStatus.classList.add('err');
                });
        });
    };

    /**
     * beta.3.18 — save Security section (autoExecuteSafe +
     * criticalRequiresAck). Anti-snipe is saved separately via
     * _saveAntiSnipe (its own button row, bypasses this section save).
     * Backend: PUT /config/general; same endpoint as Storage's save,
     * different subset.
     * @private
     */
    SettingsTab.prototype._saveSecurity = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var body = {
            autoExecuteSafe: this._security.autoSafe.getValue(),
            criticalRequiresAck: this._security.criticalAck.getValue(),
        };
        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(this._security.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(this._security.saveBtn, savingLabel, function () {
            return self.api.put('/config/general', body)
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(self._security.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self.refresh('security');
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(self._security.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    /**
     * beta.3.20 — save Storage section. Phase 3 expanded this from a
     * single audit-retention field to four operator-tunable policies
     * across two backend endpoints. We send both in parallel: audit
     * retention goes to PUT /config/general (where it's lived since
     * beta.3.18); the log-retention + keystore-backup policies go to
     * PUT /config/storage (new in 3.20). Both endpoints are owner-
     * gated, Joi-validated, idempotent. EnmStorageMaintenance picks
     * up the new values on its next 24h tick.
     * @private
     */
    SettingsTab.prototype._saveStorage = function () {
        var t = root.enmTOrFallback;
        var self = this;
        var s = this._storage;
        s.auditRetention.input.removeAttribute('aria-invalid');
        s.logGzip.input.removeAttribute('aria-invalid');
        s.logRetention.input.removeAttribute('aria-invalid');
        s.backupInterval.input.removeAttribute('aria-invalid');
        s.backupKeep.input.removeAttribute('aria-invalid');

        var retention   = parseInt(s.auditRetention.input.value, 10);
        var logGzip     = parseInt(s.logGzip.input.value, 10);
        var logRetention = parseInt(s.logRetention.input.value, 10);
        var bkInterval  = parseInt(s.backupInterval.input.value, 10);
        var bkKeep      = parseInt(s.backupKeep.input.value, 10);

        // Inline validation matching the backend Joi bounds.
        if (!Number.isInteger(retention) || retention < 0 || retention > 3650) {
            setStatus(s.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.err_retention') }));
            s.auditRetention.input.setAttribute('aria-invalid', 'true');
            try { s.auditRetention.input.focus({ preventScroll: true }); }
            catch (e) { s.auditRetention.input.focus(); }
            return;
        }
        if (!Number.isInteger(logGzip) || logGzip < 1 || logGzip > 365) {
            setStatus(s.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.storage_err_log_gzip') }));
            s.logGzip.input.setAttribute('aria-invalid', 'true');
            try { s.logGzip.input.focus({ preventScroll: true }); }
            catch (e) { s.logGzip.input.focus(); }
            return;
        }
        if (!Number.isInteger(logRetention) || logRetention < 1 || logRetention > 3650
            || logRetention <= logGzip) {
            setStatus(s.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.storage_err_log_retention') }));
            s.logRetention.input.setAttribute('aria-invalid', 'true');
            try { s.logRetention.input.focus({ preventScroll: true }); }
            catch (e) { s.logRetention.input.focus(); }
            return;
        }
        if (!Number.isInteger(bkInterval) || bkInterval < 1 || bkInterval > 90) {
            setStatus(s.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.storage_err_backup_interval') }));
            s.backupInterval.input.setAttribute('aria-invalid', 'true');
            try { s.backupInterval.input.focus({ preventScroll: true }); }
            catch (e) { s.backupInterval.input.focus(); }
            return;
        }
        if (!Number.isInteger(bkKeep) || bkKeep < 1 || bkKeep > 50) {
            setStatus(s.statusEl, 'error',
                t('settings.save_failed', { error: t('settings.storage_err_backup_keep') }));
            s.backupKeep.input.setAttribute('aria-invalid', 'true');
            try { s.backupKeep.input.focus({ preventScroll: true }); }
            catch (e) { s.backupKeep.input.focus(); }
            return;
        }

        var savingLabel = t('common.saving') || 'Saving…';
        setStatus(s.statusEl, '', t('common.loading') || 'Saving…');
        return root.enmRunOnce(s.saveBtn, savingLabel, function () {
            // Fire both PUTs in parallel. They write to different
            // config slots so they don't conflict; refresh + status
            // wait on Promise.all so the operator sees one success/
            // failure result.
            return Promise.all([
                self.api.put('/config/general', { auditRetentionDays: retention }),
                self.api.put('/config/storage', {
                    logGzipAfterDays: logGzip,
                    logRetentionDays: logRetention,
                    keystoreIntervalDays: bkInterval,
                    keystoreKeepCount: bkKeep,
                }),
            ])
                .then(function () {
                    if (self._destroyed) { return; }
                    setStatus(s.statusEl, 'success', '✓ ' + t('settings.saved'));
                    self.refresh('storage');
                    // Refresh disk usage so the operator sees updated
                    // backup status / usage right away.
                    self._refreshStorageUsage();
                })
                .catch(function (err) {
                    if (self._destroyed) { return; }
                    if (err && err.status === 401) { return; }
                    setStatus(s.statusEl, 'error',
                        t('settings.save_failed', { error: err.message || String(err) }));
                });
        });
    };

    // -----------------------------------------------------------------
    // Form fill / hydration
    // -----------------------------------------------------------------
    /**
     * beta.3.18 — _fillForm rebased onto 5 sections. Each section's
     * save handler re-hydrates only its own fields after a successful
     * PUT so pending edits in other sections aren't wiped.
     *
     * @private
     * @param {string} [scope]  one of SECTION_KEYS or undefined (= all)
     */
    SettingsTab.prototype._fillForm = function (scope) {
        var cfg = this._cfg;
        if (!cfg) { return; }
        if (!scope || scope === 'access')   { this._fillAccess(cfg); }
        if (!scope || scope === 'security') { this._fillSecurity(cfg); }
        if (!scope || scope === 'network')  { this._fillNetwork(cfg); }
        if (!scope || scope === 'alerts')   { this._fillAlerts(cfg); }
        if (!scope || scope === 'storage')  { this._fillStorage(cfg); }
        if (!scope || scope === 'advanced') { this._fillAdvanced(cfg); }
    };

    /** @private */
    SettingsTab.prototype._fillNetwork = function (cfg) {
        var chain = cfg && cfg.chains && cfg.chains.mainchain;
        if (!chain || !this._network || !this._network.seg) { return; }
        var mode = (chain.dpos && chain.dpos.ipAddressMode === 'manual')
            ? 'manual' : 'auto';
        this._network.seg.setValue(mode);
        this._onNetworkModeChange(mode);
        this._network.manualInput.value =
            (chain.dpos && chain.dpos.ipAddressManual) || '';
    };

    /** beta.3.18 — only fills log/memory/archive now. */
    SettingsTab.prototype._fillAdvanced = function (cfg) {
        var chain = cfg && cfg.chains && cfg.chains.mainchain;
        if (!chain || !this._advanced) { return; }
        this._advanced.logLevel.setValue(chain.logLevel || 'info');
        this._advanced.archiveMode.setValue(!!chain.archiveMode);
        this._advanced.memory.input.value = String(chain.memoryLimitMb || 4096);
    };

    /** beta.3.18 — Access section (RPC user / password / whitelist). */
    SettingsTab.prototype._fillAccess = function (cfg) {
        var chain = cfg && cfg.chains && cfg.chains.mainchain;
        if (!chain || !this._access) { return; }
        this._access.rpcUser.value = (chain.rpc && chain.rpc.user) || 'ela';
        this._access.rpcPasswordField.input.value = '';
        this._access.rpcPasswordField.input.placeholder =
            (chain.rpc && chain.rpc.passwordSet)
                ? (root.enmTOrFallback('settings.rpc_password_placeholder_set') || '(leave blank to keep current)')
                : 'set a password';
        // Whitelist chips are populated by _loadCreds (separate endpoint
        // returns the actual list); _fillAccess doesn't need to touch
        // them. Same shape as alpha.28's flow.
    };

    /** beta.3.18 — Security section (anti-snipe + healing + ack). */
    SettingsTab.prototype._fillSecurity = function (cfg) {
        if (!this._security) { return; }
        var t = root.enmTOrFallback;
        var g = (cfg && cfg.global) || {};
        this._security.autoSafe.setValue(
            !(g.healing && g.healing.autoExecuteSafe === false));
        this._security.criticalAck.setValue(
            !(g.notifications && g.notifications.criticalRequiresAck === false));
        if (this._security.antiSnipeField) {
            this._security.antiSnipeField.input.value = '';
            if (g.antiSnipePasswordSet) {
                this._security.antiSnipeClearBtn.hidden = false;
                this._security.antiSnipeField.input.placeholder = t('settings.anti_snipe_placeholder_set');
            } else {
                this._security.antiSnipeClearBtn.hidden = true;
                this._security.antiSnipeField.input.placeholder = t('settings.anti_snipe_placeholder_unset');
            }
            if (this._security.antiSnipeStatus) {
                this._security.antiSnipeStatus.textContent = '';
                this._security.antiSnipeStatus.classList.remove('ok', 'err');
            }
        }
    };

    /**
     * beta.3.20 — Storage section (Phase 3 expansion). Hydrates the
     * audit-retention input from cfg.global.audit and the new log /
     * keystore-backup inputs from cfg.global.{logRotation,backup}.
     * Disk-usage + last-backup line are populated separately by
     * _refreshStorageUsage which hits GET /system/storage.
     */
    SettingsTab.prototype._fillStorage = function (cfg) {
        if (!this._storage) { return; }
        var g = (cfg && cfg.global) || {};
        this._storage.auditRetention.input.value =
            String((g.audit && g.audit.retentionDays) || 365);
        var lr = g.logRotation || {};
        this._storage.logGzip.input.value =
            String(Number.isFinite(lr.gzipAfterDays) ? lr.gzipAfterDays : 7);
        this._storage.logRetention.input.value =
            String(Number.isFinite(lr.purgeAfterDays) ? lr.purgeAfterDays : 30);
        var b = g.backup || {};
        this._storage.backupInterval.input.value =
            String(Number.isFinite(b.keystoreIntervalDays) ? b.keystoreIntervalDays : 7);
        this._storage.backupKeep.input.value =
            String(Number.isFinite(b.keystoreKeepCount) ? b.keystoreKeepCount : 4);
    };

    /**
     * beta.3.19 — Alerts section (Phase 2). Hydrates from
     * cfg.global.notifications.thresholds with the same defaults the
     * backend HealthRules module ships with so the form never shows
     * empty inputs on first paint.
     * @private
     */
    SettingsTab.prototype._fillAlerts = function (cfg) {
        if (!this._alerts) { return; }
        var t = (cfg && cfg.global
            && cfg.global.notifications
            && cfg.global.notifications.thresholds) || {};
        this._alerts.diskWarn.input.value =
            String(Number.isFinite(t.diskFreeWarnGb) ? t.diskFreeWarnGb : 20);
        this._alerts.diskCritical.input.value =
            String(Number.isFinite(t.diskFreeCriticalGb) ? t.diskFreeCriticalGb : 5);
        this._alerts.peerGrace.input.value =
            String(Number.isFinite(t.peerZeroGraceMin) ? t.peerZeroGraceMin : 5);
        this._alerts.syncGrace.input.value =
            String(Number.isFinite(t.syncStallGraceMin) ? t.syncStallGraceMin : 10);
    };

    // -----------------------------------------------------------------
    // beta.3.18 — Restart modal helper.
    //
    // Operator option (3): lifecycle stays on the Dashboard, but when
    // a Settings save needs a chain restart to take effect, surface a
    // modal here so the operator can restart in one click instead of
    // hunting for the power circle. Reuses the phase-06 modal-card
    // chrome (.enm-modal-scrim + .enm-modal-card) shared with the
    // proposal card and tools-update modal.
    // -----------------------------------------------------------------
    /**
     * Fire the restart prompt after a successful save. Caller passes
     * the section key so the modal can name what changed in the body.
     * If the chain isn't currently running, we show a different
     * message (nothing to restart — changes apply on next start).
     *
     * @private
     * @param {string} sectionKey
     */
    SettingsTab.prototype._promptRestartIfNeeded = function (sectionKey) {
        var self = this;
        var t = root.enmTOrFallback;

        // Tear down any prior restart modal still open. The Settings
        // tab can fire two saves back-to-back; we only want one active.
        if (typeof this._restartModalClose === 'function') {
            try { this._restartModalClose(); } catch (e) { /* no-op */ }
            this._restartModalClose = null;
        }

        // Probe chain state via the same /chains/mainchain endpoint
        // the dashboard uses. Best-effort: if the probe fails we still
        // open the modal but with the generic body, since the change
        // is saved and the operator's intent (restart) is clear.
        this.api.get('/chains/mainchain', { skipCache: true })
            .then(function (envelope) {
                if (self._destroyed) { return; }
                // v0.5.249 — api.get() already unwraps the `{success,result}`
                // envelope and returns `result` directly, so the chain object
                // is `envelope` itself — `envelope.data` was always undefined,
                // making `alive` false for EVERY chain and showing the
                // "chain isn't running, nothing to restart" copy even while the
                // mainchain was up. Use the same defensive unwrap every other
                // caller in this file uses.
                var state = (envelope && envelope.result)
                    || (envelope && envelope.data)
                    || envelope || {};
                // Coarse states that mean "process alive". Anything
                // else means "nothing to restart".
                // v0.5.210 — accept 'synced' as alive too (v0.5.203 unified
                // the backend state vocab; 'healthy' became 'synced'). Without
                // this, the Restart modal computed alive=false for every
                // alive-and-synced chain → wrong "currently stopped, will
                // just start" copy instead of "currently running, will be
                // stopped + started" warning.
                var alive = !!(state && (
                    state.state === 'healthy'
                    || state.state === 'synced'
                    || state.state === 'syncing'
                    || state.state === 'starting'
                    || state.state === 'recovering'
                    || state.state === 'stalled'
                    || (state.pid && state.attached !== false)
                ));
                self._openRestartModal(alive);
            })
            .catch(function () {
                if (self._destroyed) { return; }
                // Assume alive on probe failure so the operator still
                // gets the Restart-now button. Worst case: backend
                // returns "chain not running" on /restart and the
                // modal's status line surfaces that.
                self._openRestartModal(true);
            });
    };

    /** @private — actually mount the modal DOM. */
    SettingsTab.prototype._openRestartModal = function (chainAlive) {
        var self = this;
        var t = root.enmTOrFallback;

        var modalRoot = document.createElement('div');
        modalRoot.className = 'enm-restart-modal-root';

        var scrim = document.createElement('div');
        scrim.className = 'enm-modal-scrim';
        modalRoot.appendChild(scrim);

        var card = document.createElement('div');
        card.className = 'enm-modal-card enm-restart-modal-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-labelledby', 'enm-restart-mod-h');
        card.setAttribute('aria-modal', 'true');

        var heading = document.createElement('h2');
        heading.id = 'enm-restart-mod-h';
        heading.className = 'enm-modal-heading';
        heading.textContent = t('settings.restart_modal_title');
        card.appendChild(heading);

        var summary = document.createElement('p');
        summary.className = 'enm-modal-summary';
        summary.textContent = chainAlive
            ? t('settings.restart_modal_body')
            : t('settings.restart_modal_chain_stopped');
        card.appendChild(summary);

        var statusLine = document.createElement('p');
        statusLine.className = 'enm-restart-modal-status';
        statusLine.setAttribute('role', 'status');
        statusLine.setAttribute('aria-live', 'polite');
        card.appendChild(statusLine);

        var actions = document.createElement('div');
        actions.className = 'enm-modal-actions';
        var laterBtn = document.createElement('button');
        laterBtn.type = 'button';
        laterBtn.className = 'enm-btn';
        laterBtn.textContent = t('settings.restart_modal_later');
        var nowBtn = document.createElement('button');
        nowBtn.type = 'button';
        nowBtn.className = 'enm-btn enm-btn-primary';
        nowBtn.textContent = t('settings.restart_modal_now');
        // When the chain isn't alive there's nothing to restart;
        // disable the primary action + lean on the secondary as
        // the dismiss button.
        if (!chainAlive) {
            nowBtn.disabled = true;
            laterBtn.textContent = t('common.close') || 'Close';
        }
        actions.appendChild(laterBtn);
        actions.appendChild(nowBtn);
        card.appendChild(actions);

        modalRoot.appendChild(card);
        document.body.appendChild(modalRoot);

        // Focus management — capture the return target + simple
        // focus trap on Tab.
        var previousFocus = document.activeElement;
        var modalClosed = false;
        var close = function () {
            if (modalClosed) { return; }
            modalClosed = true;
            if (modalRoot.parentNode) { modalRoot.parentNode.removeChild(modalRoot); }
            document.removeEventListener('keydown', onEsc);
            document.removeEventListener('keydown', trap, true);
            scrim.removeEventListener('click', onScrim);
            try {
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    previousFocus.focus({ preventScroll: true });
                }
            } catch (e) { /* focus may fail on detached elements */ }
            if (self) { self._restartModalClose = null; }
        };
        var onEsc = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onEsc);
        var onScrim = function (ev) { if (ev.target === scrim) close(); };
        scrim.addEventListener('click', onScrim);
        var trap = function (ev) {
            if (ev.key !== 'Tab') { return; }
            var focusables = card.querySelectorAll('button:not([disabled])');
            if (!focusables.length) { return; }
            var first = focusables[0];
            var last  = focusables[focusables.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', trap, true);

        laterBtn.addEventListener('click', close);
        nowBtn.addEventListener('click', function () {
            statusLine.textContent = t('settings.restart_modal_restarting');
            nowBtn.disabled = true;
            laterBtn.disabled = true;
            self.api.post('/chains/mainchain/restart')
                .then(function () {
                    if (modalClosed) { return; }
                    statusLine.textContent = t('settings.restart_modal_done');
                    // Auto-close after a brief read pause so the
                    // operator sees the confirmation before the
                    // modal disappears.
                    setTimeout(close, 1200);
                })
                .catch(function (err) {
                    if (modalClosed) { return; }
                    nowBtn.disabled = false;
                    laterBtn.disabled = false;
                    if (err && err.status === 401) {
                        statusLine.textContent = '';
                        return;
                    }
                    statusLine.textContent = t('settings.restart_modal_failed',
                        { error: (err && err.message) || String(err) });
                });
        });

        // Initial focus on the primary action so the operator can
        // hit Enter to restart immediately.
        try { (chainAlive ? nowBtn : laterBtn).focus({ preventScroll: true }); }
        catch (e) { (chainAlive ? nowBtn : laterBtn).focus(); }

        this._restartModalClose = close;
    };

    // -----------------------------------------------------------------
    // Builders for the form primitives. Each returns a small handle the
    // SettingsTab can talk to (.el for the DOM node, .getValue / .setValue
    // / .input as needed). The DOM emitted matches the phase-04 mock 1:1.
    // -----------------------------------------------------------------

    /**
     * makeSection({ id, icon, title, help, helpCodes?, helpSuffix?, tag? })
     * → { card, body, statusEl, saveBtn, revertBtn }
     *
     * Emits the canonical .enm-section-card three-part structure
     * (head / body / foot) and returns refs the caller can wire into.
     */
    function makeSection(opts) {
        var card = document.createElement('div');
        card.className = 'enm-section-card';

        // --- head ---
        var head = document.createElement('div');
        head.className = 'enm-section-card-head';
        var icon = document.createElement('div');
        icon.className = 'enm-section-card-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = opts.icon || '';
        head.appendChild(icon);

        var headbody = document.createElement('div');
        headbody.className = 'enm-section-card-headbody';
        var title = document.createElement('div');
        title.className = 'enm-section-card-title';
        title.id = 'enm-section-h-' + opts.id;
        title.textContent = opts.title || '';
        headbody.appendChild(title);
        if (opts.help) {
            var help = document.createElement('div');
            help.className = 'enm-section-card-help';
            renderHelp(help, opts.help, opts.helpCodes, opts.helpSuffix);
            headbody.appendChild(help);
        }
        head.appendChild(headbody);

        // 0.2.0-beta.3.8 — section tag now has two paint states. By
        // default it shows the static intent ("Restart required" /
        // "No restart needed"); when the section's body has unsaved
        // changes, the tag flips to a warning "Unsaved changes"
        // chip. setDirty(true|false) is exposed on the returned
        // section handle so each section's body-change listener can
        // toggle.
        var tag = null;
        if (opts.tag) {
            tag = document.createElement('div');
            tag.className = 'enm-section-card-tag ' + (opts.tag.kind || 'muted');
            tag.textContent = opts.tag.label;
            head.appendChild(tag);
        }
        card.appendChild(head);

        // --- body ---
        var body = document.createElement('div');
        body.className = 'enm-section-card-body';
        card.appendChild(body);

        // --- foot ---
        var foot = document.createElement('div');
        foot.className = 'enm-section-card-foot';
        var statusEl = document.createElement('div');
        statusEl.className = 'enm-section-card-foot-status';
        statusEl.setAttribute('role', 'status');
        statusEl.setAttribute('aria-live', 'polite');
        foot.appendChild(statusEl);

        var revertBtn = document.createElement('button');
        revertBtn.type = 'button';
        revertBtn.className = 'enm-btn';
        // beta.3.18 — Revert label routed through i18n (settings audit
        // flagged this as one of ~15 inline-English strings).
        var tFn = root.enmTOrFallback;
        revertBtn.textContent = (typeof tFn === 'function'
            && tFn('settings.revert_btn')) || 'Revert';
        foot.appendChild(revertBtn);

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'enm-btn enm-btn-primary';
        // 0.2.0-beta.3.6 — phase-04 mock spec is section-specific labels
        // ("Save Network" / "Save Advanced" / "Save General") rather
        // than a generic "Save" so operators can re-confirm what scope
        // they're committing to before clicking. Caller passes opts.id
        // already; capitalise it for display.
        var saveLabel = 'Save';
        if (opts.id === 'network')        { saveLabel = 'Save Network'; }
        else if (opts.id === 'advanced')  { saveLabel = 'Save Advanced'; }
        else if (opts.id === 'access')    { saveLabel = 'Save Access'; }
        else if (opts.id === 'security')  { saveLabel = 'Save Security'; }
        else if (opts.id === 'alerts')    { saveLabel = 'Save Alerts'; }
        else if (opts.id === 'storage')   { saveLabel = 'Save Storage'; }
        else if (opts.id === 'general')   { saveLabel = 'Save General'; }
        saveBtn.textContent = saveLabel;
        foot.appendChild(saveBtn);

        card.appendChild(foot);

        // 0.2.0-beta.3.8 — setDirty wires the dynamic Restart-tag.
        // When dirty: tag swaps to "Unsaved changes" in warning palette.
        // When clean: tag restores its construction-time label + kind.
        function setDirty(isDirty) {
            if (!tag) { return; }
            if (isDirty) {
                tag.className = 'enm-section-card-tag warn';
                tag.textContent = 'Unsaved changes';
            } else if (opts.tag) {
                tag.className = 'enm-section-card-tag ' + (opts.tag.kind || 'muted');
                tag.textContent = opts.tag.label;
            }
        }
        return { card: card, body: body, statusEl: statusEl, saveBtn: saveBtn, revertBtn: revertBtn, setDirty: setDirty };
    }

    /**
     * makeInfoCard({ title, help?, helpCodes?, helpSuffix?, codeLine? })
     * → { card, body }
     *
     * v0.5.187 (Council Node UX Phase 4) — a foot-less .enm-section-card for
     * read-only / action sections (no Save/Revert button). Same head/body
     * chrome as makeSection so the Class B/C/D/E settings cards match the
     * Class-A reference. Callers append their own controls (restart button,
     * peers mount, etc.) to .body; codeLine renders a monospace path line.
     */
    function makeInfoCard(opts) {
        opts = opts || {};
        var card = document.createElement('div');
        card.className = 'enm-section-card';

        var head = document.createElement('div');
        head.className = 'enm-section-card-head';
        var headbody = document.createElement('div');
        headbody.className = 'enm-section-card-headbody';
        var title = document.createElement('div');
        title.className = 'enm-section-card-title';
        title.textContent = opts.title || '';
        headbody.appendChild(title);
        if (opts.help) {
            var help = document.createElement('div');
            help.className = 'enm-section-card-help';
            renderHelp(help, opts.help, opts.helpCodes, opts.helpSuffix);
            headbody.appendChild(help);
        }
        head.appendChild(headbody);
        card.appendChild(head);

        var body = document.createElement('div');
        body.className = 'enm-section-card-body';
        if (opts.codeLine) {
            var code = document.createElement('code');
            code.className = 'enm-detail-addr';
            code.textContent = opts.codeLine;
            body.appendChild(code);
        }
        card.appendChild(body);
        return { card: card, body: body };
    }

    /**
     * makeFormRow({ label, help?, helpCodes?, helpSuffix?, control, disabled? })
     * → HTMLElement
     */
    function makeFormRow(opts) {
        var row = document.createElement('div');
        row.className = 'enm-form-row';
        if (opts.disabled) { row.setAttribute('data-disabled', 'true'); }

        var lblBlock = document.createElement('div');
        lblBlock.className = 'enm-form-label-block';
        var lbl = document.createElement('div');
        lbl.className = 'enm-form-label';
        lbl.textContent = opts.label || '';
        lblBlock.appendChild(lbl);
        if (opts.help || opts.helpCodes) {
            var help = document.createElement('div');
            help.className = 'enm-form-label-help';
            renderHelp(help, opts.help || '', opts.helpCodes, opts.helpSuffix);
            lblBlock.appendChild(help);
        }
        row.appendChild(lblBlock);

        var control = document.createElement('div');
        control.className = 'enm-form-control';
        if (opts.control) { control.appendChild(opts.control); }
        row.appendChild(control);
        return row;
    }

    /**
     * makeSeg({ options: [{value,label}], value, onChange })
     * → { el, getValue, setValue }
     */
    function makeSeg(opts) {
        var el = document.createElement('div');
        el.className = 'enm-seg';
        el.setAttribute('role', 'radiogroup');
        var current = opts.value || (opts.options[0] && opts.options[0].value);
        var optEls = {};

        opts.options.forEach(function (o) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'enm-seg-opt';
            btn.dataset.value = o.value;
            btn.setAttribute('role', 'radio');
            btn.textContent = o.label;
            btn.addEventListener('click', function () { setValue(o.value); });
            el.appendChild(btn);
            optEls[o.value] = btn;
        });

        // 0.2.0-beta.3.4 hotfix — split paint() (visual only) from
        // setValue() (paint + fire onChange). The initial-state setup
        // must NOT fire onChange because the caller's onChange handler
        // may reference DOM nodes (e.g. _network.manualRow) that aren't
        // built yet during the segmented control's own construction.
        // Pre-fix: SettingsTab constructor threw inside _onNetworkMode
        // Change('auto') trying to setAttribute on an undefined
        // manualRow, killing the whole tab render. Pattern now matches
        // makeToggle / makeSelectWrap which also paint without firing.
        function paint(v) {
            if (!optEls[v]) { return; }
            current = v;
            Object.keys(optEls).forEach(function (k) {
                var active = (k === v);
                optEls[k].classList.toggle('active', active);
                optEls[k].setAttribute('aria-checked', active ? 'true' : 'false');
            });
        }
        function setValue(v) {
            if (!optEls[v]) { return; }
            paint(v);
            if (typeof opts.onChange === 'function') { opts.onChange(current); }
        }
        paint(current);

        return {
            el: el,
            getValue: function () { return current; },
            setValue: function (v) { setValue(v); },
        };
    }

    /**
     * makeToggle({ initial, onChange })
     * → { el, getValue, setValue }
     */
    function makeToggle(opts) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'enm-toggle';
        el.setAttribute('role', 'switch');
        var track = document.createElement('div');
        track.className = 'enm-toggle-track';
        var thumb = document.createElement('div');
        thumb.className = 'enm-toggle-thumb';
        el.appendChild(track);
        el.appendChild(thumb);

        var on = !!opts.initial;
        function paint() {
            el.setAttribute('data-on', on ? 'true' : 'false');
            el.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        el.addEventListener('click', function () {
            on = !on;
            paint();
            if (typeof opts.onChange === 'function') { opts.onChange(on); }
        });
        paint();

        return {
            el: el,
            getValue: function () { return on; },
            setValue: function (v) { on = !!v; paint(); },
        };
    }

    /**
     * makeToggleRow({ initial, title?, sub?, getLabel?(on)→{title,sub}, onChange })
     * → { el, getValue, setValue }
     *
     * Wraps a makeToggle with adjacent .enm-toggle-row-text title+sub.
     * getLabel lets the row's text track the toggle state (e.g. Off /
     * pruning vs On / archive).
     */
    function makeToggleRow(opts) {
        var row = document.createElement('div');
        row.className = 'enm-toggle-row';

        var textWrap = document.createElement('div');
        textWrap.className = 'enm-toggle-row-text';
        var titleEl = document.createElement('div');
        titleEl.className = 'enm-toggle-row-text-title';
        var subEl = document.createElement('div');
        subEl.className = 'enm-toggle-row-text-sub';
        textWrap.appendChild(titleEl);
        textWrap.appendChild(subEl);

        var toggle = makeToggle({
            initial: !!opts.initial,
            onChange: function (on) {
                paintText(on);
                if (typeof opts.onChange === 'function') { opts.onChange(on); }
            },
        });

        function paintText(on) {
            if (typeof opts.getLabel === 'function') {
                var l = opts.getLabel(on) || {};
                titleEl.textContent = l.title || '';
                subEl.textContent = l.sub || '';
            } else {
                titleEl.textContent = opts.title || '';
                subEl.textContent = opts.sub || '';
            }
        }
        paintText(!!opts.initial);

        // Phase-04 mock places toggle BEFORE the text block. Match.
        row.appendChild(toggle.el);
        row.appendChild(textWrap);

        return {
            el: row,
            getValue: function () { return toggle.getValue(); },
            setValue: function (v) { toggle.setValue(v); paintText(!!v); },
        };
    }

    /**
     * makeInput({ type?, value?, placeholder?, mono?, ariaLabel?, describedById? })
     * → HTMLInputElement
     */
    function makeInput(opts) {
        var i = document.createElement('input');
        i.type = opts.type || 'text';
        i.className = opts.mono ? 'enm-input mono' : 'enm-input';
        if (opts.value != null) { i.value = String(opts.value); }
        if (opts.placeholder) { i.placeholder = opts.placeholder; }
        if (opts.min != null) { i.min = String(opts.min); }
        if (opts.max != null) { i.max = String(opts.max); }
        if (opts.step != null) { i.step = String(opts.step); }
        if (opts.ariaLabel) { i.setAttribute('aria-label', opts.ariaLabel); }
        if (opts.describedById) { i.setAttribute('aria-describedby', opts.describedById); }
        if (opts.type === 'number') {
            i.setAttribute('inputmode', 'numeric');
            if (opts.min != null && opts.max != null) {
                i.title = 'Between ' + opts.min + ' and ' + opts.max;
            }
        }
        return i;
    }

    /**
     * makeInputSuffix({ ...inputOpts, suffix })
     * → { el, input }
     */
    function makeInputSuffix(opts) {
        var wrap = document.createElement('div');
        wrap.className = 'enm-input-wrap';
        var input = makeInput(opts);
        wrap.appendChild(input);
        var sfx = document.createElement('span');
        sfx.className = 'enm-input-suffix';
        sfx.setAttribute('aria-hidden', 'true');
        sfx.textContent = opts.suffix || '';
        wrap.appendChild(sfx);
        return { el: wrap, input: input };
    }

    /**
     * makeSelectWrap({ options: [{value,label}], value, onChange? })
     * → { el, getValue, setValue }
     */
    function makeSelectWrap(opts) {
        var wrap = document.createElement('div');
        wrap.className = 'enm-select-wrap';
        var sel = document.createElement('select');
        sel.className = 'enm-select';
        opts.options.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            sel.appendChild(opt);
        });
        if (opts.value != null) { sel.value = String(opts.value); }
        if (typeof opts.onChange === 'function') {
            sel.addEventListener('change', function () { opts.onChange(sel.value); });
        }
        wrap.appendChild(sel);
        var chev = document.createElement('span');
        chev.className = 'enm-select-chev';
        chev.setAttribute('aria-hidden', 'true');
        chev.textContent = '▾'; // ▾
        wrap.appendChild(chev);
        return {
            el: wrap,
            getValue: function () { return sel.value; },
            setValue: function (v) { sel.value = String(v); },
        };
    }

    /**
     * makeSecretField({ value?, placeholder?, ariaLabel? })
     * → { el, input, getValue, setValue }
     *
     * Password input + eye-toggle that flips type password↔text. Operator
     * is already authenticated as owner, so the toggle is a shoulder-
     * surfing mitigation, not a security gate.
     */
    function makeSecretField(opts) {
        var wrap = document.createElement('div');
        wrap.className = 'enm-secret-field';
        var input = makeInput({
            type: 'password',
            value: opts.value || '',
            placeholder: opts.placeholder || '',
            mono: true,
            ariaLabel: opts.ariaLabel || 'Password',
        });
        input.setAttribute('autocomplete', 'new-password');
        input.setAttribute('spellcheck', 'false');
        wrap.appendChild(input);

        var eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'enm-btn enm-btn-icon';
        eye.setAttribute('aria-label', 'Show password');
        eye.setAttribute('aria-pressed', 'false');
        eye.textContent = '\u{1F441}'; // 👁
        eye.addEventListener('click', function () {
            var shown = input.type === 'text';
            input.type = shown ? 'password' : 'text';
            eye.setAttribute('aria-pressed', shown ? 'false' : 'true');
            eye.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
        });
        wrap.appendChild(eye);

        return {
            el: wrap,
            input: input,
            getValue: function () { return input.value; },
            setValue: function (v) { input.value = v == null ? '' : String(v); },
        };
    }

    /**
     * makeChipInput({ locked, placeholder?, ariaLabel? })
     * → { el, getValue, setValue }
     *
     * Reuses the alpha.27 chipInput behaviour (locked entries, IP/CIDR
     * validation, dedupe, CJK IME guard, multi-value paste) but emits
     * the mock's class names: .enm-chip-input, .enm-chip,
     * .enm-chip[data-locked="true"], .enm-chip-lock, .enm-chip-remove,
     * .enm-chip-input-input.
     */
    function makeChipInput(opts) {
        opts = opts || {};
        var lockedValues = Array.isArray(opts.locked) ? opts.locked.slice() : [];

        var el = document.createElement('div');
        el.className = 'enm-chip-input';

        var newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.className = 'enm-chip-input-input';
        newInput.placeholder = opts.placeholder || '';
        newInput.setAttribute('aria-label', opts.ariaLabel || 'Add value');
        newInput.setAttribute('autocomplete', 'off');
        newInput.setAttribute('autocapitalize', 'off');
        newInput.setAttribute('autocorrect', 'off');
        newInput.spellcheck = false;

        var values = [];
        // BP-E audit fix — track the flash-invalid border-reset timer on
        // a closure-local variable so the returned destroy() can clear it.
        // makeChipInput is a free function, not a method, so it has no
        // access to a parent `self`; the SettingsTab calls our destroy()
        // during its own destroy() flow.
        var flashTimer = null;
        var destroyed = false;

        function isLocked(v) { return lockedValues.indexOf(v) !== -1; }

        function render() {
            // Tear down existing chips, keep newInput.
            var chips = el.querySelectorAll('.enm-chip');
            for (var i = 0; i < chips.length; i += 1) { el.removeChild(chips[i]); }
            // Insert chips before newInput in order.
            values.forEach(function (v, idx) {
                var chip = document.createElement('span');
                chip.className = 'enm-chip';
                var locked = isLocked(v);
                if (locked) { chip.setAttribute('data-locked', 'true'); }
                if (locked) {
                    var lock = document.createElement('span');
                    lock.className = 'enm-chip-lock';
                    lock.setAttribute('aria-label', 'locked');
                    lock.textContent = '\u{1F512}'; // 🔒
                    chip.appendChild(lock);
                }
                chip.appendChild(document.createTextNode(v));
                if (!locked) {
                    var rm = document.createElement('button');
                    rm.type = 'button';
                    rm.className = 'enm-chip-remove';
                    rm.setAttribute('aria-label', 'Remove ' + v);
                    rm.textContent = '×'; // ×
                    rm.addEventListener('click', function () {
                        values.splice(idx, 1);
                        render();
                    });
                    chip.appendChild(rm);
                }
                if (locked) {
                    chip.title = 'Locked — needed for ENM’s own RPC calls.';
                }
                el.insertBefore(chip, newInput);
            });
        }

        function flashInvalid(reason) {
            // BP-E audit fix — guard against destroy() racing the 900ms
            // border-reset timer. The chip-input lives inside the settings
            // pane; if the operator clicks Save or navigates away while a
            // flash is in flight, the old timer would mutate the input's
            // style after it's been detached. Stash the id on a closure-
            // local so destroy() (added below) can clear it.
            if (destroyed) { return; }
            var prev = newInput.style.borderColor;
            newInput.style.borderColor = 'var(--error, #ef5060)';
            if (flashTimer) { clearTimeout(flashTimer); }
            flashTimer = setTimeout(function () {
                flashTimer = null;
                if (destroyed) { return; }
                newInput.style.borderColor = prev;
            }, 900);
            newInput.setAttribute('aria-invalid', 'true');
            var hint = reason
                || (root.enmTOrFallback
                    ? root.enmTOrFallback('settings.rpc_white_invalid')
                    : 'Not a valid IPv4 or CIDR.');
            newInput.title = hint;
            var clearOnce = function () {
                newInput.removeAttribute('aria-invalid');
                newInput.removeEventListener('input', clearOnce);
            };
            newInput.addEventListener('input', clearOnce);
        }

        function tryAdd() {
            var candidate = (newInput.value || '').trim();
            if (!candidate) { return; }
            if (!IP_OR_CIDR_RE.test(candidate)) { flashInvalid(); return; }
            if (values.indexOf(candidate) !== -1) {
                newInput.value = '';
                return;
            }
            values.push(candidate);
            newInput.value = '';
            render();
        }

        function ensureLockedPresent() {
            for (var i = lockedValues.length - 1; i >= 0; i--) {
                if (values.indexOf(lockedValues[i]) === -1) {
                    values.unshift(lockedValues[i]);
                }
            }
        }

        newInput.addEventListener('keydown', function (e) {
            // CJK IME guard (batch 18).
            if (e.isComposing || e.keyCode === 229) { return; }
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                tryAdd();
            }
        });

        // Multi-value paste (batch 18).
        newInput.addEventListener('paste', function (e) {
            var cb = e.clipboardData || (typeof root !== 'undefined' ? root.clipboardData : null);
            if (!cb || typeof cb.getData !== 'function') { return; }
            var text = cb.getData('text');
            if (!text || !/[,\s\n\t]/.test(text)) { return; }
            e.preventDefault();
            var parts = text.split(/[,\s\n\t]+/);
            for (var i = 0; i < parts.length; i += 1) {
                var v = parts[i].trim();
                if (!v) { continue; }
                newInput.value = v;
                tryAdd();
            }
        });

        el.appendChild(newInput);
        ensureLockedPresent();
        render();

        return {
            el: el,
            getValue: function () { return values.slice(); },
            setValue: function (arr) {
                values = Array.isArray(arr) ? arr.filter(function (s) {
                    return typeof s === 'string' && s.length > 0;
                }) : [];
                ensureLockedPresent();
                render();
            },
            // BP-E audit fix — parent SettingsTab.destroy() calls this
            // during its own teardown so an in-flight flashInvalid timer
            // can't mutate a detached input's style after the pane is
            // unmounted.
            destroy: function () {
                destroyed = true;
                if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
            },
        };
    }

    // -----------------------------------------------------------------
    // Misc helpers
    // -----------------------------------------------------------------

    /**
     * Set the foot status text + a state class ('success' | 'warn' |
     * 'error' | ''). Toggles role between status (info/success) and
     * alert (error) so AT announces errors with higher priority.
     */
    // beta.3.20 — helpers used by the Storage section's disk-usage
    // panel + last-backup status line.
    function fmtMb(mb) {
        if (!Number.isFinite(mb) || mb <= 0) { return '0 MB'; }
        if (mb >= 1024) { return (mb / 1024).toFixed(2) + ' GB'; }
        if (mb >= 10)   { return Math.round(mb) + ' MB'; }
        return mb.toFixed(1) + ' MB';
    }
    function relativeTime(epochMs) {
        if (!Number.isFinite(epochMs) || epochMs <= 0) { return '—'; }
        var t = root.enmTOrFallback;
        var deltaMs = Date.now() - epochMs;
        if (deltaMs < 0) { deltaMs = 0; }
        if (deltaMs < 60_000) { return t('settings.storage_relative_just_now') || 'just now'; }
        if (deltaMs < 3_600_000) {
            var min = Math.floor(deltaMs / 60_000);
            return t('settings.storage_relative_minutes', { n: min });
        }
        if (deltaMs < 86_400_000) {
            var h = Math.floor(deltaMs / 3_600_000);
            return t('settings.storage_relative_hours', { n: h });
        }
        var d = Math.floor(deltaMs / 86_400_000);
        return t('settings.storage_relative_days', { n: d });
    }
    // beta.3.21 — coerce mixed ISO/epoch values to epoch-ms. Backend
    // serializes proposed_at / executed_at / etc. as either ISO strings
    // (newer rows) or epoch-ms numbers (legacy rows from beta.3.7-).
    // relativeTime() needs epoch-ms.
    function toMs(v) {
        if (v == null) { return 0; }
        if (typeof v === 'number') { return Number.isFinite(v) ? v : 0; }
        var parsed = Date.parse(String(v));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setStatus(el, kind, text) {
        if (!el) { return; }
        el.classList.remove('success', 'warn', 'error');
        if (kind) { el.classList.add(kind); }
        // Mock-aligned roles: errors should escalate to alert.
        if (kind === 'error') {
            el.setAttribute('role', 'alert');
            el.setAttribute('aria-live', 'assertive');
        } else {
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
        }
        el.textContent = text || '';
    }

    /**
     * renderHelp(targetEl, prefix, codes?, suffix?)
     *
     * Append a mix of plain text and inline <code> spans into the given
     * element. Used for both .enm-section-card-help and .enm-form-label-
     * help so the prose can interleave runtime field names ("Writes
     * chains.mainchain.dpos.ipAddressMode + ipAddressManual.").
     */
    function renderHelp(el, prefix, codes, suffix) {
        if (prefix) { el.appendChild(document.createTextNode(prefix)); }
        if (Array.isArray(codes)) {
            codes.forEach(function (c, idx) {
                if (idx > 0) { el.appendChild(document.createTextNode(' + ')); }
                var code = document.createElement('code');
                code.textContent = c;
                el.appendChild(code);
            });
        }
        if (suffix) { el.appendChild(document.createTextNode(suffix)); }
    }

    root.EnmSettingsTab = SettingsTab;
}(typeof window !== 'undefined' ? window : globalThis));
