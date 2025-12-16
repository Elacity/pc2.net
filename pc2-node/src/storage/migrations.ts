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
const CURRENT_VERSION = 1;

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
    // Future migrations would go here
    console.log(`📦 Running migrations from version ${currentVersion} to ${CURRENT_VERSION}...`);
    // Add migration logic here as needed
    recordMigration(db, CURRENT_VERSION);
    console.log('✅ Migrations completed');
  } else if (currentVersion === CURRENT_VERSION) {
    console.log('✅ Database schema is up to date');
  } else {
    console.warn(`⚠️  Database version (${currentVersion}) is newer than expected (${CURRENT_VERSION})`);
  }
}

