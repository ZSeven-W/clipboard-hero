import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';

export interface Clip {
  id: number;
  content: string;
  category: string;
  preview: string;
  hash: string;
  created_at: string;
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_clips_category ON clips(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC)');
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

  return db.prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as Clip;
}

export function getClips(category?: string, limit = 100): Clip[] {
  if (category && category !== 'all') {
    return db.prepare(
      'SELECT * FROM clips WHERE category = ? ORDER BY created_at DESC LIMIT ?'
    ).all(category, limit) as Clip[];
  }
  return db.prepare(
    'SELECT * FROM clips ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Clip[];
}

export function searchClips(query: string): Clip[] {
  return db.prepare(
    'SELECT * FROM clips WHERE content LIKE ? ORDER BY created_at DESC LIMIT 100'
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

export function closeDatabase(): void {
  if (db) db.close();
}
