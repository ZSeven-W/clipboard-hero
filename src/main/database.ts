import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';
import { getSettings } from './settings';

export interface Clip {
  id: number;
  content: string;
  category: string;
  preview: string;
  hash: string;
  created_at: string;
  pinned: number;
  copy_count: number;
}

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'clipboard-hero.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'text',
      preview TEXT NOT NULL,
      hash TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      pinned INTEGER DEFAULT 0,
      copy_count INTEGER DEFAULT 0
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_clips_category ON clips(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_clips_pinned ON clips(pinned DESC)');

  // Migrate existing DB: add columns if they don't exist
  const cols = (db.pragma('table_info(clips)') as { name: string }[]).map((c) => c.name);
  if (!cols.includes('pinned')) {
    db.exec('ALTER TABLE clips ADD COLUMN pinned INTEGER DEFAULT 0');
  }
  if (!cols.includes('copy_count')) {
    db.exec('ALTER TABLE clips ADD COLUMN copy_count INTEGER DEFAULT 0');
  }
}

export function getClipCount(): number {
  return (db.prepare('SELECT COUNT(*) as cnt FROM clips').get() as { cnt: number }).cnt;
}

function pruneOldClips(): void {
  const maxClips = getSettings().maxClips;
  const unpinnedCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM clips WHERE pinned = 0').get() as { cnt: number }
  ).cnt;

  if (unpinnedCount > maxClips) {
    const excess = unpinnedCount - maxClips;
    db.prepare(
      `DELETE FROM clips WHERE pinned = 0 AND id IN (
        SELECT id FROM clips WHERE pinned = 0 ORDER BY created_at ASC LIMIT ?
      )`
    ).run(excess);
  }
}

export function insertClip(content: string, category: string): Clip | null {
  const hash = crypto.createHash('md5').update(content).digest('hex');
  const preview = content.substring(0, 200);

  const result = db.prepare(
    'INSERT OR IGNORE INTO clips (content, category, preview, hash) VALUES (?, ?, ?, ?)'
  ).run(content, category, preview, hash);

  if (result.changes === 0) {
    // Duplicate — bump timestamp so it appears at the top
    db.prepare('UPDATE clips SET created_at = CURRENT_TIMESTAMP WHERE hash = ?').run(hash);
    return db.prepare('SELECT * FROM clips WHERE hash = ?').get(hash) as Clip;
  }

  pruneOldClips();

  return db.prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as Clip;
}

export function getClips(category?: string, limit = 100): Clip[] {
  if (category && category !== 'all') {
    return db.prepare(
      'SELECT * FROM clips WHERE category = ? ORDER BY pinned DESC, created_at DESC LIMIT ?'
    ).all(category, limit) as Clip[];
  }
  return db.prepare(
    'SELECT * FROM clips ORDER BY pinned DESC, created_at DESC LIMIT ?'
  ).all(limit) as Clip[];
}

export function searchClips(query: string): Clip[] {
  return db.prepare(
    'SELECT * FROM clips WHERE content LIKE ? ORDER BY pinned DESC, created_at DESC LIMIT 100'
  ).all(`%${query}%`) as Clip[];
}

export function getClipById(id: number): Clip | undefined {
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as Clip | undefined;
}

export function deleteClip(id: number): void {
  db.prepare('DELETE FROM clips WHERE id = ?').run(id);
}

export function clearClips(): void {
  db.prepare('DELETE FROM clips').run();
}

export function pinClip(id: number): void {
  db.prepare('UPDATE clips SET pinned = 1 WHERE id = ?').run(id);
}

export function unpinClip(id: number): void {
  db.prepare('UPDATE clips SET pinned = 0 WHERE id = ?').run(id);
}

export function incrementCopyCount(id: number): void {
  db.prepare('UPDATE clips SET copy_count = copy_count + 1 WHERE id = ?').run(id);
}

export function getAllClips(): Clip[] {
  return db.prepare(
    'SELECT * FROM clips ORDER BY pinned DESC, created_at DESC'
  ).all() as Clip[];
}

export function closeDatabase(): void {
  if (db) db.close();
}
