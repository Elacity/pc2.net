/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmFormat — small formatting helpers shared across modules.
 *
 * Why a separate file? Phase 1b audit (code-quality round) flagged that
 * DiskPreflight used `toFixed(1)` while system.js had its own `round2`
 * helper. One source of truth.
 */

'use strict';

/**
 * Round a number to N decimal places, returning a number (not a string).
 * Useful for JSON responses where consumers expect numeric values.
 *
 * @param {number} value
 * @param {number} [digits=2]
 * @returns {number}
 */
function round(value, digits) {
    const d = Number.isInteger(digits) ? digits : 2;
    const factor = 10 ** d;
    return Math.round(value * factor) / factor;
}

/**
 * Format gigabytes to a 1-decimal string (e.g. "240.5"). Used in user-facing
 * messages where consistency matters more than precision.
 *
 * @param {number} gb
 * @returns {string}
 */
function gbDisplay(gb) {
    return round(gb, 1).toString();
}

module.exports = {
    round,
    gbDisplay,
};
