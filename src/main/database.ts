import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';
import { getSettings } from './settings';
import { classify } from './classifier';

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

export function initDatabase(customDbPath?: string): void {
  const dbPath = customDbPath ?? path.join(app.getPath('userData'), 'clipboard-hero.db');
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

  // Snippets table — user-saved named text templates
  db.exec(`
    CREATE TABLE IF NOT EXISTS snippets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_snippets_name ON snippets(name)');

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

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
}

export function importClips(
  clips: Array<{
    content: string;
    category?: string;
    pinned?: number;
    copy_count?: number;
    created_at?: string;
  }>
): ImportResult {
  let imported = 0;
  let skipped = 0;

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO clips (content, category, preview, hash, pinned, copy_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    for (const clip of clips) {
      if (!clip.content || typeof clip.content !== 'string') {
        skipped++;
        continue;
      }

      const hash = crypto.createHash('md5').update(clip.content).digest('hex');
      const preview = clip.content.substring(0, 200);
      const category = clip.category || 'text';
      const pinned = clip.pinned ? 1 : 0;
      const copyCount = clip.copy_count ?? 0;
      const createdAt = clip.created_at || new Date().toISOString();

      const result = insertStmt.run(clip.content, category, preview, hash, pinned, copyCount, createdAt);
      if (result.changes > 0) {
        imported++;
      } else {
        skipped++;
      }
    }
  });

  transaction();

  return { imported, skipped, total: clips.length };
}

export function pruneExpiredClips(): number {
  const retentionDays = getSettings().retentionDays;
  if (retentionDays <= 0) return 0;

  const result = db.prepare(
    `DELETE FROM clips WHERE pinned = 0 AND created_at < datetime('now', '-' || ? || ' days')`
  ).run(retentionDays);

  return result.changes;
}

export function updateClipContent(id: number, newContent: string): Clip | null {
  const existing = getClipById(id);
  if (!existing) return null;

  const newCategory = classify(newContent);
  const newHash = crypto.createHash('md5').update(newContent).digest('hex');
  const newPreview = newContent.substring(0, 200);

  // Check for duplicate: if another clip already has this content, bail
  const duplicate = db.prepare('SELECT id FROM clips WHERE hash = ? AND id != ?').get(newHash, id) as { id: number } | undefined;
  if (duplicate) return null;

  db.prepare(
    'UPDATE clips SET content = ?, category = ?, preview = ?, hash = ? WHERE id = ?'
  ).run(newContent, newCategory, newPreview, newHash, id);

  return getClipById(id) ?? null;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface TopClip {
  id: number;
  preview: string;
  category: string;
  copy_count: number;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface Statistics {
  totalClips: number;
  pinnedClips: number;
  totalCopies: number;
  categoryBreakdown: CategoryCount[];
  topCopied: TopClip[];
  recentActivity: DailyActivity[];
}

export function getStatistics(): Statistics {
  const totalClips = getClipCount();

  const pinnedClips = (
    db.prepare('SELECT COUNT(*) as cnt FROM clips WHERE pinned = 1').get() as { cnt: number }
  ).cnt;

  const totalCopies = (
    db.prepare('SELECT COALESCE(SUM(copy_count), 0) as total FROM clips').get() as { total: number }
  ).total;

  const categoryBreakdown = db.prepare(
    'SELECT category, COUNT(*) as count FROM clips GROUP BY category ORDER BY count DESC'
  ).all() as CategoryCount[];

  const topCopied = db.prepare(
    'SELECT id, preview, category, copy_count FROM clips WHERE copy_count > 0 ORDER BY copy_count DESC LIMIT 5'
  ).all() as TopClip[];

  const recentActivity = db.prepare(
    `SELECT DATE(created_at) as date, COUNT(*) as count
     FROM clips
     WHERE created_at >= datetime('now', '-6 days')
     GROUP BY DATE(created_at)
     ORDER BY date ASC`
  ).all() as DailyActivity[];

  return {
    totalClips,
    pinnedClips,
    totalCopies,
    categoryBreakdown,
    topCopied,
    recentActivity,
  };
}

// ── Snippets ──

export interface Snippet {
  id: number;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export function createSnippet(name: string, content: string): Snippet {
  const result = db.prepare(
    'INSERT INTO snippets (name, content) VALUES (?, ?)'
  ).run(name, content);

  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(result.lastInsertRowid) as Snippet;
}

export function getSnippets(): Snippet[] {
  return db.prepare('SELECT * FROM snippets ORDER BY updated_at DESC').all() as Snippet[];
}

export function getSnippetById(id: number): Snippet | undefined {
  return db.prepare('SELECT * FROM snippets WHERE id = ?').get(id) as Snippet | undefined;
}

export function searchSnippets(query: string): Snippet[] {
  return db.prepare(
    'SELECT * FROM snippets WHERE name LIKE ? OR content LIKE ? ORDER BY updated_at DESC'
  ).all(`%${query}%`, `%${query}%`) as Snippet[];
}

export function updateSnippet(id: number, update: { name?: string; content?: string }): Snippet | null {
  const existing = getSnippetById(id);
  if (!existing) return null;

  const newName = update.name ?? existing.name;
  const newContent = update.content ?? existing.content;

  db.prepare(
    'UPDATE snippets SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(newName, newContent, id);

  return getSnippetById(id) ?? null;
}

export function deleteSnippet(id: number): void {
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
}

export function getSnippetCount(): number {
  return (db.prepare('SELECT COUNT(*) as cnt FROM snippets').get() as { cnt: number }).cnt;
}

export function saveClipAsSnippet(clipId: number, name: string): Snippet | null {
  const clip = getClipById(clipId);
  if (!clip) return null;

  return createSnippet(name, clip.content);
}

export function closeDatabase(): void {
  if (db) db.close();
}
