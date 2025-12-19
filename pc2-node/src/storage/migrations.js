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
const CURRENT_VERSION = 2;
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
        recordMigration(db, CURRENT_VERSION);
        console.log('✅ Migrations completed');
    }
    else if (currentVersion === CURRENT_VERSION) {
        console.log('✅ Database schema is up to date');
    }
    else {
        console.warn(`⚠️  Database version (${currentVersion}) is newer than expected (${CURRENT_VERSION})`);
    }
}
//# sourceMappingURL=migrations.js.map