-- PC2 Node Database Schema
-- SQLite database for persistent storage
-- Version 32: Full schema with all migrations applied through migration 32.
--
-- IMPORTANT: This file is the canonical "fully-current" snapshot used by
-- runInitialSchema() in migrations.ts on fresh installs. Anything created
-- by an incremental migration in migrations.ts MUST also live here, or
-- fresh installs will be missing it (the v1.2.7.0/.1 publish_drafts
-- regression we shipped on 2026-05-03 was caused by exactly this drift —
-- migrations 14, 20, 21, 22, 23, 25-28 created tables that never made it
-- into schema.sql, so fresh installs crashed when apps queried them).

-- Users table: Wallet-based user accounts
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT PRIMARY KEY,
  smart_account_address TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

-- Sessions table: Active user sessions
-- scope/scope_data (added in migration 29 / SEC-3c, 2026-04 audit) constrain
-- a session to a specific resource. NULL scope = unrestricted owner/user
-- session. scope='file' = ephemeral session bound to a single fileUid (used
-- by Puter iframe apps replacing the previous insecure mock-token pattern).
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  smart_account_address TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT,
  scope_data TEXT,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Files metadata table: File and directory metadata
CREATE TABLE IF NOT EXISTS files (
  path TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  ipfs_hash TEXT,
  size INTEGER DEFAULT 0,
  mime_type TEXT,
  thumbnail TEXT,
  content_text TEXT,
  is_dir INTEGER DEFAULT 0,
  is_public INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (path, wallet_address),
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- File versions table: Track file version history
CREATE TABLE IF NOT EXISTS file_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  ipfs_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  comment TEXT,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address),
  UNIQUE(file_path, wallet_address, version_number)
);

-- Settings table: Node configuration and settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- AI Config table: Wallet-scoped AI configuration
CREATE TABLE IF NOT EXISTS ai_config (
  wallet_address TEXT PRIMARY KEY,
  default_provider TEXT DEFAULT 'ollama',
  default_model TEXT,
  api_keys TEXT,
  ollama_base_url TEXT DEFAULT 'http://localhost:11434',
  context_awareness INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
);

