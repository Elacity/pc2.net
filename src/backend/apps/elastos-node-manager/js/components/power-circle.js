/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/power-circle.js — the hero status visualization.
 *
 * One concentric SVG widget that replaces the old "state badge + stats grid +
 * sync bar" stack. It tells the operator at a glance what the chain is doing,
 * using:
 *
 *   - outer ring colour     = current state (off / booting / syncing / healthy / warning / error)
 *   - inner fill ring       = sync percent, only when state === 'syncing'
 *   - centre label          = percent number (syncing) OR a glyph (everything else)
 *   - centre subtitle       = a one-word state name underneath the chain name
 *
 * Visual states map from the 6 backend coarse states (chain-card emits them):
 *
 *   unconfigured  → off       (faint, awaits Configure)
 *   stopped       → off       (faint, awaits Start)
 *   starting      → booting   (animated rotating arc — the Apple-spinner look)
 *   recovering    → booting
 *   syncing       → syncing   (steady ring + filling inner ring + %)
 *   healthy       → healthy   (steady ring + soft glow + ✓)
 *   stalled       → warning   (amber ring + !)
 *   error         → error     (red ring + ✕)
 *
 * The whole circle is a single click target — tap it to do "the obvious thing"
 * for the current state (start when off, open details when running, etc.).
 * The chain-card supplies the click handler.
 *
 * Animations all use Apple's spring easing — cubic-bezier(0.32, 0.72, 0, 1) —
 * via the --motion-spring token in styles.css.
 */

