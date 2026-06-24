/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * components/sparkline.js — inline-SVG sparkline primitive.
 *
 * Renders a single block-height series as a filled area + line stroke,
 * matching the apple-hero mock (viewBox 0 0 300 44, ~12 even-stride
 * points, currentColor for both stroke and gradient stops). Used by
 * chain-card under the primary metric for "movement over the last hour"
 * at a glance.
 *
 * API:
 *   var spark = new EnmSparkline({ color: 'var(--state-healthy)' });
 *   spark.mount(parent);            // returns this
 *   spark.setSeries([{t,h}, ...]);  // re-renders, decimates to 12 if needed
 *   spark.destroy();
 *
 * Edge cases — must NEVER look broken:
 *   - 0 points       → hide the SVG entirely (no empty rectangle)
 *   - 1 point        → render a single dot at vertical mid + a horizontal line
 *   - 2+ flat points → draw the line, no fill gradient (flat-line look)
 *   - 2+ normal pts  → fill area + line above
 *
 * Each instance gets a unique gradient id (Math.random-derived) so
 * SVG defs don't collide when several sparklines mount on the page.
 *
 * NO external SVG libraries. Pure DOM construction so the rendered
 * SVG is inspectable + a11y-tractable.
 */

(function (root) {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    // Mock spec: 300 × 44 px, padded inside so the line doesn't kiss
    // the edges. The viewBox is fixed; CSS scales the container.
    var W = 300;
    var H = 44;
    var PAD_X = 0;
    var PAD_TOP = 4;
    var PAD_BOTTOM = 4;

    // The server decimates to ~12; the client re-decimates as a safety
    // net because incremental SSE pushes can grow the buffer past 12
    // between polls.
    var TARGET_POINTS = 12;

    function uniqueId() {
        // Browser may not expose crypto.randomUUID inside a Puter iframe;
        // a Math.random suffix is enough since collisions would have to
        // happen within one mount cycle to matter.
        return 'spk-' + Math.random().toString(36).slice(2, 10);
    }

    function EnmSparkline(opts) {
        opts = opts || {};
        // The CSS color expression for both the line stroke and the fill
        // gradient stops. Pass a token (e.g. 'var(--state-healthy)') so
        // light/dark theme + state changes pick up automatically via
        // currentColor inheritance.
        this._color = opts.color || 'var(--state-healthy)';
        this._ariaLabel = opts.ariaLabel || 'Block height, last hour';

        this._id = uniqueId();
        this._series = [];

        this._build();
    }

    EnmSparkline.prototype._build = function () {
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('enm-spark');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        // preserveAspectRatio: none lets the line stretch to the
        // container width even when the bounding box gets wider.
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', this._ariaLabel);
        svg.setAttribute('focusable', 'false');
        // Set color on the SVG so currentColor flows to stroke + stops.
        svg.style.color = this._color;
        svg.hidden = true; // hidden until setSeries lands real data

        // a11y: `<title>` child mirrors aria-label for JAWS — some screen
        // readers still prefer the title element even when aria-label is
        // present. The element is updated by _render() with the current
        // series summary (min/max/delta) so the announcement stays
        // meaningful as data lands.
        var titleEl = document.createElementNS(SVG_NS, 'title');
        titleEl.textContent = this._ariaLabel;
        svg.appendChild(titleEl);
        this._titleEl = titleEl;

        // Defs + linearGradient with two stops — top opaque, bottom
        // transparent. stop colours use currentColor so the gradient
        // inherits the SVG's color attribute.
        var defs = document.createElementNS(SVG_NS, 'defs');
        var grad = document.createElementNS(SVG_NS, 'linearGradient');
        grad.setAttribute('id', this._id);
        grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');

        var stopTop = document.createElementNS(SVG_NS, 'stop');
        stopTop.setAttribute('offset', '0%');
        stopTop.setAttribute('stop-color', 'currentColor');
        stopTop.setAttribute('stop-opacity', 'var(--sparkline-fill-top)');

        var stopBottom = document.createElementNS(SVG_NS, 'stop');
        stopBottom.setAttribute('offset', '100%');
        stopBottom.setAttribute('stop-color', 'currentColor');
        stopBottom.setAttribute('stop-opacity', 'var(--sparkline-fill-bottom)');

        grad.appendChild(stopTop);
        grad.appendChild(stopBottom);
        defs.appendChild(grad);
        svg.appendChild(defs);

        var fill = document.createElementNS(SVG_NS, 'path');
        fill.classList.add('enm-spark-fill');
        fill.setAttribute('fill', 'url(#' + this._id + ')');
        fill.setAttribute('stroke', 'none');
        svg.appendChild(fill);

        var line = document.createElementNS(SVG_NS, 'path');
        line.classList.add('enm-spark-line');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', 'currentColor');
        line.setAttribute('stroke-width', 'var(--sparkline-stroke, 1.6)');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(line);

        this.root  = svg;
        this._fill = fill;
        this._line = line;
    };

    EnmSparkline.prototype.mount = function (parent) {
        parent.appendChild(this.root);
        return this;
    };

    EnmSparkline.prototype.destroy = function () {
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    };

    /**
     * @param {Array<{t:number, h:number}>} series
     */
    EnmSparkline.prototype.setSeries = function (series) {
        if (!Array.isArray(series) || series.length === 0) {
            this._series = [];
            this.root.hidden = true;
            return;
        }
        // alpha.28.1 batch 24 — belt-and-braces NaN filter. The
        // height-series SSE handler already rejects {h: NaN} at intake
        // (batch 24 fix), but defending in setSeries too protects
        // against any future caller passing raw data — one NaN point
        // would have propagated through hMin/hMax/range and produced
        // an SVG `d="M NaN,NaN ..."` that silently bricked the
        // sparkline. (Numerical audit adc48dd0.)
        var clean = [];
        for (var i = 0; i < series.length; i += 1) {
            var p = series[i];
            if (!p) { continue; }
            if (!isFinite(p.t) || !isFinite(p.h)) { continue; }
            clean.push(p);
        }
        if (clean.length === 0) {
            this._series = [];
            this.root.hidden = true;
            return;
        }
        this._series = decimate(clean, TARGET_POINTS);
        this._render();
    };

    EnmSparkline.prototype.setColor = function (color) {
        this._color = color;
        this.root.style.color = color;
    };

    /** @private */
    EnmSparkline.prototype._render = function () {
        var pts = this._series;
        if (pts.length === 0) { this.root.hidden = true; return; }
        this.root.hidden = false;

        // Map heights to SVG y-coordinates. y = 0 is top of viewBox,
        // y = H is bottom. We want higher height → smaller y (line goes
        // UP as height grows). Add vertical padding so the line never
        // touches the edges.
        var hMin = Infinity; var hMax = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].h < hMin) hMin = pts[i].h;
            if (pts[i].h > hMax) hMax = pts[i].h;
        }
        var range = hMax - hMin;
        var usableH = H - PAD_TOP - PAD_BOTTOM;
        var midY = PAD_TOP + usableH / 2;

        // Special-case the single-point series: draw a horizontal line
        // through the centre, plus a dot. This is the "we've only just
        // started recording" look — better than vanishing.
        if (pts.length === 1) {
            var d = 'M' + PAD_X + ',' + midY.toFixed(2)
                  + ' L' + (W - PAD_X) + ',' + midY.toFixed(2);
            this._line.setAttribute('d', d);
            this._fill.setAttribute('d',
                d + ' L' + (W - PAD_X) + ',' + H + ' L' + PAD_X + ',' + H + ' Z'
            );
            // alpha.28.1 batch 49 (audit adc48dd0) — refresh the
            // aria-label + <title> here too. Previously this branch
            // returned without updating, so AT users on a single-
            // point series got the stale "Block height, last hour"
            // placeholder forever.
            var fmt = function (v) {
                return (typeof v === 'number' && isFinite(v))
                    ? v.toLocaleString()
                    : String(v);
            };
            var only = pts[0].h;
            var summary = this._ariaLabel + ': ' + fmt(only);
            this.root.setAttribute('aria-label', summary);
            if (this._titleEl) { this._titleEl.textContent = summary; }
            return;
        }

        // Even-stride x-coordinates across the full width.
        // alpha.29 batch 95 (Round-32 audit finding #6, INFO) — the
        // single-point branch above returned at line 229, so by here
        // pts.length is guaranteed >= 2 and the ternary defending
        // against pts.length === 1 was dead code. Removed the ternary
        // so the constraint is obvious to future readers without
        // having to trace back to the early-return.
        var xs = [];
        var stride = (W - 2 * PAD_X) / (pts.length - 1);
        for (var k = 0; k < pts.length; k++) xs.push(PAD_X + k * stride);

        // y mapping. When range === 0 (flat line), every point hits
        // midY — that's the truthful "no movement" look.
        var ys = pts.map(function (p) {
            if (range === 0) return midY;
            return PAD_TOP + (1 - (p.h - hMin) / range) * usableH;
        });

        // Build the line path: M x0 y0 L x1 y1 L ...
        // alpha.29 batch 111 (Round-34 perf finding #3, LOW) — build
        // path strings into an array then join() once, instead of
        // += concatenation in a tight loop. Each concat in the
        // previous shape allocated a new transient string; the loop
        // is small (TARGET_POINTS=12) but sparklines re-render on
        // every SSE height tick and on every chain-card so the
        // cumulative cost on slow ARM/RPi hardware matters.
        var lineParts = ['M', xs[0].toFixed(2), ',', ys[0].toFixed(2)];
        for (var j = 1; j < pts.length; j++) {
            lineParts.push(' L', xs[j].toFixed(2), ',', ys[j].toFixed(2));
        }
        var line = lineParts.join('');

        // Fill path closes the line down to the baseline (y=H), back to
        // the start at the baseline, then Z.
        var fillParts = lineParts.concat([
            ' L', xs[xs.length - 1].toFixed(2), ',', H,
            ' L', xs[0].toFixed(2), ',', H, ' Z'
        ]);
        var fill = fillParts.join('');

        this._line.setAttribute('d', line);
        this._fill.setAttribute('d', fill);

        // Hide the fill on a flat line — it would just be a solid block
        // of colour and looks worse than no fill.
        this._fill.style.opacity = (range === 0) ? '0' : '';

        // a11y: refresh aria-label + <title> with a one-line summary so
        // screen readers announce "Block height: +16 over last hour
        // (12,340 → 12,356)" instead of a generic "graphic". toLocaleString
        // keeps the numbers grouped for screen-reader rhythm.
        var first = pts[0].h;
        var last = pts[pts.length - 1].h;
        var delta = last - first;
        var sign = delta > 0 ? '+' : (delta < 0 ? '−' : '±');
        var fmt = function (v) {
            return (typeof v === 'number' && isFinite(v))
                ? v.toLocaleString()
                : String(v);
        };
        var summary = this._ariaLabel
            + ': ' + sign + fmt(Math.abs(delta))
            + ' (' + fmt(first) + ' → ' + fmt(last) + ')';
        this.root.setAttribute('aria-label', summary);
        if (this._titleEl) { this._titleEl.textContent = summary; }
    };

    /**
     * Reduce an array to ~target points by even time-stride. Server
     * already decimates the initial GET, but SSE pushes grow the buffer
     * past target until the next bootstrap — so the renderer is the
     * safety net.
     *
     * @param {Array<{t:number,h:number}>} series
     * @param {number} target
     * @returns {Array<{t:number,h:number}>}
     */
    function decimate(series, target) {
        if (series.length <= target) return series.slice();
        var first = series[0].t;
        var last = series[series.length - 1].t;
        var stride = (last - first) / (target - 1);
        var out = [];
        var j = 0;
        for (var i = 0; i < target; i += 1) {
            var t = first + i * stride;
            while (j + 1 < series.length
                && Math.abs(series[j + 1].t - t) < Math.abs(series[j].t - t)) {
                j += 1;
            }
            var candidate = series[j];
            var prev = out[out.length - 1];
            if (!prev || prev.t !== candidate.t) out.push(candidate);
        }
        return out;
    }

    root.EnmSparkline = EnmSparkline;
}(typeof window !== 'undefined' ? window : globalThis));
