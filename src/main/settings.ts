import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export interface Settings {
  maxClips: number;
  pollingInterval: number;
  launchAtLogin: boolean;
  retentionDays: number; // 0 = keep forever
}

const DEFAULTS: Settings = {
  maxClips: 1000,
  pollingInterval: 500,
  launchAtLogin: false,
  retentionDays: 30,
};

let current: Settings = { ...DEFAULTS };

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    current = { ...DEFAULTS, ...parsed };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

export function saveSettings(update: Partial<Settings>): Settings {
  current = { ...current, ...update };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(current, null, 2), 'utf-8');
  return current;
}

export function getSettings(): Settings {
  return current;
}
