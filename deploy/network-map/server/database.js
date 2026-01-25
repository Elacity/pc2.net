/**
 * Database module - SQLite storage for network map data
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Initialize the database with required tables
 */
export async function initDatabase() {
  const dataDir = join(__dirname, '../data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  
  db = new Database(join(dataDir, 'network-map.db'));
  db.pragma('journal_mode = WAL');
  
  // Nodes table - stores all node data (internal, not exposed)
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_identifier TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      node_id TEXT,
      public_url TEXT,
      endpoint TEXT,
      endpoint_type TEXT DEFAULT 'unknown',
      status TEXT DEFAULT 'unknown',
      activity_type TEXT DEFAULT 'unknown',
      node_type TEXT DEFAULT 'registered',
      is_pc2_node INTEGER DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      last_health_check TEXT,
      health_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add node_type column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE nodes ADD COLUMN node_type TEXT DEFAULT 'registered'`);
  } catch (e) {
    // Column already exists
  }
  
  // Activity history - for calculating activity patterns
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_identifier TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (node_identifier) REFERENCES nodes(node_identifier)
    )
  `);
  
  // Network stats snapshots - for timeline/trends
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      total_registered INTEGER DEFAULT 0,
      total_active_pc2 INTEGER DEFAULT 0,
      online_now INTEGER DEFAULT 0,
      offline_now INTEGER DEFAULT 0,
      stale_nodes INTEGER DEFAULT 0,
      always_on INTEGER DEFAULT 0,
      intermittent INTEGER DEFAULT 0,
      occasional INTEGER DEFAULT 0,
      inactive INTEGER DEFAULT 0
    )
  `);
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_identifier ON nodes(node_identifier);
    CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
    CREATE INDEX IF NOT EXISTS idx_activity_node ON activity_history(node_identifier);
    CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_stats_timestamp ON stats_snapshots(timestamp);
  `);
  
  return db;
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Upsert a node (insert or update)
 */
export function upsertNode(node) {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO nodes (
      node_identifier, username, node_id, public_url, endpoint, endpoint_type,
      status, activity_type, node_type, is_pc2_node, first_seen, last_seen, 
      last_health_check, health_data, updated_at
    ) VALUES (
      @node_identifier, @username, @node_id, @public_url, @endpoint, @endpoint_type,
      @status, @activity_type, @node_type, @is_pc2_node, @first_seen, @last_seen,
      @last_health_check, @health_data, @updated_at
    )
    ON CONFLICT(node_identifier) DO UPDATE SET
      status = @status,
      activity_type = @activity_type,
      node_type = @node_type,
      is_pc2_node = @is_pc2_node,
      last_seen = @last_seen,
      last_health_check = @last_health_check,
      health_data = @health_data,
      updated_at = @updated_at
  `);
  
  return stmt.run({
    node_identifier: node.nodeIdentifier,
    username: node.username,
    node_id: node.nodeId || null,
    public_url: node.publicUrl || null,
    endpoint: node.endpoint || null,
    endpoint_type: node.endpointType || 'unknown',
    status: node.status,
    activity_type: node.activityType || 'unknown',
    node_type: node.nodeType || 'registered',
    is_pc2_node: node.isPC2Node ? 1 : 0,
    first_seen: node.firstSeen || now,
    last_seen: now,
    last_health_check: now,
    health_data: node.healthData ? JSON.stringify(node.healthData) : null,
    updated_at: now
  });
}

/**
 * Record activity event
 */
export function recordActivity(nodeIdentifier, status) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO activity_history (node_identifier, status, timestamp)
    VALUES (?, ?, ?)
  `);
  return stmt.run(nodeIdentifier, status, new Date().toISOString());
}

/**
 * Get all nodes (public info only - anonymized)
 */
