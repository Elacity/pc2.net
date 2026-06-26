/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * CrMembershipService — detect whether the operator's node public key is
 * bound to a CR Council seat on Elastos mainchain.
 *
 * v0.5.229 (audit 2026-05-27). Operator directive: ENM treated everyone as
 * a BPoS supernode by default, even when they registered through the CR
 * Council flow (via Elastos Essentials → CRCouncilMemberClaimNode TX). The
 * two roles are on-chain-distinct:
 *
 *   - BPoS producer: registered via producer-register TX. Lives in the
 *     producer registry. Lookup: listproducers, match nodepublickey.
 *   - CR Council member: registered via CRInfo TX, then bound a node
 *     pubkey via CRCouncilMemberClaimNode TX. Lives in
 *     CRCommittee.Members[]. Lookup: listcurrentcrs, match
 *     crmembersinfo[].dpospublickey.
 *
 * This service is the CR-side of the pair (the BPoS-side already exists
 * via getproducerinfo in EnmRpcClient). It mirrors node.sh:1117-1129's
 * pattern: query listcurrentcrs, find the matching dpospublickey, return
 * { state, nickname, did, cid, impeachmentVotes, ... }.
 *
 * Failure modes (all return { isCrMember: false, source: '<reason>' }):
 *   - no node pubkey in cfg (keystore not unlocked)
 *   - no mainchain RPC config / undecryptable password
 *   - RPC call failed (mainchain RPC unreachable / 5xx)
 *   - Committee not in election period (returns empty crmembersinfo array)
 *   - operator's pubkey is NOT a member (the actual "they didn't bind" case)
 *
 * Cached in-process for 30s to bound mainchain RPC hits when multiple
 * UI surfaces poll concurrently (settings panel, dashboard cards). Mirrors
 * the _producerRoleCache pattern added in v0.5.228d for the BPoS side.
 *
 * No side effects on cfg, no implicit chain restart, no spawn-time impact.
 * This is a pure read used by /system/identity, /system/council-status,
 * and (future) /system/role-debug for the UI to label the operator's role
 * truthfully.
 */

'use strict';

const ConfigStore = require('./ConfigStore');
const { ENM_LOG_PREFIX } = require('./EnmConstants');

const CACHE_TTL_MS = 30_000;
let _cache = null;   // { ts, result } — single-entry cache (one operator, one keystore)

/**
 * Lowercase + 0x-strip a hex string so chain-side casing variations don't
 * cause false negatives in pubkey comparisons. Matches the same norm
 * helper used by EvmSidechainAdapter.detectProducerRole.
 */
function normHex(s) {
    return String(s || '').toLowerCase().replace(/^0x/, '');
}

/**
 * Query the on-chain CR Committee and determine whether the operator's
 * node pubkey is bound to a Council seat. Pure read; cached 30s.
 *
 * @param {object} cfg ConfigStore.load() result (chains.mainchain.dpos.nodePublicKey + chains.mainchain.rpc required)
 * @param {object} [opts]
 * @param {boolean} [opts.skipCache=false] force a fresh RPC call
 * @param {object}  [opts.log] optional logger { info, warn, error }
 * @returns {Promise<{
 *   isCrMember: boolean,
 *   inNextCommittee?: boolean,   // matched in listnextcrs (waiting for next term)
 *   state?: string,              // 'Elected' | 'Inactive' | 'Impeached' | 'Returned' | 'Terminated' | 'Illegal'
 *   nickname?: string,
 *   cid?: string,
 *   did?: string,
 *   dpospublickey?: string,
 *   impeachmentVotes?: string,
 *   depositAddress?: string,
 *   depositAmount?: string,
 *   penalty?: string,
 *   index?: number,
 *   currentCommitteeSize?: number,
 *   source: 'matched' | 'matched-next' | 'not-in-committee' | 'no-active-committee' |
 *           'no-node-pubkey' | 'no-mainchain-rpc' | 'rpc-password-undecryptable' | 'error',
 *   error?: string,
 *   lastChecked: string  // ISO timestamp
 * }>}
 */
