/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmCrypto — Wave M1.4 (beta.3.88) — centralized cryptographic + validation
 * helpers used across ENM's setup wizards, config writes, and per-chain
 * adapters. Sits ALONGSIDE EnmEncryption.js (which owns the AES-256-GCM
 * envelope format for at-rest secrets); EnmCrypto provides the non-
 * encryption surfaces — password generation matching node.sh's gen_pass
 * policy, EVM + ELA address validation, RPC credential generation.
 *
 * NODE.SH PARITY (per plan §17): replaces these node.sh patterns with
 * encrypted-at-rest, validated equivalents:
 *
 *   - gen_pass (node.sh:423-435)
 *       16+ char minimum, must include upper, lower, digit, non-alnum
 *       Random fallback: `openssl rand -base64 100 | head -c 32`
 *     → EnmCrypto.generatePassword(length=32)
 *
 *   - Zero-validation miner-address prompt (node.sh:3258-3265 + parallels)
 *       `read -p '? Miner Address: ' ESC_MINER_ADDRESS` — accepts "BANANA"
 *     → EnmCrypto.validateEthAddress(addr) — 0x-prefix + 40 hex + EIP-55
 *       checksum warn
 *
 *   - Random RPC user/pass (node.sh:gen_jsonrpc_user_pass)
 *     → EnmCrypto.generateRpcCredentials() → { user, password }
 *
 * The encrypt/decrypt re-exports below let new adapters import only this
 * file for the common crypto surface (one import vs two).
 */

'use strict';

const crypto = require('node:crypto');

const EnmEncryption = require('./EnmEncryption');

// node.sh gen_pass complexity policy (build/skeleton/node.sh:423-435):
//   must contain at least one of each: upper, lower, digit, non-alnum
const PASSWORD_COMPLEXITY = {
    upper: /[A-Z]/,
    lower: /[a-z]/,
    digit: /[0-9]/,
    nonAlnum: /[^A-Za-z0-9]/,
};

// Character pool for random password generation. Includes safe punctuation
// only — excludes shell metacharacters ($ ` \ " ') and whitespace so the
// password is safe to surface via stdin-pipe to child processes without
// shell-escaping concerns (we never put it in a CLI arg, but defense in
// depth).
const PASSWORD_POOL = (
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    + 'abcdefghijklmnopqrstuvwxyz'
    + '0123456789'
    + '!@#%^&*()_+-=[]{}|;:,.<>?/~'
);

/**
 * Generate a cryptographically-random password matching node.sh's complexity
 * policy. Used by setup-wizard cards for fresh keystore creation.
 *
 * @param {number} [length=32] — total length; node.sh defaults to 32 via
 *   `openssl rand -base64 100 | head -c 32`. Minimum 16 (the node.sh
 *   complexity gate's lower bound).
 * @returns {string} password guaranteed to satisfy PASSWORD_COMPLEXITY
 */
function generatePassword(length) {
    const len = (typeof length === 'number' && length >= 16) ? length : 32;
    // Loop until we hit a password that satisfies all 4 complexity rules.
    // Probability of a random 32-char draw missing any one class is tiny
    // (~0.0002) so this loop almost always exits on the first iteration.
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const bytes = crypto.randomBytes(len);
        let pw = '';
        for (let i = 0; i < len; i += 1) {
            pw += PASSWORD_POOL[bytes[i] % PASSWORD_POOL.length];
        }
        if (validatePasswordComplexity(pw)) {
            return pw;
        }
    }
    // Fall-back: synthesize one of each class explicitly and shuffle.
    // Reached only on cosmic-ray-grade RNG entropy failure.
    const chars = [
        PASSWORD_POOL.match(PASSWORD_COMPLEXITY.upper)[0],
        PASSWORD_POOL.match(PASSWORD_COMPLEXITY.lower)[0],
        PASSWORD_POOL.match(PASSWORD_COMPLEXITY.digit)[0],
        PASSWORD_POOL.match(PASSWORD_COMPLEXITY.nonAlnum)[0],
    ];
    const fillBytes = crypto.randomBytes(len - 4);
    for (let i = 0; i < fillBytes.length; i += 1) {
        chars.push(PASSWORD_POOL[fillBytes[i] % PASSWORD_POOL.length]);
    }
    // Fisher-Yates shuffle with cryptographic RNG
    for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

