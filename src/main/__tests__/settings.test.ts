import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock electron's app module
vi.mock('electron', () => ({
  app: {
    getPath: () => settingsDir,
  },
}));

let settingsDir: string;

import { loadSettings, saveSettings, getSettings, Settings } from '../settings';

beforeEach(() => {
  settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-hero-settings-'));
});

afterEach(() => {
  fs.rmSync(settingsDir, { recursive: true, force: true });
});

describe('loadSettings', () => {
  it('returns defaults when no settings file exists', () => {
    const settings = loadSettings();
    expect(settings).toEqual({
      maxClips: 1000,
      pollingInterval: 500,
      launchAtLogin: false,
      retentionDays: 30,
    });
  });

  it('loads settings from file', () => {
    const custom: Settings = { maxClips: 500, pollingInterval: 250, launchAtLogin: true, retentionDays: 14 };
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify(custom));

    const settings = loadSettings();
    expect(settings.maxClips).toBe(500);
    expect(settings.pollingInterval).toBe(250);
    expect(settings.launchAtLogin).toBe(true);
  });

  it('merges partial settings with defaults', () => {
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({ maxClips: 200 }));

    const settings = loadSettings();
    expect(settings.maxClips).toBe(200);
    expect(settings.pollingInterval).toBe(500); // default
    expect(settings.launchAtLogin).toBe(false); // default
  });

  it('returns defaults for corrupted JSON', () => {
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), 'not valid json{{{');

    const settings = loadSettings();
    expect(settings).toEqual({
      maxClips: 1000,
      pollingInterval: 500,
      launchAtLogin: false,
      retentionDays: 30,
    });
  });
});

describe('saveSettings', () => {
  it('saves partial update and returns merged settings', () => {
    loadSettings(); // initialize defaults
    const result = saveSettings({ maxClips: 300 });

    expect(result.maxClips).toBe(300);
    expect(result.pollingInterval).toBe(500);
    expect(result.launchAtLogin).toBe(false);
  });

  it('persists settings to disk', () => {
    loadSettings();
    saveSettings({ pollingInterval: 1000 });

    const raw = fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.pollingInterval).toBe(1000);
  });

  it('applies multiple sequential updates', () => {
    loadSettings();
    saveSettings({ maxClips: 200 });
    saveSettings({ launchAtLogin: true });

    const result = getSettings();
    expect(result.maxClips).toBe(200);
    expect(result.launchAtLogin).toBe(true);
    expect(result.pollingInterval).toBe(500);
  });

  it('overwrites previously saved values', () => {
    loadSettings();
    saveSettings({ maxClips: 100 });
    saveSettings({ maxClips: 999 });

    expect(getSettings().maxClips).toBe(999);
  });
});

describe('getSettings', () => {
  it('returns current in-memory settings', () => {
    loadSettings();
    const settings = getSettings();
    expect(settings).toEqual({
      maxClips: 1000,
      pollingInterval: 500,
      launchAtLogin: false,
      retentionDays: 30,
    });
  });

  it('reflects changes after saveSettings', () => {
    loadSettings();
    saveSettings({ maxClips: 42 });
    expect(getSettings().maxClips).toBe(42);
  });

  it('reflects values loaded from disk', () => {
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ maxClips: 777, pollingInterval: 100, launchAtLogin: true })
    );
    loadSettings();
    const settings = getSettings();
    expect(settings.maxClips).toBe(777);
    expect(settings.pollingInterval).toBe(100);
    expect(settings.launchAtLogin).toBe(true);
  });
});
