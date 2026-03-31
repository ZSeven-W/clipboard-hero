import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock electron's app module before importing database
vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}));

// Mock classifier for updateClipContent
vi.mock('../classifier', () => ({
  classify: vi.fn((content: string) => {
    if (content.startsWith('http')) return 'url';
    if (content.includes('@') && content.includes('.')) return 'email';
    return 'text';
  }),
}));

// Mock settings to control maxClips and retentionDays in pruning tests
vi.mock('../settings', () => ({
  getSettings: () => ({ maxClips: mockMaxClips, pollingInterval: 500, launchAtLogin: false, retentionDays: mockRetentionDays }),
}));

let mockMaxClips = 1000;
let mockRetentionDays = 30;

import {
  initDatabase,
  insertClip,
  getClips,
  searchClips,
  getClipById,
  deleteClip,
  clearClips,
  pinClip,
  unpinClip,
  incrementCopyCount,
  getAllClips,
  getClipCount,
  importClips,
  pruneExpiredClips,
  updateClipContent,
  getStatistics,
  closeDatabase,
} from '../database';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `clipboard-hero-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  initDatabase(dbPath);
  mockMaxClips = 1000;
  mockRetentionDays = 30;
});

afterEach(() => {
  closeDatabase();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch {}
});

describe('initDatabase', () => {
  it('creates the database file', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});

describe('insertClip', () => {
  it('inserts a new clip and returns it', () => {
    const clip = insertClip('hello world', 'text');
    expect(clip).not.toBeNull();
    expect(clip!.content).toBe('hello world');
    expect(clip!.category).toBe('text');
    expect(clip!.pinned).toBe(0);
    expect(clip!.copy_count).toBe(0);
  });

  it('generates a preview from content', () => {
    const longContent = 'A'.repeat(300);
    const clip = insertClip(longContent, 'text');
    expect(clip!.preview.length).toBe(200);
  });

  it('deduplicates identical content by bumping timestamp', () => {
    const clip1 = insertClip('duplicate text', 'text');
    const clip2 = insertClip('duplicate text', 'text');
    expect(clip1!.id).toBe(clip2!.id);
  });

  it('stores different content as separate clips', () => {
    const clip1 = insertClip('first', 'text');
    const clip2 = insertClip('second', 'text');
    expect(clip1!.id).not.toBe(clip2!.id);
  });
});

describe('getClips', () => {
  it('returns pinned clips before unpinned clips', () => {
    const unpinned = insertClip('unpinned', 'text');
    const toBePinned = insertClip('will-pin', 'text');
    pinClip(toBePinned!.id);
    const clips = getClips();
    expect(clips[0].content).toBe('will-pin');
    expect(clips[0].pinned).toBe(1);
  });

  it('filters by category', () => {
    insertClip('some code', 'code');
    insertClip('a url', 'url');
    insertClip('plain text', 'text');
    const codeClips = getClips('code');
    expect(codeClips.length).toBe(1);
    expect(codeClips[0].category).toBe('code');
  });

  it('returns all clips when category is "all"', () => {
    insertClip('code clip', 'code');
    insertClip('text clip', 'text');
    const clips = getClips('all');
    expect(clips.length).toBe(2);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      insertClip(`clip ${i}`, 'text');
    }
    const clips = getClips(undefined, 3);
    expect(clips.length).toBe(3);
  });
});

describe('searchClips', () => {
  it('finds clips by partial content match', () => {
    insertClip('hello world', 'text');
    insertClip('goodbye world', 'text');
    insertClip('hello there', 'text');
    const results = searchClips('hello');
    expect(results.length).toBe(2);
  });

  it('returns empty array when no match', () => {
    insertClip('hello world', 'text');
    const results = searchClips('nonexistent');
    expect(results.length).toBe(0);
  });

  it('search is case-insensitive (SQLite LIKE)', () => {
    insertClip('Hello World', 'text');
    const results = searchClips('hello');
    expect(results.length).toBe(1);
  });
});

describe('getClipById', () => {
  it('returns the clip with the given id', () => {
    const inserted = insertClip('find me', 'text');
    const found = getClipById(inserted!.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe('find me');
  });

  it('returns undefined for nonexistent id', () => {
    expect(getClipById(99999)).toBeUndefined();
  });
});

describe('deleteClip', () => {
  it('removes a clip by id', () => {
    const clip = insertClip('delete me', 'text');
    deleteClip(clip!.id);
    expect(getClipById(clip!.id)).toBeUndefined();
  });
});

describe('clearClips', () => {
  it('removes all clips', () => {
    insertClip('one', 'text');
    insertClip('two', 'text');
    clearClips();
    expect(getClipCount()).toBe(0);
  });
});

describe('pinClip / unpinClip', () => {
  it('pins a clip', () => {
    const clip = insertClip('pin me', 'text');
    pinClip(clip!.id);
    const found = getClipById(clip!.id);
    expect(found!.pinned).toBe(1);
  });

  it('unpins a clip', () => {
    const clip = insertClip('unpin me', 'text');
    pinClip(clip!.id);
    unpinClip(clip!.id);
    const found = getClipById(clip!.id);
    expect(found!.pinned).toBe(0);
  });

  it('pinned clips appear first in results', () => {
    const first = insertClip('first', 'text');
    insertClip('second', 'text');
    pinClip(first!.id);
    const clips = getClips();
    expect(clips[0].content).toBe('first');
    expect(clips[0].pinned).toBe(1);
  });
});

describe('incrementCopyCount', () => {
  it('increments the copy count', () => {
    const clip = insertClip('count me', 'text');
    incrementCopyCount(clip!.id);
    incrementCopyCount(clip!.id);
    const found = getClipById(clip!.id);
    expect(found!.copy_count).toBe(2);
  });
});

describe('getClipCount', () => {
  it('returns the total number of clips', () => {
    expect(getClipCount()).toBe(0);
    insertClip('one', 'text');
    insertClip('two', 'text');
    expect(getClipCount()).toBe(2);
  });
});

describe('getAllClips', () => {
  it('returns all clips without limit', () => {
    for (let i = 0; i < 150; i++) {
      insertClip(`clip ${i}`, 'text');
    }
    const all = getAllClips();
    expect(all.length).toBe(150);
  });
});

describe('pruning', () => {
  it('prunes oldest unpinned clips when exceeding maxClips', () => {
    mockMaxClips = 3;
    insertClip('clip-1', 'text');
    insertClip('clip-2', 'text');
    insertClip('clip-3', 'text');
    // This insert should trigger pruning of the oldest
    insertClip('clip-4', 'text');
    const clips = getClips();
    expect(clips.length).toBeLessThanOrEqual(4);
    // clip-1 should have been pruned
    const contents = clips.map((c) => c.content);
    expect(contents).not.toContain('clip-1');
  });

  it('does not prune pinned clips', () => {
    mockMaxClips = 2;
    const pinned = insertClip('pinned-clip', 'text');
    pinClip(pinned!.id);
    insertClip('clip-a', 'text');
    insertClip('clip-b', 'text');
    // Trigger pruning
    insertClip('clip-c', 'text');
    const found = getClipById(pinned!.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe('pinned-clip');
  });
});

describe('importClips', () => {
  it('imports an array of clips and returns counts', () => {
    const result = importClips([
      { content: 'imported-1', category: 'text' },
      { content: 'imported-2', category: 'url' },
      { content: 'imported-3', category: 'code' },
    ]);
    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(3);
    expect(getClipCount()).toBe(3);
  });

  it('skips duplicates already in the database', () => {
    insertClip('existing-clip', 'text');
    const result = importClips([
      { content: 'existing-clip', category: 'text' },
      { content: 'new-clip', category: 'text' },
    ]);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(getClipCount()).toBe(2);
  });

  it('skips duplicates within the import batch itself', () => {
    const result = importClips([
      { content: 'same-content', category: 'text' },
      { content: 'same-content', category: 'text' },
    ]);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips entries with missing or invalid content', () => {
    const result = importClips([
      { content: '', category: 'text' },
      { content: 'valid', category: 'text' },
      { category: 'text' } as any,
      { content: 123 } as any,
    ]);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(3);
  });

  it('preserves pinned state from imported clips', () => {
    importClips([
      { content: 'pinned-import', category: 'text', pinned: 1 },
    ]);
    const clips = getClips();
    expect(clips[0].content).toBe('pinned-import');
    expect(clips[0].pinned).toBe(1);
  });

  it('preserves copy_count from imported clips', () => {
    importClips([
      { content: 'counted-clip', category: 'text', copy_count: 5 },
    ]);
    const clips = getClips();
    expect(clips[0].copy_count).toBe(5);
  });

  it('preserves created_at from imported clips', () => {
    const timestamp = '2025-01-15 10:30:00';
    importClips([
      { content: 'dated-clip', category: 'text', created_at: timestamp },
    ]);
    const clips = getClips();
    expect(clips[0].created_at).toBe(timestamp);
  });

  it('defaults category to text when not provided', () => {
    importClips([{ content: 'no-category' }]);
    const clips = getClips();
    expect(clips[0].category).toBe('text');
  });

  it('handles empty array gracefully', () => {
    const result = importClips([]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe('pruneExpiredClips', () => {
  it('deletes unpinned clips older than retentionDays', () => {
    mockRetentionDays = 7;
    // Insert a clip and manually backdate it via raw SQL
    const clip = insertClip('old-clip', 'text');
    // We need to access the db directly — use importClips with old date instead
    importClips([{ content: 'ancient-clip', category: 'text', created_at: '2020-01-01 00:00:00' }]);
    const before = getClipCount();
    expect(before).toBe(2);

    const deleted = pruneExpiredClips();
    expect(deleted).toBe(1);
    expect(getClipCount()).toBe(1);
  });

  it('does not delete pinned clips even if expired', () => {
    mockRetentionDays = 7;
    importClips([{ content: 'old-pinned', category: 'text', created_at: '2020-01-01 00:00:00', pinned: 1 }]);

    const deleted = pruneExpiredClips();
    expect(deleted).toBe(0);
    expect(getClipCount()).toBe(1);
  });

  it('does nothing when retentionDays is 0 (keep forever)', () => {
    mockRetentionDays = 0;
    importClips([{ content: 'forever-clip', category: 'text', created_at: '2020-01-01 00:00:00' }]);

    const deleted = pruneExpiredClips();
    expect(deleted).toBe(0);
    expect(getClipCount()).toBe(1);
  });

  it('does not delete recent clips', () => {
    mockRetentionDays = 30;
    insertClip('fresh-clip', 'text');

    const deleted = pruneExpiredClips();
    expect(deleted).toBe(0);
    expect(getClipCount()).toBe(1);
  });

  it('returns the number of deleted clips', () => {
    mockRetentionDays = 1;
    importClips([
      { content: 'old-1', category: 'text', created_at: '2020-01-01 00:00:00' },
      { content: 'old-2', category: 'text', created_at: '2020-01-02 00:00:00' },
      { content: 'old-3', category: 'text', created_at: '2020-01-03 00:00:00' },
    ]);

    const deleted = pruneExpiredClips();
    expect(deleted).toBe(3);
    expect(getClipCount()).toBe(0);
  });
});

describe('updateClipContent', () => {
  it('updates content, preview, hash, and category', () => {
    const clip = insertClip('original text', 'text');
    const updated = updateClipContent(clip!.id, 'https://example.com');
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('https://example.com');
    expect(updated!.category).toBe('url');
    expect(updated!.preview).toBe('https://example.com');
  });

  it('returns null for nonexistent id', () => {
    expect(updateClipContent(99999, 'new')).toBeNull();
  });

  it('returns null when new content duplicates another clip', () => {
    insertClip('existing content', 'text');
    const clip2 = insertClip('will change', 'text');
    const result = updateClipContent(clip2!.id, 'existing content');
    expect(result).toBeNull();
    // Original content should be unchanged
    const found = getClipById(clip2!.id);
    expect(found!.content).toBe('will change');
  });

  it('preserves pinned state and copy_count after update', () => {
    const clip = insertClip('pin me', 'text');
    pinClip(clip!.id);
    incrementCopyCount(clip!.id);
    incrementCopyCount(clip!.id);

    const updated = updateClipContent(clip!.id, 'updated pinned');
    expect(updated!.pinned).toBe(1);
    expect(updated!.copy_count).toBe(2);
  });

  it('allows updating to same content (same hash, same id)', () => {
    const clip = insertClip('same content', 'text');
    const updated = updateClipContent(clip!.id, 'same content');
    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('same content');
  });

  it('truncates preview to 200 chars', () => {
    const clip = insertClip('short', 'text');
    const longContent = 'B'.repeat(300);
    const updated = updateClipContent(clip!.id, longContent);
    expect(updated!.preview.length).toBe(200);
  });

  it('re-classifies email content', () => {
    const clip = insertClip('plain text', 'text');
    const updated = updateClipContent(clip!.id, 'user@example.com');
    expect(updated!.category).toBe('email');
  });
});

describe('getStatistics', () => {
  it('returns zeros for an empty database', () => {
    const stats = getStatistics();
    expect(stats.totalClips).toBe(0);
    expect(stats.pinnedClips).toBe(0);
    expect(stats.totalCopies).toBe(0);
    expect(stats.categoryBreakdown).toEqual([]);
    expect(stats.topCopied).toEqual([]);
    expect(stats.recentActivity).toEqual([]);
  });

  it('returns correct totalClips count', () => {
    insertClip('one', 'text');
    insertClip('two', 'code');
    insertClip('three', 'url');
    const stats = getStatistics();
    expect(stats.totalClips).toBe(3);
  });

  it('returns correct pinnedClips count', () => {
    const a = insertClip('a', 'text');
    const b = insertClip('b', 'text');
    insertClip('c', 'text');
    pinClip(a!.id);
    pinClip(b!.id);
    const stats = getStatistics();
    expect(stats.pinnedClips).toBe(2);
  });

  it('returns correct totalCopies sum', () => {
    const clip1 = insertClip('clip1', 'text');
    const clip2 = insertClip('clip2', 'text');
    incrementCopyCount(clip1!.id);
    incrementCopyCount(clip1!.id);
    incrementCopyCount(clip1!.id);
    incrementCopyCount(clip2!.id);
    const stats = getStatistics();
    expect(stats.totalCopies).toBe(4);
  });

  it('returns category breakdown sorted by count descending', () => {
    insertClip('text1', 'text');
    insertClip('text2', 'text');
    insertClip('text3', 'text');
    insertClip('code1', 'code');
    insertClip('code2', 'code');
    insertClip('url1', 'url');
    const stats = getStatistics();
    expect(stats.categoryBreakdown.length).toBe(3);
    expect(stats.categoryBreakdown[0]).toEqual({ category: 'text', count: 3 });
    expect(stats.categoryBreakdown[1]).toEqual({ category: 'code', count: 2 });
    expect(stats.categoryBreakdown[2]).toEqual({ category: 'url', count: 1 });
  });

  it('returns top copied clips ordered by copy_count descending', () => {
    const a = insertClip('alpha', 'text');
    const b = insertClip('beta', 'text');
    const c = insertClip('gamma', 'text');
    incrementCopyCount(b!.id);
    incrementCopyCount(b!.id);
    incrementCopyCount(b!.id);
    incrementCopyCount(a!.id);
    // c has 0 copies, should not appear
    const stats = getStatistics();
    expect(stats.topCopied.length).toBe(2);
    expect(stats.topCopied[0].copy_count).toBe(3);
    expect(stats.topCopied[0].preview).toBe('beta');
    expect(stats.topCopied[1].copy_count).toBe(1);
  });

  it('limits top copied to 5 entries', () => {
    for (let i = 0; i < 8; i++) {
      const clip = insertClip(`clip-${i}`, 'text');
      incrementCopyCount(clip!.id);
    }
    const stats = getStatistics();
    expect(stats.topCopied.length).toBe(5);
  });

  it('excludes zero-copy clips from topCopied', () => {
    insertClip('no copies', 'text');
    const stats = getStatistics();
    expect(stats.topCopied.length).toBe(0);
  });

  it('returns recent activity grouped by date', () => {
    // Clips inserted with CURRENT_TIMESTAMP will be today
    insertClip('today-1', 'text');
    insertClip('today-2', 'text');
    const stats = getStatistics();
    expect(stats.recentActivity.length).toBeGreaterThanOrEqual(1);
    const todayEntry = stats.recentActivity[stats.recentActivity.length - 1];
    expect(todayEntry.count).toBe(2);
  });

  it('does not include activity older than 7 days', () => {
    // Import a clip with old date
    importClips([{ content: 'ancient', category: 'text', created_at: '2020-01-01 00:00:00' }]);
    const stats = getStatistics();
    // The ancient clip should not appear in recentActivity
    const ancientEntry = stats.recentActivity.find((d) => d.date === '2020-01-01');
    expect(ancientEntry).toBeUndefined();
    // But it should still count in totalClips
    expect(stats.totalClips).toBe(1);
  });

  it('includes category and id in topCopied entries', () => {
    const clip = insertClip('http://example.com', 'url');
    incrementCopyCount(clip!.id);
    const stats = getStatistics();
    expect(stats.topCopied[0].id).toBe(clip!.id);
    expect(stats.topCopied[0].category).toBe('url');
  });
});
