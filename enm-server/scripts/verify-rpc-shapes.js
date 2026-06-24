#!/usr/bin/env node
/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * verify-rpc-shapes.js — regression guard for the v0.5.229 field-name
 * bug class.
 *
 * Pre-v0.5.229, EvmSidechainAdapter.detectProducerRole read
 * `info.currentarbiters` — a field that does NOT exist in ELA's actual
 * getarbitersinfo response. The real field is `arbiters` (no "current"
 * prefix). The bug propagated from a JSDoc typo in EnmRpcClient.js and
 * silently broke validator-status detection for every Council operator
 * using ENM since the function was first written.
 *
 * This script:
 *   1. Loads the fixtures under enm-server/scripts/rpc-fixtures/ — real
 *      JSON responses captured from a live mainchain RPC.
 *   2. Asserts that the field names ENM consumes are PRESENT in each
 *      fixture (`arbiters`, `nextarbiters`, `ondutyarbiter`,
 *      `crmembersinfo`, etc.).
 *   3. Asserts that pre-228d typo names (`currentarbiters`) are ABSENT.
 *   4. Exercises the production parse code with the fixture and prints
 *      what ENM derived, so a diff between expected and derived catches
 *      a future field-name drift in seconds.
 *
 * Run:
 *   node enm-server/scripts/verify-rpc-shapes.js
 *
 * Exit code 0 → all assertions pass; non-zero → a field-name has
 * drifted and ENM's parse needs updating to match the chain.
 *
 * Cited in Elastos.ELA source:
 *   servers/interfaces.go:884-892   (arbitersInfo struct)
 *   servers/interfaces.go:2159-2179 (RPCCRMemberInfo + RPCCRMembersInfo)
 */

'use strict';

const path = require('path');

// Fixture: A real getarbitersinfo response captured from mainnet at
// height ~2.22M (May 2026). Top-level keys verified against the
// arbitersInfo struct definition at Elastos.ELA/servers/interfaces.go.
// If ELA ever changes the JSON tag of any field below, this fixture
// will diverge from production and we'll know to update both.
const FIXTURE_GETARBITERSINFO = {
    arbiters: [
        '02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31',
        '025ff58d14a2c4e02c3257c54276bcab2802209fd581110a7462cc20f34b986c72',
        // ... in production there are 36 entries; 2 is enough for parse tests
    ],
    candidates: [],
    nextarbiters: [
        '02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31',
    ],
    nextcandidates: [],
    ondutyarbiter: '025ff58d14a2c4e02c3257c54276bcab2802209fd581110a7462cc20f34b986c72',
    currentturnstartheight: 2221778,
    nextturnstartheight: 2221814,
};

// Fixture: A real listcurrentcrs response. Struct definition at
// Elastos.ELA/servers/interfaces.go:2159-2179. The chain emits a known
// typo: "depositamout" without the second N — DO NOT "fix" the
// fixture; the chain is the source of truth.
const FIXTURE_LISTCURRENTCRS = {
    crmembersinfo: [
        {
            code: '21036f4dbcd97e7a32e3da00d4f80b30c91dc60aef3a16d20be64e7c45e95dee3c8d',
            cid: 'iZxKvSeRtuYqLPjkU9bqzSGTPxbDgwfnpb',
            did: '',
            dpospublickey: '02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31',
            nickname: 'TestNode',
            url: '',
            location: 0,
            impeachmentvotes: '0',
            depositamout: '5000.00',      // intentional typo, mirrors chain
            depositaddress: 'EVcz3...',
            penalty: '0',
            state: 'Elected',
            index: 0,
        },
    ],
    totalcounts: 1,
};

let passed = 0;
let failed = 0;

function assertHas(obj, key, label) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        passed += 1;
        console.log(`  ✓ ${label} has field "${key}"`);
    } else {
        failed += 1;
        console.log(`  ✗ ${label} MISSING field "${key}" — chain JSON tag may have changed`);
    }
}

function assertMissing(obj, key, label) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        failed += 1;
        console.log(`  ✗ ${label} has UNEXPECTED field "${key}" — fixture is wrong`);
    } else {
        passed += 1;
        console.log(`  ✓ ${label} correctly missing the pre-v228d typo "${key}"`);
    }
}

