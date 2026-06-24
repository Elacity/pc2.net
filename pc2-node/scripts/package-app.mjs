#!/usr/bin/env node
/**
 * package-app.mjs — packages Elastos Node Manager as a service-type
 * app bundle for the dApp Store.
 *
 * What it produces:
 *   dist-app/elastos-node-manager-<version>.tar.gz   (frontend + backend + manifest)
 *   dist-app/elastos-node-manager-<version>.json     (signed manifest, ready for /install)
 *   .pc2-dev-key.json                                (Ed25519 keypair, generated once)
 *
 * Bundle layout inside the tarball:
 *   index.html, css/, js/, assets/   (frontend, served at root by pc2-node)
 *   backend/                         (Node service, spawned by AppProcessManager)
 *     package.json
 *     src/server.js
 *     node_modules/                  (production deps, bundled for self-contained install)
 *
 * Compatible with the install path landed in this branch:
 *   - manifest.type === 'service'
 *   - distribution.signature signed by a key in PC2_TRUSTED_SERVICE_PUBLISHERS
 *   - bundle hash signed by Node's crypto.sign(null, hash, ed25519PrivateKey),
 *     which is wire-compatible with tweetnacl.sign.detached.verify on the
 *     pc2-node side (verifyDistributionSignature in AppInstallService.ts).
 *
 * Dev usage (from repo root):
 *   node pc2-node/scripts/package-app.mjs
 *
 * Set PC2_DEV_KEY_PATH to reuse a key across runs (otherwise the script
 * generates a fresh one and saves it to .pc2-dev-key.json at the repo root).
 *
 * Production: replace the dev key with the ElacityLabs production publisher
 * key (HSM-backed), and change channel to 'stable'. Out of scope for this
 * script.
 */

'use strict';

