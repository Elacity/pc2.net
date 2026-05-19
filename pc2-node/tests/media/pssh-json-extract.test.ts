/**
 * Unit tests for `extractPSSHJson` — the box-walking PSSH decoder used by
 * `/api/media/init` to recover Elacity Lit-DRM protection payloads from an
 * fMP4 init segment.
 *
 * Covers both:
 *   • pc2-node-emitted inits (single pssh at end-of-moov, JSON payload with
 *     pc2-node key order).
 *   • bento4 `mp4dash`-emitted inits (ClearKey pssh + cenc:lit-aes-gcm-v3
 *     pssh under moov, JSON payload with alphabetically-sorted keys).
 *
 * The decoder must be structural (ISO/IEC 23001-7 §8.1 box walk), not
 * substring-marker-based — see the regression that motivated this test:
 * mp4dash payloads start with `{"algorithm":` (alphabetical first key), so
 * the previous marker scan returned 0 entries for bento4-packaged media.
 *
 * Run: tsx --test pc2-node/tests/media/pssh-json-extract.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { extractPSSHJson } from '../../src/services/media/psshJson.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Box helpers ────────────────────────────────────────────────────────

function box(type: string, content: Buffer): Buffer {
  const size = 8 + content.length;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(size, 0);
  out.write(type, 4, 4, 'ascii');
  content.copy(out, 8);
  return out;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

const LIT_SYSTEM_ID = Buffer.from('bf2c86c1d9ff4ab1b4be45ae4d99e1fe', 'hex');
const CLEARKEY_SYSTEM_ID = Buffer.from('1077efecc0b24d02ace33c1e52e2fb4b', 'hex');

/** Build a v0 pssh box with the given systemId and raw data. */
function psshV0(systemId: Buffer, data: Buffer): Buffer {
  const body = Buffer.concat([
    Buffer.from([0, 0, 0, 0]), // version + flags
    systemId,
    u32(data.length),
    data,
  ]);
  return box('pssh', body);
}

/** Build a v1 pssh box with KIDs[] and (optionally empty) data. */
function psshV1(systemId: Buffer, kids: Buffer[], data: Buffer): Buffer {
  const body = Buffer.concat([
    Buffer.from([1, 0, 0, 0]), // version=1, flags=0
    systemId,
    u32(kids.length),
    ...kids,
    u32(data.length),
    data,
  ]);
  return box('pssh', body);
}

const ftyp = box('ftyp', Buffer.concat([
  Buffer.from('isom', 'ascii'),
  u32(0x200),
  Buffer.from('isomavc1', 'ascii'),
]));

// ── Tests ──────────────────────────────────────────────────────────────

test('extracts Elacity pssh from real bento4 mp4dash init fixture', () => {
  const fixturePath = join(__dirname, 'fixtures', 'bento4-mp4dash-init.mp4');
  const init = readFileSync(fixturePath);

  const entries = extractPSSHJson(init);

  assert.equal(entries.length, 1, 'expected exactly one Elacity entry (ClearKey sibling is skipped)');
  assert.equal(entries[0].protectionType, 'cenc:lit-aes-gcm-v3');
  assert.equal(entries[0].data.actionIpfsId, 'QmPBjQD7V4aFTZPxUwZ9gDPFJtcJ4SvsJdTh3QexTyRBbj');
  assert.equal(entries[0].data.kid, '6214d1c6c17a5d07a841be6242e6240b');
  assert.equal(entries[0].data.litBackend, 'chipotle');
});

test('extracts pc2-node-style payload (in-moov, pc2-node key order)', () => {
  // pc2-node serialises with `protocolVersion` as the first key.
  const payload = JSON.stringify({
    protocolVersion: '3.0',
    protectionType: 'cenc:lit-aes-gcm-v3',
    variant: 'eth.web3.clearkey',
    algorithm: 'AES-128-CBC',
    data: {
      actionIpfsId: 'QmTest1234567890pc2nodePayloadShapeXYZ',
      litBackend: 'chipotle',
      chainId: 8453,
      authority: '0xAUTH',
      rpc: 'https://base.lava.build',
      kid: 'aabbccddeeff00112233445566778899',
      dataToEncryptHash: 'deadbeef',
      ciphertext: 'cafebabe',
      issuer: '0xISSUER',
      signature: 'sig',
      format: 'hex',
    },
  });

  const pssh = psshV0(LIT_SYSTEM_ID, Buffer.from(payload, 'utf8'));
  const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(100)), pssh]));
  const init = Buffer.concat([ftyp, moov]);

  const entries = extractPSSHJson(init);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].protectionType, 'cenc:lit-aes-gcm-v3');
  assert.equal(entries[0].data.actionIpfsId, 'QmTest1234567890pc2nodePayloadShapeXYZ');
});

