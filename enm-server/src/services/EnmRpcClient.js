/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EnmRpcClient — JSON-RPC 2.0 client for ELA mainchain.
 *
 * Talks to the operator's local ela process at 127.0.0.1:<rpcPort>. Auth is
 * HTTP Basic per servers/httpjsonrpc/server.go:258-281 (verified Rev 1 audit).
 *
 * Implementation choices:
 *   - Node's built-in `http` module — no extra dep
 *   - 10-second per-request timeout (matches dao-dashboard's pattern, Rev 5 audit)
 *   - No retries here; the SelfHealingEngine decides retry policy based on
 *     which failure mode (F2 RPC unreachable) the timeout hits
 *   - Single integer id per call (timestamp-based — fine for stateless RPC)
 *
 * RPC methods implemented (per Rev 1+3 audits, lines verified in
 * Elastos.ELA/servers/interfaces.go):
 *   - getblockcount        line 1269
 *   - getconnectioncount   line 1038
 *   - getnodestate         line 191  (replaces getpeers — does not exist)
 *   - getinfo              line 930
 *   - getbestblockhash     line 1261
 *   - getmininginfo        line 963
 *   - getrawmempool        line 1042
 *   - listproducers        line 2373
 *   - getproducerinfo      line 556
 *   - getarbitratorgroupbyheight line 1338
 */

'use strict';

const http = require('node:http');
const { URL } = require('node:url');

const DEFAULT_TIMEOUT_MS = 10_000;
// P1 (v0.5.182) — hard ceiling on a single RPC response body (anti-OOM).
const MAX_RPC_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * @typedef {object} RpcClientConfig
 * @property {string} host        defaults to '127.0.0.1'
 * @property {number} port        defaults to 20336
 * @property {string} user        HTTP Basic username (rpcuser from config.json)
 * @property {string} password    HTTP Basic password (decrypted before passing in)
 * @property {number} [timeoutMs] per-request timeout, default 10s
 */

class EnmRpcClient {
    /**
     * @param {RpcClientConfig} config
     */
    constructor(config) {
        if (!config || typeof config !== 'object') {
            throw new TypeError('EnmRpcClient: config object is required');
        }
        this.host = config.host || '127.0.0.1';
        this.port = config.port || 20336;
        if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
            throw new RangeError(`EnmRpcClient: invalid port ${this.port}`);
        }
        if (typeof config.user !== 'string' || typeof config.password !== 'string') {
            throw new TypeError('EnmRpcClient: user and password must be strings');
        }
        this.user = config.user;
        this.password = config.password;
        this.timeoutMs = Number.isInteger(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
        this._authHeader = `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`;
    }

    /**
     * Generic JSON-RPC call. Throws on transport, HTTP, or RPC-level errors.
     *
     * @param {string} method
     * @param {object|Array} [params]
     * @returns {Promise<unknown>} result field of the RPC response
     */
    call(method, params) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                jsonrpc: '2.0',
                method,
                params: params == null ? {} : params,
                id: Date.now(),
            });

            const req = http.request({
                host: this.host,
                port: this.port,
                method: 'POST',
                path: '/',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Authorization': this._authHeader,
                },
                timeout: this.timeoutMs,
            }, (res) => {
                let chunks = '';
                let size = 0;
                res.setEncoding('utf8');
                res.on('data', (c) => {
                    // P1 (v0.5.182) — cap response size. A misbehaving RPC (or an
                    // HTML error page from a proxy in front of the port) returning a
                    // multi-MB body would otherwise be buffered fully in memory →
                    // GC pressure / OOM at fleet scale. 16 MB is far above any
                    // legitimate ela/arbiter JSON-RPC reply.
                    size += c.length;
                    if (size > MAX_RPC_RESPONSE_BYTES) {
                        req.destroy(new RpcTransportError(
                            `RPC response too large (>${MAX_RPC_RESPONSE_BYTES} bytes) from ${this.host}:${this.port}`,
                        ));
                        return;
                    }
                    chunks += c;
                });
                res.on('end', () => {
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        return reject(new RpcAuthError(
                            `RPC auth rejected (HTTP ${res.statusCode}). Check rpcuser/rpcpassword in config.json.`,
                        ));
                    }
                    if (res.statusCode === undefined || res.statusCode >= 500) {
                        return reject(new RpcTransportError(
                            `RPC server error: HTTP ${res.statusCode}`,
                        ));
                    }
                    let parsed;
                    try {
                        parsed = JSON.parse(chunks);
                    } catch (err) {
                        return reject(new RpcTransportError(
                            `RPC response was not JSON (HTTP ${res.statusCode}): ${err.message}`,
                        ));
                    }
                    if (parsed && parsed.error) {
                        return reject(new RpcMethodError(
                            (parsed.error && parsed.error.message) || 'RPC method error',
                            parsed.error.code,
                        ));
                    }
                    return resolve(parsed && parsed.result);
                });
            });

            req.on('timeout', () => {
                req.destroy(new RpcTransportError(`RPC timeout after ${this.timeoutMs}ms (method=${method})`));
            });
            req.on('error', (err) => {
                // ECONNREFUSED is the canonical "node not running" signal — F1/F2 cares about it.
                if (err && err.code === 'ECONNREFUSED') {
                    return reject(new RpcUnreachableError(`RPC connection refused at ${this.host}:${this.port}`));
                }
                reject(new RpcTransportError(err.message));
            });
            req.write(body);
            req.end();
        });
    }

    // --- Convenience wrappers around the v0.1 method set (Rev 1+3 audits) ---

    getblockcount() { return this.call('getblockcount'); }
    getconnectioncount() { return this.call('getconnectioncount'); }
    getnodestate() { return this.call('getnodestate'); }
    getinfo() { return this.call('getinfo'); }
    getbestblockhash() { return this.call('getbestblockhash'); }
    getmininginfo() { return this.call('getmininginfo'); }
    getrawmempool() { return this.call('getrawmempool'); }

    /**
     * Returns block header by hash. The header includes timestamp, which we
     * use to detect "synced" — if the latest block is within ~5 min of now,
     * the chain is fully caught up regardless of whether we can resolve the
     * network's tip from peers.
     *
     * @param {string} hash       hex block hash
     * @param {number} [verbose]  0 = raw bytes hex, 2 = decoded object (default)
     */
    getblockheader(hash, verbose = 2) {
        return this.call('getblockheader', { blockhash: hash, verbosity: verbose });
    }

    /**
     * Returns each connected peer's known best block height. We take the
     * max of these as the network's reference tip when computing sync
     * progress — more reliable than guessing from local-height drift,
     * because peers handshake quickly after start.
     *
     * Schema (per ela JSON-RPC docs): result is an array of objects
     * containing fields including `height` and `services`.
     */
    getpeerinfo() { return this.call('getpeerinfo'); }

    /**
     * @param {{ start?: number, limit?: number, state?: string }} [params]
     */
    listproducers(params) { return this.call('listproducers', params || { state: 'all' }); }

    /**
     * @param {string} publicKey  hex-encoded compressed pubkey (66 chars)
     */
    getproducerinfo(publicKey) { return this.call('getproducerinfo', { publickey: publicKey }); }

    /**
     * @param {number} height  uint32 block height
     */
    getarbitratorgroupbyheight(height) { return this.call('getarbitratorgroupbyheight', { height }); }

    /**
     * 0.2.0-alpha.7 — current DPoS rotation snapshot.
     *
     * v0.5.229 (audit 2026-05-27) — field names corrected by verifying
     * against the real ELA struct definition at
     *   Elastos.ELA/servers/interfaces.go:884-892 (type arbitersInfo).
     * Pre-229 this JSDoc said `currentarbiters` and `currentcandidates`;
     * those fields DO NOT EXIST in the chain's response. The actual JSON
     * struct tags are `arbiters` and `candidates` (no "current" prefix).
     * The pre-229 typo propagated into EvmSidechainAdapter.detectProducerRole
     * and routes/chains.js's /chains/:id/rotation endpoint — both read
     * `info.currentarbiters` and got `undefined` → empty array → every
     * Council operator was incorrectly reported as Inactive on the current
     * slate. Smoking gun verified by live curl 2026-05-27:
     *   getarbitersinfo response top-level keys =
     *     [arbiters, candidates, nextarbiters, nextcandidates,
     *      ondutyarbiter, currentturnstartheight, nextturnstartheight]
     *
     *   ondutyarbiter:           hex of the producer signing the current round
     *   currentturnstartheight:  first height of the current rotation turn
     *   nextturnstartheight:     first height of the next rotation turn
     *   arbiters:                hex[] of producers in the active slate
     *   nextarbiters:            hex[] of producers queued for the next slate
     *   candidates / nextcandidates: backup pool (likewise NOT prefixed)
     *
     * Per-entry caveat (ELA chain-side bug — handle defensively in callers):
     * Elastos.ELA/servers/interfaces.go:906-912 returns an empty string
     * '' in the slot of any CRC arbiter whose IsNormal=false (i.e.
     * MemberState != MemberElected). Callers MUST filter empty entries
     * before .includes(me) lookups, otherwise a Council member in
     * MemberInactive state appears absent from the slate.
     *
     * No auth gate; same rate-limit bucket as getproducerinfo.
     */
    getarbitersinfo() { return this.call('getarbitersinfo', {}); }

    /**
     * v0.5.229 — list the CURRENT CR Council members (the ones who won the
     * most recent CR election; lives in CRCommittee.GetCurrentMembers()).
     * Used by ENM's CrMembershipService to detect whether the operator's
     * node pubkey is bound to a Council seat (via CRCouncilMemberClaimNode).
     *
     * Verified against Elastos.ELA struct definitions at
     *   servers/interfaces.go:2159-2179 (RPCCRMemberInfo + RPCCRMembersInfo)
     *   servers/interfaces.go:2604-2649 (ListCurrentCRs handler)
     *
     * Response shape:
     *   result.crmembersinfo:  array of member objects (one per current CR member)
     *   result.totalcounts:    number of members
     *
     * Each member object has these fields (note "depositamout" typo is
     * upstream — Elastos.ELA spells it without the second N):
     *   code              hex of the member's program code
     *   cid               Citizen ID (base58 address derived from CR pubkey)
     *   did               Decentralized Identifier (base58)
     *   dpospublickey     hex of the operator's NODE pubkey bound via
     *                     CRCouncilMemberClaimNode. THIS is what ENM
     *                     matches against the local keystore pubkey.
     *   nickname          operator-chosen display name
     *   url               optional URL
     *   location          uint location code
     *   impeachmentvotes  string number of impeachment votes
     *   depositamout      string ELA amount (sic — upstream typo)
     *   depositaddress    base58 deposit address
     *   penalty           string penalty amount
     *   state             MemberState as string: 'Elected', 'Inactive',
     *                     'Impeached', 'Returned', 'Terminated', or
     *                     'Illegal'
     *   index             ordering index in the Committee
     *
     * Caveat: when the CR Committee is NOT in election period (between
     * Council terms), the handler returns an EMPTY crmembersinfo array
     * even if previous members exist. Callers must treat empty as
     * "no current Council" rather than "operator not a member".
     *
     * No auth gate; same rate-limit bucket as getproducerinfo. node.sh
     * matches this with `ela_jsonrpc listcurrentcrs state all`
     * (node.sh:1117) — the `state` param is documented but not actually
     * read by the handler (servers/interfaces.go:2604).
     */
    listcurrentcrs() { return this.call('listcurrentcrs', { state: 'all' }); }

    /**
     * v0.5.229 — list the NEXT CR Council members (the ones who will take
     * over at the next Committee transition). Same response shape as
     * listcurrentcrs. Useful to detect "Council member elected but the
     * current term hasn't started yet". Handler at
     *   Elastos.ELA/servers/interfaces.go:2651 ListNextCRs.
     */
    listnextcrs() { return this.call('listnextcrs', { state: 'all' }); }

    /**
     * beta.3.13 — producer's locked deposit balance. Verified registered
     * on JSON-RPC at servers/httpjsonrpc/server.go:117 as
     * "getdepositcoin" → GetDepositCoin. Takes the OWNER public key
     * (since the deposit is locked at the owner-derived address, not
     * the node-derived one). Returns a JSON object with available
     * and used fields, both string ELA values.
     *
     * @param {string} ownerPubkey  hex-encoded compressed pubkey of the
     *     producer's owner (66 chars). NOT the node pubkey.
     */
    getdepositcoin(ownerPubkey) { return this.call('getdepositcoin', { ownerpublickey: ownerPubkey }); }

    /**
     * beta.3.13 — claimable BPoS rewards for an address. Verified
     * registered on JSON-RPC at servers/httpjsonrpc/server.go:125 as
     * "dposv2rewardinfo" → DposV2RewardInfo. Takes an OWNER address
     * (Standard or Multi-sign or Stake-prefixed); the handler auto-
     * promotes it to the stake-prefixed form before lookup. Returns
     * { address, claimable, claiming, claimed } string ELA values.
     *
     * NOT keyed by the node signing address — that address has no
     * reward bookkeeping (see arbitrators.go:732-801).
     *
     * @param {string} ownerAddr  Elastos mainchain address derived
     *     from the producer's OwnerPublicKey (NOT the node keystore).
     */
    dposv2rewardinfo(ownerAddr) { return this.call('dposv2rewardinfo', { address: ownerAddr }); }

    /**
     * v0.5.168 (Phase 1) — ARBITER-only methods. These are served by the
     * `arbiter` binary's JSON-RPC interface, NOT the ela mainchain. node.sh
     * only ever calls getspvheight on the arbiter (node.sh:5060) and uses
     * getsidechainblockheight to read each bridged sidechain's SPV-tracked
     * height (node.sh:5073-5145). The arbiter reuses the same EnmRpcClient
     * (ArbiterAdapter.rpcClient) so they live here rather than in a separate
     * client. Calling them against a mainchain ela process returns an RPC
     * method error (the caller treats that as null).
     *
     * getspvheight — the arbiter's own SPV sync height (its view of the
     * mainchain it follows to sign cross-chain payloads).
     */
    getspvheight() { return this.call('getspvheight'); }

    /**
     * getsidechainblockheight — the SPV-tracked block height the arbiter has
     * for one bridged sidechain, keyed by that sidechain's genesis block hash
     * (the values in ArbiterAdapter.ARBITER_SIDE_NODE_DEFS[net][id].GenesisBlock).
     *
     * @param {string} genesisHash  the sidechain's genesis block hash (hex)
     */
    getsidechainblockheight(genesisHash) {
        return this.call('getsidechainblockheight', { hash: genesisHash });
    }
}

