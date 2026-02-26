/**
 * Context Storage
 * 
 * SQLite storage for context events (location, photos, voice transcripts, activity).
 * Powers the awareness layer — feeding real-world context into AI conversations.
 */

import Database from 'better-sqlite3';

export interface ContextEvent {
  type: 'location' | 'photo' | 'voice_transcript' | 'activity' | 'environment';
  timestamp: string;
  data: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    placeName?: string;
    photoCID?: string;
    photoName?: string;
    exifData?: Record<string, unknown>;
    transcript?: string;
    action?: string;
    details?: string;
    motionState?: string;
  };
}

export interface StoredContextEvent extends ContextEvent {
  id: number;
  wallet: string;
  created_at: number;
}

export class ContextStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  storeEvent(wallet: string, event: ContextEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO context_events (wallet, timestamp, type, data)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      wallet,
      event.timestamp,
      event.type,
      JSON.stringify(event.data)
    );
    return result.lastInsertRowid as number;
  }

  storeEvents(wallet: string, events: ContextEvent[]): number[] {
    const ids: number[] = [];
    const insertMany = this.db.transaction((evts: ContextEvent[]) => {
      for (const event of evts) {
        ids.push(this.storeEvent(wallet, event));
      }
    });
    insertMany(events);
    return ids;
  }

  getRecentEvents(wallet: string, hours: number = 24, limit: number = 100): StoredContextEvent[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = this.db.prepare(`
      SELECT id, wallet, timestamp, type, data, created_at
      FROM context_events
      WHERE wallet = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(wallet, cutoff, limit) as Array<{
      id: number;
      wallet: string;
      timestamp: string;
      type: string;
      data: string;
      created_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      wallet: row.wallet,
      timestamp: row.timestamp,
      type: row.type as ContextEvent['type'],
      data: JSON.parse(row.data),
      created_at: row.created_at,
    }));
  }

  getLocationTrajectory(wallet: string, startTime: string, endTime: string): StoredContextEvent[] {
    const rows = this.db.prepare(`
      SELECT id, wallet, timestamp, type, data, created_at
      FROM context_events
      WHERE wallet = ? AND type = 'location' AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(wallet, startTime, endTime) as Array<{
      id: number;
      wallet: string;
      timestamp: string;
      type: string;
      data: string;
      created_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      wallet: row.wallet,
      timestamp: row.timestamp,
      type: 'location' as const,
      data: JSON.parse(row.data),
      created_at: row.created_at,
    }));
  }

  /**
   * Build a summarized context block for system prompt injection.
   * Capped at ~200 tokens to preserve context window on small models.
   */
  summarizeRecentContext(wallet: string, hours: number = 24): string {
    const events = this.getRecentEvents(wallet, hours, 50);
    if (events.length === 0) return '';

    const parts: string[] = [];

    const locations = events.filter(e => e.type === 'location');
    if (locations.length > 0) {
      const latest = locations[0];
      const place = latest.data.placeName || `${latest.data.latitude}, ${latest.data.longitude}`;
      const time = new Date(latest.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      parts.push(`Location: ${place} as of ${time}`);
    }

    const photos = events.filter(e => e.type === 'photo');
    if (photos.length > 0) {
      const names = photos.slice(0, 3).map(p => p.data.photoName || 'photo').join(', ');
      parts.push(`Photos: ${photos.length} today (${names})`);
    }

    const activities = events.filter(e => e.type === 'activity');
    if (activities.length > 0) {
      const recent = activities.slice(0, 3).map(a => a.data.action || a.data.details).filter(Boolean);
      if (recent.length > 0) {
        parts.push(`Activity: ${recent.join(', ')}`);
      }
    }

    const transcripts = events.filter(e => e.type === 'voice_transcript');
    if (transcripts.length > 0) {
      parts.push(`Voice notes: ${transcripts.length} today`);
    }

    const envEvents = events.filter(e => e.type === 'environment');
    if (envEvents.length > 0) {
      const latest = envEvents[0];
      if (latest.data.motionState) {
        parts.push(`Motion: ${latest.data.motionState}`);
      }
    }

    if (parts.length === 0) return '';

    return `[Current Context — auto-gathered from your devices]\n${parts.join('\n')}`;
  }

  getEventCount(wallet: string, hours: number = 24): number {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM context_events
      WHERE wallet = ? AND timestamp >= ?
    `).get(wallet, cutoff) as { count: number };
    return row.count;
  }
}
