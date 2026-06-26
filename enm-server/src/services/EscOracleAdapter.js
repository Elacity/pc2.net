/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EscOracleAdapter — Wave M4.1 (beta.0.3.1) — ESC sidekick oracle.
 *
 * Watches ESC (parent) + relays cross-chain transactions to ELA
 * mainchain. Stateless Node.js HTTP relayer (Class C). Spawn:
 *   node <scriptPath>/crosschain_oracle.js
 *
 * Port: cfg.ports.httpRpc (operator-configurable; node.sh default 20632).
 */

'use strict';

const OracleAdapter = require('./OracleAdapter');

class EscOracleAdapter extends OracleAdapter {
    get chainId()        { return 'esc-oracle'; }
    get displayName()    { return 'ESC Oracle'; }
    get scriptFilename() { return 'crosschain_oracle.js'; }
    // parentChainId resolved by base ChainAdapter.parentOf static map
    // → 'esc'. Override here is unnecessary but harmless for clarity.
    get parentChainId()  { return 'esc'; }
}

module.exports = EscOracleAdapter;
