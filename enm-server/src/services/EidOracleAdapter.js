/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * EidOracleAdapter — Wave M4.1 (beta.0.3.1) — EID sidekick oracle.
 *
 * Class C; analogous to EscOracleAdapter. Script name differs:
 *   ESC oracle → crosschain_oracle.js
 *   EID oracle → crosschain_eid.js
 *   PG  oracle → crosschain_pg.js   (M5.4)
 *
 * The EID oracle's relay target is the same mainchain RPC; only its
 * parent (EID, not ESC) and script filename differ.
 */

'use strict';

const OracleAdapter = require('./OracleAdapter');

class EidOracleAdapter extends OracleAdapter {
    get chainId()        { return 'eid-oracle'; }
    get displayName()    { return 'EID Oracle'; }
    get scriptFilename() { return 'crosschain_eid.js'; }
    get parentChainId()  { return 'eid'; }
}

module.exports = EidOracleAdapter;
