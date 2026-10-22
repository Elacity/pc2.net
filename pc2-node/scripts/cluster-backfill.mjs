#!/usr/bin/env node
/* eslint-disable */
// cluster-backfill.js — one-shot script to push failed/stuck pinned_cids
// (and nft_pins) rows from the local Jetson SQLite DB into the supernode
// IPFS Cluster, retroactively fixing today's "buyer can't reach minter's
// content" pain.
//
// Usage:
//   DRY_RUN=1 node cluster-backfill.js   (just count + list, no writes)
//   node cluster-backfill.js              (actually backfill)
//
// Required env (already set in pc2-node ecosystem.config.cjs):
//   SUPERNODE_CLUSTER_PIN_URL, SUPERNODE_CLUSTER_PIN_TOKEN
// Run from pc2-node/ after `npm run build`: certificates are verified with
// the same trust policy as the server (supernode IPs checked as *.ela.city).

import { installOutboundTlsPolicy } from "../dist/utils/tlsTrust.js";
installOutboundTlsPolicy();

// Try @photostructure/sqlite first (v1.2.7+), fall back to better-sqlite3 (v1.2.6).
let Database;
try {
  ({ Database } = await import("@photostructure/sqlite"));
} catch {
  Database = (await import("better-sqlite3")).default;
}

const URL = process.env.SUPERNODE_CLUSTER_PIN_URL;
const TOKEN = process.env.SUPERNODE_CLUSTER_PIN_TOKEN;
const REPL_MIN = process.env.SUPERNODE_CLUSTER_PIN_REPLICATION_MIN || "2";
const REPL_MAX = process.env.SUPERNODE_CLUSTER_PIN_REPLICATION_MAX || "2";
const DB_PATH = process.env.PC2_DB_PATH || "./data/pc2.db";
const DRY_RUN = process.env.DRY_RUN === "1";
const STUCK_MIN = parseInt(process.env.STUCK_MIN || "30", 10); // 30 min
const LIMIT = parseInt(process.env.LIMIT || "1000", 10);

if (!URL || !TOKEN) {
  console.error("ERROR: SUPERNODE_CLUSTER_PIN_URL and _TOKEN must be set");
  process.exit(1);
}

console.log(`Cluster URL : ${URL}`);
console.log(`DB path     : ${DB_PATH}`);
console.log(`Replication : ${REPL_MIN}/${REPL_MAX}`);
console.log(`Stuck after : ${STUCK_MIN} min`);
console.log(`Limit       : ${LIMIT}`);
console.log(`Dry run     : ${DRY_RUN}`);
console.log("");

// Both adapters accept (path, opts) with readonly support.
const db = new Database(DB_PATH, DRY_RUN ? { readonly: true } : {});

console.log("=== pinned_cids status histogram ===");
const pcStats = db.prepare(
  "SELECT pin_status, COUNT(*) as n FROM pinned_cids GROUP BY pin_status ORDER BY n DESC"
).all();
for (const r of pcStats) {
  console.log(`  ${r.pin_status.padEnd(10)} ${r.n}`);
}

console.log("");
console.log("=== nft_pins status histogram ===");
const npStats = db.prepare(
  "SELECT pin_status, COUNT(*) as n FROM nft_pins GROUP BY pin_status ORDER BY n DESC"
).all();
for (const r of npStats) {
  console.log(`  ${r.pin_status.padEnd(10)} ${r.n}`);
}

// pinned_at is stored as milliseconds-epoch (Date.now()) in pc2-node.
const stuckCutoff = Date.now() - STUCK_MIN * 60 * 1000;

console.log("");
console.log(`=== Candidates (failed OR stuck>${STUCK_MIN}min in queued/pinning) ===`);
const candidates = db.prepare(`
  SELECT cid, wallet_address, source, size, pinned_at, pin_status
  FROM pinned_cids
  WHERE pin_status = 'failed'
     OR (pin_status IN ('queued', 'pinning') AND pinned_at < ?)
  ORDER BY pinned_at DESC
  LIMIT ?
`).all(stuckCutoff, LIMIT);