test('extracts mp4dash-style payload with alphabetically-sorted keys (regression: marker scan bug)', () => {
  // The canonicalised order produced by the Lit encrypt path — `algorithm`
  // sorts first, so the old marker-based scan (`{"protocolVersion":` /
  // `{"data":{` / `{"protectionType":`) returned 0 entries for this shape.
  const payload = JSON.stringify({
    algorithm: 'AES-128-CBC',
    data: {
      actionIpfsId: 'QmCanonicalSortedPayloadActionId00000',
      authority: '0xAUTH',
      chainId: 8453,
      ciphertext: 'cipher',
      dataToEncryptHash: 'hash',
      format: 'hex',
      issuer: '0xISSUER',
      kid: 'ffeeddccbbaa99887766554433221100',
      litBackend: 'chipotle',
      rpc: 'https://base.lava.build',
      signature: 'sig',
    },
    protectionType: 'cenc:lit-aes-gcm-v3',
    protocolVersion: '3.0',
    variant: 'eth.web3.clearkey',
  });

  const pssh = psshV0(LIT_SYSTEM_ID, Buffer.from(payload, 'utf8'));
  const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(100)), pssh]));
  const init = Buffer.concat([ftyp, moov]);

  const entries = extractPSSHJson(init);
  assert.equal(entries.length, 1, 'must find pssh regardless of JSON key order');
  assert.equal(entries[0].protectionType, 'cenc:lit-aes-gcm-v3');
  assert.equal(entries[0].data.kid, 'ffeeddccbbaa99887766554433221100');
});

test('skips ClearKey-style pssh (v1, KIDs but empty data) emitted alongside by mp4dash', () => {
  const kid = Buffer.from('6214d1c6c17a5d07a841be6242e6240b', 'hex');
  const clearKeyPssh = psshV1(CLEARKEY_SYSTEM_ID, [kid], Buffer.alloc(0));

  const litPayload = JSON.stringify({
    algorithm: 'AES-128-CBC',
    data: { actionIpfsId: 'QmLitPayloadAlongsideClearKeyXYZ', kid: kid.toString('hex') },
    protectionType: 'cenc:lit-aes-gcm-v3',
    protocolVersion: '3.0',
  });
  const litPssh = psshV0(LIT_SYSTEM_ID, Buffer.from(litPayload, 'utf8'));

  const moov = box('moov', Buffer.concat([
    box('mvhd', Buffer.alloc(100)),
    clearKeyPssh,
    litPssh,
  ]));
  const init = Buffer.concat([ftyp, moov]);

  const entries = extractPSSHJson(init);
  assert.equal(entries.length, 1, 'ClearKey sibling must be silently skipped');
  assert.equal(entries[0].data.actionIpfsId, 'QmLitPayloadAlongsideClearKeyXYZ');
});

test('also accepts pssh at file-root (not just inside moov)', () => {
  const payload = JSON.stringify({
    data: { actionIpfsId: 'QmRootLevelPsshPayload' },
    protectionType: 'cenc:lit-aes-gcm-v3',
  });
  const pssh = psshV0(LIT_SYSTEM_ID, Buffer.from(payload, 'utf8'));
  const moov = box('moov', box('mvhd', Buffer.alloc(100)));
  const init = Buffer.concat([ftyp, moov, pssh]);

  const entries = extractPSSHJson(init);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].data.actionIpfsId, 'QmRootLevelPsshPayload');
});

test('returns [] for init with no pssh', () => {
  const moov = box('moov', box('mvhd', Buffer.alloc(100)));
  const init = Buffer.concat([ftyp, moov]);
  assert.deepEqual(extractPSSHJson(init), []);
});

test('returns [] for pssh whose JSON lacks data.actionIpfsId (foreign DRM payload shape)', () => {
  const foreignPayload = JSON.stringify({ widevine: { some: 'thing' } });
  const pssh = psshV0(LIT_SYSTEM_ID, Buffer.from(foreignPayload, 'utf8'));
  const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(100)), pssh]));
  const init = Buffer.concat([ftyp, moov]);
  assert.deepEqual(extractPSSHJson(init), []);
});

test('does not throw on a truncated pssh box', () => {
  // pssh with a dataSize header that overruns the remaining body
  const truncatedBody = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    LIT_SYSTEM_ID,
    u32(999999), // claims 1 MB of data
    Buffer.from('not-that-much', 'utf8'),
  ]);
  const pssh = box('pssh', truncatedBody);
  const moov = box('moov', Buffer.concat([box('mvhd', Buffer.alloc(100)), pssh]));
  const init = Buffer.concat([ftyp, moov]);

  assert.doesNotThrow(() => extractPSSHJson(init));
  assert.deepEqual(extractPSSHJson(init), []);
});

test('handles multiple Elacity pssh entries (e.g. unified + legacy SA payloads)', () => {
  const unifiedPayload = JSON.stringify({
    data: { actionIpfsId: 'QmUnifiedActionId' },
    protectionType: 'cenc:lit-aes-gcm-v3',
  });
  const saPayload = JSON.stringify({
    data: { actionIpfsId: 'QmSmartAccountActionId' },
    protectionType: 'cenc:lit-drm-sa-v1',
  });

  const moov = box('moov', Buffer.concat([
    box('mvhd', Buffer.alloc(100)),
    psshV0(LIT_SYSTEM_ID, Buffer.from(unifiedPayload, 'utf8')),
    psshV0(LIT_SYSTEM_ID, Buffer.from(saPayload, 'utf8')),
  ]));
  const init = Buffer.concat([ftyp, moov]);

  const entries = extractPSSHJson(init);
  assert.equal(entries.length, 2);
  const types = entries.map((e) => e.protectionType).sort();
  assert.deepEqual(types, ['cenc:lit-aes-gcm-v3', 'cenc:lit-drm-sa-v1']);
});