import {
    readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync,
    readdirSync, mkdtempSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as cryptoSign, createPrivateKey, createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as tar from 'tar';

// =============================================================================
// Configuration (ENM-specific)
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');

const APP_NAME             = 'elastos-node-manager';
const APP_TITLE            = 'Elastos Node Manager';
const APP_DESCRIPTION      = 'Run and self-heal an Elastos mainchain node for BPoS supernode operators.';
const APP_AUTHOR           = 'Elacity';
const APP_CATEGORY         = 'blockchain';
const APP_ICON             = 'assets/icon.svg';
const FRONTEND_DIR         = join(REPO_ROOT, 'src', 'backend', 'apps', 'elastos-node-manager');
const BACKEND_DIR          = join(REPO_ROOT, 'enm-server');
const OUT_DIR              = join(REPO_ROOT, 'dist-app');
const KEY_FILE             = process.env.PC2_DEV_KEY_PATH || join(REPO_ROOT, '.pc2-dev-key.json');

const SERVICE_PORT         = 4180;
const SERVICE_BACKEND_ENTRY = 'backend/src/server.js';
const SERVICE_HEALTH_PATH   = '/api/enm/health';

// Files we always exclude from the backend portion of the bundle (build
// artifacts, dev-only docs, tests). The frontend is shipped as-is.
const BACKEND_EXCLUDES = ['.git', 'tests', '__tests__', 'Dockerfile', 'docs'];

// =============================================================================
// Main
// =============================================================================

function main() {
    sanityCheck();

    const version = readBackendVersion();
    log(`[1/6] Packaging ${APP_NAME}-${version}`);

    log(`[2/6] Installing backend production deps…`);
    execSync('npm install --omit=dev --no-audit --no-fund', {
        cwd: BACKEND_DIR,
        stdio: 'inherit',
    });

    const stage = mkdtempSync(join(tmpdir(), `pkg-${APP_NAME}-`));
    try {
        log(`[3/6] Staging frontend + backend at ${stage}`);
        stageBundle(stage);

        log(`[4/6] Building tarball`);
        mkdirSync(OUT_DIR, { recursive: true });
        const bundlePath = join(OUT_DIR, `${APP_NAME}-${version}.tar.gz`);
        tar.c({
            gzip: true,
            cwd: stage,
            file: bundlePath,
            sync: true,
        }, readdirSync(stage));

        log(`[5/6] Signing bundle`);
        const { signatureHex, publisherHex } = signBundle(bundlePath);

        log(`[6/6] Writing signed manifest`);
        const manifest = buildManifest({ version, signatureHex, publisherHex });
        const manifestPath = join(OUT_DIR, `${APP_NAME}-${version}.json`);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

        printSummary({ bundlePath, manifestPath, publisherHex });
    } finally {
        try { rmSync(stage, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

// =============================================================================
// Helpers
// =============================================================================

function sanityCheck() {
    if (!existsSync(FRONTEND_DIR)) die(`Frontend not found at ${FRONTEND_DIR}`);
    if (!existsSync(BACKEND_DIR))  die(`Backend not found at ${BACKEND_DIR}`);
    if (!existsSync(join(BACKEND_DIR, 'src', 'server.js'))) {
        die(`Expected backend entry at ${join(BACKEND_DIR, 'src', 'server.js')} — adjust SERVICE_BACKEND_ENTRY if moved.`);
    }
}

function readBackendVersion() {
    const pkg = JSON.parse(readFileSync(join(BACKEND_DIR, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
}

function stageBundle(stage) {
    // Frontend at bundle root
    cpSync(FRONTEND_DIR, stage, { recursive: true });

    // Backend under bundle/backend
    cpSync(BACKEND_DIR, join(stage, 'backend'), { recursive: true });

    // Drop dev-only files from the backend copy
    for (const ex of BACKEND_EXCLUDES) {
        const path = join(stage, 'backend', ex);
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    }

    // Drop node_modules/.bin — its entries are symlinks like
    //   .bin/mime -> /home/runner/work/.../node_modules/mime/cli.js
    // pointing to wherever npm install was run (the CI runner or the
    // dev's Mac). After extraction on a different host, those targets
    // don't exist and pc2-node's installFromLocal blows up trying to
    // open them. We don't run any of these CLIs at runtime — we only
    // require() packages, which never goes through .bin — so dropping
    // the directory is safe and keeps the bundle host-agnostic.
    const binDir = join(stage, 'backend', 'node_modules', '.bin');
    if (existsSync(binDir)) rmSync(binDir, { recursive: true, force: true });
}

function signBundle(bundlePath) {
    const bundleBuffer = readFileSync(bundlePath);
    const bundleHash = createHash('sha256').update(bundleBuffer).digest();

    const { privateKey, publicKey } = loadOrGenerateKeypair();

    // Ed25519 detached signature over the SHA-256 of the tarball bytes.
    // Wire format (64 bytes) matches what tweetnacl.sign.detached produces,
    // so pc2-node's verifyDistributionSignature accepts it.
    const signatureBytes = cryptoSign(null, bundleHash, privateKey);

    // Extract raw 32-byte public key from SPKI DER (12-byte prefix + key).
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);

    return {
        signatureHex: signatureBytes.toString('hex'),
        publisherHex: rawPublicKey.toString('hex'),
    };
}

function loadOrGenerateKeypair() {
    if (existsSync(KEY_FILE)) {
        const stored = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
        return {
            privateKey: createPrivateKey({ key: stored.privatePem, format: 'pem' }),
            publicKey:  createPublicKey({ key: stored.publicPem, format: 'pem' }),
        };
    }
    const kp = generateKeyPairSync('ed25519');
    const stored = {
        publicPem:  kp.publicKey.export({ format: 'pem', type: 'spki' }),
        privatePem: kp.privateKey.export({ format: 'pem', type: 'pkcs8' }),
        generatedAt: new Date().toISOString(),
        note: 'DEV KEYPAIR — never use for production. Replace with HSM-backed key in prod.',
    };
    writeFileSync(KEY_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });
    log(`(generated fresh dev keypair, saved to ${KEY_FILE})`);
    return kp;
}

function buildManifest({ version, signatureHex, publisherHex }) {
    return {
        name: APP_NAME,
        title: APP_TITLE,
        version,
        description: APP_DESCRIPTION,
        author: APP_AUTHOR,
        type: 'service',
        category: APP_CATEGORY,
        role: 'dapp', // optional install (vs. 'system' which ships baked into PC2)
        icon: APP_ICON,
        entry: 'index.html',
        // alpha.24: declare initial window dimensions so PC2's launcher
        // opens ENM at a usable size rather than the 960x560 fallback.
        // Most settings panels need 1024+ for sane label/input layout;
        // 1200x800 gives breathing room without being so large that
        // small monitors can't fit it. PC2 reads this from
        // app_info.metadata.window_size at launch.
        display: {
            width: 1200,
            height: 800,
            resizable: true,
        },
        backend: {
            entry: SERVICE_BACKEND_ENTRY,
            port: SERVICE_PORT,
            healthCheck: SERVICE_HEALTH_PATH,
            // pc2-node calls this BEFORE SIGTERM on uninstall (purge mode)
            // so ENM can copy keystore.dat to PC2's data root before its
            // dirs are nuked. Without this, an uninstall would lose the
            // operator's BPoS supernode key — unrecoverable.
            teardown: {
                endpoint: '/api/enm/teardown',
                timeoutMs: 30_000,
            },
        },
        capabilities: {
            network: true,
        },
        // Paths ENM writes to OUTSIDE its bundle dir — pc2-node deletes
        // these on purge-uninstall. Chain data, audit DB, downloaded
        // binaries, ENM's settings DB all live here. Keystore lives here
        // too but the teardown hook above copies it to a safe location
        // BEFORE this purge runs.
        //
        // The ${PC2_DATA_DIR} placeholder resolves at uninstall time to
        // the operator's PC2_DATA_DIR env (default /var/lib/pc2/data).
        // ENM's DataDir.js puts its data root at
        // ${PC2_DATA_DIR}/extensions/elastos-node-manager/, which is
        // what we wipe.
        externalDataDirs: ['${PC2_DATA_DIR}/extensions/elastos-node-manager'],
        distribution: {
            // Populate `cid` after uploading the tarball to IPFS. The dApp
            // Store catalog reads this manifest verbatim and POSTs it to
            // /api/installed-apps/install along with the CID body field.
            cid: '',
            signature: signatureHex,
            signedBy: publisherHex,
            channel: 'beta',
        },
    };
}

function printSummary({ bundlePath, manifestPath, publisherHex }) {
    const banner = '─'.repeat(60);
    process.stderr.write(`
${banner}
✅ Done.

Bundle:     ${bundlePath}
Manifest:   ${manifestPath}
Publisher:  ${publisherHex}

Next steps:
  1. Upload the .tar.gz to IPFS, capture the CID.
     ipfs add "${bundlePath}"

  2. Edit the manifest and set distribution.cid to that CID.

  3. On the PC2 host, set the trusted publisher env var:
     PC2_TRUSTED_SERVICE_PUBLISHERS=${publisherHex}
     systemctl restart pc2-node

  4. Either: list the {manifest, cid} pair in the dApp Store catalog
     (apps.ela.city) so users see an Install tile,
     or: directly install via curl —

     curl -X POST http://<host>/api/installed-apps/install \\
       -H 'Authorization: Bearer <owner-token>' \\
       -H 'Content-Type: application/json' \\
       -d '{"manifest": <paste manifest>, "cid": "<paste cid>"}'

${banner}
`);
}

function log(msg) { process.stderr.write(`[package-app] ${msg}\n`); }
function die(msg) { log(`ERROR: ${msg}`); process.exit(1); }

// =============================================================================
// Entry
// =============================================================================

try {
    main();
} catch (err) {
    log(`FAILED: ${err.message}`);
    if (err.stack) process.stderr.write(err.stack + '\n');
    process.exit(1);
}