-- AI Memory State table: Context engineering for persistent AI memory
CREATE TABLE IF NOT EXISTS ai_memory_state (
  wallet_address TEXT PRIMARY KEY,
  consolidated_summary TEXT DEFAULT '',
  entities_json TEXT DEFAULT '[]',
  last_actions_json TEXT DEFAULT '[]',
  user_intent TEXT DEFAULT '',
  message_count INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- AI Conversations table: Persistent chat history
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  title TEXT DEFAULT 'New Conversation',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Recent apps table: Track recently launched apps per user
CREATE TABLE IF NOT EXISTS recent_apps (
  wallet_address TEXT NOT NULL,
  app_name TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  PRIMARY KEY (wallet_address, app_name),
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- API Keys table: For programmatic/agent access
CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER,
  revoked INTEGER DEFAULT 0,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Scheduled tasks table: Cron-like task scheduling
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,
  action TEXT NOT NULL,
  action_params TEXT,
  enabled INTEGER DEFAULT 1,
  last_run_at INTEGER,
  last_run_status TEXT,
  last_run_result TEXT,
  next_run_at INTEGER,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Audit logs table: Track agent and API actions
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  resource_path TEXT,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  request_body TEXT,
  response_summary TEXT,
  ip_address TEXT,
  user_agent TEXT,
  api_key_id TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);

-- Installed apps table: User-installed dApps from IPFS
CREATE TABLE IF NOT EXISTS installed_apps (
  app_name TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  cid TEXT NOT NULL,
  size INTEGER DEFAULT 0,
  icon TEXT,
  description TEXT,
  author TEXT,
  permissions_json TEXT DEFAULT '[]',
  requirements_json TEXT DEFAULT '{}',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Pinned CIDs table: Tracks marketplace purchases and CDN-participating content
CREATE TABLE IF NOT EXISTS pinned_cids (
  cid TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'marketplace',
  size INTEGER NOT NULL DEFAULT 0,
  pinned_at INTEGER NOT NULL,
  last_announced_at INTEGER,
  last_served_at INTEGER,
  serve_count INTEGER NOT NULL DEFAULT 0,
  pin_status TEXT NOT NULL DEFAULT 'complete',
  bytes_downloaded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cid, wallet_address)
);

-- NFT Pins table: Tracks NFT images pinned to the node by owners
CREATE TABLE IF NOT EXISTS nft_pins (
  cid TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  name TEXT,
  collection_name TEXT,
  mime_type TEXT,
  file_path TEXT,
  pin_status TEXT NOT NULL DEFAULT 'queued',
  pinned_at INTEGER NOT NULL,
  PRIMARY KEY (cid, wallet_address)
);

-- Content catalog table: On-chain indexed content for decentralized discovery
CREATE TABLE IF NOT EXISTS content_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT,
  channel_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  operative_address TEXT,
  creator_address TEXT NOT NULL,
  name TEXT,
  description TEXT,
  image_url TEXT,
  content_cid TEXT,
  metadata_cid TEXT,
  mime_type TEXT,
  asset_type TEXT,
  price TEXT,
  payment_token TEXT,
  op_type INTEGER,
  chain_id INTEGER NOT NULL DEFAULT 8453,
  block_number INTEGER NOT NULL,
  tx_hash TEXT,
  contract_version TEXT NOT NULL DEFAULT 'v2',
  metadata_status TEXT NOT NULL DEFAULT 'pending',
  indexed_at INTEGER NOT NULL,
  metadata_json TEXT,
  UNIQUE(channel_address, token_id, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_content_catalog_creator ON content_catalog(creator_address);
CREATE INDEX IF NOT EXISTS idx_content_catalog_type ON content_catalog(asset_type);
CREATE INDEX IF NOT EXISTS idx_content_catalog_content_id ON content_catalog(content_id);
CREATE INDEX IF NOT EXISTS idx_content_catalog_channel ON content_catalog(channel_address);
CREATE INDEX IF NOT EXISTS idx_content_catalog_status ON content_catalog(metadata_status);
CREATE INDEX IF NOT EXISTS idx_content_catalog_block ON content_catalog(block_number);

-- Telemetry on-ramp table: anonymous funnel events for v1.2 launch metrics
-- Tracks 4 events: install_started, wallet_ready, first_capsule_open, first_payment.
-- install_id is a random UUID generated once per node and stored in `settings`
-- (key: telemetry_install_id) so we can dedupe counts without collecting any PII.
-- Owner-only write; public-read aggregated only (no raw rows ever exposed).
CREATE TABLE IF NOT EXISTS telemetry_onramp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  ts INTEGER NOT NULL,
  install_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_onramp_event ON telemetry_onramp(event);
CREATE INDEX IF NOT EXISTS idx_telemetry_onramp_install ON telemetry_onramp(install_id);

-- T-1C Phase 1: metric registry. `metrics_counters` is monotonic per (name,
-- tags) and UPSERTed in place. `metrics_histogram_samples` appends a raw
-- sample per observation; the future daily flusher rolls them up + prunes.
-- `tags` is a canonicalised JSON string with sorted keys so identical tag
-- sets always collide on the primary key. Honoured by every recorder in
-- `pc2-node/src/utils/metrics.ts`; no-op when PC2_TELEMETRY_DISABLED=true.
CREATE TABLE IF NOT EXISTS metrics_counters (
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '{}',
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (name, tags)
);

CREATE INDEX IF NOT EXISTS idx_metrics_counters_name ON metrics_counters(name);

CREATE TABLE IF NOT EXISTS metrics_histogram_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '{}',
  value REAL NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_histogram_name_ts ON metrics_histogram_samples(name, ts);

-- Context events table: Awareness layer data (location, photos, voice, activity)
CREATE TABLE IF NOT EXISTS context_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- FTS5 Full-Text Search for files
-- Note: We don't use content='files' because the files table doesn't have a 'name' column
-- Instead, we use triggers to keep FTS5 in sync (defined below)
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  path,
  name,
  content,
  mime_type
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_wallet ON files(wallet_address);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_file_versions_path ON file_versions(file_path, wallet_address);
CREATE INDEX IF NOT EXISTS idx_file_versions_created ON file_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_config_wallet ON ai_config(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ai_memory_state_updated ON ai_memory_state(updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_wallet ON ai_conversations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(wallet_address, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_apps_wallet ON recent_apps(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_wallet ON audit_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_wallet ON scheduled_tasks(wallet_address);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at);
CREATE INDEX IF NOT EXISTS idx_installed_apps_cid ON installed_apps(cid);
CREATE INDEX IF NOT EXISTS idx_nft_pins_wallet ON nft_pins(wallet_address);
CREATE INDEX IF NOT EXISTS idx_nft_pins_contract ON nft_pins(contract_address, token_id);
CREATE INDEX IF NOT EXISTS idx_pinned_cids_wallet ON pinned_cids(wallet_address);
CREATE INDEX IF NOT EXISTS idx_pinned_cids_status ON pinned_cids(pin_status);
CREATE INDEX IF NOT EXISTS idx_pinned_cids_served ON pinned_cids(last_served_at);
CREATE INDEX IF NOT EXISTS idx_context_wallet_time ON context_events(wallet, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_context_type ON context_events(type);

-- ─────────────────────────────────────────────────────────────────────────
-- Tables historically created by migrations only (14, 20, 21, 22, 23, 25-28).
-- Mirrored here so fresh installs (which run schema.sql then stamp at
-- CURRENT_VERSION and skip the migration loop) get them too. Migration 32
-- in migrations.ts re-applies the same CREATE … IF NOT EXISTS statements
-- on existing v1.2.7.0/.1 installs that booted with a broken DB.
-- ─────────────────────────────────────────────────────────────────────────

-- Migration 14: Agent Proposals — AI agent transaction proposals awaiting approval
CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  from_address TEXT,
  smart_account_address TEXT,
  recipient TEXT,
  to_address TEXT,
  value TEXT,
  data TEXT,
  chain_id INTEGER,
  token_address TEXT,
  token_symbol TEXT,
  token_decimals INTEGER,
  token_amount TEXT,
  summary_action TEXT,
  summary_estimated_gas TEXT,
  summary_total_cost TEXT,
  tx_hash TEXT,
  error TEXT,
  rejection_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  approved_at INTEGER,
  rejected_at INTEGER,
  executed_at INTEGER,
  FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_wallet  ON agent_proposals(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_status  ON agent_proposals(status);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_created ON agent_proposals(wallet_address, created_at DESC);

-- Migration 20: Content hashes — perceptual fingerprinting + duplicate detection
CREATE TABLE IF NOT EXISTS content_hashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phash TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'phash',
  token_id TEXT,
  channel TEXT,
  creator TEXT,
  content_type TEXT,
  metadata_cid TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX IF NOT EXISTS idx_content_hashes_phash   ON content_hashes(phash);
CREATE INDEX IF NOT EXISTS idx_content_hashes_creator ON content_hashes(creator);
CREATE INDEX IF NOT EXISTS idx_content_hashes_token   ON content_hashes(token_id);
CREATE INDEX IF NOT EXISTS idx_content_hashes_source  ON content_hashes(source);

-- Migration 21: Publish drafts — Elacity Creator stages publish flows here
-- before pushing on-chain. Missing this table on fresh installs caused the
-- v1.2.7.0/.1 crash on first elacity-creator open.
CREATE TABLE IF NOT EXISTS publish_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  asset_cid TEXT NOT NULL,
  metadata_cid TEXT NOT NULL,
  encrypt_hash TEXT NOT NULL,
  kid TEXT,
  channel TEXT NOT NULL,
  price TEXT,
  currency_address TEXT,
  currency_symbol TEXT,
  copies INTEGER DEFAULT 1,
  access_method TEXT DEFAULT 'buy_once',
  reseller_cut INTEGER DEFAULT 0,
  royalty_partners TEXT,
  thumbnail_cid TEXT,
  adult INTEGER DEFAULT 0,
  steps TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drafts_wallet ON publish_drafts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON publish_drafts(status);

-- Migration 22: Agent audit log — AI action tracking for after-the-fact review
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  source TEXT,
  session_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_agent_ts ON agent_audit_log(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON agent_audit_log(action);

-- Migration 23: Installed skills — purchased skill ownership tracking
CREATE TABLE IF NOT EXISTS installed_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  kid TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  name TEXT,
  description TEXT,
  authority TEXT,
  chain_id INTEGER DEFAULT 8453,
  installed_at TEXT DEFAULT (datetime('now')),
  last_verified TEXT DEFAULT (datetime('now')),
  UNIQUE(wallet_address, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_installed_skills_wallet ON installed_skills(wallet_address);
CREATE INDEX IF NOT EXISTS idx_installed_skills_kid    ON installed_skills(kid);

-- Migrations 25 + 26 + 28 (final form): channel_metadata
-- Channel metadata overrides for V3 channels that have no on-chain stored
-- metadata. Columns from migration 25 (base table), migration 26
-- (plans/token_access) and migration 28 (creator/contract_version/block/
-- tx_hash/indexed_at) are all included here so fresh installs converge
-- on the same shape that incrementally-upgraded installs reach.
CREATE TABLE IF NOT EXISTS channel_metadata (
  address TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  description TEXT,
  categories TEXT,
  image TEXT,
  cover_image TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_by TEXT,
  plans TEXT,
  token_access TEXT,
  creator_address TEXT,
  contract_version TEXT,
  block_number INTEGER,
  tx_hash TEXT,
  indexed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_channel_metadata_creator ON channel_metadata(creator_address);
CREATE INDEX IF NOT EXISTS idx_channel_metadata_block   ON channel_metadata(block_number);

-- Triggers for FTS synchronization
CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, path, name, content, mime_type)
  VALUES (new.rowid, new.path, new.path, COALESCE(new.content_text, ''), COALESCE(new.mime_type, ''));
END;

CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON files BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS files_fts_update AFTER UPDATE ON files BEGIN
  UPDATE files_fts SET
    path = new.path,
    name = new.path,
    content = COALESCE(new.content_text, ''),
    mime_type = COALESCE(new.mime_type, '')
  WHERE rowid = new.rowid;
END;
