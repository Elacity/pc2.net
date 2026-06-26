/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * ClassBPorts — Wave M3.5 (beta.3.99) — canonical port tuples for the
 * Class B (EVM PBFT sidechain) ports per the audited Elastos docs.
 *
 * Plan §14 lists the verified values. Testnet uses the 21xxx range per
 * H19 (replace leading '20' with '21'). PG's UDP-discovery + WS ports
 * are unverified by the official docs (plan Q3/Q4 open questions);
 * we ship the most likely values + flag them in the schema for the
 * operator's diagnostic check at PG install time (M5.3).
 *
 * This helper is consulted by the M3.5 install endpoint when the
 * operator's payload doesn't override ports (most never will — the
 * canonical defaults Just Work).
 */

'use strict';

const PORTS = Object.freeze({
    mainnet: Object.freeze({
        esc: Object.freeze({
            rpc:       20636,
            p2p:       20638,
            dpos:      20639,
            discovery: 20630,
            httpInfo:  20632,
        }),
        eid: Object.freeze({
            rpc:       20646,
            p2p:       20648,
            dpos:      20649,
            discovery: 20640,
            httpInfo:  20642,
        }),
        pg: Object.freeze({
            // Verified per plan §14.
            rpc:       20676,
            p2p:       20678,
            dpos:      20679,
            // UDP discovery + httpInfo are operator-confirmed at first
            // PG run (M5.3 diagnostic). These are the canonical defaults
            // we ship; the diagnostic surfaces the actual bound ports.
            discovery: 20670,
            httpInfo:  20672,
        }),
    }),
    testnet: Object.freeze({
        esc: Object.freeze({
            rpc:       21636,
            p2p:       21638,
            dpos:      21639,
            discovery: 21630,
            httpInfo:  21632,
        }),
        eid: Object.freeze({
            rpc:       21646,
            p2p:       21648,
            dpos:      21649,
            discovery: 21640,
            httpInfo:  21642,
        }),
        pg: Object.freeze({
            rpc:       21676,
            p2p:       21678,
            dpos:      21679,
            discovery: 21670,
            httpInfo:  21672,
        }),
    }),
});

/**
 * Resolve the canonical Class B port tuple for (chainId, activeNet).
 * Throws if chainId is not a known Class B chain.
 *
 * @param {string} chainId  one of 'esc' | 'eid' | 'pg'
 * @param {string} activeNet  'mainnet' | 'testnet' (default 'mainnet')
 * @returns {{ rpc: number, p2p: number, dpos: number, discovery: number, httpInfo: number }}
 */
function portsFor(chainId, activeNet) {
    const net = activeNet === 'testnet' ? 'testnet' : 'mainnet';
    const byChain = PORTS[net];
    if (!byChain[chainId]) {
        throw new Error(`ClassBPorts.portsFor: unknown Class B chainId "${chainId}"`);
    }
    // Return a fresh object (not the frozen one) so caller can mutate.
    return Object.assign({}, byChain[chainId]);
}

/**
 * @returns {string[]} known Class B chainIds (esc, eid, pg).
 */
function knownChainIds() {
    return ['esc', 'eid', 'pg'];
}

module.exports = {
    PORTS,
    portsFor,
    knownChainIds,
};
