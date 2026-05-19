/**
 * Fixture-driven CENC PSSH conformance tests.
 *
 * These tests load real per-Representation init segments produced by the
 * post-fix DASH packager (CID `bafybeienaomsfl56lvg6e74xsp76546dalhrywlb3boq5tj4vbqubmknsm`,
 * minted 2026-05-18) and assert the structural properties that make the
 * media playable across libav-based and MSE-based clients.
 *
 * Both fixtures (~1.6 KB each) are vendored in `fixtures/` so this test
 * runs without network access. Each fixture passed the load-bearing
 * libav C harness extraction (tools/verify-pssh-libav/verify-pssh) at
 * vendoring time.
 *
 * Tracked: MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
 * See docs/core/CENC_PACKAGING_COMPLIANCE.md.
 *
 * Run: tsx --test pc2-node/tests/media/pssh-fixture.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Buffer } from 'buffer';

import { extractFirstPSSHBox } from '../../src/services/media/dashPackager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, 'fixtures');

const ELACITY_SYSTEM_ID_HEX = 'bf2c86c1d9ff4ab1b4be45ae4d99e1fe';

// ── Box walk helpers ──────────────────────────────────────────────────

interface Box { type: string; start: number; size: number; }

function findBoxes(buf: Buffer, parentStart: number, parentEnd: number): Box[] {
  const boxes: Box[] = [];
  let pos = parentStart;
  while (pos + 8 <= parentEnd) {
    const size = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (size < 8 || pos + size > parentEnd) break;
    boxes.push({ type, start: pos, size });
    pos += size;
  }
  return boxes;
}

/**
 * Locate a box by 4cc anywhere within [start, end) of `buf` by scanning
 * for the literal 4-byte type marker preceded by a plausible size field.
 * Box-tree-aware container types (stsd, sample entries, ...) embed
 * codec-specific headers between the container start and the first
 * child, so a true recursive walk would need per-type offset tables.
 * For conformance assertions we only care WHETHER a box is present and
 * where it starts — a byte scan is sufficient and reliable because the
 * 4cc strings we test for (`encv`, `enca`, `sinf`, `tenc`, `frma`) do
 * not collide with codec sample data.
 */
function findBoxByMarker(buf: Buffer, start: number, end: number, type: string): Box | null {
  const marker = Buffer.from(type, 'ascii');
  // 4cc lives at offset 4 of a box (size:u32 then type:4cc). Scan for it.
  for (let pos = start + 4; pos + 4 <= end; pos++) {
    if (buf[pos] === marker[0] && buf[pos + 1] === marker[1]
      && buf[pos + 2] === marker[2] && buf[pos + 3] === marker[3]) {
      const boxStart = pos - 4;
      if (boxStart < start) continue;
      const size = buf.readUInt32BE(boxStart);
      if (size >= 8 && boxStart + size <= end) {
        return { type, start: boxStart, size };
      }
    }
  }
  return null;
}

// ── Tests ─────────────────────────────────────────────────────────────

