#!/usr/bin/env node
/**
 * package-app.mjs — packages Elastos Node Manager as a service-type
 * app bundle for the dApp Store.
 *
 * What it produces (PER target arch — see --arch below):
 *   dist-app/elastos-node-manager-<version>-<os>-<arch>.tar.gz  (frontend + backend)
 *   dist-app/elastos-node-manager-<version>-<os>-<arch>.json    (signed per-arch manifest fragment)
 *   .pc2-dev-key.json                                           (DEV Ed25519 keypair, generated once)
 *
 * Multi-arch: ENM's backend bundles the NATIVE module better-sqlite3, whose
 * .node binary is arch-specific. Build one bundle per arch ON A HOST OF THAT
 * ARCH (the build-enm-bundle.yml CI matrix uses x64 + native arm64 runners),
 * then fold both into one registry entry with per-arch `distribution.variants`.
 *
 * Flags / env:
 *   --arch x64|arm64        target arch (default: host arch). Must match the
 *                           build host unless --allow-cross-arch is given.
 *   --os linux              target OS (default: linux; only linux supported).
 *   --seed-file <path>      file holding a 64-hex Ed25519 seed to sign with
 *   PC2_SIGNING_SEED_FILE   same as --seed-file (env form, for CI secrets)
 *   PC2_SIGNING_SEED_HEX    inline 64-hex Ed25519 seed (env form)
 *   (no seed) → falls back to .pc2-dev-key.json (DEV ONLY).
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

// --- Multi-arch packaging ---------------------------------------------------
// ENM's backend bundles `better-sqlite3`, a NATIVE module whose compiled
// .node binary is architecture-specific. A bundle built on x64 will NOT run on
// arm64 (Jetson / Raspberry Pi) and vice-versa. We therefore build ONE bundle
// PER target arch — each on a host of that arch (CI matrix / native runner) —
// and publish them as per-arch variants in the registry. The published
// manifest advertises BOTH arches via requirements.platform; pc2-node's dApp
// Centre picks the variant matching the host arch at install time.
const SUPPORTED_TARGET_ARCHES = ['x64', 'arm64'];
const TARGET_OS   = (getArg('--os')   || process.env.PC2_TARGET_OS   || 'linux');
const TARGET_ARCH = (getArg('--arch') || process.env.PC2_TARGET_ARCH || process.arch);
const ALLOW_CROSS_ARCH = process.argv.includes('--allow-cross-arch');

// requirements.platform advertised in the published manifest — the UNION of
// arches we ship, so the dApp Centre gates macOS/Windows OUT but allows Linux
// x64 + arm64. The 50 GB disk floor lives in `reason` (the schema gates on RAM,
// not disk, but operators need to see the real constraint).
const PLATFORM_REQUIREMENT = {
    os: ['linux'],
    arch: ['x64', 'arm64'],
    minMemoryMB: 4096,
    reason: 'Elastos Node Manager runs native Linux node binaries (x86_64 / arm64) and needs at least 50 GB of free disk for chain data. It is not available on macOS or Windows.',
};
const MIN_PC2_VERSION = '1.1.0';

// Files we always exclude from the backend portion of the bundle (build
// artifacts, dev-only docs, tests). The frontend is shipped as-is.
const BACKEND_EXCLUDES = ['.git', 'tests', '__tests__', 'Dockerfile', 'docs'];

// =============================================================================
// Main
// =============================================================================

function main() {
    sanityCheck();

    const version = readBackendVersion();
    const baseName = `${APP_NAME}-${version}-${TARGET_OS}-${TARGET_ARCH}`;
    log(`[1/6] Packaging ${baseName} (host arch=${process.arch})`);

    log(`[2/6] Installing backend production deps (native better-sqlite3 → ${TARGET_ARCH})…`);
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
        const bundlePath = join(OUT_DIR, `${baseName}.tar.gz`);
        tar.c({
            gzip: true,
            cwd: stage,
            file: bundlePath,
            sync: true,
        }, readdirSync(stage));

        log(`[5/6] Signing bundle`);
        const { signatureHex, publisherHex, size } = signBundle(bundlePath);

        log(`[6/6] Writing signed manifest`);
        const manifest = buildManifest({ version, signatureHex, publisherHex, size });
        const manifestPath = join(OUT_DIR, `${baseName}.json`);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

        printSummary({ bundlePath, manifestPath, publisherHex, baseName });
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
    if (!SUPPORTED_TARGET_ARCHES.includes(TARGET_ARCH)) {
        die(`Unsupported --arch "${TARGET_ARCH}". Supported: ${SUPPORTED_TARGET_ARCHES.join(', ')}.`);
    }
    // The backend bundles a NATIVE module (better-sqlite3). `npm install` builds
    // it for the HOST arch, so a bundle is only valid if built on a host whose
    // arch matches the target. Refuse a cross-arch build (which would silently
    // bake the wrong .node and crash on the target) unless explicitly forced.
    if (TARGET_ARCH !== process.arch && !ALLOW_CROSS_ARCH) {
        die(
            `Refusing to build a ${TARGET_ARCH} bundle on a ${process.arch} host — the bundled ` +
            `native better-sqlite3 binary would be ${process.arch} and crash on ${TARGET_ARCH}. ` +
            `Build on a ${TARGET_ARCH} host (CI matrix / native runner), or pass --allow-cross-arch ` +
            `ONLY if you have separately ensured node_modules holds a ${TARGET_ARCH} prebuild.`,
        );
    }
    if (TARGET_OS !== 'linux') {
        die(`Only --os linux is supported for ENM (got "${TARGET_OS}"). The Elastos node binaries are Linux-only.`);
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
        size: bundleBuffer.length,
    };
}

function loadOrGenerateKeypair() {
    // Production path: sign with a raw 32-byte Ed25519 seed (64 hex chars),
    // e.g. the Elacity Labs publisher key. Provide it as a file (--seed-file /
    // PC2_SIGNING_SEED_FILE) or inline (PC2_SIGNING_SEED_HEX). We wrap the seed
    // in the fixed Ed25519 PKCS#8 DER prefix so Node's crypto can load it; the
    // derived public key MUST match the registry's trusted publisher.
    const seedFile = getArg('--seed-file') || process.env.PC2_SIGNING_SEED_FILE;
    const seedHex = (seedFile ? readFileSync(seedFile, 'utf8') : (process.env.PC2_SIGNING_SEED_HEX || '')).trim();
    if (seedHex) {
        if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) {
            die('Signing seed must be exactly 64 hex chars (a 32-byte Ed25519 seed).');
        }
        const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
        const pkcs8 = Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seedHex, 'hex')]);
        const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
        const publicKey = createPublicKey(privateKey);
        log('(signing with provided Ed25519 seed)');
        return { privateKey, publicKey };
    }
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

function buildManifest({ version, signatureHex, publisherHex, size }) {
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
        // Device-compatibility gate (read by pc2-node's AppInstallService +
        // the dApp Centre). ENM is Linux-only and ships per-arch native
        // binaries, so macOS/Windows hosts are blocked and only x64 + arm64
        // Linux (VPS, Jetson, Raspberry Pi) are offered. minVersion gates old
        // PC2 builds that predate service-app support.
        requirements: {
            minVersion: MIN_PC2_VERSION,
            platform: PLATFORM_REQUIREMENT,
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
            //
            // This is the PER-ARCH fragment for `${TARGET_OS}-${TARGET_ARCH}`.
            // The catalog-assembly step (assemble-enm-entry.mjs) folds the
            // x64 + arm64 fragments into a single registry entry whose `distribution.cid`
            // is the x64 default (back-compat) and whose `distribution.variants`
            // map carries the per-arch {cid, signature, size}. The installer
            // then picks the variant matching the host arch.
            cid: '',
            signature: signatureHex,
            signedBy: publisherHex,
            channel: 'beta',
            os: TARGET_OS,
            arch: TARGET_ARCH,
            size,
        },
    };
}

function printSummary({ bundlePath, manifestPath, publisherHex, baseName }) {
    const banner = '─'.repeat(60);
    const otherArch = TARGET_ARCH === 'x64' ? 'arm64' : 'x64';
    process.stderr.write(`
${banner}
✅ Done — built the ${TARGET_OS}-${TARGET_ARCH} variant.

Bundle:     ${bundlePath}
Manifest:   ${manifestPath}   (per-arch fragment)
Publisher:  ${publisherHex}

This is ONE arch. ENM ships per-arch (native better-sqlite3), so you also need
the ${otherArch} bundle, built on a ${otherArch} Linux host:

  PC2_SIGNING_SEED_FILE=<seed> node pc2-node/scripts/package-app.mjs --arch ${otherArch}

Then, to publish BOTH as one catalog entry:
  1. Pin each tarball to IPFS, capture the per-arch CIDs:
     ipfs add "${bundlePath}"            # ${TARGET_ARCH}
     ipfs add "<the ${otherArch} tarball>"   # ${otherArch}

  2. Run the catalog-assembly step to fold both fragments into one registry
     entry (distribution.variants[linux-x64|linux-arm64]):
     node deploy/app-registry/scripts/assemble-enm-entry.mjs \\
       --x64-manifest <x64.json> --x64-cid <x64-cid> \\
       --arm64-manifest <arm64.json> --arm64-cid <arm64-cid>
     node deploy/app-registry/scripts/sync-from-pc2.mjs   # then fold into registry.json

  3. On the PC2 host, trust the publisher (stable across builds because we sign
     with the fixed Elacity Labs seed):
     PC2_TRUSTED_SERVICE_PUBLISHERS=${publisherHex}
     systemctl restart pc2-node

  The dApp Centre then offers ENM only on Linux x64/arm64 (Jetson/Pi/VPS) and
  installs the variant matching each host's architecture.

${banner}
`);
}

function log(msg) { process.stderr.write(`[package-app] ${msg}\n`); }
function die(msg) { log(`ERROR: ${msg}`); process.exit(1); }

// Tiny `--flag value` reader (function declaration → hoisted, so it is safe to
// call from the const initializers near the top of the module).
function getArg(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

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
