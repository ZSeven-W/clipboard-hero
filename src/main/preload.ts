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
  updateClip: (id: number, newContent: string) => ipcRenderer.invoke('clips:update', id, newContent),
  getClipCount: () => ipcRenderer.invoke('clips:count'),
  getStats: () => ipcRenderer.invoke('clips:stats'),
  getTransforms: () => ipcRenderer.invoke('transforms:list'),
  applyTransform: (id: string, input: string) => ipcRenderer.invoke('transforms:apply', id, input),
  copyTransformed: (text: string) => ipcRenderer.invoke('transforms:copy', text),
  // Snippets
  createSnippet: (name: string, content: string) => ipcRenderer.invoke('snippets:create', name, content),
  getSnippets: () => ipcRenderer.invoke('snippets:getAll'),
  getSnippetById: (id: number) => ipcRenderer.invoke('snippets:getById', id),
  searchSnippets: (query: string) => ipcRenderer.invoke('snippets:search', query),
  updateSnippet: (id: number, update: { name?: string; content?: string }) =>
    ipcRenderer.invoke('snippets:update', id, update),
  deleteSnippet: (id: number) => ipcRenderer.invoke('snippets:delete', id),
  getSnippetCount: () => ipcRenderer.invoke('snippets:count'),
  saveClipAsSnippet: (clipId: number, name: string) => ipcRenderer.invoke('snippets:saveFromClip', clipId, name),
  copySnippet: (id: number) => ipcRenderer.invoke('snippets:copy', id),
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