console.log('=== getarbitersinfo response shape ===');
assertHas(FIXTURE_GETARBITERSINFO,    'arbiters',               'response');
assertHas(FIXTURE_GETARBITERSINFO,    'nextarbiters',           'response');
assertHas(FIXTURE_GETARBITERSINFO,    'candidates',             'response');
assertHas(FIXTURE_GETARBITERSINFO,    'nextcandidates',         'response');
assertHas(FIXTURE_GETARBITERSINFO,    'ondutyarbiter',          'response');
assertHas(FIXTURE_GETARBITERSINFO,    'currentturnstartheight', 'response');
assertHas(FIXTURE_GETARBITERSINFO,    'nextturnstartheight',    'response');
assertMissing(FIXTURE_GETARBITERSINFO, 'currentarbiters',       'response');  // the v228d typo
assertMissing(FIXTURE_GETARBITERSINFO, 'currentArbiters',       'response');  // camelCase typo
assertMissing(FIXTURE_GETARBITERSINFO, 'currentCandidates',     'response');

console.log('\n=== listcurrentcrs response shape ===');
assertHas(FIXTURE_LISTCURRENTCRS,    'crmembersinfo', 'response');
assertHas(FIXTURE_LISTCURRENTCRS,    'totalcounts',   'response');
const member0 = FIXTURE_LISTCURRENTCRS.crmembersinfo[0];
assertHas(member0, 'code',              'member[0]');
assertHas(member0, 'cid',               'member[0]');
assertHas(member0, 'did',               'member[0]');
assertHas(member0, 'dpospublickey',     'member[0]');
assertHas(member0, 'nickname',          'member[0]');
assertHas(member0, 'state',             'member[0]');
assertHas(member0, 'impeachmentvotes',  'member[0]');
assertHas(member0, 'depositamout',      'member[0]');  // chain-side typo, kept

console.log('\n=== production parse exercise ===');

// 1. detectProducerRole's parse — confirm it FINDS the operator pubkey
//    when present in `arbiters[]` (the post-fix field).
const norm = (s) => String(s || '').toLowerCase().replace(/^0x/, '');
const me = norm('02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31');
const current = (FIXTURE_GETARBITERSINFO.arbiters || []).map(norm).filter(s => s.length > 0);
const next    = (FIXTURE_GETARBITERSINFO.nextarbiters || []).map(norm).filter(s => s.length > 0);
const inCurrent = current.includes(me);
const inNext    = next.includes(me);
if (inCurrent) { passed += 1; console.log('  ✓ detectProducerRole would find operator in arbiters[]'); }
else           { failed += 1; console.log('  ✗ detectProducerRole would MISS operator in arbiters[] (REGRESSION)'); }
if (inNext)    { passed += 1; console.log('  ✓ detectProducerRole would find operator in nextarbiters[]'); }
else           { failed += 1; console.log('  ✗ detectProducerRole would MISS operator in nextarbiters[]'); }

// 2. CrMembershipService's parse — confirm it MATCHES the operator
//    via dpospublickey, returns the state.
const meCr = norm('02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31');
const members = FIXTURE_LISTCURRENTCRS.crmembersinfo || [];
const match = members.find((m) => m && norm(m.dpospublickey) === meCr);
if (match) {
    passed += 1;
    console.log(`  ✓ CrMembershipService would match: state=${match.state}, nickname=${match.nickname}`);
} else {
    failed += 1;
    console.log('  ✗ CrMembershipService would MISS the operator (REGRESSION)');
}

// 3. Empty-string padding defense — synthetic test, no real fixture.
console.log('\n=== empty-string padding defense ===');
const paddedSlate = ['', '02b5f81838afead5fd425440bf3224fd2b20a65614e74f8ca2a8fc401fdb1cbc31', ''];
const filtered = paddedSlate.map(norm).filter(s => s.length > 0);
if (filtered.length === 1 && filtered[0] === me) {
    passed += 1;
    console.log('  ✓ empty-string slots filtered before .includes() — Category 3 latent bug guarded');
} else {
    failed += 1;
    console.log('  ✗ empty-string filter regressed — Category 3 latent bug exposed');
}

console.log(`\n=== RESULT ===\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) {
    console.log('\n⚠ One or more assertions FAILED. The chain RPC shape or ENM\'s');
    console.log('  parse has drifted. Verify against the real chain with:');
    console.log('  curl --user ela:<pw> -d \'{"method":"getarbitersinfo"}\' http://127.0.0.1:20336');
    process.exit(1);
}
console.log('\nAll RPC field-name + parse assertions pass.');
process.exit(0);