async function detectCrMembership(cfg, opts) {
    const options = opts || {};
    const log = options.log || null;

    if (!options.skipCache && _cache && (Date.now() - _cache.ts) < CACHE_TTL_MS) {
        return _cache.result;
    }

    const out = {
        isCrMember: false,
        source: 'error',
        lastChecked: new Date().toISOString(),
    };

    try {
        const cfgRoot = (cfg && cfg.chains) || cfg || {};
        const mainCfg = cfgRoot.mainchain;
        const nodePubkeyRaw = mainCfg && mainCfg.dpos && mainCfg.dpos.nodePublicKey;
        if (!nodePubkeyRaw) {
            out.source = 'no-node-pubkey';
            _cache = { ts: Date.now(), result: out };
            return out;
        }
        const mainRpc = mainCfg.rpc;
        if (!mainRpc || !mainRpc.user) {
            out.source = 'no-mainchain-rpc';
            _cache = { ts: Date.now(), result: out };
            return out;
        }

        // Lazy require mirrors EvmSidechainAdapter's pattern. The
        // EnmRpcClient destructure is critical — bare-require returns the
        // whole module object and `new EnmRpcClient(...)` throws "is not
        // a constructor" (the same bug we caught in v228c).
        const EnmCrypto = require('./EnmCrypto');
        const { EnmRpcClient } = require('./EnmRpcClient');

        let password = '';
        if (mainRpc.passwordEncrypted) {
            try {
                password = EnmCrypto.decrypt(mainRpc.passwordEncrypted);
            } catch (e) {
                out.source = 'rpc-password-undecryptable';
                out.error = e && e.message ? e.message : String(e);
                _cache = { ts: Date.now(), result: out };
                return out;
            }
        }
        const client = new EnmRpcClient({
            host: mainRpc.host || '127.0.0.1',
            port: mainRpc.port || 20336,
            user: mainRpc.user,
            password,
            timeoutMs: 5000,
        });

        const me = normHex(nodePubkeyRaw);

        // Pass 1: current Committee. The common case — operator is a
        // current member (Elected / Inactive / etc.) or no match.
        let currentInfo;
        try {
            currentInfo = await client.listcurrentcrs();
        } catch (err) {
            out.source = 'error';
            out.error = err && err.message ? err.message : String(err);
            // Don't cache RPC failures — let the next call retry against
            // the live chain. 30s of fake-not-found is worse than a
            // momentary RPC blip.
            if (log) {
                log.warn(`${ENM_LOG_PREFIX} CrMembershipService: listcurrentcrs failed (${out.error})`);
            }
            return out;
        }

        const currentMembers = (currentInfo && Array.isArray(currentInfo.crmembersinfo))
            ? currentInfo.crmembersinfo : [];
        out.currentCommitteeSize = currentMembers.length;

        if (currentMembers.length === 0) {
            // Committee not in election period. Could still be on the
            // ballot in the next term — fall through to Pass 2 below.
            out.source = 'no-active-committee';
        } else {
            const match = currentMembers.find(
                (m) => m && normHex(m.dpospublickey) === me,
            );
            if (match) {
                out.isCrMember = true;
                out.inNextCommittee = false;
                out.state = match.state || null;
                out.nickname = match.nickname || null;
                out.cid = match.cid || null;
                out.did = match.did || null;
                out.dpospublickey = match.dpospublickey || null;
                out.impeachmentVotes = match.impeachmentvotes || null;
                out.depositAddress = match.depositaddress || null;
                // Note the upstream typo: chain emits "depositamout".
                out.depositAmount = match.depositamout || null;
                out.penalty = match.penalty || null;
                out.index = (typeof match.index === 'number') ? match.index : null;
                out.source = 'matched';
                if (log) {
                    log.info(
                        `${ENM_LOG_PREFIX} CrMembershipService: matched in current Committee — `
                        + `state=${out.state}, nickname=${out.nickname}, `
                        + `committee-size=${out.currentCommitteeSize}`,
                    );
                }
                _cache = { ts: Date.now(), result: out };
                return out;
            }
        }

        // Pass 2: next Committee. Operator may have just been elected
        // and is waiting for the term boundary. Best-effort — don't fail
        // the whole detect on a listnextcrs error.
        try {
            const nextInfo = await client.listnextcrs();
            const nextMembers = (nextInfo && Array.isArray(nextInfo.crmembersinfo))
                ? nextInfo.crmembersinfo : [];
            const nextMatch = nextMembers.find(
                (m) => m && normHex(m.dpospublickey) === me,
            );
            if (nextMatch) {
                out.isCrMember = true;
                out.inNextCommittee = true;
                out.state = nextMatch.state || null;
                out.nickname = nextMatch.nickname || null;
                out.cid = nextMatch.cid || null;
                out.did = nextMatch.did || null;
                out.dpospublickey = nextMatch.dpospublickey || null;
                out.impeachmentVotes = nextMatch.impeachmentvotes || null;
                out.depositAddress = nextMatch.depositaddress || null;
                out.depositAmount = nextMatch.depositamout || null;
                out.penalty = nextMatch.penalty || null;
                out.index = (typeof nextMatch.index === 'number') ? nextMatch.index : null;
                out.source = 'matched-next';
                if (log) {
                    log.info(
                        `${ENM_LOG_PREFIX} CrMembershipService: matched in NEXT Committee `
                        + `(waiting for term boundary) — nickname=${out.nickname}`,
                    );
                }
                _cache = { ts: Date.now(), result: out };
                return out;
            }
        } catch (_) { /* listnextcrs unavailable / chain old — non-fatal */ }

        // Pass 3: definitively not a CR member.
        if (out.source !== 'no-active-committee') {
            out.source = 'not-in-committee';
        }
        _cache = { ts: Date.now(), result: out };
        return out;
    } catch (err) {
        // Catch-all: any unexpected throw → log + return error sentinel.
        out.source = 'error';
        out.error = err && err.message ? err.message : String(err);
        if (log) {
            log.error(
                `${ENM_LOG_PREFIX} CrMembershipService: unexpected error: ${out.error}`,
            );
        }
        return out;
    }
}

/**
 * Drop the cached result (used after a setup-wizard write or a forced
 * refresh from the UI's debug panel).
 */
function clearCache() {
    _cache = null;
}

module.exports = {
    detectCrMembership,
    clearCache,
    _internal: { CACHE_TTL_MS, normHex },
};
