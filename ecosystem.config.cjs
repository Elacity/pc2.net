/**
 * PM2 Ecosystem Configuration
 *
 * Runs node DIRECTLY (not via npm) to prevent orphaned processes on restart.
 * When PM2 kills the process, it kills the actual node process, not just an npm wrapper.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 reload ecosystem.config.cjs    # zero-downtime reload (preferred for env changes)
 *   pm2 restart ecosystem.config.cjs   # full restart (downtime)
 *   pm2 stop pc2
 *
 * Operator env overrides:
 *   This file reads optional secrets from process.env so operators do NOT
 *   have to edit this tracked file. Set the vars in:
 *     - pc2-node/.env       (auto-loaded by dotenv at boot — preferred)
 *     - shell environment   (export VAR=...; then pm2 start)
 *     - systemd unit file   (Environment= directives)
 *
 *   See pc2-node/.env.example for the full list of opt-in env vars.
 *
 * Log rotation (operator setup, ONE-TIME):
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 50M
 *   pm2 set pm2-logrotate:retain 7
 *   pm2 set pm2-logrotate:compress true
 *   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
 *   # Without this, pm2-out.log can grow unbounded (we've seen 945 MB in production).
 */
// v1.2.7.2: use __dirname-based absolute paths for cwd/script. The
// previous "./pc2-node" + "dist/index.js" pattern caused PM2 to double-
// resolve paths when UpdateService called `pm2 startOrRestart` from
// inside pc2-node/, producing e.g. /Users/sash/.pc2/pc2-node/pc2-node/dist/index.js
// which "Script not found"-ed. Absolute paths are unambiguous regardless
// of CWD at start time.
const path = require('path');
const PC2_NODE_DIR = path.join(__dirname, 'pc2-node');

