/**
 * evaluatePlatformCompatibility() unit tests (device-compatibility gating).
 *
 * The dApp Centre mirrors this exact logic in isHostCompatible()
 * (src/backend/apps/app-center/index.html) — if these expectations change,
 * update the client mirror too.
 *
 * Run: npx tsx --test tests/unit/platform-compat.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePlatformCompatibility,
  resolveHostVariant,
  type HostPlatformSummary,
} from '../../src/utils/platform.js';

const jetson: HostPlatformSummary = {
  os: 'linux', arch: 'arm64', totalMemoryMB: 7800, isJetson: true, isConstrainedDevice: true,
};
const linuxServer: HostPlatformSummary = {
  os: 'linux', arch: 'x64', totalMemoryMB: 16384, isJetson: false, isConstrainedDevice: false,
};
const mac: HostPlatformSummary = {
  os: 'darwin', arch: 'arm64', totalMemoryMB: 32768, isJetson: false, isConstrainedDevice: false,
};

test('no requirement → always compatible', () => {
  assert.equal(evaluatePlatformCompatibility(undefined, mac).compatible, true);
  assert.equal(evaluatePlatformCompatibility({}, mac).compatible, true);
});

test('Linux-only app: allowed on Jetson + Linux server, blocked on macOS', () => {
  const req = { os: ['linux'] };
  assert.equal(evaluatePlatformCompatibility(req, jetson).compatible, true);
  assert.equal(evaluatePlatformCompatibility(req, linuxServer).compatible, true);

  const verdict = evaluatePlatformCompatibility(req, mac);
  assert.equal(verdict.compatible, false);
  assert.match(verdict.reason ?? '', /Linux/);
  assert.match(verdict.reason ?? '', /macOS/);
});

test('arch allow-list gates by CPU', () => {
  const req = { os: ['linux'], arch: ['x64', 'arm64'] };
  assert.equal(evaluatePlatformCompatibility(req, jetson).compatible, true);
  assert.equal(evaluatePlatformCompatibility(req, linuxServer).compatible, true);

  const armOnly = { arch: ['arm64'] };
  assert.equal(evaluatePlatformCompatibility(armOnly, linuxServer).compatible, false);
});

test('minMemoryMB enforces a RAM floor', () => {
  const tiny: HostPlatformSummary = { ...jetson, totalMemoryMB: 2048 };
  const req = { os: ['linux'], minMemoryMB: 4096 };
  assert.equal(evaluatePlatformCompatibility(req, jetson).compatible, true);

  const verdict = evaluatePlatformCompatibility(req, tiny);
  assert.equal(verdict.compatible, false);
  assert.match(verdict.reason ?? '', /RAM/);
});

test('custom reason overrides the generated text', () => {
  const req = { os: ['linux'], reason: 'This app needs a real Elastos node host.' };
  const verdict = evaluatePlatformCompatibility(req, mac);
  assert.equal(verdict.compatible, false);
  assert.equal(verdict.reason, 'This app needs a real Elastos node host.');
});

test('ENM-style requirement: Linux + 4GB — the Jetson/Pi-vs-Mac case', () => {
  const enm = { os: ['linux'], minMemoryMB: 4096, reason: 'Elastos Node Manager runs Linux node binaries.' };
  // Jetson / Pi-class (linux arm64, >=4GB) → can run
  assert.equal(evaluatePlatformCompatibility(enm, jetson).compatible, true);
  // Mac desktop → cannot (this is the dApp Store message the user asked for)
  assert.equal(evaluatePlatformCompatibility(enm, mac).compatible, false);
});

// ---- resolveHostVariant: per-arch capsule selection (multi-arch ENM) -------

const ENM_VARIANTS = {
  'linux-x64':   { cid: 'bafyX64',  signature: 'sigX64',  size: 30_100_000 },
  'linux-arm64': { cid: 'bafyArm', signature: 'sigArm', size: 27_900_000 },
};

test('no variants → null (single-arch app uses top-level cid)', () => {
  assert.equal(resolveHostVariant(undefined, linuxServer), null);
  assert.equal(resolveHostVariant({}, linuxServer), null);
});

test('server picks linux-<own arch>', () => {
  const onX64 = resolveHostVariant(ENM_VARIANTS, linuxServer);
  assert.equal(onX64?.key, 'linux-x64');
  assert.equal(onX64?.variant.cid, 'bafyX64');

  const onArm = resolveHostVariant(ENM_VARIANTS, jetson);
  assert.equal(onArm?.key, 'linux-arm64');
  assert.equal(onArm?.variant.cid, 'bafyArm');
});

test('missing arch throws (no usable capsule → fail closed)', () => {
  // macOS host has no linux-darwin variant → must refuse, not silently fetch x64
  assert.throws(() => resolveHostVariant(ENM_VARIANTS, mac), /darwin-arm64/);
});

test('matched variant missing cid/signature throws', () => {
  const broken = { 'linux-x64': { cid: '', signature: 'sig' } };
  assert.throws(() => resolveHostVariant(broken, linuxServer), /missing cid or signature/);
});
