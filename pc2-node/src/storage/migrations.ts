/**
 * Database Migrations
 * 
 * Manages database schema versioning and migrations
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
const CURRENT_VERSION = 13;

interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

/**
 * Get current database version
 */
function getCurrentVersion(db: Database.Database): number {
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
function recordMigration(db: Database.Database, version: number): void {
  db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
    .run(version, Date.now());
}

/**
 * Run initial schema creation
 */
function runInitialSchema(db: Database.Database): void {
  const schemaFile = findSchemaFile();
  const schema = readFileSync(schemaFile, 'utf8');
  db.exec(schema);
  recordMigration(db, CURRENT_VERSION);
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion === 0) {
    // First run: create initial schema
    console.log('📦 Creating initial database schema...');
    runInitialSchema(db);
    console.log('✅ Database schema created');
    return;
  }

  if (currentVersion < CURRENT_VERSION) {
    console.log(`📦 Running migrations from version ${currentVersion} to ${CURRENT_VERSION}...`);
    
    // Migration 2: Add thumbnail column to files table
    if (currentVersion < 2) {
      try {
        db.exec('ALTER TABLE files ADD COLUMN thumbnail TEXT');
        console.log('✅ Added thumbnail column to files table');
      } catch (error: any) {
        // Column might already exist (e.g., from fresh install with new schema)
        if (!error.message.includes('duplicate column')) {
          console.warn(`⚠️  Migration 2 warning: ${error.message}`);
        }
      }
    }
    
    // Migration 3: Add FTS5 full-text search and content_text column
    if (currentVersion < 3) {
      try {
        // Add content_text column for storing extracted file content
        db.exec('ALTER TABLE files ADD COLUMN content_text TEXT');
        console.log('✅ Added content_text column to files table');
        
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
        console.log('✅ Created FTS5 virtual table files_fts');
        
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
        console.log('✅ Created FTS5 sync triggers');
        
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
        console.log('✅ Populated FTS5 with existing files');
        
      } catch (error: any) {
        console.error(`❌ Migration 3 error: ${error.message}`);
        // Don't fail migration if FTS5 already exists
        if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
          throw error;
        }
      }
    }
    
    // Migration 4: Add file_versions table for version history
    if (currentVersion < 4) {
      try {
        console.log('📦 Running Migration 4: File versioning...');
        
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
        
        console.log('✅ Migration 4 complete: File versioning table created');
        recordMigration(db, 4);
      } catch (error: any) {
        console.error(`❌ Migration 4 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 5: Add ai_config table for wallet-scoped AI configuration
    if (currentVersion < 5) {
      try {
        console.log('📦 Running Migration 5: AI configuration...');
        
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
        
        console.log('✅ Migration 5 complete: AI config table created');
        recordMigration(db, 5);
      } catch (error: any) {
        console.error(`❌ Migration 5 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 6: Clean model names in ai_config (remove provider prefixes)
    if (currentVersion < 6) {
      try {
        console.log('📦 Running Migration 6: Clean AI model names...');
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
              console.log(`  Cleaned model for ${row.wallet_address.substring(0, 10)}...: "${model}" -> "${cleanModel}"`);
              cleaned++;
            }
          }
        }
        
        console.log(`✅ Migration 6 complete: Cleaned ${cleaned} model name(s)`);
        recordMigration(db, 6);
      } catch (error: any) {
        console.error(`❌ Migration 6 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 7: Update deprecated Claude model names to current model
    if (currentVersion < 7) {
      try {
        console.log('📦 Running Migration 7: Update deprecated Claude models...');
        const deprecatedModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-sonnet-20240620'];
        const newModel = 'claude-sonnet-4-5-20250929';
        
        let updated = 0;
        for (const oldModel of deprecatedModels) {
          const rows = db.prepare('SELECT wallet_address, default_model FROM ai_config WHERE default_model = ?').all(oldModel) as Array<{wallet_address: string, default_model: string}>;
          for (const row of rows) {
            db.prepare('UPDATE ai_config SET default_model = ? WHERE wallet_address = ?').run(newModel, row.wallet_address);
            console.log(`  Updated Claude model for ${row.wallet_address.substring(0, 10)}...: "${row.default_model}" -> "${newModel}"`);
            updated++;
          }
        }
        
        console.log(`✅ Migration 7 complete: Updated ${updated} Claude model name(s)`);
        recordMigration(db, 7);
      } catch (error: any) {
        console.error(`❌ Migration 7 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 8: Add recent_apps table for tracking recently launched apps
    if (currentVersion < 8) {
      try {
        console.log('📦 Running Migration 8: Recent apps table...');
        
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
        
        console.log('✅ Migration 8 complete: Recent apps table created');
        recordMigration(db, 8);
      } catch (error: any) {
        console.error(`❌ Migration 8 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 9: Add api_keys table for agent/programmatic access
    if (currentVersion < 9) {
      try {
        console.log('📦 Running Migration 9: API keys table...');
        
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
        
        console.log('✅ Migration 9 complete: API keys table created');
        recordMigration(db, 9);
      } catch (error: any) {
        console.error(`❌ Migration 9 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 10: Add audit_logs table for tracking agent actions
    if (currentVersion < 10) {
      try {
        console.log('📦 Running Migration 10: Audit logs table...');
        
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
        
        console.log('✅ Migration 10 complete: Audit logs table created');
        recordMigration(db, 10);
      } catch (error: any) {
        console.error(`❌ Migration 10 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 11: Add scheduled_tasks table for cron-like task scheduling
    if (currentVersion < 11) {
      try {
        console.log('📦 Running Migration 11: Scheduled tasks table...');
        
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
        
        console.log('✅ Migration 11 complete: Scheduled tasks table created');
        recordMigration(db, 11);
      } catch (error: any) {
        console.error(`❌ Migration 11 error: ${error.message}`);
        throw error;
      }
    }

    // Migration 12: AI Memory State table (Context Engineering)
    if (currentVersion < 12) {
      try {
        console.log('📦 Running Migration 12: AI Memory State table...');
        
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
        
        console.log('✅ Migration 12 complete: AI Memory State table created');
        recordMigration(db, 12);
      } catch (error: any) {
        console.error(`❌ Migration 12 error: ${error.message}`);
        throw error;
      }
    }
    
    // Migration 13: AI Conversations table (persistent chat history)
    if (currentVersion < 13) {
      try {
        console.log('📦 Running Migration 13: AI Conversations table...');
        
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
        
        console.log('✅ Migration 13 complete: AI Conversations table created');
        recordMigration(db, 13);
      } catch (error: any) {
        console.error(`❌ Migration 13 error: ${error.message}`);
        throw error;
      }
    }
    
    console.log('✅ Migrations completed');
  } else if (currentVersion === CURRENT_VERSION) {
    // Even if migration version is current, check if FTS5 table exists
    // (it might have been dropped manually or due to an error)
    try {
      const fts5Exists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='files_fts'
      `).get();
      
      if (!fts5Exists) {
        console.log('⚠️  FTS5 table missing, recreating...');
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
        console.log('✅ FTS5 table and triggers recreated');
      }
    } catch (error: any) {
      console.warn('⚠️  Could not check/recreate FTS5 table:', error.message);
    }
    console.log('✅ Database schema is up to date');
  } else {
    console.warn(`⚠️  Database version (${currentVersion}) is newer than expected (${CURRENT_VERSION})`);
  }
}
