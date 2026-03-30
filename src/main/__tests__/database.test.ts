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

// Mock settings to control maxClips in pruning tests
vi.mock('../settings', () => ({
  getSettings: () => ({ maxClips: mockMaxClips, pollingInterval: 500, launchAtLogin: false }),
}));

let mockMaxClips = 1000;

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
  closeDatabase,
} from '../database';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `clipboard-hero-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  initDatabase(dbPath);
  mockMaxClips = 1000;
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
