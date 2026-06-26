#!/usr/bin/env node
/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * anti-snipe-hash — operator CLI to generate the scrypt hash for
 * cfg.global.antiSnipePasswordHash without needing the Settings UI.
 *
 * Two modes:
 *
 *   1. Interactive (no args): prompts for password (echoed off),
 *      confirms via re-entry, prints the hash to stdout.
 *
 *        $ node scripts/anti-snipe-hash.js
 *        password:
 *        confirm:
 *        scrypt$abc123...$def456...
 *
 *   2. Piped (--stdin flag, password on stdin): one-shot for
 *      automated provisioning.
 *
 *        $ echo -n 'hunter22' | node scripts/anti-snipe-hash.js --stdin
 *        scrypt$abc123...$def456...
 *
 * Output goes to stdout (no other writes); errors go to stderr.
 * Exit codes: 0 on success, 1 on validation failure, 2 on
 * unexpected error.
 *
 * The hash format matches SelfHealingEngine._verifyAntiSnipePassword
 * exactly:  scrypt$<saltHex>$<derivedHex>  (16-byte salt, 64-byte
 * derived key).
 *
 * WHEN TO USE:
 *   - Headless / SSH provisioning where opening the Settings UI is
 *     impractical (write the hash directly into config.json or POST
 *     to /config/anti-snipe-password from a deploy script).
 *   - Rotation: generate-then-POST as a one-liner.
 *
 * 0.2.0-beta.3.11.
 */

'use strict';

const crypto = require('crypto');
const readline = require('readline');

const SALT_BYTES = 16;
const DERIVED_BYTES = 64;
const MIN_LENGTH = 8;
const MAX_LENGTH = 256;

function bail(code, msg) {
    if (msg) { process.stderr.write(msg + '\n'); }
    process.exit(code);
}

function validatePassword(password) {
    if (typeof password !== 'string') { return 'Password must be a string.'; }
    if (password.length < MIN_LENGTH) { return `Password must be at least ${MIN_LENGTH} characters.`; }
    if (password.length > MAX_LENGTH) { return `Password must be at most ${MAX_LENGTH} characters.`; }
    return null;
}

function hash(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(SALT_BYTES);
        crypto.scrypt(password, salt, DERIVED_BYTES, (err, derived) => {
            if (err) { reject(err); return; }
            resolve('scrypt$' + salt.toString('hex') + '$' + derived.toString('hex'));
        });
    });
}

async function readFromStdin() {
    return new Promise((resolve, reject) => {
        let buf = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { buf += chunk; });
        process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
        process.stdin.on('error', reject);
    });
}

async function readInteractive(promptText) {
    // node-builtin prompt: hide echo with raw mode + manual handling.
    // Falls back to plain readline if not a TTY (shouldn't happen since
    // we already routed piped input through --stdin).
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stderr,
            });
            rl.question(promptText, (ans) => { rl.close(); resolve(ans); });
            return;
        }
        process.stderr.write(promptText);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        let buf = '';
        const onData = (key) => {
            // Ctrl-C / Ctrl-D
            if (key === '' || key === '') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', onData);
                process.stderr.write('\n');
                reject(new Error('cancelled'));
                return;
            }
            // Enter
            if (key === '\r' || key === '\n') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', onData);
                process.stderr.write('\n');
                resolve(buf);
                return;
            }
            // Backspace (handle both DEL and BS)
            if (key === '' || key === '\b') {
                buf = buf.slice(0, -1);
                return;
            }
            buf += key;
        };
        process.stdin.on('data', onData);
    });
}

async function main() {
    const args = process.argv.slice(2);
    const stdinMode = args.includes('--stdin');
    const help = args.includes('--help') || args.includes('-h');
    if (help) {
        process.stderr.write([
            'anti-snipe-hash — generate scrypt hash for cfg.global.antiSnipePasswordHash',
            '',
            'Usage:',
            '  node scripts/anti-snipe-hash.js              # interactive (TTY prompt)',
            '  echo -n "password" | node ... --stdin        # read from stdin',
            '',
            'Output: a single line of the form  scrypt$<saltHex>$<derivedHex>',
            '',
            'See SelfHealingEngine._verifyAntiSnipePassword for the verify side.',
        ].join('\n') + '\n');
        return bail(0);
    }

    let password;
    try {
        if (stdinMode) {
            password = await readFromStdin();
        } else {
            password = await readInteractive('password: ');
            const confirm = await readInteractive('confirm:  ');
            if (password !== confirm) { return bail(1, 'Passwords do not match.'); }
        }
    } catch (err) {
        return bail(2, `Failed to read password: ${err.message || err}`);
    }

    const validationError = validatePassword(password);
    if (validationError) { return bail(1, validationError); }

    let result;
    try {
        result = await hash(password);
    } catch (err) {
        return bail(2, `scrypt failed: ${err.message || err}`);
    }
    process.stdout.write(result + '\n');
}

main().catch((err) => bail(2, err && err.stack || String(err)));