// Audio fixture is NOT vendored yet — the in-tree video init is post-fix
// (structurally identical pre- and post-multi-trak-transform since video was
// already the first trak), but a clean audio fixture requires a re-mint with
// the multi-trak-transform fix active in production. Drop the latest CID into
// fixtures/audio-init-post-fix.mp4 to re-enable the audio assertions.
// See MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
for (const [label, file, expectedEntryType, expectedOrigFormat] of [
  ['video', 'video-init-post-fix.mp4', 'encv', 'av01'] as const,
]) {
  test(`${label} fixture: declares encryption (enc${label === 'video' ? 'v' : 'a'} + sinf + tenc)`, () => {
    const buf = readFileSync(join(FIXTURES, file));

    // No top-level pssh (MSE rejects it).
    const topLevel = findBoxes(buf, 0, buf.length);
    const rootPssh = topLevel.find(b => b.type === 'pssh');
    assert.equal(rootPssh, undefined, `${label} fixture must not have top-level pssh`);

    // moov present.
    const moov = topLevel.find(b => b.type === 'moov');
    assert.ok(moov, `${label} fixture missing moov`);

    // pssh is the LAST child of moov.
    const moovChildren = findBoxes(buf, moov.start + 8, moov.start + moov.size);
    const lastChild = moovChildren[moovChildren.length - 1];
    assert.equal(lastChild?.type, 'pssh', `${label} fixture: last moov child must be pssh, got ${lastChild?.type}`);

    // Sample entry is the encrypted form (encv / enca), NOT the cleartext form (av01 / mp4a).
    const sampleEntry = findBoxByMarker(buf, moov.start + 8, moov.start + moov.size, expectedEntryType);
    assert.ok(sampleEntry, `${label} fixture: missing ${expectedEntryType} sample entry — multi-trak transform regression?`);

    const cleartextEntry = findBoxByMarker(buf, moov.start + 8, moov.start + moov.size, expectedOrigFormat);
    assert.equal(cleartextEntry, null, `${label} fixture: cleartext ${expectedOrigFormat} entry must not coexist with ${expectedEntryType}`);

    // sinf / schm / schi / tenc all present somewhere under enc{v,a}.
    for (const required of ['sinf', 'frma', 'schm', 'schi', 'tenc']) {
      const found = findBoxByMarker(buf, sampleEntry.start + 8, sampleEntry.start + sampleEntry.size, required);
      assert.ok(found, `${label} fixture: missing ${required} inside ${expectedEntryType}`);
    }

    // frma carries the original format (av01 / mp4a).
    const frma = findBoxByMarker(buf, sampleEntry.start + 8, sampleEntry.start + sampleEntry.size, 'frma');
    const frmaPayload = buf.subarray(frma!.start + 8, frma!.start + 12).toString('ascii');
    assert.equal(frmaPayload, expectedOrigFormat, `${label} frma must declare original format ${expectedOrigFormat}`);

    // tenc: u8 reserved(1) + u8 reserved+crypt_byte_block(1) + u8 default_isProtected
    //       + u8 default_per_sample_iv_size + 16-byte default_KID
    const tenc = findBoxByMarker(buf, sampleEntry.start + 8, sampleEntry.start + sampleEntry.size, 'tenc');
    assert.ok(tenc, `${label} fixture: missing tenc`);
    const tencContent = tenc.start + 8 + 4; // box header + fullbox version/flags
    assert.equal(buf[tencContent + 2], 1, `${label} tenc.default_isProtected must be 1`);
    assert.equal(buf[tencContent + 3], 8, `${label} tenc.default_per_sample_iv_size must be 8`);
    const tencKid = buf.subarray(tencContent + 4, tencContent + 4 + 16);
    assert.equal(tencKid.length, 16, `${label} tenc.default_KID must be 16 bytes`);
  });

  test(`${label} fixture: pssh box structure (cenc:lit-aes-gcm-v3 systemId, v1, KID_count=1, JSON Data[])`, () => {
    const buf = readFileSync(join(FIXTURES, file));
    const pssh = extractFirstPSSHBox(buf);
    assert.ok(pssh, `${label} fixture: extractFirstPSSHBox returned null`);

    // Box header: size(4) + type(4) + version(1) + flags(3) + systemId(16)
    //             + KID_count(4) + KID(16) + DataSize(4) + Data[N]
    const declaredSize = pssh.readUInt32BE(0);
    assert.equal(declaredSize, pssh.length, 'pssh declared size must equal byte length');
    assert.equal(pssh.toString('ascii', 4, 8), 'pssh');
    assert.equal(pssh[8], 1, 'pssh version must be 1');
    assert.deepEqual(pssh[9], 0); assert.deepEqual(pssh[10], 0); assert.deepEqual(pssh[11], 0);

    const sysid = pssh.subarray(12, 28).toString('hex');
    assert.equal(sysid, ELACITY_SYSTEM_ID_HEX, `${label} pssh systemId must be Elacity dDRM`);

    const kidCount = pssh.readUInt32BE(28);
    assert.equal(kidCount, 1, `${label} pssh KID_count must be 1`);

    const psshKid = pssh.subarray(32, 48).toString('hex');
    assert.equal(psshKid.length, 32, `${label} pssh KID must be 16 bytes`);

    const dataSize = pssh.readUInt32BE(48);
    assert.equal(dataSize + 52, pssh.length, 'pssh Data[] length must complete the box');

    const dataJson = pssh.subarray(52, 52 + dataSize).toString('utf-8');
    const parsed = JSON.parse(dataJson);
    assert.equal(parsed.protocolVersion, '3.0', 'pssh Data must be v3.0 JSON');
    assert.equal(parsed.protectionType, 'cenc:lit-aes-gcm-v3');
    assert.ok(parsed.data?.actionIpfsId, 'pssh JSON must carry actionIpfsId');
    assert.ok(parsed.data?.kid?.startsWith('0x'), 'pssh JSON kid must be 0x-prefixed');
    assert.ok(parsed.data?.ciphertext, 'pssh JSON must carry ciphertext');

    // pssh JSON kid (without 0x) must byte-equal the pssh binary KID array.
    const jsonKidHex = parsed.data.kid.replace(/^0x/, '').toLowerCase();
    assert.equal(jsonKidHex, psshKid, 'pssh JSON kid must equal pssh binary KID');
  });
}

// Cross-track KID equivalence test deferred until a post-multi-trak-fix
// audio fixture lands. The KID-as-asset-identity contract is asserted at
// packaging time (dashPackager passes a single contractKidHex into every
// segment + transform call) and verified by the C harness against live
// assets. Adding the unit assertion is a follow-up.
