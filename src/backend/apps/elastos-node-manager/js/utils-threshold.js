/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-threshold.js — threshold-aware CSS class helper.
 *
 * v0.5.221 audit Phase 8 (XFLOW-12, AUDIT-FLOW-O10 + O11 + O12 + D02).
 * Multiple dashboard cards (disk/CPU/memory/per-chain metrics) show
 * numeric values that should change color when crossing operator-set
 * thresholds — but pre-v0.5.221 they all had neutral styling regardless
 * of value. Operator on a host with 5 GB free disk saw the disk card
 * with the same color as one with 500 GB free.
 *
 * Usage:
 *   enmApplyThreshold(diskCard, freeGb, { warnAt: 100, criticalAt: 50 });
 *   //   if (freeGb < 50)        → adds 'is-critical' class
 *   //   else if (freeGb < 100)  → adds 'is-warn' class
 *   //   else                    → no modifier class
 *
 * For high-is-bad metrics (CPU/memory usage %) pass invert: true:
 *   enmApplyThreshold(cpuCard, cpuPct, { warnAt: 80, criticalAt: 95, invert: true });
 *   //   if (cpuPct > 95)        → 'is-critical'
 *   //   else if (cpuPct > 80)   → 'is-warn'
 *
 * The CSS class names are stable so styling lives in css/styles.css.
 */

(function (root) {
    'use strict';

    function enmApplyThreshold(el, value, opts) {
        if (!el || !el.classList) { return; }
        opts = opts || {};
        // Always strip first so a fresh call below the threshold removes
        // the prior modifier.
        el.classList.remove('is-warn', 'is-critical');
        if (typeof value !== 'number' || !isFinite(value)) { return; }
        var warnAt = (typeof opts.warnAt === 'number') ? opts.warnAt : null;
        var critAt = (typeof opts.criticalAt === 'number') ? opts.criticalAt : null;
        var invert = !!opts.invert;
        if (invert) {
            // High value is bad — CPU/memory usage.
            if (critAt != null && value > critAt) { el.classList.add('is-critical'); }
            else if (warnAt != null && value > warnAt) { el.classList.add('is-warn'); }
        } else {
            // Low value is bad — free disk space.
            if (critAt != null && value < critAt) { el.classList.add('is-critical'); }
            else if (warnAt != null && value < warnAt) { el.classList.add('is-warn'); }
        }
    }

    root.enmApplyThreshold = enmApplyThreshold;
}(typeof window !== 'undefined' ? window : globalThis));