/**
 * Check whether a password satisfies node.sh's complexity policy.
 * Used by setup-wizard cards to validate operator-supplied passwords
 * before encryption + storage.
 *
 * @param {string} password
 * @returns {boolean}
 */
function validatePasswordComplexity(password) {
    if (typeof password !== 'string' || password.length < 16) {
        return false;
    }
    return PASSWORD_COMPLEXITY.upper.test(password)
        && PASSWORD_COMPLEXITY.lower.test(password)
        && PASSWORD_COMPLEXITY.digit.test(password)
        && PASSWORD_COMPLEXITY.nonAlnum.test(password);
}

/**
 * Generate random JSON-RPC credentials. Used by chain setup to populate
 * `cfg.chains.<id>.rpc.{user, passwordEncrypted}` without operator input
 * (RPC is loopback-only by default; password is for defense-in-depth).
 *
 * @returns {{ user: string, password: string }}
 *   user: 12-char alphanumeric
 *   password: 32-char complexity-compliant
 */
function generateRpcCredentials() {
    // 12 alphanumeric chars (node.sh ranges 8-16; we settle on 12)
    const userBytes = crypto.randomBytes(12);
    const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let user = '';
    for (let i = 0; i < 12; i += 1) {
        user += alnum[userBytes[i] % alnum.length];
    }
    return { user, password: generatePassword(32) };
}

// EVM address regex: 0x + 40 hex chars. Case-insensitive at this layer;
// EIP-55 checksum validation is a SEPARATE check (warn-only) below.
const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validate an Ethereum-style address (used by Class B EVM sidechain miner
 * addresses). Returns a structured result so the caller can decide whether
 * to surface a hard error (invalid format) vs a soft warning (checksum
 * mismatch — possibly a copy-paste from a non-EIP-55 source).
 *
 * NODE.SH DIVERGENCE: node.sh has ZERO validation (anti-pattern). ENM
 * validates strictly + warns on checksum mismatch.
 *
 * @param {string} addr
 * @returns {{ valid: boolean, normalized?: string, warning?: string }}
 */
function validateEthAddress(addr) {
    if (typeof addr !== 'string' || addr.length === 0) {
        return { valid: false, warning: 'address is empty' };
    }
    if (!ETH_ADDR_RE.test(addr)) {
        return {
            valid: false,
            warning: `not a valid Ethereum address (expected 0x followed by 40 hex chars; got "${addr.slice(0, 20)}${addr.length > 20 ? '…' : ''}")`,
        };
    }
    // EIP-55 checksum check. The address is valid format-wise; check
    // whether the operator pasted a mixed-case (checksummed) form.
    // If so, verify it; if not (all-lower or all-upper), accept as-is
    // with a soft warning so the operator knows we recommend EIP-55.
    const noPrefix = addr.slice(2);
    const isLower = noPrefix === noPrefix.toLowerCase();
    const isUpper = noPrefix === noPrefix.toUpperCase();
    if (isLower || isUpper) {
        return {
            valid: true,
            normalized: addr.toLowerCase(),
            warning: 'address has no EIP-55 checksum — recommend pasting the mixed-case form from your wallet',
        };
    }
    // Mixed-case: compute the expected checksum + compare
    const hash = crypto.createHash('sha3-256').update(noPrefix.toLowerCase()).digest('hex');
    let expected = '';
    for (let i = 0; i < noPrefix.length; i += 1) {
        const c = noPrefix[i];
        if (/[a-f]/i.test(c)) {
            expected += parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c.toLowerCase();
        } else {
            expected += c;
        }
    }
    if (expected === noPrefix) {
        return { valid: true, normalized: addr };
    }
    return {
        valid: true, // still format-valid; just checksum mismatch
        normalized: addr.toLowerCase(),
        warning: 'EIP-55 checksum mismatch — double-check the address; possible copy-paste error',
    };
}

