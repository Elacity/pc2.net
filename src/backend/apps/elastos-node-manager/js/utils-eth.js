/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * utils-eth.js — shared Ethereum-style address helpers.
 *
 * Single source of truth for:
 *   - normalize(raw)      — strip whitespace, fix 0X→0x prefix
 *   - validate(addr)      — returns null on OK, error-key string otherwise
 *   - hasMixedCase(addr)  — true when the address has BOTH upper + lower hex letters
 *   - eip55Checksum(addr) — EIP-55 canonical-case form of a lowercased address
 *   - isValidEip55(addr)  — true iff input case matches eip55Checksum (mixed-case only)
 *
 * Why this lives here, not inline in setup-conversation.js / settings-tab.js:
 *
 *   The audit (AUDIT-FLOW-XFLOW-04 + XFLOW-16) found `validateEth` duplicated
 *   in 3 places with subtle behavior drift: setup-conversation.js Card 4 had a
 *   soft EIP-55 warning; settings-tab.js Class B had no EIP-55 awareness at
 *   all (AUDIT-FLOW-B01, P1). The fix is one shared utility with HARD-block
 *   EIP-55 verification — see Phase 2 of ENM_FIX_PLAN_2026-05-25.md.
 *
 * Hard-block requires keccak-256, which the browser doesn't ship (SubtleCrypto
 * provides standard SHA-3 but with a different pad byte). The js-sha3 library
 * is vendored at js/vendor/js-sha3.min.js and MUST load BEFORE this file in
 * index.html.
 *
 * If js-sha3 fails to load, isValidEip55 returns null (cannot verify) and the
 * caller should fall back to a soft warning. validate / hasMixedCase / format
 * checks all still work without keccak.
 */

