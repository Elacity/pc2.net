#!/usr/bin/env node
/**
 * assemble-enm-entry.mjs — fold the two per-arch ENM capsule fragments produced
 * by pc2-node/scripts/package-app.mjs into ONE registry entry with per-arch
 * `distribution.variants`, and upsert it into pc2-node/registry/v1.2/_index.json.
 *
 * Why: ENM bundles the native module better-sqlite3, so it ships one capsule
 * per arch (linux-x64, linux-arm64). Each `package-app.mjs --arch <a>` run emits
 * a per-arch fragment manifest (with that arch's signature/size, cid empty).
 * After each tarball is pinned to IPFS and its CID captured, this script merges
 * both fragments + both CIDs into a single _index.json entry whose:
 *   - distribution.cid/signature/size  = the x64 bundle (back-compat default)
 *   - distribution.variants            = { linux-x64, linux-arm64 } with the
 *                                        per-arch cid + signature + size
 *   - distribution.signedBy            = the shared publisher key
 *
 * The supernode sync (deploy/app-registry/scripts/sync-from-pc2.mjs) then folds
 * the _index.json entry into registry.json verbatim — no change needed there.
 *
 * Usage:
 *   node deploy/app-registry/scripts/assemble-enm-entry.mjs \
 *     --x64-manifest   dist-app/elastos-node-manager-<ver>-linux-x64.json \
 *     --x64-cid        bafy...x64 \
 *     --arm64-manifest dist-app/elastos-node-manager-<ver>-linux-arm64.json \
 *     --arm64-cid      bafy...arm64 \
 *     [--index pc2-node/registry/v1.2/_index.json] [--dry-run]
 *
 * Nothing is pushed live: this only edits the local _index.json (or prints a
 * diff with --dry-run).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
// deploy/app-registry/scripts/ -> repoRoot = ../../..
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const DRY_RUN = process.argv.includes('--dry-run');

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

function loadJson(path) {
  if (!existsSync(path)) die(`${path} not found`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function requireArg(flag) {
  const v = getArg(flag);
  if (!v) die(`missing required arg ${flag}`);
  return v;
}

function main() {
  const x64ManifestPath   = resolve(requireArg('--x64-manifest'));
  const arm64ManifestPath = resolve(requireArg('--arm64-manifest'));
  const x64Cid   = requireArg('--x64-cid').trim();
  const arm64Cid = requireArg('--arm64-cid').trim();
  const indexPath = resolve(getArg('--index') || resolve(REPO_ROOT, 'pc2-node', 'registry', 'v1.2', '_index.json'));

  const x64   = loadJson(x64ManifestPath);
  const arm64 = loadJson(arm64ManifestPath);
  const index = loadJson(indexPath);

  // --- sanity: the two fragments must describe the SAME app + publisher ------
  if (x64.name !== arm64.name) die(`fragment name mismatch: ${x64.name} vs ${arm64.name}`);
  if (x64.version !== arm64.version) die(`fragment version mismatch: ${x64.version} vs ${arm64.version}`);
  const signedBy = x64.distribution?.signedBy;
  if (!signedBy) die('x64 fragment has no distribution.signedBy');
  if (arm64.distribution?.signedBy !== signedBy) {
    die(`signedBy mismatch between fragments (${signedBy} vs ${arm64.distribution?.signedBy})`);
  }
  if (index.publisher?.publicKey && index.publisher.publicKey !== signedBy) {
    die(`fragment signedBy (${signedBy}) does not match registry publisher.publicKey (${index.publisher.publicKey}). Wrong signing key?`);
  }
  for (const [label, frag] of [['x64', x64], ['arm64', arm64]]) {
    if (!frag.distribution?.signature) die(`${label} fragment missing distribution.signature`);
  }
  for (const [label, cid] of [['x64', x64Cid], ['arm64', arm64Cid]]) {
    if (!/^[a-zA-Z0-9]+$/.test(cid)) die(`${label} CID looks malformed: "${cid}"`);
  }

  // --- build the merged entry from the x64 fragment as the base -------------
  // Strip the per-arch-only scratch fields the packager wrote on the fragment
  // (os/arch were there to label the fragment; the merged entry uses variants).
  const { os: _os, arch: _arch, ...x64DistBase } = x64.distribution;

  const mergedDistribution = {
    ...x64DistBase,
    signedBy,
    // x64 is the back-compat default for clients that predate variants.
    cid: x64Cid,
    signature: x64.distribution.signature,
    size: x64.distribution.size,
    variants: {
      'linux-x64':   { cid: x64Cid,   signature: x64.distribution.signature,   size: x64.distribution.size },
      'linux-arm64': { cid: arm64Cid, signature: arm64.distribution.signature, size: arm64.distribution.size },
    },
  };

  // x64 fragment is the base manifest (identical to arm64 except distribution).
  const entry = { ...x64, distribution: mergedDistribution };

  // --- upsert into _index.json apps[] ---------------------------------------
  const apps = Array.isArray(index.apps) ? index.apps : [];
  const idx = apps.findIndex(a => a.name === entry.name);
  const action = idx >= 0 ? 'REPLACE' : 'APPEND';
  if (idx >= 0) apps[idx] = entry; else apps.push(entry);

  const out = { ...index, apps };

  console.log('=== assemble-enm-entry ===');
  console.log(`  app:        ${entry.name} ${entry.version}`);
  console.log(`  action:     ${action} in ${indexPath}`);
  console.log(`  signedBy:   ${signedBy}`);
  console.log(`  variants:`);
  console.log(`    linux-x64    cid=${x64Cid}    size=${x64.distribution.size}`);
  console.log(`    linux-arm64  cid=${arm64Cid}  size=${arm64.distribution.size}`);

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing. Entry preview:');
    console.log(JSON.stringify(entry.distribution, null, 2));
    return;
  }

  writeFileSync(indexPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${indexPath}`);
  console.log('Next: node deploy/app-registry/scripts/sync-from-pc2.mjs   (folds into registry.json)');
}

main();
