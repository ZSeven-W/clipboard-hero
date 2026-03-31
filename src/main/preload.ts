import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getClips: (category?: string) => ipcRenderer.invoke('clips:getAll', category),
  searchClips: (query: string) => ipcRenderer.invoke('clips:search', query),
  copyClip: (id: number) => ipcRenderer.invoke('clips:copy', id),
  deleteClip: (id: number) => ipcRenderer.invoke('clips:delete', id),
  clearClips: () => ipcRenderer.invoke('clips:clear'),
  pinClip: (id: number) => ipcRenderer.invoke('clips:pin', id),
  unpinClip: (id: number) => ipcRenderer.invoke('clips:unpin', id),
  exportClips: () => ipcRenderer.invoke('clips:export'),
  importClips: (clips: Array<Record<string, unknown>>) => ipcRenderer.invoke('clips:import', clips),
  getClipCount: () => ipcRenderer.invoke('clips:count'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (update: Record<string, unknown>) => ipcRenderer.invoke('settings:save', update),
  onClipboardChanged: (callback: (clip: unknown) => void) => {
    ipcRenderer.on('clipboard:changed', (_event, clip) => callback(clip));
  },
  onRefresh: (callback: () => void) => {
    ipcRenderer.on('clips:refresh', () => callback());
  },
  onSettingsOpen: (callback: () => void) => {
    ipcRenderer.on('settings:open', () => callback());
  },
});