console.log(`Found ${candidates.length} pinned_cids candidate(s)`);

const nftCandidates = db.prepare(`
  SELECT np.cid, np.wallet_address, np.name, np.collection_name, np.pinned_at, np.pin_status
  FROM nft_pins np
  LEFT JOIN pinned_cids pc ON np.cid = pc.cid
  WHERE pc.cid IS NULL  -- only nft_pins NOT already covered by pinned_cids backfill
    AND (np.pin_status = 'failed'
         OR (np.pin_status IN ('queued', 'pinning') AND np.pinned_at < ?))
  ORDER BY np.pinned_at DESC
  LIMIT ?
`).all(stuckCutoff, LIMIT);

console.log(`Found ${nftCandidates.length} extra nft_pins-only candidate(s) (not in pinned_cids)`);

const allCids = new Map();
for (const r of candidates) allCids.set(r.cid, { ...r, table: "pinned_cids" });
for (const r of nftCandidates) {
  if (!allCids.has(r.cid)) allCids.set(r.cid, { ...r, table: "nft_pins" });
}

console.log(`Total unique CIDs to backfill: ${allCids.size}`);
console.log("");

if (allCids.size === 0) {
  console.log("Nothing to backfill. Done.");
  db.close();
  process.exit(0);
}

console.log("=== First 10 examples ===");
let i = 0;
for (const [cid, row] of allCids) {
  if (i++ >= 10) break;
  const date = new Date(row.pinned_at || 0).toISOString().slice(0, 16);
  console.log(`  ${cid}  status=${row.pin_status}  source=${row.source || row.table}  pinned_at=${date}`);
}
console.log("");

if (DRY_RUN) {
  console.log("DRY_RUN — exiting before any cluster POSTs or DB updates.");
  db.close();
  process.exit(0);
}

console.log("=== Backfilling to cluster ===");
const updateStmtPC = db.prepare("UPDATE pinned_cids SET pin_status = ? WHERE cid = ?");
const updateStmtNP = db.prepare("UPDATE nft_pins SET pin_status = ? WHERE cid = ?");

const target = `${URL.replace(/\/+$/, "")}/pins`;
let okCount = 0;
let alreadyCount = 0;
let errCount = 0;
const errors = [];

const cids = Array.from(allCids.entries());
for (let idx = 0; idx < cids.length; idx++) {
  const [cid, row] = cids[idx];
  const body = {
    cid,
    name: `backfill-${cid.slice(0, 12)}-${Date.now()}`,
    meta: {
      "replication-min": REPL_MIN,
      "replication-max": REPL_MAX,
      "origin": "jetson-backfill-2026-05-02",
    },
  };
  try {
    const resp = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok) {
      updateStmtPC.run("complete", cid);
      updateStmtNP.run("complete", cid);
      okCount++;
      if (idx % 25 === 0 || idx === cids.length - 1) {
        process.stdout.write(`\r  progress: ${idx + 1}/${cids.length}  ok=${okCount} err=${errCount}    `);
      }
    } else {
      const txt = (await resp.text().catch(() => "")).slice(0, 200);
      errCount++;
      errors.push({ cid, status: resp.status, body: txt });
    }
  } catch (e) {
    errCount++;
    errors.push({ cid, error: e.message });
  }
  await new Promise((r) => setTimeout(r, 80));
}

process.stdout.write("\n");
console.log("");
console.log("=== SUMMARY ===");
console.log(`  ok           : ${okCount}`);
console.log(`  err          : ${errCount}`);
console.log(`  total tried  : ${cids.length}`);

if (errors.length > 0) {
  console.log("");
  console.log("=== First 10 errors ===");
  for (const e of errors.slice(0, 10)) {
    console.log(`  ${e.cid}  ${e.status || "EXC"}  ${e.body || e.error}`);
  }
}

db.close();
console.log("Done.");
