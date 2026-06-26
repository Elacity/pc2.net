/*
 * Copyright (C) 2026-present Elacity
 * SPDX-License-Identifier: AGPL-3.0
 *
 * db.js — wraps better-sqlite3 to expose the Puter-extension `db.write` /
 * `db.read` shape that the ENM services were written against.
 *
 * The original ENM extension consumed `extension.import('data').db` from
 * Puter's kernel, which exposed:
 *
 *   db.write(sql, paramsArray)  → Promise<{ lastInsertRowid, changes }>
 *   db.read(sql, paramsArray)   → Promise<row[]>
 *
 * better-sqlite3 is synchronous, so we wrap each call in Promise.resolve().
 * SQL placeholder syntax (`?`) is identical, so route SQL ports verbatim.
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

/**
 * @param {string} dbPath  absolute path to the SQLite file
 * @returns {{ raw: import('better-sqlite3').Database, write: Function, read: Function }}
 */
function openDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const raw = new Database(dbPath);
    // WAL gives us concurrent readers (the routes can hit the DB simultaneously).
    raw.pragma('journal_mode = WAL');
    raw.pragma('synchronous = NORMAL');
    // P1 (v0.5.182) — better-sqlite3 defaults busy_timeout to 0ms, so a WAL
    // auto-checkpoint colliding with a batched DELETE (audit cleanup) or a long
    // read throws SQLITE_BUSY straight to the route/health tick. Wait+retry for
    // up to 5s instead of failing the request.
    raw.pragma('busy_timeout = 5000');

    return {
        raw,
        async write(sql, params = []) {
            return raw.prepare(sql).run(...(params || []));
        },
        async read(sql, params = []) {
            return raw.prepare(sql).all(...(params || []));
        },
    };
}

module.exports = { openDb };
