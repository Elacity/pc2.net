/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EthRpcClient — Wave M3.1 (beta.3.95) — Ethereum JSON-RPC 2.0 client
 * for the EVM sidechains (ESC, EID, PG).
 *
 * DISTINCT FROM EnmRpcClient — EnmRpcClient targets ela's mainchain RPC
 * which uses Bitcoin-style RPC method names (getblockcount,
 * getconnectioncount, getnodestate, etc.) under HTTP Basic auth. ESC /
 * EID / PG are go-ethereum forks and speak the Ethereum JSON-RPC spec
 * (eth_blockNumber, net_peerCount, eth_syncing, etc.) — and do NOT use
 * HTTP Basic by default. Mixing the two clients would surface confusing
 * "method not found" errors and tempt operators to set --rpcuser /
 * --rpcpassword which the ELA-derived geth fork doesn't honor.
 *
 * NETWORK POSTURE
 *   - HTTP POST to http://127.0.0.1:<rpcPort> by default (loopback-only).
 *   - No HTTP Basic auth header — geth's HTTP server has no built-in
 *     auth; access control is via --rpcaddr=127.0.0.1 + UFW.
 *   - Per H25 (plan §10): never combine --allow-insecure-unlock with an
 *     externally-bound RPC. The enforced default is 127.0.0.1.
 *
 * METHODS (verified against go-ethereum's RPC schema):
 *   - eth_blockNumber       → returns hex-encoded current block number
 *   - eth_chainId           → hex-encoded chain id (sanity check)
 *   - eth_syncing           → false when fully synced, object with
 *                              {startingBlock, currentBlock, highestBlock}
 *                              while syncing
 *   - net_listening         → boolean, is the node listening
 *   - net_peerCount         → hex-encoded peer count
 *   - net_version           → string chain version
 *   - admin_peers           → array of peer info (NOT enabled by default
 *                              on most ESC/EID builds; will error with
 *                              "method not found" — caller handles)
 *   - eth_getBalance        → hex wei balance for an address
 *   - eth_gasPrice          → hex wei suggested gas price
 *
 * Method-name parity tested against ESC v0.x and EID v0.x in M3.2.
 *
 * THIS CLIENT INTENTIONALLY DOES NOT support eth_sendTransaction or
 * any signing methods — ENM never signs on behalf of the operator
 * (H7). All on-chain mutations are operator-driven from their own
 * wallet apps; ENM is identity-only.
 */

'use strict';

const http = require('node:http');

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * @typedef {object} EthRpcClientConfig
 * @property {string}  [host='127.0.0.1']
 * @property {number}  port            geth HTTP-RPC port (ESC=20636, EID=20646, PG=20676)
 * @property {number}  [timeoutMs=10000]
 */

class EthRpcClient {
    /**
     * @param {EthRpcClientConfig} config
     */
    constructor(config) {
        if (!config || typeof config !== 'object') {
            throw new TypeError('EthRpcClient: config object required');
        }
        this.host = config.host || '127.0.0.1';
        this.port = config.port;
        if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
            throw new RangeError(`EthRpcClient: invalid port ${this.port}`);
        }
        this.timeoutMs = Number.isInteger(config.timeoutMs)
            ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
        // Single monotonic id; geth doesn't care about uniqueness across
        // calls but we want it deterministic in the trace logs.
        this._nextId = 1;
    }

    /**
     * Generic JSON-RPC call. Throws on transport, HTTP, or RPC-level errors.
     *
     * @param {string} method
     * @param {Array} [params=[]]
     * @returns {Promise<unknown>} the `result` field of the RPC response
     */
    call(method, params) {
        const self = this;
        return new Promise((resolve, reject) => {
            if (typeof method !== 'string' || method.length === 0) {
                return reject(new TypeError('EthRpcClient.call: method required'));
            }
            const id = this._nextId++;
            const body = JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params: Array.isArray(params) ? params : [],
            });
            const req = http.request({
                host: self.host,
                port: self.port,
                method: 'POST',
                path: '/',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: self.timeoutMs,
            }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        // 0.5.111 audit Session 111 — typed transport error.
                        // HTTP non-200 from geth's RPC server means the
                        // request reached the server but was rejected
                        // (rate-limit, bad path, malformed body). Distinct
                        // from "server not running" — callers can branch
                        // on instanceof EthRpcUnreachableError below.
                        return reject(new EthRpcTransportError(
                            `EthRpcClient: ${method} → HTTP ${res.statusCode}`,
                        ));
                    }
                    let parsed;
                    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                    catch (err) {
                        return reject(new EthRpcTransportError(
                            `EthRpcClient: ${method} → invalid JSON: ${err.message}`,
                        ));
                    }
                    if (parsed && parsed.error) {
                        const msg = (parsed.error && parsed.error.message)
                            || JSON.stringify(parsed.error);
                        // 0.5.111 audit Session 111 — typed method error.
                        // Chain-side errors (method not found, invalid
                        // params) — operator-meaningful; preserve the
                        // message. Caller can recognize via instanceof
                        // EthRpcMethodError without string-matching.
                        return reject(new EthRpcMethodError(
                            `EthRpcClient: ${method} → ${msg}`,
                            parsed.error.code,
                        ));
                    }
                    return resolve(parsed && parsed.result);
                });
                res.on('error', reject);
            });
            req.on('timeout', () => {
                req.destroy(new EthRpcTransportError(
                    `EthRpcClient: ${method} timed out after ${self.timeoutMs}ms`,
                ));
            });
            req.on('error', (err) => {
                // 0.5.111 audit Session 111 — mirror EnmRpcClient's typed-
                // error branching. ECONNREFUSED is the canonical "node
                // process not running" signal — F-rules consume this to
                // distinguish "chain down" from "chain alive but slow".
                // Pre-0.5.111 every transport failure looked identical to
                // callers (plain Error), so the dashboard couldn't tell
                // an off chain from a flaky one and showed the same
                // generic pill for both.
                if (err && err.code === 'ECONNREFUSED') {
                    return reject(new EthRpcUnreachableError(
                        `EthRpcClient: ${method} → connection refused at ${self.host}:${self.port}`,
                    ));
                }
                reject(new EthRpcTransportError(
                    `EthRpcClient: ${method} → ${err && err.message ? err.message : String(err)}`,
                ));
            });
            req.write(body);
            req.end();
        });
    }

    // -------- Convenience wrappers (return parsed numbers where useful) --------

    /**
     * eth_blockNumber. Returns the current best block height as a Number.
     * Geth returns a hex string; we parse to int for parity with EnmRpcClient.
     *
     * @returns {Promise<number>}
     */
    async getBlockNumber() {
        const hex = await this.call('eth_blockNumber', []);
        return parseHexNumber(hex, 'eth_blockNumber');
    }

    /**
     * eth_chainId. Returns the chain id as a Number (e.g. ESC mainnet is 20).
     * Used to verify we're talking to the chain the cfg claims.
     *
     * @returns {Promise<number>}
     */
    async getChainId() {
        const hex = await this.call('eth_chainId', []);
        return parseHexNumber(hex, 'eth_chainId');
    }

    /**
     * eth_syncing. Returns either `false` (fully synced) or an object
     * with { startingBlock, currentBlock, highestBlock } as Numbers.
     *
     * @returns {Promise<false | { startingBlock: number, currentBlock: number, highestBlock: number }>}
     */
    async syncing() {
        const result = await this.call('eth_syncing', []);
        if (result === false || result == null) { return false; }
        if (typeof result === 'object') {
            return {
                startingBlock: parseHexNumber(result.startingBlock, 'syncing.startingBlock'),
                currentBlock:  parseHexNumber(result.currentBlock,  'syncing.currentBlock'),
                highestBlock:  parseHexNumber(result.highestBlock,  'syncing.highestBlock'),
            };
        }
        return false;
    }

    /**
     * net_peerCount. Returns the count as a Number.
     *
     * @returns {Promise<number>}
     */
    async getPeerCount() {
        const hex = await this.call('net_peerCount', []);
        return parseHexNumber(hex, 'net_peerCount');
    }

    /**
     * net_listening. Returns boolean — is the node accepting peer connections?
     *
     * @returns {Promise<boolean>}
     */
    async netListening() {
        const result = await this.call('net_listening', []);
        return result === true;
    }

    /**
     * v0.5.175 — admin_addPeer: dial an enode now (dynamic peer; lost on
     * restart). Used by the self-service "add peer" feature for INSTANT effect
     * (the durable side is cfg.bootnodes → --bootnodes on next start). Requires
     * the `admin` RPC namespace (enabled in our rpcapi since v0.5.172).
     *
     * @param {string} enode  enode://<128hex>@<host>:<port>
     * @returns {Promise<boolean>}
     */
    async addPeer(enode) {
        const result = await this.call('admin_addPeer', [enode]);
        return result === true;
    }

    /**
     * v0.5.175 — admin_addTrustedPeer: like addPeer but the connection is
     * persistent + reconnected + exempt from the maxpeers cap. Best for an
     * operator-pinned seed (e.g. their own node). Still lost on restart unless
     * persisted to cfg.bootnodes (which we do).
     *
     * @param {string} enode
     * @returns {Promise<boolean>}
     */
    async addTrustedPeer(enode) {
        const result = await this.call('admin_addTrustedPeer', [enode]);
        return result === true;
    }

    /**
     * net_version. Returns the network version string (e.g. "20" for ESC mainnet).
     *
     * @returns {Promise<string>}
     */
    async getNetVersion() {
        const v = await this.call('net_version', []);
        return String(v == null ? '' : v);
    }

    /**
     * eth_gasPrice. Returns the suggested gas price as a BigInt wei value
     * (geth returns hex; JS Numbers can't safely hold large wei amounts).
     *
     * @returns {Promise<bigint>}
     */
    async getGasPrice() {
        const hex = await this.call('eth_gasPrice', []);
        if (typeof hex !== 'string') {
            throw new Error(`EthRpcClient: eth_gasPrice returned non-string: ${typeof hex}`);
        }
        return BigInt(hex);
    }

    /**
     * eth_getBalance(addr, 'latest'). Returns the balance as a BigInt wei.
     * Used by Class D (Arbiter) mining-address balance check in M6.
     *
     * @param {string} addr  0x-prefixed 40-hex Ethereum address
     * @returns {Promise<bigint>}
     */
    async getBalance(addr) {
        if (typeof addr !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
            throw new TypeError('EthRpcClient.getBalance: addr must be 0x + 40 hex');
        }
        const hex = await this.call('eth_getBalance', [addr, 'latest']);
        if (typeof hex !== 'string') {
            throw new Error('EthRpcClient: eth_getBalance returned non-string');
        }
        return BigInt(hex);
    }
}

