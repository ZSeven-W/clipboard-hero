// Renderer process — no imports, uses window.api exposed by preload

let currentCategory = 'all';
let currentClips: ClipItem[] = [];
let focusedIndex = -1;

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
    focusedIndex = -1;
    return;
  }

  for (let i = 0; i < currentClips.length; i++) {
    clipList.appendChild(createClipElement(currentClips[i], i));
  }

  // Auto-focus first item when panel opens / refreshes
  if (focusedIndex === -1 || focusedIndex >= currentClips.length) {
    focusedIndex = 0;
  }
  setFocusedItem(focusedIndex, false);
}

function setFocusedItem(index: number, scrollIntoView = true): void {
  // Remove existing focus
  const items = clipList.querySelectorAll<HTMLDivElement>('.clip-item');
  items.forEach((el) => el.classList.remove('focused'));

  if (index < 0 || index >= items.length) return;

  focusedIndex = index;
  const el = items[index];
  el.classList.add('focused');
  if (scrollIntoView) {
    el.scrollIntoView({ block: 'nearest' });
  }
}

function createClipElement(clip: ClipItem, index: number): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'clip-item';
  if (clip.pinned) {
    item.classList.add('pinned');
  }
  item.dataset.index = String(index);

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

  meta.appendChild(badge);
  meta.appendChild(time);

  // Copy count badge (only shown when > 1)
  if (clip.copy_count > 1) {
    const countBadge = document.createElement('span');
    countBadge.className = 'clip-count';
    countBadge.textContent = `${clip.copy_count}\u00d7`;
    meta.appendChild(countBadge);
  }

  // Pin button
  const pinBtn = document.createElement('button');
  pinBtn.className = 'clip-pin';
  pinBtn.title = clip.pinned ? 'Unpin' : 'Pin';
  pinBtn.textContent = '\uD83D\uDCCC'; // 📌
  if (clip.pinned) {
    pinBtn.classList.add('active');
  }
  pinBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (clip.pinned) {
      await window.api.unpinClip(clip.id);
    } else {
      await window.api.pinClip(clip.id);
    }
    focusedIndex = index;
    loadClips();
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'clip-delete';
  deleteBtn.textContent = '\u00d7';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.deleteClip(clip.id);
    // Adjust focus after deletion
    if (focusedIndex >= currentClips.length - 1) {
      focusedIndex = Math.max(0, currentClips.length - 2);
    }
    loadClips();
  });

  item.appendChild(preview);
  item.appendChild(meta);
  item.appendChild(pinBtn);
  item.appendChild(deleteBtn);

  // Click to copy back to clipboard
  item.addEventListener('click', async () => {
    await window.api.copyClip(clip.id);
    item.classList.add('copied');
    // Refresh to update copy count
    setTimeout(async () => {
      item.classList.remove('copied');
      await loadClips();
    }, 600);
  });

  // Track hover for focus
  item.addEventListener('mouseenter', () => {
    setFocusedItem(index, false);
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
    focusedIndex = 0;
    loadClips();
  });
});

let searchTimeout: number;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(() => {
    focusedIndex = 0;
    loadClips();
  }, 200);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
    return;
  }

  // Only handle navigation keys when not typing in search
  const inSearch = document.activeElement === searchInput;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = Math.min(focusedIndex + 1, currentClips.length - 1);
    setFocusedItem(next);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (inSearch && focusedIndex <= 0) return; // let cursor move in input
    const prev = Math.max(focusedIndex - 1, 0);
    setFocusedItem(prev);
    return;
  }

  if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < currentClips.length) {
    e.preventDefault();
    const clip = currentClips[focusedIndex];
    const items = clipList.querySelectorAll<HTMLDivElement>('.clip-item');
    const el = items[focusedIndex];
    window.api.copyClip(clip.id).then(async () => {
      el?.classList.add('copied');
      setTimeout(async () => {
        el?.classList.remove('copied');
        await loadClips();
      }, 600);
    });
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !inSearch && focusedIndex >= 0) {
    e.preventDefault();
    const clip = currentClips[focusedIndex];
    if (focusedIndex >= currentClips.length - 1) {
      focusedIndex = Math.max(0, currentClips.length - 2);
    }
    window.api.deleteClip(clip.id).then(() => loadClips());
    return;
  }
});

// Hide preview when mouse leaves clip list
clipList.addEventListener('mouseleave', () => {
  previewPanel.classList.remove('visible');
});

// Refresh data and focus search when the window becomes visible
window.addEventListener('focus', () => {
  searchInput.focus();
  searchInput.select();
  focusedIndex = 0;
  loadClips();
});

// Listen for real-time clipboard updates from main process
window.api.onClipboardChanged(() => loadClips());
window.api.onRefresh(() => loadClips());

// Initial load
loadClips();