(function (root) {
    'use strict';

    var FORMAT_RX     = /^0x[0-9a-fA-F]{40}$/;
    var BARE_40HEX_RX = /^[0-9a-fA-F]{40}$/;     // missing 0x prefix
    var HAS_UPPER_AF  = /[A-F]/;
    var HAS_LOWER_AF  = /[a-f]/;

    /**
     * Strip whitespace + uppercase X prefix. Both common paste mishaps.
     * Trim() handles leading/trailing whitespace; \s+ handles internal
     * (newlines from PDF copy, spaces from screenshots / wallet-app
     * exports). Stripping internal whitespace is safe because no hex
     * address can validly contain spaces.
     * @param {string} raw
     * @returns {string}
     */
    function normalize(raw) {
        if (typeof raw !== 'string') { return ''; }
        var stripped = raw.replace(/\s+/g, '');
        if (/^0X/.test(stripped)) {
            stripped = '0x' + stripped.slice(2);
        }
        return stripped;
    }

    /**
     * Format-validate a normalized address. Returns null on OK, else
     * an i18n-key-friendly error tag the caller maps to localized copy.
     *
     *   null            → valid format (case-check is separate via isValidEip55)
     *   'missing_0x'    → looks like 40 hex chars but no 0x prefix
     *   'format'        → anything else (wrong length, bad chars, etc.)
     *
     * @param {string} normalized — output of normalize()
     * @returns {string|null}
     */
    function validate(normalized) {
        if (typeof normalized !== 'string') { return 'format'; }
        if (FORMAT_RX.test(normalized)) { return null; }
        if (BARE_40HEX_RX.test(normalized)) { return 'missing_0x'; }
        return 'format';
    }

    /**
     * EIP-55 detection — addresses with BOTH upper and lower hex letters
     * have a (claimed) checksum encoded in their case. Lowercase or all-
     * uppercase addresses have no checksum to verify and don't need the
     * EIP-55 gate. Digits 0-9 don't count toward case (no upper/lower).
     * @param {string} addr — with or without 0x prefix
     * @returns {boolean}
     */
    function hasMixedCase(addr) {
        if (typeof addr !== 'string') { return false; }
        return HAS_UPPER_AF.test(addr) && HAS_LOWER_AF.test(addr);
    }

    /**
     * Compute the EIP-55 canonical case form of an address.
     * Lowercases the input, keccak-256-hashes the lowercased hex string
     * (as UTF-8 ASCII bytes — that's the EIP-55 spec), then uppercases
     * each letter where the corresponding hash nibble is >= 8.
     *
     * Returns null if js-sha3 hasn't loaded (caller should degrade to
     * soft warning).
     *
     * Verified against all 8 EIP-55 spec test vectors.
     *
     * @param {string} addr — with or without 0x prefix
     * @returns {string|null} — '0x' + 40 chars in EIP-55 canonical case
     */
    function eip55Checksum(addr) {
        if (typeof addr !== 'string') { return null; }
        var keccak = (root.sha3 && typeof root.sha3.keccak_256 === 'function')
            ? root.sha3.keccak_256
            : null;
        if (!keccak) { return null; }
        var stripped = addr.replace(/^0x/i, '').toLowerCase();
        if (!BARE_40HEX_RX.test(stripped)) { return null; }
        var hash = keccak(stripped);
        var out = '0x';
        for (var i = 0; i < 40; i += 1) {
            var c = stripped[i];
            if (c >= '0' && c <= '9') {
                out += c;
            } else {
                var nibble = parseInt(hash[i], 16);
                out += (nibble >= 8) ? c.toUpperCase() : c;
            }
        }
        return out;
    }

    /**
     * Verify EIP-55 checksum. Returns:
     *   true   → checksum matches canonical case (safe to accept)
     *   false  → checksum INVALID — likely typo, reject hard
     *   null   → cannot verify (no keccak available; caller falls back
     *            to soft warning, AUDIT-FLOW-C401 behavior)
     *
     * Always returns null for all-lowercase or all-uppercase addresses
     * (they don't carry a checksum to verify — only mixed-case does).
     *
     * @param {string} addr — with 0x prefix
     * @returns {boolean|null}
     */
    function isValidEip55(addr) {
        if (typeof addr !== 'string') { return null; }
        if (!hasMixedCase(addr)) { return null; }
        var canonical = eip55Checksum(addr);
        if (!canonical) { return null; }
        // Compare with 0x prefix in canonical form ('0x' lowercase).
        var addrNorm = (addr.slice(0, 2).toLowerCase() === '0x')
            ? '0x' + addr.slice(2)
            : '0x' + addr;
        return canonical === addrNorm;
    }

    /**
     * Combined check the wizard / settings forms can call. Returns:
     *   { ok: true }                    → safe to accept
     *   { ok: false, error: 'format' }  → invalid format
     *   { ok: false, error: 'missing_0x', suggested: '0x...' } → fixable typo
     *   { ok: false, error: 'eip55_checksum' } → mixed-case but wrong checksum
     *   { ok: true, warn: 'no_keccak' } → format OK, EIP-55 couldn't verify
     *                                     (caller surfaces soft warning)
     *
     * @param {string} raw
     * @returns {object}
     */
    function check(raw) {
        var norm = normalize(raw);
        var fmt = validate(norm);
        if (fmt === 'missing_0x') {
            return { ok: false, error: 'missing_0x', suggested: '0x' + norm };
        }
        if (fmt === 'format') {
            return { ok: false, error: 'format' };
        }
        if (!hasMixedCase(norm)) {
            // All-lower or all-upper — no checksum to verify, accept.
            return { ok: true, normalized: norm };
        }
        var eip = isValidEip55(norm);
        if (eip === true) {
            return { ok: true, normalized: norm };
        }
        if (eip === false) {
            return { ok: false, error: 'eip55_checksum', suggested: eip55Checksum(norm) };
        }
        // eip === null → keccak unavailable, soft warning path.
        return { ok: true, normalized: norm, warn: 'no_keccak' };
    }

    // Export.
    root.enmEthAddress = {
        normalize: normalize,
        validate: validate,
        hasMixedCase: hasMixedCase,
        eip55Checksum: eip55Checksum,
        isValidEip55: isValidEip55,
        check: check,
    };
}(typeof window !== 'undefined' ? window : globalThis));