// 0.5.111 audit Session 111 — typed error classes mirroring
// EnmRpcClient's hierarchy. Pre-0.5.111 every failure path threw a plain
// Error, so callers (chain-card health pill, HealthChecker F-rules)
// couldn't tell "chain process down" from "method not supported" from
// "timeout" without string-matching the message. Now: branch on
// instanceof. Existing callers that just catch any Error still work —
// these are subclasses.
class EthRpcError extends Error {
    constructor(message) { super(message); this.name = 'EthRpcError'; }
}
class EthRpcUnreachableError extends EthRpcError {
    constructor(message) { super(message); this.name = 'EthRpcUnreachableError'; }
}
class EthRpcTransportError extends EthRpcError {
    constructor(message) { super(message); this.name = 'EthRpcTransportError'; }
}
class EthRpcMethodError extends EthRpcError {
    constructor(message, code) { super(message); this.name = 'EthRpcMethodError'; this.code = code; }
}

/**
 * Parse a hex-encoded number (with or without "0x" prefix) into a JS Number.
 * Throws if the value is out of safe-integer range so silent overflow is
 * caught at the boundary.
 *
 * @param {string} hex
 * @param {string} ctx for error messages
 * @returns {number}
 */
function parseHexNumber(hex, ctx) {
    if (typeof hex !== 'string') {
        throw new Error(`EthRpcClient: ${ctx} returned non-string: ${typeof hex}`);
    }
    const big = BigInt(hex);
    if (big > Number.MAX_SAFE_INTEGER) {
        throw new RangeError(
            `EthRpcClient: ${ctx} value ${big.toString()} exceeds Number.MAX_SAFE_INTEGER`,
        );
    }
    return Number(big);
}

module.exports = {
    EthRpcClient,
    DEFAULT_TIMEOUT_MS,
    // 0.5.111 audit Session 111 — typed error classes (parity with
    // EnmRpcClient). Callers can `instanceof EthRpcUnreachableError`
    // to branch on the ECONNREFUSED case without string-matching.
    EthRpcError,
    EthRpcUnreachableError,
    EthRpcTransportError,
    EthRpcMethodError,
    // Exported for tests.
    _internal: { parseHexNumber },
};