module.exports = {
  apps: [{
    name: "pc2",
    cwd: PC2_NODE_DIR,
    script: path.join(PC2_NODE_DIR, 'dist/index.js'),
    interpreter: "node",

    // Restart behavior - prevents port conflicts from rapid restarts
    restart_delay: 10000,     // Wait 10 seconds between restarts (ports need time to release)
    max_restarts: 10,         // Max 10 restarts before giving up
    min_uptime: 30000,        // Must run 30s to count as successful start
    kill_timeout: 15000,      // Wait 15s for graceful shutdown

    // Node.js options for large file handling and IPFS performance
    node_args: "--max-old-space-size=2048",

    // Environment
    //
    // Hardcoded defaults (always set):
    //   NODE_ENV, PORT, PATH                       — runtime / system
    //   LIT_BACKEND, REPLICATION_MIN/MAX           — feature defaults
    //   NODE_TLS_REJECT_UNAUTHORIZED               — TLS verification (always "1")
    //
    // Conditional opt-in vars (cluster, AI, comms credentials, RPC pool):
    //   We use the spread pattern `...(process.env.X ? { X: process.env.X } : {})`
    //   so that absent shell env vars are NOT inserted into pm2's env block as
    //   empty strings. This is critical for the dotenv-loaded `pc2-node/.env`
    //   path to work: dotenv (default `override: false`) won't overwrite a key
    //   that's already in process.env — and an empty string counts as "set".
    //
    //   With this pattern:
    //     - Shell sets KEY  → pm2 inserts KEY  → dotenv sees it set, skips → shell wins ✓
    //     - Shell empty     → pm2 omits KEY    → dotenv populates from .env  → .env wins ✓
    //     - Both unset      → pm2 omits KEY    → dotenv has nothing          → feature off ✓
    //
    //   See SUPERNODE-RPC-PROXY task notes (2026-05-02) for the full
    //   diagnosis of the original `process.env.X || ""` bug.
    env: {
      NODE_ENV: "production",
      PORT: "4200",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin",

      // ── Always-set feature defaults (safe to be in env block, no secrets) ──
      LIT_BACKEND: process.env.LIT_BACKEND || "chipotle",
      SUPERNODE_CLUSTER_PIN_REPLICATION_MIN: process.env.SUPERNODE_CLUSTER_PIN_REPLICATION_MIN || "2",
      SUPERNODE_CLUSTER_PIN_REPLICATION_MAX: process.env.SUPERNODE_CLUSTER_PIN_REPLICATION_MAX || "2",

      // Always verify TLS: an inherited "0" from the shell would disable it process-wide.
      NODE_TLS_REJECT_UNAUTHORIZED: "1",

      // ── Opt-in: IPFS Cluster pinning (v1.2.7+) ─────────────────────────
      // When both URL and TOKEN are set, pc2-node forwards every successful
      // local pin to the supernode IPFS Cluster for replication. See
      // pc2-node/src/services/clusterPin.ts and pc2-node/.env.example.
      ...(process.env.SUPERNODE_CLUSTER_PIN_URL   ? { SUPERNODE_CLUSTER_PIN_URL:   process.env.SUPERNODE_CLUSTER_PIN_URL }   : {}),
      ...(process.env.SUPERNODE_CLUSTER_PIN_TOKEN ? { SUPERNODE_CLUSTER_PIN_TOKEN: process.env.SUPERNODE_CLUSTER_PIN_TOKEN } : {}),

      // ── Opt-in: Legacy supernode/Elacity forwards (still supported) ────
      // Pre-v1.2.7 mechanisms. Cluster forwarding is additive — these can
      // stay configured and continue to fire in parallel.
      ...(process.env.ELACITY_PIN_FORWARD_URL ? { ELACITY_PIN_FORWARD_URL: process.env.ELACITY_PIN_FORWARD_URL } : {}),
      ...(process.env.SUPERNODE_PIN_MIRRORS   ? { SUPERNODE_PIN_MIRRORS:   process.env.SUPERNODE_PIN_MIRRORS }   : {}),

      // ── Opt-in: Supernode RPC pool (Web3 reads) ────────────────────────
      // Comma-separated list of authoritative Base RPC URLs (Alchemy / Infura /
      // self-hosted reth). Prepended to the public fallback chain at boot.
      // Without this set, public RPC providers will rate-limit on Particle
      // Auth's getPrimaryAssets() burst — see SUPERNODE-RPC-PROXY task.
      ...(process.env.SUPERNODE_RPC_URLS ? { SUPERNODE_RPC_URLS: process.env.SUPERNODE_RPC_URLS } : {}),

      // ── Opt-in: AI providers ───────────────────────────────────────────
      // Pc2-node's AI service auto-detects which providers are configured.
      // See pc2-node/.env.example for sign-up links.
      ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
      ...(process.env.OPENAI_API_KEY    ? { OPENAI_API_KEY:    process.env.OPENAI_API_KEY }    : {}),
      ...(process.env.GOOGLE_API_KEY    ? { GOOGLE_API_KEY:    process.env.GOOGLE_API_KEY }    : {}),
      ...(process.env.XAI_API_KEY       ? { XAI_API_KEY:       process.env.XAI_API_KEY }       : {}),
      ...(process.env.OLLAMA_BASE_URL   ? { OLLAMA_BASE_URL:   process.env.OLLAMA_BASE_URL }   : {}),

      // ── Opt-in: Communication gateways ─────────────────────────────────
      ...(process.env.TELEGRAM_BOT_TOKEN ? { TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN } : {}),
      // WhatsApp via Baileys uses session files in pc2-node/data/, no env var.

      // ── Opt-in: Lit Protocol overrides (defaults baked into codebase) ──
      ...(process.env.LIT_ACTION_CID   ? { LIT_ACTION_CID:   process.env.LIT_ACTION_CID }   : {}),
      ...(process.env.MEDIA_ACTION_CID ? { MEDIA_ACTION_CID: process.env.MEDIA_ACTION_CID } : {})
    },

    // Logging
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    // NOTE: log size capped via pm2-logrotate module (see file header).
    // Without pm2-logrotate, ~/.pm2/logs/pc2-out.log grows unbounded.
  }]
};