export function getPublicNodes(filters = {}) {
  const db = getDatabase();
  
  let sql = `
    SELECT 
      node_identifier as nodeIdentifier,
      status,
      activity_type as activityType,
      node_type as nodeType
    FROM nodes
    WHERE 1=1
  `;
  
  const params = [];
  
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  
  if (filters.activityType) {
    sql += ' AND activity_type = ?';
    params.push(filters.activityType);
  }
  
  if (filters.nodeType) {
    sql += ' AND node_type = ?';
    params.push(filters.nodeType);
  }
  
  // Order: supernodes first, then online PC2, then others
  sql += " ORDER BY CASE node_type WHEN 'supernode' THEN 0 ELSE 1 END, CASE status WHEN 'online' THEN 0 ELSE 1 END, last_seen DESC";
  
  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }
  
  return db.prepare(sql).all(...params);
}

/**
 * Get a single node by identifier (public info only)
 */
export function getPublicNode(nodeIdentifier) {
  const db = getDatabase();
  return db.prepare(`
    SELECT 
      node_identifier as nodeIdentifier,
      status,
      activity_type as activityType,
      node_type as nodeType
    FROM nodes
    WHERE node_identifier = ?
  `).get(nodeIdentifier);
}

/**
 * Get current network statistics
 */
export function getNetworkStats() {
  const db = getDatabase();
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as totalRegistered,
      SUM(CASE WHEN is_pc2_node = 1 THEN 1 ELSE 0 END) as totalActivePC2,
      SUM(CASE WHEN status = 'online' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as onlineNow,
      SUM(CASE WHEN status = 'offline' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as offlineNow,
      SUM(CASE WHEN status = 'stale' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as staleNodes,
      SUM(CASE WHEN activity_type = 'always-on' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as alwaysOn,
      SUM(CASE WHEN activity_type = 'intermittent' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as intermittent,
      SUM(CASE WHEN activity_type = 'occasional' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as occasional,
      SUM(CASE WHEN activity_type = 'inactive' AND is_pc2_node = 1 THEN 1 ELSE 0 END) as inactive
    FROM nodes
  `).get();
  
  return {
    totalRegistered: stats.totalRegistered || 0,
    totalActivePC2: stats.totalActivePC2 || 0,
    onlineNow: stats.onlineNow || 0,
    offlineNow: stats.offlineNow || 0,
    staleNodes: stats.staleNodes || 0,
    activityDistribution: {
      alwaysOn: stats.alwaysOn || 0,
      intermittent: stats.intermittent || 0,
      occasional: stats.occasional || 0,
      inactive: stats.inactive || 0
    }
  };
}

/**
 * Save stats snapshot for timeline
 */
export function saveStatsSnapshot(stats) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO stats_snapshots (
      timestamp, total_registered, total_active_pc2, online_now, offline_now,
      stale_nodes, always_on, intermittent, occasional, inactive
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    new Date().toISOString(),
    stats.totalRegistered,
    stats.totalActivePC2,
    stats.onlineNow,
    stats.offlineNow,
    stats.staleNodes,
    stats.activityDistribution.alwaysOn,
    stats.activityDistribution.intermittent,
    stats.activityDistribution.occasional,
    stats.activityDistribution.inactive
  );
}

/**
 * Get timeline data
 */
export function getTimeline(days = 30) {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  return db.prepare(`
    SELECT 
      date(timestamp) as date,
      MAX(total_active_pc2) as totalNodes,
      MAX(online_now) as onlineNodes
    FROM stats_snapshots
    WHERE timestamp >= ?
    GROUP BY date(timestamp)
    ORDER BY date ASC
  `).all(cutoff);
}

/**
 * Get activity history for a node (for calculating patterns)
 */
export function getNodeActivityHistory(nodeIdentifier, hours = 168) {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  return db.prepare(`
    SELECT status, timestamp
    FROM activity_history
    WHERE node_identifier = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `).all(nodeIdentifier, cutoff);
}

/**
 * Cleanup old activity history (keep 30 days)
 */
export function cleanupOldData() {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  db.prepare('DELETE FROM activity_history WHERE timestamp < ?').run(cutoff);
  
  // Keep only daily snapshots for data older than 7 days
  const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    DELETE FROM stats_snapshots 
    WHERE timestamp < ? 
    AND id NOT IN (
      SELECT MIN(id) FROM stats_snapshots 
      WHERE timestamp < ? 
      GROUP BY date(timestamp)
    )
  `).run(weekCutoff, weekCutoff);
}
