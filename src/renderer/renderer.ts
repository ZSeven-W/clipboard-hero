// Renderer process — no imports, uses window.api exposed by preload

let currentCategory = 'all';
let currentClips: ClipItem[] = [];

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const clipList = document.getElementById('clip-list') as HTMLDivElement;
const previewPanel = document.getElementById('preview-panel') as HTMLDivElement;
const previewContent = document.getElementById('preview-content') as HTMLPreElement;
const categoryTabs = document.querySelectorAll('.category-tab');

// ── Data loading ──

async function loadClips(): Promise<void> {
  const query = searchInput.value.trim();

  if (query) {
    currentClips = await window.api.searchClips(query);
  } else {
    currentClips = await window.api.getClips(currentCategory);
  }

  renderClips();
}

// ── Rendering ──

function renderClips(): void {
  clipList.innerHTML = '';
  previewPanel.classList.remove('visible');

  if (currentClips.length === 0) {
    clipList.innerHTML =
      '<div class="empty-state">No clipboard history yet.<br>Copy something to get started!</div>';
    return;
  }

  for (const clip of currentClips) {
    clipList.appendChild(createClipElement(clip));
  }
}

function createClipElement(clip: ClipItem): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'clip-item';

  const preview = document.createElement('div');
  preview.className = 'clip-preview';
  preview.textContent = clip.preview.substring(0, 120);

  const meta = document.createElement('div');
  meta.className = 'clip-meta';

  const badge = document.createElement('span');
  badge.className = `clip-badge badge-${clip.category}`;
  badge.textContent = clip.category;

  const time = document.createElement('span');
  time.className = 'clip-time';
  time.textContent = formatTime(clip.created_at);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'clip-delete';
  deleteBtn.textContent = '\u00d7';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.deleteClip(clip.id);
    loadClips();
  });

  meta.appendChild(badge);
  meta.appendChild(time);

  item.appendChild(preview);
  item.appendChild(meta);
  item.appendChild(deleteBtn);

  // Click to copy back to clipboard
  item.addEventListener('click', async () => {
    await window.api.copyClip(clip.id);
    item.classList.add('copied');
    setTimeout(() => item.classList.remove('copied'), 600);
  });

  // Hover to show full preview
  item.addEventListener('mouseenter', () => {
    previewContent.textContent = clip.content;
    previewPanel.classList.add('visible');
  });

  return item;
}

// ── Helpers ──

function formatTime(dateStr: string): string {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - date.getTime();

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

// ── Event handlers ──

categoryTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    categoryTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategory = (tab as HTMLElement).dataset.category || 'all';
    loadClips();
  });
});

let searchTimeout: number;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => loadClips(), 200);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close();
});

// Hide preview when mouse leaves clip list
clipList.addEventListener('mouseleave', () => {
  previewPanel.classList.remove('visible');
});

// Refresh data and focus search when the window becomes visible
window.addEventListener('focus', () => {
  searchInput.focus();
  searchInput.select();
  loadClips();
});

// Listen for real-time clipboard updates from main process
window.api.onClipboardChanged(() => loadClips());
window.api.onRefresh(() => loadClips());

// Initial load
loadClips();
