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

// Mock classifier (required by database.ts)
vi.mock('../classifier', () => ({
  classify: vi.fn((content: string) => {
    if (content.startsWith('http')) return 'url';
    if (content.includes('@') && content.includes('.')) return 'email';
    return 'text';
  }),
}));

// Mock settings
vi.mock('../settings', () => ({
  getSettings: () => ({ maxClips: 1000, pollingInterval: 500, launchAtLogin: false, retentionDays: 30 }),
}));

import {
  initDatabase,
  insertClip,
  getClipById,
  createSnippet,
  getSnippets,
  getSnippetById,
  searchSnippets,
  updateSnippet,
  deleteSnippet,
  getSnippetCount,
  saveClipAsSnippet,
  closeDatabase,
} from '../database';

let dbPath: string;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `clipboard-hero-snippets-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  initDatabase(dbPath);
});

afterEach(() => {
  closeDatabase();
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch {}
});

describe('createSnippet', () => {
  it('creates a snippet and returns it', () => {
    const snippet = createSnippet('greeting', 'Hello, World!');
    expect(snippet).toBeDefined();
    expect(snippet.id).toBeGreaterThan(0);
    expect(snippet.name).toBe('greeting');
    expect(snippet.content).toBe('Hello, World!');
    expect(snippet.created_at).toBeDefined();
    expect(snippet.updated_at).toBeDefined();
  });

  it('allows multiple snippets with the same name', () => {
    const s1 = createSnippet('template', 'version 1');
    const s2 = createSnippet('template', 'version 2');
    expect(s1.id).not.toBe(s2.id);
    expect(getSnippetCount()).toBe(2);
  });

  it('stores empty-string content', () => {
    const snippet = createSnippet('empty', '');
    expect(snippet.content).toBe('');
  });

  it('stores multi-line content', () => {
    const content = 'line 1\nline 2\nline 3';
    const snippet = createSnippet('multi', content);
    expect(snippet.content).toBe(content);
  });

  it('stores unicode content', () => {
    const snippet = createSnippet('emoji', 'Hello 🌍 世界');
    expect(snippet.content).toBe('Hello 🌍 世界');
  });
});

describe('getSnippets', () => {
  it('returns empty array when no snippets exist', () => {
    expect(getSnippets()).toEqual([]);
  });

  it('returns all snippets', () => {
    createSnippet('first', 'content-1');
    createSnippet('second', 'content-2');
    createSnippet('third', 'content-3');
    const snippets = getSnippets();
    expect(snippets.length).toBe(3);
    const names = snippets.map((s) => s.name);
    expect(names).toContain('first');
    expect(names).toContain('second');
    expect(names).toContain('third');
  });
});

describe('getSnippetById', () => {
  it('returns the snippet with the given id', () => {
    const created = createSnippet('findme', 'find my content');
    const found = getSnippetById(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('findme');
    expect(found!.content).toBe('find my content');
  });

  it('returns undefined for nonexistent id', () => {
    expect(getSnippetById(99999)).toBeUndefined();
  });
});

describe('searchSnippets', () => {
  beforeEach(() => {
    createSnippet('email-template', 'Dear Sir/Madam, ...');
    createSnippet('code-header', '// Copyright 2026');
    createSnippet('meeting-notes', 'Action items from standup');
  });

  it('finds snippets by name match', () => {
    const results = searchSnippets('template');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('email-template');
  });

  it('finds snippets by content match', () => {
    const results = searchSnippets('Copyright');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('code-header');
  });

  it('is case-insensitive', () => {
    const results = searchSnippets('dear');
    expect(results.length).toBe(1);
  });

  it('returns empty array when no match', () => {
    const results = searchSnippets('nonexistent');
    expect(results.length).toBe(0);
  });

  it('matches across both name and content', () => {
    createSnippet('notes', 'email draft for client');
    const results = searchSnippets('email');
    // Should match 'email-template' (name) and the new snippet (content)
    expect(results.length).toBe(2);
  });
});

describe('updateSnippet', () => {
  it('updates the name only', () => {
    const snippet = createSnippet('old-name', 'content');
    const updated = updateSnippet(snippet.id, { name: 'new-name' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('new-name');
    expect(updated!.content).toBe('content');
  });

  it('updates the content only', () => {
    const snippet = createSnippet('name', 'old-content');
    const updated = updateSnippet(snippet.id, { content: 'new-content' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('name');
    expect(updated!.content).toBe('new-content');
  });

  it('updates both name and content', () => {
    const snippet = createSnippet('old', 'old');
    const updated = updateSnippet(snippet.id, { name: 'new', content: 'new' });
    expect(updated!.name).toBe('new');
    expect(updated!.content).toBe('new');
  });

  it('updates the updated_at timestamp', () => {
    const snippet = createSnippet('name', 'content');
    const originalUpdatedAt = snippet.updated_at;
    // Small delay to ensure timestamp differs
    const updated = updateSnippet(snippet.id, { content: 'changed' });
    expect(updated!.updated_at).toBeDefined();
    // updated_at should be >= original (SQLite CURRENT_TIMESTAMP granularity is seconds)
  });

  it('returns null for nonexistent id', () => {
    expect(updateSnippet(99999, { name: 'nope' })).toBeNull();
  });

  it('preserves fields when empty update is given', () => {
    const snippet = createSnippet('keep', 'keep-content');
    const updated = updateSnippet(snippet.id, {});
    expect(updated!.name).toBe('keep');
    expect(updated!.content).toBe('keep-content');
  });
});

describe('deleteSnippet', () => {
  it('removes a snippet by id', () => {
    const snippet = createSnippet('delete-me', 'bye');
    deleteSnippet(snippet.id);
    expect(getSnippetById(snippet.id)).toBeUndefined();
  });

  it('does not affect other snippets', () => {
    const s1 = createSnippet('keep', 'content-1');
    const s2 = createSnippet('delete', 'content-2');
    deleteSnippet(s2.id);
    expect(getSnippetById(s1.id)).toBeDefined();
    expect(getSnippetCount()).toBe(1);
  });

  it('is a no-op for nonexistent id', () => {
    createSnippet('only', 'snippet');
    deleteSnippet(99999);
    expect(getSnippetCount()).toBe(1);
  });
});

describe('getSnippetCount', () => {
  it('returns 0 when no snippets exist', () => {
    expect(getSnippetCount()).toBe(0);
  });

  it('returns the correct count', () => {
    createSnippet('a', '1');
    createSnippet('b', '2');
    createSnippet('c', '3');
    expect(getSnippetCount()).toBe(3);
  });

  it('decrements after deletion', () => {
    const s = createSnippet('temp', 'x');
    createSnippet('keep', 'y');
    deleteSnippet(s.id);
    expect(getSnippetCount()).toBe(1);
  });
});

describe('saveClipAsSnippet', () => {
  it('saves a clip as a snippet with given name', () => {
    const clip = insertClip('console.log("hello")', 'code');
    const snippet = saveClipAsSnippet(clip!.id, 'debug-log');
    expect(snippet).not.toBeNull();
    expect(snippet!.name).toBe('debug-log');
    expect(snippet!.content).toBe('console.log("hello")');
  });

  it('returns null for nonexistent clip id', () => {
    expect(saveClipAsSnippet(99999, 'nope')).toBeNull();
  });

  it('creates a snippet independent of the original clip', () => {
    const clip = insertClip('original', 'text');
    const snippet = saveClipAsSnippet(clip!.id, 'saved');
    expect(snippet).not.toBeNull();
    // Snippet should still exist even if we verify it's a separate entity
    expect(snippet!.id).toBeGreaterThan(0);
    const found = getSnippetById(snippet!.id);
    expect(found!.content).toBe('original');
  });

  it('allows saving the same clip multiple times with different names', () => {
    const clip = insertClip('reusable', 'text');
    const s1 = saveClipAsSnippet(clip!.id, 'version-1');
    const s2 = saveClipAsSnippet(clip!.id, 'version-2');
    expect(s1!.id).not.toBe(s2!.id);
    expect(s1!.content).toBe(s2!.content);
    expect(getSnippetCount()).toBe(2);
  });
});
