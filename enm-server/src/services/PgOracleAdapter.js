/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * PgOracleAdapter — Wave M5.4 (beta.0.3.9) — PG sidekick oracle.
 *
 * Class C (Oracle) — same shape as Esc/EidOracleAdapter; only the
 * scriptFilename + parent differ.
 *
 * The PG oracle relays cross-chain transactions between PG and
 * mainchain. PG itself is closed-source (plan §11 risk #2) but the
 * oracle script is open-source Node.js — so the trust posture is the
 * same as ESC/EID oracles.
 */

'use strict';

const OracleAdapter = require('./OracleAdapter');

class PgOracleAdapter extends OracleAdapter {
    get chainId()        { return 'pg-oracle'; }
    get displayName()    { return 'PG Oracle'; }
    get scriptFilename() { return 'crosschain_pg.js'; }
    get parentChainId()  { return 'pg'; }
}

module.exports = PgOracleAdapter;
