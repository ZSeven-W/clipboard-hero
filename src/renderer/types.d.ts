interface ClipItem {
  id: number;
  content: string;
  category: string;
  preview: string;
  hash: string;
  created_at: string;
}

interface ClipboardAPI {
  getClips(category?: string): Promise<ClipItem[]>;
  searchClips(query: string): Promise<ClipItem[]>;
  copyClip(id: number): Promise<void>;
  deleteClip(id: number): Promise<void>;
  clearClips(): Promise<void>;
  onClipboardChanged(callback: (clip: ClipItem) => void): void;
  onRefresh(callback: () => void): void;
}

interface Window {
  api: ClipboardAPI;
}