/*
 * beta.3.15 — removed two methods added speculatively in beta.3.13:
 *
 *   getbalancebyaddr(addr)   — NOT registered on the JSON-RPC server
 *                              (only on the REST interface, exposed
 *                              at /api/v1/asset/balances/:addr per
 *                              servers/httprestful/server.go:122).
 *                              Calling it via JSON-RPC always 404s.
 *
 *   getdposrewards(pubkey)   — Method name doesn't exist. The actual
 *                              method is dposv2rewardinfo (added above)
 *                              and it's address-keyed, not pubkey-keyed.
 *                              The keystore-derived "node signing
 *                              address" has zero rewards bookkeeping
 *                              anyway, so surfacing a balance for it
 *                              was misleading even when it worked.
 *
 * If a future caller needs balance for arbitrary addresses, route via
 * HTTP GET to the REST endpoint (separate client) — don't add it back
 * to this JSON-RPC client.
 */

// --- Error types — let the caller distinguish failure modes for healing rules. ---

class RpcError extends Error {
    constructor(message) { super(message); this.name = 'RpcError'; }
}
class RpcUnreachableError extends RpcError {
    constructor(message) { super(message); this.name = 'RpcUnreachableError'; }
}
class RpcTransportError extends RpcError {
    constructor(message) { super(message); this.name = 'RpcTransportError'; }
}
class RpcAuthError extends RpcError {
    constructor(message) { super(message); this.name = 'RpcAuthError'; }
}
class RpcMethodError extends RpcError {
    constructor(message, code) { super(message); this.name = 'RpcMethodError'; this.code = code; }
}

module.exports = {
    EnmRpcClient,
    RpcError,
    RpcUnreachableError,
    RpcTransportError,
    RpcAuthError,
    RpcMethodError,
    DEFAULT_TIMEOUT_MS,
};
