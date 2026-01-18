import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_FILE = join(__dirname, 'schema.sql');
function findSchemaFile() {
    if (existsSync(SCHEMA_FILE)) {
        return SCHEMA_FILE;
    }
    const sourceSchema = join(__dirname, '../../src/storage/schema.sql');
    if (existsSync(sourceSchema)) {
        return sourceSchema;
    }
    throw new Error(`Schema file not found. Tried: ${SCHEMA_FILE} and ${sourceSchema}`);
}
const CURRENT_VERSION = 3;
function getCurrentVersion(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
    const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
    return row.version ?? 0;
}
function recordMigration(db, version) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, Date.now());
}
function runInitialSchema(db) {
    const schemaFile = findSchemaFile();
    const schema = readFileSync(schemaFile, 'utf8');
    db.exec(schema);
    recordMigration(db, CURRENT_VERSION);
}
export function runMigrations(db) {
    const currentVersion = getCurrentVersion(db);
    if (currentVersion === 0) {
        console.log('📦 Creating initial database schema...');
        runInitialSchema(db);
        console.log('✅ Database schema created');
        return;
    }
    if (currentVersion < CURRENT_VERSION) {
        console.log(`📦 Running migrations from version ${currentVersion} to ${CURRENT_VERSION}...`);
        if (currentVersion < 2) {
            try {
                db.exec('ALTER TABLE files ADD COLUMN thumbnail TEXT');
                console.log('✅ Added thumbnail column to files table');
            }
            catch (error) {
                if (!error.message.includes('duplicate column')) {
                    console.warn(`⚠️  Migration 2 warning: ${error.message}`);
                }
            }
        }
        if (currentVersion < 3) {
            try {
                db.exec('ALTER TABLE files ADD COLUMN content_text TEXT');
                console.log('✅ Added content_text column to files table');
                db.exec('DROP TABLE IF EXISTS files_fts');
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
                console.log('✅ Created FTS5 virtual table files_fts');
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
            }
            catch (error) {
                console.error(`❌ Migration 3 error: ${error.message}`);
                if (!error.message.includes('already exists') && !error.message.includes('duplicate column')) {
                    throw error;
                }
            }
        }
        recordMigration(db, CURRENT_VERSION);
        console.log('✅ Migrations completed');
    }
    else if (currentVersion === CURRENT_VERSION) {
        try {
            const fts5Exists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='files_fts'
      `).get();
            if (!fts5Exists) {
                console.log('⚠️  FTS5 table missing, recreating...');
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
        }
        catch (error) {
            console.warn('⚠️  Could not check/recreate FTS5 table:', error.message);
        }
        console.log('✅ Database schema is up to date');
    }
    else {
        console.warn(`⚠️  Database version (${currentVersion}) is newer than expected (${CURRENT_VERSION})`);
    }
}
//# sourceMappingURL=migrations.js.map