// ELA address regex: base58check, starts with E (mainnet) or 4 (testnet),
// length ~34 chars. We don't validate the checksum here (would need ela-cli
// or a base58check decoder) — we just check the shape so an obviously
// wrong paste (Ethereum address, garbage) is rejected at the wizard layer.
// Full validation lives in ela-cli's own paths.
const ELA_ADDR_RE = /^[E4][1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * Validate an ELA mainchain address (used by Class D Arbiter mining
 * address — SideChainPow heartbeats spend mainchain ELA, so the funding
 * address must be a mainchain ELA address, NOT Ethereum).
 *
 * @param {string} addr
 * @returns {{ valid: boolean, warning?: string }}
 */
function validateElaAddress(addr) {
    if (typeof addr !== 'string' || addr.length === 0) {
        return { valid: false, warning: 'address is empty' };
    }
    if (!ELA_ADDR_RE.test(addr)) {
        return {
            valid: false,
            warning: `not a valid ELA address (expected base58check starting with E or 4, length 34; got "${addr.slice(0, 20)}${addr.length > 20 ? '…' : ''}")`,
        };
    }
    return { valid: true };
}

// enode URL (geth peer reference): enode://<pubkey>@<host>:<port>[?discport=N]
//   pubkey  — the node's secp256k1 public key WITHOUT the 0x04 prefix =
//             64 bytes = 128 hex chars (NOT 130; the uncompressed-point
//             prefix is dropped in the enode form).
//   host    — IPv4, bracketed IPv6 ([::1]), or DNS hostname.
//   port    — TCP listener (devp2p RLPx). 1–65535.
//   discport— optional UDP discovery port override (defaults to <port>).
// v0.5.175 — used by the self-service "Peers & Bootnodes" panel so an
// operator whose EVM sidechain is stuck at 0 peers can paste an enode and
// have ENM validate it before persisting + live-dialing it.
const ENODE_RE = /^enode:\/\/([0-9a-fA-F]{128})@(\[[0-9a-fA-F:]+\]|[^@:/]+):(\d{1,5})(\?discport=(\d{1,5}))?$/;

/**
 * Validate a geth enode URL (Class B EVM sidechain peer/bootnode). Returns a
 * structured result mirroring validateEthAddress so the route can surface a
 * hard error on bad shape. The pubkey is normalized to lowercase (geth treats
 * it case-insensitively; lowercase is the canonical on-wire form).
 *
 * @param {string} enode
 * @returns {{ valid: boolean, normalized?: string, warning?: string }}
 */
function validateEnode(enode) {
    if (typeof enode !== 'string' || enode.trim().length === 0) {
        return { valid: false, warning: 'enode is empty' };
    }
    const s = enode.trim();
    if (s.length > 512) {
        return { valid: false, warning: 'enode is too long (max 512 chars)' };
    }
    const m = ENODE_RE.exec(s);
    if (!m) {
        return {
            valid: false,
            warning: `not a valid enode URL (expected enode://<128-hex-pubkey>@<host>:<port>; got "${s.slice(0, 32)}${s.length > 32 ? '…' : ''}")`,
        };
    }
    const port = Number(m[3]);
    if (port < 1 || port > 65535) {
        return { valid: false, warning: `enode port out of range (1–65535; got ${port})` };
    }
    if (m[5] !== undefined) {
        const discport = Number(m[5]);
        if (discport < 1 || discport > 65535) {
            return { valid: false, warning: `enode discport out of range (1–65535; got ${discport})` };
        }
    }
    const normalized = `enode://${m[1].toLowerCase()}@${m[2]}:${m[3]}${m[4] || ''}`;
    return { valid: true, normalized };
}

module.exports = {
    // Password generation + validation (node.sh gen_pass parity)
    generatePassword,
    validatePasswordComplexity,
    generateRpcCredentials,
    // Address validation
    validateEthAddress,
    validateElaAddress,
    validateEnode,
    // Re-exports from EnmEncryption for unified imports
    encrypt: EnmEncryption.encrypt,
    decrypt: EnmEncryption.decrypt,
    // Constants exported for tests
    PASSWORD_POOL,
    PASSWORD_COMPLEXITY,
    ETH_ADDR_RE,
    ELA_ADDR_RE,
    ENODE_RE,
};
