interface ClipItem {
  id: number;
  content: string;
  category: string;
  preview: string;
  hash: string;
  created_at: string;
  pinned: number;
  copy_count: number;
}

interface AppSettings {
  maxClips: number;
  pollingInterval: number;
  launchAtLogin: boolean;
  retentionDays: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

interface TopClip {
  id: number;
  preview: string;
  category: string;
  copy_count: number;
}

interface DailyActivity {
  date: string;
  count: number;
}

interface ClipStatistics {
  totalClips: number;
  pinnedClips: number;
  totalCopies: number;
  categoryBreakdown: CategoryCount[];
  topCopied: TopClip[];
  recentActivity: DailyActivity[];
}

interface ClipboardAPI {
  getClips(category?: string): Promise<ClipItem[]>;
  searchClips(query: string): Promise<ClipItem[]>;
  copyClip(id: number): Promise<void>;
  deleteClip(id: number): Promise<void>;
  clearClips(): Promise<void>;
  pinClip(id: number): Promise<void>;
  unpinClip(id: number): Promise<void>;
  exportClips(): Promise<ClipItem[]>;
  updateClip(id: number, newContent: string): Promise<ClipItem | null>;
  getClipCount(): Promise<number>;
  getStats(): Promise<ClipStatistics>;
  getSettings(): Promise<AppSettings>;
  saveSettings(update: Partial<AppSettings>): Promise<AppSettings>;
  onClipboardChanged(callback: (clip: ClipItem) => void): void;
  onRefresh(callback: () => void): void;
  onSettingsOpen(callback: () => void): void;
}

interface Window {
  api: ClipboardAPI;
}
