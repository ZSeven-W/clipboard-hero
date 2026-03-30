import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mutable clipboard text for the mock
let clipboardText = '';

vi.mock('electron', () => ({
  clipboard: {
    readText: () => clipboardText,
  },
}));

vi.mock('../classifier', () => ({
  classify: vi.fn((content: string) => {
    if (content.startsWith('http')) return 'url';
    if (content.includes('@')) return 'email';
    return 'text';
  }),
}));

let insertedClips: { content: string; category: string }[] = [];
let insertId = 1;

vi.mock('../database', () => ({
  insertClip: vi.fn((content: string, category: string) => {
    const clip = {
      id: insertId++,
      content,
      category,
      preview: content.substring(0, 200),
      hash: 'hash-' + insertId,
      created_at: new Date().toISOString(),
      pinned: 0,
      copy_count: 0,
    };
    insertedClips.push({ content, category });
    return clip;
  }),
}));

import { startWatching, stopWatching, skipNextChange, updateInterval } from '../clipboard-watcher';

beforeEach(() => {
  vi.useFakeTimers();
  clipboardText = 'initial';
  insertedClips = [];
  insertId = 1;
});

afterEach(() => {
  stopWatching();
  vi.useRealTimers();
});

describe('startWatching', () => {
  it('does not fire callback when clipboard has not changed', () => {
    const callback = vi.fn();
    startWatching(callback);
    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('fires callback when clipboard content changes', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = 'new content';
    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'new content', category: 'text' })
    );
  });

  it('classifies URL content correctly', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = 'https://example.com';
    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'url' })
    );
  });

  it('classifies email content correctly', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = 'user@example.com';
    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'email' })
    );
  });

  it('fires for each distinct clipboard change', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = 'first change';
    vi.advanceTimersByTime(500);

    clipboardText = 'second change';
    vi.advanceTimersByTime(500);

    clipboardText = 'third change';
    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('does not fire when clipboard is empty', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = '';
    vi.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
  });

  it('uses custom polling interval', () => {
    const callback = vi.fn();
    startWatching(callback, 1000);

    clipboardText = 'changed';
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not fire for same content repeated', () => {
    const callback = vi.fn();
    clipboardText = 'same';
    startWatching(callback);

    // Content is "same" which matches initial read
    vi.advanceTimersByTime(2000);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('skipNextChange', () => {
  it('skips one clipboard change after being called', () => {
    const callback = vi.fn();
    startWatching(callback);

    skipNextChange();
    clipboardText = 'skipped content';
    vi.advanceTimersByTime(500);

    expect(callback).not.toHaveBeenCalled();
  });

  it('only skips one change, not subsequent ones', () => {
    const callback = vi.fn();
    startWatching(callback);

    skipNextChange();
    clipboardText = 'skipped';
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();

    clipboardText = 'not skipped';
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'not skipped' })
    );
  });

  it('inserts the clip to DB when not skipping', () => {
    const callback = vi.fn();
    startWatching(callback);

    clipboardText = 'stored clip';
    vi.advanceTimersByTime(500);

    expect(insertedClips).toHaveLength(1);
    expect(insertedClips[0].content).toBe('stored clip');
  });

  it('does not insert clip when skipped', () => {
    const callback = vi.fn();
    startWatching(callback);

    skipNextChange();
    clipboardText = 'not stored';
    vi.advanceTimersByTime(500);

    expect(insertedClips).toHaveLength(0);
  });
});

describe('stopWatching', () => {
  it('stops detecting clipboard changes', () => {
    const callback = vi.fn();
    startWatching(callback);

    stopWatching();
    clipboardText = 'after stop';
    vi.advanceTimersByTime(2000);

    expect(callback).not.toHaveBeenCalled();
  });

  it('is safe to call multiple times', () => {
    const callback = vi.fn();
    startWatching(callback);
    stopWatching();
    stopWatching();
    // Should not throw
  });
});

describe('updateInterval', () => {
  it('changes polling interval without losing callback', () => {
    const callback = vi.fn();
    startWatching(callback, 500);

    updateInterval(2000);

    clipboardText = 'after update';
    vi.advanceTimersByTime(500);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('continues detecting changes after interval update', () => {
    const callback = vi.fn();
    startWatching(callback, 500);

    updateInterval(100);

    clipboardText = 'fast poll';
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
