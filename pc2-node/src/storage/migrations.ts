/**
 * Database Migrations
 * 
 * Manages database schema versioning and migrations
 */

import { type Database } from './database.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';
const log = createLogger('migrations');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Schema file is in source directory, not dist
// In production, this will be in dist/storage, but schema.sql needs to be copied
// For now, use source path (works in both dev and after copying schema.sql)
const SCHEMA_FILE = join(__dirname, 'schema.sql');

// Fallback: try source directory if not found in dist
function findSchemaFile(): string {
  if (existsSync(SCHEMA_FILE)) {
    return SCHEMA_FILE;
  }
  // Try source directory (for development)
  const sourceSchema = join(__dirname, '../../src/storage/schema.sql');
  if (existsSync(sourceSchema)) {
    return sourceSchema;
  }
  throw new Error(`Schema file not found. Tried: ${SCHEMA_FILE} and ${sourceSchema}`);
}
const CURRENT_VERSION = 34;

interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
}

/**
 * Get current database version
 */
function getCurrentVersion(db: Database): number {
  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number | null };
  return row.version ?? 0;
}

/**
 * Record migration as applied
 */
function recordMigration(db: Database, version: number): void {
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
    .run(version, Date.now());
}

/**
 * Run initial schema creation
 */
function runInitialSchema(db: Database): void {
  const schemaFile = findSchemaFile();
  const schema = readFileSync(schemaFile, 'utf8');
  db.exec(schema);
  recordMigration(db, CURRENT_VERSION);
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion === 0) {
    // First run: create initial schema
    log.info('📦 Creating initial database schema...');
    runInitialSchema(db);
    log.info('✅ Database schema created');
    return;
  }

  if (currentVersion < CURRENT_VERSION) {
    log.info(`📦 Running migrations from version ${currentVersion} to ${CURRENT_VERSION}...`);
    
    // Migration 2: Add thumbnail column to files table
    if (currentVersion < 2) {
      try {
        db.exec('ALTER TABLE files ADD COLUMN thumbnail TEXT');
        log.debug('✅ Added thumbnail column to files table');
      } catch (error: any) {
        // Column might already exist (e.g., from fresh install with new schema)
        if (!error.message.includes('duplicate column')) {
          log.warn(`⚠️  Migration 2 warning: ${error.message}`);
        }
      }
    }
    
    // Migration 3: Add FTS5 full-text search and content_text column
    if (currentVersion < 3) {
      try {
        // Add content_text column for storing extracted file content
        db.exec('ALTER TABLE files ADD COLUMN content_text TEXT');
        log.debug('✅ Added content_text column to files table');
        
        // Drop existing FTS5 table and triggers if they exist (for clean migration)
        db.exec('DROP TABLE IF EXISTS files_fts');
        db.exec('DROP TRIGGER IF EXISTS files_fts_insert');
        db.exec('DROP TRIGGER IF EXISTS files_fts_update');
        db.exec('DROP TRIGGER IF EXISTS files_fts_delete');
        
        // Create FTS5 virtual table for full-text search
        // Note: We don't use content='files' because the files table doesn't have a 'name' column
        // We'll use triggers to keep FTS5 in sync instead
        db.exec(`
          CREATE VIRTUAL TABLE files_fts USING fts5(
            path,
            name,
            content,
            mime_type
          )
        `);
        log.debug('✅ Created FTS5 virtual table files_fts');
        
        // Helper function to extract filename from path
        // SQLite doesn't have a built-in basename function, so we use a workaround
        // For path like /user/path/to/file.txt, we want file.txt
        // We'll extract it by finding the last '/' and taking everything after it
        
        // Create triggers to keep FTS5 in sync with files table
        // For name field, we'll store the full path (still searchable)
        // Filename extraction can be done in application code when needed
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(rowid, path, name, content, mime_type)
            VALUES (
              new.rowid, 
              new.path,
              new.path,  -- Store full path in name field (searchable)
              COALESCE(new.content_text, ''),
              COALESCE(new.mime_type, '')
            );
          END
        `);
        
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON files BEGIN
            DELETE FROM files_fts WHERE rowid = old.rowid;
          END
        `);
        
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS files_fts_update AFTER UPDATE ON files BEGIN
            UPDATE files_fts SET
              path = new.path,
              name = new.path,  -- Store full path in name field
              content = COALESCE(new.content_text, ''),
              mime_type = COALESCE(new.mime_type, '')
            WHERE rowid = new.rowid;
          END
        `);
        log.debug('✅ Created FTS5 sync triggers');
        
        // Populate FTS5 with existing files (if any)
        db.exec(`
          INSERT INTO files_fts(rowid, path, name, content, mime_type)
          SELECT 
            rowid,
            path,
            path as name,  -- Store full path in name field
            COALESCE(content_text, '') as content,
            COALESCE(mime_type, '') as mime_type
          FROM files
          WHERE is_dir = 0
        `);
        log.debug('✅ Populated FTS5 with existing files');
        
      } catch (error: any) {
        log.error(`❌ Migration 3 error: ${error.message}`);
        // Don't fail migration if FTS5 already exists
        if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
          throw error;
        }
      }
    }
    
    // Migration 4: Add file_versions table for version history
    if (currentVersion < 4) {
      try {
        log.info('📦 Running Migration 4: File versioning...');
        
        // Create file_versions table
        db.exec(`
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
          )
        `);
        
        // Create index for fast lookups
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_file_versions_path 
          ON file_versions(file_path, wallet_address)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_file_versions_created 
          ON file_versions(created_at DESC)
        `);
        
        log.info('✅ Migration 4 complete: File versioning table created');
        recordMigration(db, 4);
      } catch (error: any) {
        log.error(`❌ Migration 4 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 5: Add ai_config table for wallet-scoped AI configuration
    if (currentVersion < 5) {
      try {
        log.info('📦 Running Migration 5: AI configuration...');
        
        // Create ai_config table (wallet-scoped)
        db.exec(`
          CREATE TABLE IF NOT EXISTS ai_config (
            wallet_address TEXT PRIMARY KEY,
            default_provider TEXT DEFAULT 'ollama',
            default_model TEXT,
            api_keys TEXT,
            ollama_base_url TEXT DEFAULT 'http://localhost:11434',
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
          )
        `);
        
        // Create index for fast lookups
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_ai_config_wallet 
          ON ai_config(wallet_address)
        `);
        
        log.info('✅ Migration 5 complete: AI config table created');
        recordMigration(db, 5);
      } catch (error: any) {
        log.error(`❌ Migration 5 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 6: Clean model names in ai_config (remove provider prefixes)
    if (currentVersion < 6) {
      try {
        log.info('📦 Running Migration 6: Clean AI model names...');
        const rows = db.prepare('SELECT wallet_address, default_model FROM ai_config WHERE default_model IS NOT NULL').all() as Array<{wallet_address: string, default_model: string}>;
        
        let cleaned = 0;
        for (const row of rows) {
          let model = row.default_model;
          if (model && model.includes(':')) {
            const parts = model.split(':');
            // If first part is a provider name, remove it
            if (parts[0] === 'ollama' || parts[0] === 'claude' || parts[0] === 'openai' || parts[0] === 'gemini') {
              const cleanModel = parts.slice(1).join(':');
              db.prepare('UPDATE ai_config SET default_model = ? WHERE wallet_address = ?').run(cleanModel, row.wallet_address);
              log.debug(`  Cleaned model for ${row.wallet_address.substring(0, 10)}...: "${model}" -> "${cleanModel}"`);
              cleaned++;
            }
          }
        }
        
        log.info(`✅ Migration 6 complete: Cleaned ${cleaned} model name(s)`);
        recordMigration(db, 6);
      } catch (error: any) {
        log.error(`❌ Migration 6 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 7: Update deprecated Claude model names to current model
    if (currentVersion < 7) {
      try {
        log.info('📦 Running Migration 7: Update deprecated Claude models...');
        const deprecatedModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620'];
        const newModel = 'claude-sonnet-4-5-20250929';
        
        let updated = 0;
        for (const oldModel of deprecatedModels) {
          const rows = db.prepare('SELECT wallet_address, default_model FROM ai_config WHERE default_model = ?').all(oldModel) as Array<{wallet_address: string, default_model: string}>;
          for (const row of rows) {
            db.prepare('UPDATE ai_config SET default_model = ? WHERE wallet_address = ?').run(newModel, row.wallet_address);
            log.debug(`  Updated Claude model for ${row.wallet_address.substring(0, 10)}...: "${row.default_model}" -> "${newModel}"`);
            updated++;
          }
        }
        
        log.info(`✅ Migration 7 complete: Updated ${updated} Claude model name(s)`);
        recordMigration(db, 7);
      } catch (error: any) {
        log.error(`❌ Migration 7 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 8: Add recent_apps table for tracking recently launched apps
    if (currentVersion < 8) {
      try {
        log.info('📦 Running Migration 8: Recent apps table...');
        
        db.exec(`
          CREATE TABLE IF NOT EXISTS recent_apps (
            wallet_address TEXT NOT NULL,
            app_name TEXT NOT NULL,
            launched_at INTEGER NOT NULL,
            PRIMARY KEY (wallet_address, app_name),
            FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_recent_apps_wallet 
          ON recent_apps(wallet_address)
        `);
        
        log.info('✅ Migration 8 complete: Recent apps table created');
        recordMigration(db, 8);
      } catch (error: any) {
        log.error(`❌ Migration 8 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 9: Add api_keys table for agent/programmatic access
    if (currentVersion < 9) {
      try {
        log.info('📦 Running Migration 9: API keys table...');
        
        db.exec(`
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
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_api_keys_wallet 
          ON api_keys(wallet_address)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_api_keys_hash 
          ON api_keys(key_hash)
        `);
        
        log.info('✅ Migration 9 complete: API keys table created');
        recordMigration(db, 9);
      } catch (error: any) {
        log.error(`❌ Migration 9 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 10: Add audit_logs table for tracking agent actions
    if (currentVersion < 10) {
      try {
        log.info('📦 Running Migration 10: Audit logs table...');
        
        db.exec(`
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
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_audit_logs_wallet 
          ON audit_logs(wallet_address)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
          ON audit_logs(created_at DESC)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
          ON audit_logs(action)
        `);
        
        log.info('✅ Migration 10 complete: Audit logs table created');
        recordMigration(db, 10);
      } catch (error: any) {
        log.error(`❌ Migration 10 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 11: Add scheduled_tasks table for cron-like task scheduling
    if (currentVersion < 11) {
      try {
        log.info('📦 Running Migration 11: Scheduled tasks table...');
        
        db.exec(`
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
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_wallet 
          ON scheduled_tasks(wallet_address)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run 
          ON scheduled_tasks(next_run_at)
        `);
        
        log.info('✅ Migration 11 complete: Scheduled tasks table created');
        recordMigration(db, 11);
      } catch (error: any) {
        log.error(`❌ Migration 11 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 12: AI Memory State table (Context Engineering)
    if (currentVersion < 12) {
      try {
        log.info('📦 Running Migration 12: AI Memory State table...');
        
        db.exec(`
          CREATE TABLE IF NOT EXISTS ai_memory_state (
            wallet_address TEXT PRIMARY KEY,
            consolidated_summary TEXT DEFAULT '',
            entities_json TEXT DEFAULT '[]',
            last_actions_json TEXT DEFAULT '[]',
            user_intent TEXT DEFAULT '',
            message_count INTEGER DEFAULT 0,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
          )
        `);
        
        // Create index for faster lookups
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_ai_memory_state_updated 
          ON ai_memory_state(updated_at)
        `);
        
        log.info('✅ Migration 12 complete: AI Memory State table created');
        recordMigration(db, 12);
      } catch (error: any) {
        log.error(`❌ Migration 12 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 13: AI Conversations table (persistent chat history)
    if (currentVersion < 13) {
      try {
        log.info('📦 Running Migration 13: AI Conversations table...');
        
        db.exec(`
          CREATE TABLE IF NOT EXISTS ai_conversations (
            id TEXT PRIMARY KEY,
            wallet_address TEXT NOT NULL,
            title TEXT DEFAULT 'New Conversation',
            messages_json TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE
          )
        `);
        
        // Create index for wallet-scoped queries
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_ai_conversations_wallet 
          ON ai_conversations(wallet_address)
        `);
        
        // Create index for ordering by updated_at
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated 
          ON ai_conversations(wallet_address, updated_at DESC)
        `);
        
        log.info('✅ Migration 13 complete: AI Conversations table created');
        recordMigration(db, 13);
      } catch (error: any) {
        log.error(`❌ Migration 13 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 14: Agent Proposals table (AI agent transaction proposals)
    if (currentVersion < 14) {
      try {
        log.info('📦 Running Migration 14: Agent Proposals table...');
        
        db.exec(`
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
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_agent_proposals_wallet 
          ON agent_proposals(wallet_address)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_agent_proposals_status 
          ON agent_proposals(status)
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_agent_proposals_created 
          ON agent_proposals(wallet_address, created_at DESC)
        `);
        
        log.info('✅ Migration 14 complete: Agent Proposals table created');
        recordMigration(db, 14);
      } catch (error: any) {
        log.error(`❌ Migration 14 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 15: Context events table + context_awareness flag
    if (currentVersion < 15) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS context_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_context_wallet_time ON context_events(wallet, timestamp DESC)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_context_type ON context_events(type)`);

        // Add context_awareness flag to ai_config
        try {
          db.exec(`ALTER TABLE ai_config ADD COLUMN context_awareness INTEGER DEFAULT 0`);
        } catch {
          // Column already exists
        }

        log.info('✅ Migration 15 complete: Context events table + awareness flag');
        recordMigration(db, 15);
      } catch (error: any) {
        log.error(`❌ Migration 15 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 16: Installed apps table for dApp Store
    if (currentVersion < 16) {
      try {
        log.info('📦 Running Migration 16: Installed apps table...');
        
        db.exec(`
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
          )
        `);
        
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_installed_apps_cid
          ON installed_apps(cid)
        `);
        
        log.info('✅ Migration 16 complete: Installed apps table created');
        recordMigration(db, 16);
      } catch (error: any) {
        log.error(`❌ Migration 16 error: ${error.message}`);
        throw error;
      }
    }

    if (currentVersion < 17) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS pinned_cids (
            cid TEXT NOT NULL,
            wallet_address TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'marketplace',
            size INTEGER NOT NULL DEFAULT 0,
            pinned_at INTEGER NOT NULL,
            last_announced_at INTEGER,
            PRIMARY KEY (cid, wallet_address)
          )
        `);
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_pinned_cids_wallet
          ON pinned_cids(wallet_address)
        `);
        log.info('✅ Migration 17 complete: Pinned CIDs table created');
        recordMigration(db, 17);
      } catch (error: any) {
        log.error(`❌ Migration 17 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 18: Content seeding — add serve tracking + pin status to pinned_cids
    if (currentVersion < 18) {
      try {
        log.info('📦 Running Migration 18: Content seeding columns...');

        try {
          db.exec('ALTER TABLE pinned_cids ADD COLUMN last_served_at INTEGER');
        } catch { /* column may already exist */ }

        try {
          db.exec('ALTER TABLE pinned_cids ADD COLUMN serve_count INTEGER NOT NULL DEFAULT 0');
        } catch { /* column may already exist */ }

        try {
          db.exec("ALTER TABLE pinned_cids ADD COLUMN pin_status TEXT NOT NULL DEFAULT 'complete'");
        } catch { /* column may already exist */ }

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_pinned_cids_status
          ON pinned_cids(pin_status)
        `);

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_pinned_cids_served
          ON pinned_cids(last_served_at)
        `);

        log.info('✅ Migration 18 complete: Content seeding columns added');
        recordMigration(db, 18);
      } catch (error: any) {
        log.error(`❌ Migration 18 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 19: Content catalog table for on-chain content indexer
    if (currentVersion < 19) {
      try {
        log.info('📦 Running Migration 19: Content catalog table...');

        db.exec(`
          CREATE TABLE IF NOT EXISTS content_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_id TEXT,
            channel_address TEXT NOT NULL,
            token_id INTEGER NOT NULL,
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
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_creator ON content_catalog(creator_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_type ON content_catalog(asset_type)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_content_id ON content_catalog(content_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_channel ON content_catalog(channel_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_status ON content_catalog(metadata_status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_block ON content_catalog(block_number)`);

        log.info('✅ Migration 19 complete: Content catalog table created');
        recordMigration(db, 19);
      } catch (error: any) {
        log.error(`❌ Migration 19 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 20: Content hashes table for perceptual fingerprinting + duplicate detection
    if (currentVersion < 20) {
      try {
        db.exec(`
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
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_phash ON content_hashes(phash)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_creator ON content_hashes(creator)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_token ON content_hashes(token_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_source ON content_hashes(source)`);

        log.info('✅ Migration 20 complete: Content hashes table created');
        recordMigration(db, 20);
      } catch (error: any) {
        log.error(`❌ Migration 20 error: ${error.message}`);
        throw error;
      }
    }

    if (currentVersion < 21) {
      try {
        db.exec(`
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
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_drafts_wallet ON publish_drafts(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drafts_status ON publish_drafts(status)`);

        log.info('✅ Migration 21 complete: Publish drafts table created');
        recordMigration(db, 21);
      } catch (error: any) {
        log.error(`❌ Migration 21 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 22: Agent audit log table for AI action tracking
    if (currentVersion < 22) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS agent_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            agent_id TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT,
            source TEXT,
            session_key TEXT
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_agent_ts ON agent_audit_log(agent_id, timestamp)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action ON agent_audit_log(action)`);

        log.info('✅ Migration 22 complete: Agent audit log table created');
        recordMigration(db, 22);
      } catch (error: any) {
        log.error(`❌ Migration 22 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 23: Installed skills table for purchased skill ownership tracking
    if (currentVersion < 23) {
      try {
        db.exec(`
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
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_installed_skills_wallet ON installed_skills(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_installed_skills_kid ON installed_skills(kid)`);

        log.info('✅ Migration 23 complete: Installed skills table created');
        recordMigration(db, 23);
      } catch (error: any) {
        log.error(`❌ Migration 23 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 24: Recreate content_catalog with token_id as TEXT (V3 uint256 token IDs overflow JS numbers)
    if (currentVersion < 24) {
      try {
        log.info('📦 Running Migration 24: Recreate content_catalog with TEXT token_id...');

        db.exec(`DROP TABLE IF EXISTS content_catalog`);

        db.exec(`
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
          )
        `);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_creator ON content_catalog(creator_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_type ON content_catalog(asset_type)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_content_id ON content_catalog(content_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_channel ON content_catalog(channel_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_status ON content_catalog(metadata_status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_block ON content_catalog(block_number)`);

        // Reset indexer progress so it re-scans from configured from_block
        db.exec(`DELETE FROM settings WHERE key LIKE 'indexer_last_block_%'`);

        log.info('✅ Migration 24 complete: content_catalog recreated with TEXT token_id, indexer progress reset');
        recordMigration(db, 24);
      } catch (error: any) {
        log.error(`❌ Migration 24 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 25: Channel metadata overrides (V3 channels have no backend-stored metadata)
    if (currentVersion < 25) {
      try {
        log.info('📦 Running Migration 25: Channel metadata table...');

        db.exec(`
          CREATE TABLE IF NOT EXISTS channel_metadata (
            address TEXT PRIMARY KEY NOT NULL,
            name TEXT,
            description TEXT,
            categories TEXT,
            image TEXT,
            cover_image TEXT,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_by TEXT
          )
        `);

        log.info('✅ Migration 25 complete: channel_metadata table created');
        recordMigration(db, 25);
      } catch (error: any) {
        log.error(`❌ Migration 25 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 26: Add plans and token_access columns to channel_metadata
    if (currentVersion < 26) {
      try {
        log.info('📦 Running Migration 26: Add plans/token_access to channel_metadata...');

        const cols = db.prepare(`PRAGMA table_info(channel_metadata)`).all() as any[];
        const colNames = cols.map((c: any) => c.name);

        if (!colNames.includes('plans')) {
          db.exec(`ALTER TABLE channel_metadata ADD COLUMN plans TEXT`);
        }
        if (!colNames.includes('token_access')) {
          db.exec(`ALTER TABLE channel_metadata ADD COLUMN token_access TEXT`);
        }

        log.info('✅ Migration 26 complete: plans/token_access columns added');
        recordMigration(db, 26);
      } catch (error: any) {
        log.error(`❌ Migration 26 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 27: Create nft_pins table for NFT IPFS pinning
    if (currentVersion < 27) {
      try {
        log.info('📦 Running Migration 27: Create nft_pins table...');
        db.exec(`
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
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nft_pins_wallet ON nft_pins(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nft_pins_contract ON nft_pins(contract_address, token_id)`);
        log.info('✅ Migration 27 complete: nft_pins table created');
        recordMigration(db, 27);
      } catch (error: any) {
        log.error(`❌ Migration 27 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 28: extend channel_metadata so channels discovered via ChannelCreated
    // (not yet having any minted assets) can be indexed and listed. This is critical
    // for the Creator app UX — users must see their channel immediately after creation.
    if (currentVersion < 28) {
      try {
        log.info('📦 Running Migration 28: Extend channel_metadata for factory-indexed channels...');
        // SQLite ALTER TABLE ADD COLUMN is idempotent via try/catch
        const addCol = (sql: string) => {
          try { db.exec(sql); } catch (e: any) {
            if (!String(e?.message || '').includes('duplicate column')) throw e;
          }
        };
        addCol(`ALTER TABLE channel_metadata ADD COLUMN creator_address TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN contract_version TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN block_number INTEGER`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN tx_hash TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN indexed_at INTEGER`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN plans TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN token_access TEXT`);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_metadata_creator ON channel_metadata(creator_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_metadata_block ON channel_metadata(block_number)`);

        log.info('✅ Migration 28 complete: channel_metadata extended');
        recordMigration(db, 28);
      } catch (error: any) {
        log.error(`❌ Migration 28 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 29 (SEC-3c, 2026-04 audit): add scope/scope_data columns to
    // sessions so /open_item can mint scoped, file-bound iframe-app tokens
    // instead of the previous insecure mock-token-* pattern. Existing
    // sessions remain unrestricted (NULL scope is the legacy contract).
    if (currentVersion < 29) {
      try {
        log.info('📦 Running Migration 29: Add scope/scope_data to sessions (SEC-3c)...');
        const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as any[];
        const colNames = cols.map((c: any) => c.name);
        if (!colNames.includes('scope')) {
          db.exec(`ALTER TABLE sessions ADD COLUMN scope TEXT`);
        }
        if (!colNames.includes('scope_data')) {
          db.exec(`ALTER TABLE sessions ADD COLUMN scope_data TEXT`);
        }
        log.info('✅ Migration 29 complete: sessions.scope/scope_data columns added');
        recordMigration(db, 29);
      } catch (error: any) {
        log.error(`❌ Migration 29 error: ${error.message}`);
        throw error;
      }
    }

    if (currentVersion < 30) {
      try {
        log.info('📦 Running Migration 30: Create telemetry_onramp table (A5 §P0 funnel)...');
        db.exec(`
          CREATE TABLE IF NOT EXISTS telemetry_onramp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            ts INTEGER NOT NULL,
            install_id TEXT NOT NULL
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_onramp_event ON telemetry_onramp(event)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_onramp_install ON telemetry_onramp(install_id)`);
        log.info('✅ Migration 30 complete: telemetry_onramp table + indexes created');
        recordMigration(db, 30);
      } catch (error: any) {
        log.error(`❌ Migration 30 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 31: bytes_downloaded column on pinned_cids. Drives the
    // real-time download progress bar in the Elacity Market app. Seeded
    // from the existing `size` column for already-complete pins so retro
    // rows still show 100% instead of 0%.
    if (currentVersion < 31) {
      try {
        log.info('📦 Running Migration 31: Add bytes_downloaded to pinned_cids...');
        try {
          db.exec('ALTER TABLE pinned_cids ADD COLUMN bytes_downloaded INTEGER NOT NULL DEFAULT 0');
        } catch (e: any) {
          if (!String(e?.message || '').includes('duplicate column')) throw e;
        }
        db.exec(`
          UPDATE pinned_cids
          SET bytes_downloaded = size
          WHERE pin_status = 'complete' AND bytes_downloaded = 0
        `);
        log.info('✅ Migration 31 complete: bytes_downloaded column added');
        recordMigration(db, 31);
      } catch (error: any) {
        log.error(`❌ Migration 31 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 32 (v1.2.7.2): Self-heal for installs corrupted by the
    // pre-32 fresh-install bug. Up to and including v1.2.7.1 the migration
    // runner returned early after runInitialSchema() for currentVersion === 0
    // and stamped the DB at CURRENT_VERSION (then = 31), meaning fresh
    // installs never executed migrations 14, 20, 21, 22, 23, 25-28. Result:
    // 6 tables (publish_drafts, agent_proposals, content_hashes,
    // agent_audit_log, installed_skills, channel_metadata) were absent on
    // fresh nodes, and the first time elacity-creator hit /api/drafts the
    // PC2 process exited with code 1 (no-such-table).
    //
    // For v1.2.7.2+ schema.sql includes those tables directly so fresh
    // installs are healed at runInitialSchema() time. This migration runs
    // the same CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
    // blocks for already-corrupted v1.2.7.0/.1 nodes that booted with the
    // broken DB and were stamped at version 31. All statements are
    // idempotent so it is also a safe no-op on healthy installs.
    if (currentVersion < 32) {
      try {
        log.info('📦 Running Migration 32 (v1.2.7.2): Self-heal migration-only tables...');

        // Migration 14: agent_proposals
        db.exec(`
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
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_proposals_wallet  ON agent_proposals(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_proposals_status  ON agent_proposals(status)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_proposals_created ON agent_proposals(wallet_address, created_at DESC)`);

        // Migration 20: content_hashes
        db.exec(`
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
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_phash   ON content_hashes(phash)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_creator ON content_hashes(creator)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_token   ON content_hashes(token_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_content_hashes_source  ON content_hashes(source)`);

        // Migration 21: publish_drafts (the table whose absence crashed elacity-creator)
        db.exec(`
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
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drafts_wallet ON publish_drafts(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_drafts_status ON publish_drafts(status)`);

        // Migration 22: agent_audit_log
        db.exec(`
          CREATE TABLE IF NOT EXISTS agent_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            agent_id TEXT NOT NULL,
            action TEXT NOT NULL,
            detail TEXT,
            source TEXT,
            session_key TEXT
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_agent_ts ON agent_audit_log(agent_id, timestamp)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action   ON agent_audit_log(action)`);

        // Migration 23: installed_skills
        db.exec(`
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
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_installed_skills_wallet ON installed_skills(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_installed_skills_kid    ON installed_skills(kid)`);

        // Migrations 25 + 26 + 28 (final form): channel_metadata with all columns
        db.exec(`
          CREATE TABLE IF NOT EXISTS channel_metadata (
            address TEXT PRIMARY KEY NOT NULL,
            name TEXT,
            description TEXT,
            categories TEXT,
            image TEXT,
            cover_image TEXT,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_by TEXT
          )
        `);
        // Add columns from migrations 26 and 28 idempotently — table may already
        // have them on a partially-progressed install.
        const addCol = (sql: string) => {
          try { db.exec(sql); } catch (e: any) {
            if (!String(e?.message || '').includes('duplicate column')) throw e;
          }
        };
        addCol(`ALTER TABLE channel_metadata ADD COLUMN plans TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN token_access TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN creator_address TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN contract_version TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN block_number INTEGER`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN tx_hash TEXT`);
        addCol(`ALTER TABLE channel_metadata ADD COLUMN indexed_at INTEGER`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_metadata_creator ON channel_metadata(creator_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_channel_metadata_block   ON channel_metadata(block_number)`);

        log.info('✅ Migration 32 complete: migration-only tables healed (publish_drafts, agent_proposals, content_hashes, agent_audit_log, installed_skills, channel_metadata)');
        recordMigration(db, 32);
      } catch (error: any) {
        log.error(`❌ Migration 32 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 33 (T-1C Phase 1, 2026-05-07): create the metric registry
    // tables that back `pc2-node/src/utils/metrics.ts`. Counters are
    // monotonic per (name, tags) and UPSERTed in place. Histograms append a
    // raw sample per observation and get rolled up + pruned by the future
    // daily flusher (T-1C Phase 4-6). The `tags` column is a canonicalised
    // JSON string with sorted keys so identical tag sets always collide on
    // the primary key. Honoured by every recorder; entirely no-op when
    // `PC2_TELEMETRY_DISABLED=true` is set.
    if (currentVersion < 33) {
      try {
        log.info('📦 Running Migration 33: Create metrics_counters + metrics_histogram_samples tables (T-1C Phase 1)...');
        db.exec(`
          CREATE TABLE IF NOT EXISTS metrics_counters (
            name TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '{}',
            value INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (name, tags)
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_counters_name ON metrics_counters(name)`);
        db.exec(`
          CREATE TABLE IF NOT EXISTS metrics_histogram_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '{}',
            value REAL NOT NULL,
            ts INTEGER NOT NULL
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_histogram_name_ts ON metrics_histogram_samples(name, ts)`);
        log.info('✅ Migration 33 complete: metrics_counters + metrics_histogram_samples tables + indexes created');
        recordMigration(db, 33);
      } catch (error: any) {
        log.error(`❌ Migration 33 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 34 (AGENT-CREATOR-STUDIO-2026-05, S1 foundation):
    // Create publish_intents — the Monetisation Agent's pre-encryption working
    // state. Mirrors the input-side columns of publish_drafts so the Creator
    // app's wizard pre-fill logic can reuse most of its existing code; OMITS
    // the post-encryption columns (asset_cid / metadata_cid / encrypt_hash /
    // steps) which can only be filled after the Creator app's encrypt + pin
    // step. The Creator consumes an intent via puter.args.resumeIntent, copies
    // these fields into a new publish_drafts row, and marks the intent
    // 'consumed' with consumed_draft_id pointing back to the resulting draft.
    // See .cursor/tasks/AGENT-CREATOR-STUDIO-2026-05/PLAN.md §6 for the
    // shared-intent / two-presentations architecture.
    if (currentVersion < 34) {
      try {
        log.info('📦 Running Migration 34: publish_intents (Monetisation Agent S1 foundation)...');
        db.exec(`
          CREATE TABLE IF NOT EXISTS publish_intents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            conversation_id TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            source_file_path TEXT,
            title TEXT,
            description TEXT,
            category TEXT,
            file_name TEXT,
            file_size INTEGER,
            mime_type TEXT,
            tags TEXT,
            channel TEXT,
            price TEXT,
            currency_address TEXT,
            currency_symbol TEXT,
            copies INTEGER DEFAULT 1,
            access_method TEXT DEFAULT 'buy_once',
            reseller_cut INTEGER DEFAULT 0,
            royalty_partners TEXT,
            license_profile TEXT DEFAULT 'perpetual_personal_view',
            thumbnail_cid TEXT,
            thumbnail_path TEXT,
            adult INTEGER DEFAULT 0,
            consumed_draft_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            CHECK (status IN ('draft', 'handed_off', 'abandoned', 'consumed'))
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_intents_wallet ON publish_intents(wallet_address)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_intents_wallet_status ON publish_intents(wallet_address, status, updated_at DESC)`);
        log.info('✅ Migration 34 complete: publish_intents table + indexes created');
        recordMigration(db, 34);
      } catch (error: any) {
        log.error(`❌ Migration 34 error: ${error.message}`);
        throw error;
      }
    }

    log.info('✅ Migrations completed');
  } else if (currentVersion === CURRENT_VERSION) {
    // Even if migration version is current, check if FTS5 table exists
    // (it might have been dropped manually or due to an error)
    try {
      const fts5Exists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='files_fts'
      `).get();
      
      if (!fts5Exists) {
        log.warn('⚠️  FTS5 table missing, recreating...');
        // Recreate FTS5 table and triggers
        db.exec('DROP TRIGGER IF EXISTS files_fts_insert');
        db.exec('DROP TRIGGER IF EXISTS files_fts_update');
        db.exec('DROP TRIGGER IF EXISTS files_fts_delete');
        db.exec(`
          CREATE VIRTUAL TABLE files_fts USING fts5(
            path,
            name,
            content,
            mime_type
          )
        `);
        db.exec(`
          CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(rowid, path, name, content, mime_type)
            VALUES (new.rowid, new.path, new.path, COALESCE(new.content_text, ''), COALESCE(new.mime_type, ''));
          END
        `);
        db.exec(`
          CREATE TRIGGER files_fts_delete AFTER DELETE ON files BEGIN
            DELETE FROM files_fts WHERE rowid = old.rowid;
          END
        `);
        db.exec(`
          CREATE TRIGGER files_fts_update AFTER UPDATE ON files BEGIN
            UPDATE files_fts SET
              path = new.path,
              name = new.path,
              content = COALESCE(new.content_text, ''),
              mime_type = COALESCE(new.mime_type, '')
            WHERE rowid = new.rowid;
          END
        `);
        // Repopulate FTS5 with existing files
        db.exec(`
          INSERT INTO files_fts(rowid, path, name, content, mime_type)
          SELECT 
            rowid,
            path,
            path as name,
            COALESCE(content_text, '') as content,
            COALESCE(mime_type, '') as mime_type
          FROM files
          WHERE is_dir = 0
        `);
        log.info('✅ FTS5 table and triggers recreated');
      }
    } catch (error: any) {
      log.warn('⚠️  Could not check/recreate FTS5 table:', error.message);
    }

    // Migration 34: Add `kid` column to publish_drafts so draft-resume mints
    // can emit the canonical KID as on-chain bytes16 contentId (matches the
    // KID embedded in pssh/tenc on IPFS-pinned init segments). Tracked in
    // MEDIA-2026-05-18-CENC-PSSH-LIBAV-COMPLIANCE.
    if (currentVersion < 34) {
      try {
        db.exec('ALTER TABLE publish_drafts ADD COLUMN kid TEXT');
        log.info('✅ Migration 34: Added kid column to publish_drafts');
      } catch (error: any) {
        if (!error.message.includes('duplicate column')) {
          log.warn(`⚠️  Migration 34 warning: ${error.message}`);
        }
      }
      recordMigration(db, 34);
    }

    log.info('✅ Database schema is up to date');
  } else {
    log.warn(`⚠️  Database version (${currentVersion}) is newer than expected (${CURRENT_VERSION})`);
  }
}
