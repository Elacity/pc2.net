/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmEncryption — own AES-256-GCM with own key file.
 *
 * Why own crypto and not PC2's encrypt/decrypt?
 *   PC2's utils/encryption.ts is NOT exposed to extensions via install.services
 *   (verified Rev 7, agent 2). Extensions cannot import it. We implement minimal
 *   AES-256-GCM with the same threat model: key at rest in mode-0600 file inside
 *   the extension data dir, IV per-message.
 *
 * Format on disk: { v: 1, iv: <base64>, tag: <base64>, ct: <base64> } as JSON.
 *
 * Used for: chains.mainchain.rpc.password, keystore-password.enc.
 * NOT used for: the keystore.dat itself (operator imports an already-encrypted file).
 *
 * --- KEY ROTATION ---
 *
 * Today there is no automatic key rotation. The master key at
 * encryptionKeyPath() is generated once on first run and reused
 * forever. This is acceptable for v0.5 because:
 *   1. Every envelope embeds a version field (FORMAT_VERSION). When we
 *      eventually need to rotate, bump the version and have decrypt()
 *      try the new key first, falling back to the old key for envelopes
 *      that still carry v=1.
 *   2. The blast radius is limited to two envelopes per chain — the RPC
 *      password and the keystore stash. A breach scenario would already
 *      have access to the key file (mode 0600 in the data dir), so
 *      re-encryption alone wouldn't help.
 *
 * Manual rotation procedure (operator-driven, until automation lands):
 *   1. Stop ela: POST /chains/mainchain/stop
 *   2. Decrypt RPC password + keystore stash with the current key,
 *      hold them in memory.
 *   3. Move encryption.key aside (`mv encryption.key encryption.key.v1`).
 *   4. Restart enm-server — getMasterKey() generates a fresh key.
 *   5. Re-call POST /config/mainchain with the plaintext RPC password
 *      and POST /setup/keystore with the keystore password to re-encrypt.
 *   6. Verify by starting ela; remove encryption.key.v1 once confirmed.
 */

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { encryptionKeyPath } = require('./DataDir');

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;        // GCM standard
const TAG_BYTES = 16;       // GCM standard
const FORMAT_VERSION = 1;

let cachedKey = null;

/**
 * Load or generate the master key. First call writes the key file with mode 0600.
 * Subsequent calls in the same process reuse the cached buffer.
 *
 * @returns {Buffer} 32-byte key
 */
function getMasterKey() {
    if (cachedKey) {
        return cachedKey;
    }
    const target = encryptionKeyPath();
    if (fs.existsSync(target)) {
        cachedKey = fs.readFileSync(target);
        if (cachedKey.length !== KEY_BYTES) {
            throw new Error(`EnmEncryption: key file at ${target} has wrong length (${cachedKey.length}, expected ${KEY_BYTES})`);
        }
        return cachedKey;
    }
    // First run — generate.
    const key = crypto.randomBytes(KEY_BYTES);
    // Ensure directory exists with restrictive perms.
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, key, { mode: 0o600 });
    cachedKey = key;
    return key;
}

/**
 * Encrypt UTF-8 plaintext to a JSON envelope string.
 *
 * @param {string} plaintext
 * @returns {string} JSON: { v, iv, tag, ct }
 */
function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
        throw new TypeError('EnmEncryption.encrypt: plaintext must be a string');
    }
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.length !== TAG_BYTES) {
        throw new Error(`EnmEncryption.encrypt: unexpected tag length ${tag.length}`);
    }
    return JSON.stringify({
        v: FORMAT_VERSION,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: ct.toString('base64'),
    });
}

/**
 * Decrypt a JSON envelope produced by encrypt(). Throws on tamper or wrong key.
 *
 * @param {string} envelope JSON: { v, iv, tag, ct }
 * @returns {string} UTF-8 plaintext
 */
function decrypt(envelope) {
    if (typeof envelope !== 'string') {
        throw new TypeError('EnmEncryption.decrypt: envelope must be a string');
    }
    let parsed;
    try {
        parsed = JSON.parse(envelope);
    } catch (err) {
        throw new Error(`EnmEncryption.decrypt: invalid JSON envelope (${err.message})`);
    }
    if (!parsed || parsed.v !== FORMAT_VERSION) {
        throw new Error(`EnmEncryption.decrypt: unsupported format version ${parsed && parsed.v}`);
    }
    const iv = Buffer.from(parsed.iv, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    const ct = Buffer.from(parsed.ct, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('EnmEncryption.decrypt: malformed IV or tag length');
    }
    const key = getMasterKey();
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    // GCM throws here on auth failure (wrong key / tamper).
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
}

/**
 * Test-only: reset the cached key (forces re-read on next call). Not exported
 * by index — used inside this file's own vitest run.
 */
function _resetCacheForTests() {
    cachedKey = null;
}

module.exports = {
    encrypt,
    decrypt,
    getMasterKey,
    _resetCacheForTests,
};
