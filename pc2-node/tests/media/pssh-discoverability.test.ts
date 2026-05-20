/**
 * Conformance test for pssh placement in init segments.
 *
 * Asserts that `splicePSSHIntoInit()` produces a layout that:
 *   1. Has NO top-level pssh sibling (Chromium MSE rejects it as an
 *      unexpected top-level ISO BMFF box; bento4 doesn't emit one either).
 *   2. Has an in-moov pssh as the LAST child of moov (after every trak).
 *      Load-bearing for libav — `mov_read_pssh()` attaches
 *      AVEncryptionInitInfo to `c->fc->streams[nb_streams-1]`, so pssh
 *      must come after at least one trak or no stream exists to attach to.
 *   3. `extractFirstPSSHBox()` round-trips the in-moov pssh byte-identically.
 *
 * Tracked: .cursor/tasks/MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
 *
 * Run: tsx --test pc2-node/tests/media/pssh-discoverability.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'buffer';

import {
  splicePSSHIntoInit,
  extractFirstPSSHBox,
} from '../../src/services/media/dashPackager.js';

// ── Box helpers ────────────────────────────────────────────────────────

function box(type: string, content: Buffer): Buffer {
  const size = 8 + content.length;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(size, 0);
  out.write(type, 4, 4, 'ascii');
  content.copy(out, 8);
  return out;
}

function buildSyntheticInit(): Buffer {
  // ftyp (minimal: 'isom' major + version + compatible_brands)
  const ftyp = box('ftyp', Buffer.concat([
    Buffer.from('isom', 'ascii'),       // major_brand
    Buffer.from([0, 0, 0x02, 0]),        // minor_version 512
    Buffer.from('isom', 'ascii'),       // compatible brand
  ]));

  // mvhd (zeroed content, just to fill a box of plausible size)
  const mvhd = box('mvhd', Buffer.alloc(100));
  // Two traks (zeroed) — simulating multi-track init (video + audio).
  const trak1 = box('trak', Buffer.alloc(80));
  const trak2 = box('trak', Buffer.alloc(80));
  const moov = box('moov', Buffer.concat([mvhd, trak1, trak2]));

  return Buffer.concat([ftyp, moov]);
}

function buildSyntheticPSSH(): Buffer {
  // Real-shaped Elacity v1 pssh: 4 size + 4 'pssh' + 1 ver + 3 flags
  // + 16 systemId + 4 KID_count + 16 KID + 4 dataSize + N data
  const data = Buffer.from('{"protocolVersion":"3.0","x":"test"}', 'utf-8');
  const content = Buffer.concat([
    Buffer.from([1, 0, 0, 0]),                              // version=1, flags=0
    Buffer.from('bf2c86c1d9ff4ab1b4be45ae4d99e1fe', 'hex'), // cenc:lit-aes-gcm-v3 systemId
    Buffer.from([0, 0, 0, 1]),                              // KID_count=1
    Buffer.alloc(16, 0xab),                                 // KID
    Buffer.from([0, 0, 0, data.length]),                    // DataSize
    data,
  ]);
  return box('pssh', content);
}

function findBoxes(buf: Buffer, parentStart: number, parentEnd: number): Array<{ type: string; start: number; size: number }> {
  const boxes = [];
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

// ── Tests ──────────────────────────────────────────────────────────────

test('splicePSSHIntoInit emits in-moov pssh as last moov child, no root sibling', () => {
  const init = buildSyntheticInit();
  const pssh = buildSyntheticPSSH();
  const out = splicePSSHIntoInit(init, pssh);

  // Output size = init + 1 × pssh.
  assert.equal(out.length, init.length + pssh.length);

  // Top-level layout: ftyp, moov — NO pssh at root (MSE rejects it).
  const topLevel = findBoxes(out, 0, out.length);
  assert.deepEqual(topLevel.map(b => b.type), ['ftyp', 'moov']);

  // moov children: mvhd, trak, trak, pssh — pssh is the LAST child.
  const moovBox = topLevel[1];
  const moovChildren = findBoxes(out, moovBox.start + 8, moovBox.start + moovBox.size);
  assert.deepEqual(moovChildren.map(b => b.type), ['mvhd', 'trak', 'trak', 'pssh']);
  const moovPssh = moovChildren[moovChildren.length - 1];
  assert.equal(moovPssh.start + moovPssh.size, moovBox.start + moovBox.size, 'in-moov pssh must be last child');

  // In-moov pssh is byte-identical to input pssh.
  const moovPsshBytes = out.subarray(moovPssh.start, moovPssh.start + moovPssh.size);
  assert.deepEqual([...moovPsshBytes], [...pssh], 'in-moov pssh != input pssh');

  // moov declared size grew by exactly one pssh.
  const origMoov = findBoxes(init, 0, init.length).find(b => b.type === 'moov')!;
  assert.equal(moovBox.size, origMoov.size + pssh.length);
});

test('extractFirstPSSHBox round-trips byte-identically', () => {
  const init = buildSyntheticInit();
  const pssh = buildSyntheticPSSH();
  const out = splicePSSHIntoInit(init, pssh);

  const extracted = extractFirstPSSHBox(out);
  assert.ok(extracted, 'extractFirstPSSHBox returned null');
  assert.deepEqual([...extracted!], [...pssh], 'extracted pssh != input pssh');
});

test('extractFirstPSSHBox returns null for init without pssh', () => {
  const init = buildSyntheticInit();
  assert.equal(extractFirstPSSHBox(init), null);
});

test('splicePSSHIntoInit falls back to append when moov is missing', () => {
  const ftypOnly = box('ftyp', Buffer.from('isom'));
  const pssh = buildSyntheticPSSH();
  const out = splicePSSHIntoInit(ftypOnly, pssh);
  assert.equal(out.length, ftypOnly.length + pssh.length);
  assert.deepEqual([...out.subarray(ftypOnly.length)], [...pssh]);
});
