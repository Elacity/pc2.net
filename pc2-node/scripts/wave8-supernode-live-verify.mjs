#!/usr/bin/env node
/**
 * Wave 8 (H-01.2) — Live supernode probe.
 *
 * Fetches the provision envelope from each supernode and verifies the
 * signature using the pinned pubkey in chipotle-client.ts. This catches
 * drift between the supernode's installed private key and the pubkey
 * PC2 trusts — the most-likely way this trust chain breaks in practice.
 *
 * No request body, no session state; runs safely in any environment with
 * network access to the supernodes.
 */

import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import https from 'node:https';

const __here = dirname(fileURLToPath(import.meta.url));

const SUPERNODES = [
  'https://69.164.241.210/api/ddrm/provision',
  'https://38.242.211.112/api/ddrm/provision',
];
// The supernodes are addressed by IP but serve the *.ela.city certificate.
const SUPERNODE_TLS_SERVERNAME = 'supernode.ela.city';

const PROVISION_ENVELOPE_DOMAIN = 'elacity.pc2.chipotle-provision.v1';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function readPinnedPubKey() {
  const src = readFileSync(join(__here, '../src/api/chipotle-client.ts'), 'utf8');
  const match = src.match(/ELACITY_LABS_PROVISION_PUBKEY_HEX\s*=\s*\n?\s*'([0-9a-fA-F]{64})'/);
  if (!match) throw new Error('Could not locate pinned pubkey in chipotle-client.ts');
  return match[1].toLowerCase();
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { servername: SUPERNODE_TLS_SERVERNAME, timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`http_${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function probe(url, pubKeyHex) {
  let text;
  try {
    text = await httpsGet(url);
  } catch (e) {
    return { ok: false, reason: `network:${e.message}` };
  }
  let env;
  try { env = JSON.parse(text); } catch { return { ok: false, reason: 'body_not_json' }; }

  if (env.v !== 1 || env.domain !== PROVISION_ENVELOPE_DOMAIN) {
    return { ok: false, reason: 'envelope_bad_domain_or_version' };
  }
  if (typeof env.signedAt !== 'number') return { ok: false, reason: 'bad_signedAt' };

  const ageSec = Math.floor(Date.now() / 1000) - env.signedAt;
  if (Math.abs(ageSec) > 90 * 86400) {
    return { ok: false, reason: `stale:${ageSec}s` };
  }

  const { sig, ...signed } = env;
  const sigBytes = Buffer.from(sig, 'base64');
  if (sigBytes.length !== 64) return { ok: false, reason: 'sig_length' };

  const spki = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(pubKeyHex, 'hex')]);
  const pub = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  const msg = Buffer.from(canonicalize(signed), 'utf8');
  const verified = verify(null, msg, pub, sigBytes);

  if (!verified) return { ok: false, reason: 'signature_invalid' };
  return { ok: true, signedAt: env.signedAt, ageSec, apiUrl: env.payload?.apiUrl };
}

const pubKeyHex = readPinnedPubKey();
console.log(`\nWave 8 live supernode probe`);
console.log(`  Pinned pubkey (first 16 hex): ${pubKeyHex.substring(0, 16)}…\n`);

let failed = 0;
for (const url of SUPERNODES) {
  const r = await probe(url, pubKeyHex);
  if (r.ok) {
    console.log(`  \x1b[32m✓\x1b[0m ${url}`);
    console.log(`      signedAt=${r.signedAt} (age ${r.ageSec}s), payload.apiUrl=${r.apiUrl}`);
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${url}`);
    console.log(`      reason: ${r.reason}`);
    failed++;
  }
}

console.log('');
if (failed > 0) {
  console.log(`  \x1b[31m${failed}/${SUPERNODES.length} supernodes failed verification\x1b[0m`);
  process.exit(1);
}
console.log(`  \x1b[32m${SUPERNODES.length}/${SUPERNODES.length} supernodes verified\x1b[0m`);
process.exit(0);
