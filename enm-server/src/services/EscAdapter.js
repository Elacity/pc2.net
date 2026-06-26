/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EscAdapter — Wave M3.2 (beta.3.96) — Elastos Smart Chain adapter.
 *
 * Class B (EVM PBFT sidechain) — extends EvmSidechainAdapter base.
 * Only the chain-specific identity + canonical ports need to be
 * declared; all spawn/start/RPC behavior comes from the base class
 * (M3.1).
 *
 * Canonical values (per the audited Elastos docs / plan §14):
 *   chainId        — 'esc' (matches cfg.chains key, binary name, dir name)
 *   chainIdValue   — 20 (EIP-155 mainnet chain id)
 *   defaultRpcPort — 20636 (HTTP-RPC)
 *
 * Ports for ESC mainnet (verified plan §14 + Elastos docs):
 *   20630 — UDP discovery
 *   20632 — HTTP info (legacy, unused by ENM)
 *   20636 — HTTP-RPC (cfg.ports.rpc)
 *   20638 — P2P TCP+UDP (cfg.ports.p2p)
 *   20639 — DPoS TCP (cfg.ports.dpos)
 *
 * Testnet uses the 21xxx range per H19 (replace leading '20' with '21').
 */

'use strict';

const EvmSidechainAdapter = require('./EvmSidechainAdapter');

class EscAdapter extends EvmSidechainAdapter {
    get chainId()        { return 'esc'; }
    get displayName()    { return 'Elastos Smart Chain'; }
    get binaryName()     { return 'esc'; }
    get defaultRpcPort() { return 20636; }
    get chainIdValue()   { return 20; }
}

module.exports = EscAdapter;