(function (root) {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    // 0.2.0-alpha.1 (Apple Hero) — viewBox bumped 100 → 220 so the ring
    // stroke can be a substantial 10 (≈4.5% of diameter) like the mock
    // and like Apple's Activity rings. Geometry collapsed from two
    // separate circles (outer state-ring + inner percent-ring at
    // different radii) down to one track + one progress ring at the
    // same radius — this matches the mock's iOS pattern: the progress
    // ring overlays the track, and dasharray/dashoffset express both
    // "calm full ring" (healthy) and "partial fill" (syncing).
    //
    // viewBox is fixed at 220; the CSS clamp on .enm-chain-hero scales
    // the rendered size to taste (180–220px).
    var VB = 220;
    var CENTRE = VB / 2;          // 110
    var R = 100;                  // ring radius (10 from viewBox edge = stroke clearance)
    var CIRC = 2 * Math.PI * R;   // 628.318...

    function PowerCircle(opts) {
        opts = opts || {};
        this._onTap = (typeof opts.onTap === 'function') ? opts.onTap : null;
        this._ariaLabel = opts.ariaLabel || 'Status';

        this._state = 'off';
        this._percent = null;

        this._build();
    }

    /** @private */
    PowerCircle.prototype._build = function () {
        // Outer wrapper is a <button> so it's keyboard-focusable + reads as
        // interactive to assistive tech. Inside is the SVG + the centre stack.
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'enm-power-circle';
        btn.setAttribute('aria-label', this._ariaLabel);
        btn.dataset.state = this._state;

        var self = this;
        btn.addEventListener('click', function () {
            if (self._onTap) self._onTap(self._state);
        });

        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + VB + ' ' + VB);
        // a11y: aria-hidden=true hides the SVG from AT; role=img is redundant
        // and was previously paired here, causing screen readers to announce
        // an "image" with no name. The outer button's dynamic aria-label
        // is the accessible name for this control.
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('aria-hidden', 'true');
        svg.classList.add('enm-pc-svg');

        // Track ring — always visible, very faint, sits behind everything.
        var track = document.createElementNS(SVG_NS, 'circle');
        track.classList.add('enm-pc-track');
        track.setAttribute('cx', CENTRE);
        track.setAttribute('cy', CENTRE);
        track.setAttribute('r',  R);
        track.setAttribute('fill', 'none');
        svg.appendChild(track);

        // Progress ring — coloured per state. Overlays the track at the
        // same radius. dashoffset drives the partial-fill mechanic when
        // syncing; for every other state it stays at 0 (full circle).
        // Rotated -90deg so the fill starts at 12 o'clock and grows
        // clockwise — iOS Activity Ring convention.
        var ring = document.createElementNS(SVG_NS, 'circle');
        ring.classList.add('enm-pc-ring');
        ring.setAttribute('cx', CENTRE);
        ring.setAttribute('cy', CENTRE);
        ring.setAttribute('r',  R);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('transform', 'rotate(-90 ' + CENTRE + ' ' + CENTRE + ')');
        ring.style.strokeDasharray = CIRC;
        ring.style.strokeDashoffset = '0';   // full circle by default
        svg.appendChild(ring);

        btn.appendChild(svg);

        // Centre label — text that swaps between % (syncing) and a glyph
        // (everything else). Lives in the DOM rather than SVG so we get
        // crisp typography from the inherited font stack.
        var labelWrap = document.createElement('span');
        labelWrap.className = 'enm-pc-label-wrap';

        var glyph = document.createElement('span');
        glyph.className = 'enm-pc-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        labelWrap.appendChild(glyph);

        var pctText = document.createElement('span');
        pctText.className = 'enm-pc-percent';
        pctText.setAttribute('aria-hidden', 'true');
        labelWrap.appendChild(pctText);

        btn.appendChild(labelWrap);

        this.root    = btn;
        this._ring   = ring;
        this._glyph  = glyph;
        this._pctText = pctText;

        this._render();
    };

    PowerCircle.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        return this;
    };

    PowerCircle.prototype.destroy = function () {
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    };

    /**
     * @param {('off'|'booting'|'syncing'|'healthy'|'warning'|'error')} state
     * @param {object} [opts]
     * @param {number} [opts.percent]  0..100, only meaningful when state==='syncing'
     */
    PowerCircle.prototype.setState = function (state, opts) {
        var validStates = ['off', 'booting', 'syncing', 'healthy', 'warning', 'error'];
        if (validStates.indexOf(state) === -1) {
            state = 'off';
        }
        this._state = state;
        if (opts && typeof opts.percent === 'number') {
            // Clamp to [0, 100] — backend can momentarily go to 100.001 etc.
            this._percent = Math.max(0, Math.min(100, opts.percent));
        } else if (state !== 'syncing') {
            this._percent = null;
        }
        this._render();
    };

    PowerCircle.prototype.setOnTap = function (fn) {
        this._onTap = (typeof fn === 'function') ? fn : null;
    };

    /** @private */
    PowerCircle.prototype._render = function () {
        this.root.dataset.state = this._state;

        // 0.2.0-alpha.1 — single-ring model. The same circle expresses
        // both "calm state colour" (healthy / warning / error / off,
        // where the ring is fully drawn and stroke colour says
        // everything) and "syncing progress" (dashoffset partial-fills
        // the ring). Three sub-cases for the centre label:
        //   syncing + percent known    → "82%"
        //   syncing + percent unknown  → animated dots (Apple-style "thinking")
        //   any other state            → state glyph (⏻, !, ✕, etc.)
        var hasPct = (this._state === 'syncing' && this._percent != null);
        if (hasPct) {
            var filled = CIRC * (this._percent / 100);
            this._ring.style.strokeDashoffset = (CIRC - filled).toFixed(2);
            this._pctText.textContent = this._percent.toFixed(this._percent < 10 ? 1 : 0) + '%';
            this._pctText.hidden = false;
            this._glyph.hidden = true;
            this._glyph.classList.remove('enm-pc-glyph-estimating');
        } else {
            // Full circle (offset 0) for every non-syncing state — the
            // ring colour does the talking. CSS owns the colour per
            // [data-state]; we don't touch it from JS.
            this._ring.style.strokeDashoffset = '0';
            this._pctText.hidden = true;
            this._glyph.hidden = false;
            if (this._state === 'syncing') {
                // Network reference not in yet — paint the ring as a
                // "thinking" indicator (CSS adds the shimmering dash)
                // and show pulsing dots in the centre.
                this._glyph.textContent = '···';
                this._glyph.classList.add('enm-pc-glyph-estimating');
            } else {
                this._glyph.textContent = GLYPH[this._state] || '';
                this._glyph.classList.remove('enm-pc-glyph-estimating');
            }
        }

        // ARIA — describe the state for screen readers.
        var live = STATE_ARIA[this._state] || '';
        if (this._state === 'syncing' && this._percent != null) {
            live = 'Syncing ' + Math.floor(this._percent) + ' percent';
        }
        this.root.setAttribute('aria-label', this._ariaLabel + ': ' + live);
    };

    // Centre glyphs — kept as text so they inherit the page font and scale
    // perfectly. Apple HIG-style: simple, single-stroke characters.
    //
    // alpha.18 — healthy uses the power symbol (⏻) in green, not a
    // checkmark. A check reads as "done / completed"; a running node
    // is ongoing. The power glyph + green colour + the breath
    // animation say "alive and powered on" without the false-finality
    // of a tick. Off and healthy share the glyph; the colour is what
    // changes (gray vs green) — same visual grammar as a Mac's power
    // LED.
    var GLYPH = {
        off:     '⏻',     // power symbol — dim
        booting: '',      // blank — the animated state-ring is enough
        syncing: '',      // not used — percent text takes its place
        healthy: '⏻',     // power symbol — green, breathing
        warning: '!',
        error:   '✕',
    };

    // ARIA fallback strings — chain-card overrides aria-label dynamically too.
    var STATE_ARIA = {
        off:     'Off',
        booting: 'Starting',
        syncing: 'Syncing',
        healthy: 'Healthy',
        warning: 'Warning',
        error:   'Error',
    };

    root.EnmPowerCircle = PowerCircle;
}(typeof window !== 'undefined' ? window : globalThis));
