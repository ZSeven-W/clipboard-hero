// Renderer process — no imports, uses window.api exposed by preload

let currentCategory = 'all';
let currentClips: ClipItem[] = [];
let focusedIndex = -1;

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const clipList = document.getElementById('clip-list') as HTMLDivElement;
const previewPanel = document.getElementById('preview-panel') as HTMLDivElement;
const previewContent = document.getElementById('preview-content') as HTMLPreElement;
const categoryTabs = document.querySelectorAll('.category-tab');
const clipCountEl = document.getElementById('clip-count') as HTMLSpanElement;

// Settings elements
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsOverlay = document.getElementById('settings-overlay') as HTMLDivElement;
const settingsClose = document.getElementById('settings-close') as HTMLButtonElement;
const settingsSave = document.getElementById('settings-save') as HTMLButtonElement;
const settingsCancel = document.getElementById('settings-cancel') as HTMLButtonElement;
const settingMaxClips = document.getElementById('setting-max-clips') as HTMLInputElement;
const settingPolling = document.getElementById('setting-polling') as HTMLSelectElement;
const settingRetention = document.getElementById('setting-retention') as HTMLSelectElement;
const settingLaunchLogin = document.getElementById('setting-launch-login') as HTMLInputElement;

// ── Data loading ──

async function loadClips(): Promise<void> {
  const query = searchInput.value.trim();

  if (query) {
    currentClips = await window.api.searchClips(query);
  } else {
    currentClips = await window.api.getClips(currentCategory);
  }

  renderClips();
  updateStatusBar();
}

async function updateStatusBar(): Promise<void> {
  const count = await window.api.getClipCount();
  clipCountEl.textContent = `${count} clip${count !== 1 ? 's' : ''}`;
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

  // Save as Snippet button
  const snippetBtn = document.createElement('button');
  snippetBtn.className = 'clip-snippet';
  snippetBtn.title = 'Save as Snippet';
  snippetBtn.textContent = '\u2702'; // ✂
  snippetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSaveSnippetPrompt(clip.id);
  });

  // Transform button
  const transformBtn = document.createElement('button');
  transformBtn.className = 'clip-transform';
  transformBtn.title = 'Transform';
  transformBtn.textContent = '\u21C4'; // ⇄
  transformBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTransformPicker(clip);
  });

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'clip-edit';
  editBtn.title = 'Edit';
  editBtn.textContent = '\u270E'; // ✎
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditing(item, clip, index);
  });

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
  item.appendChild(snippetBtn);
  item.appendChild(transformBtn);
  item.appendChild(editBtn);
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

// ── Inline editing ──

function startEditing(item: HTMLDivElement, clip: ClipItem, index: number): void {
  // Prevent duplicate edit state
  if (item.querySelector('.clip-edit-area')) return;

  item.classList.add('editing');

  const textarea = document.createElement('textarea');
  textarea.className = 'clip-edit-area';
  textarea.value = clip.content;
  textarea.rows = Math.min(clip.content.split('\n').length + 1, 6);

  const actions = document.createElement('div');
  actions.className = 'clip-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-sm';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary btn-sm';
  cancelBtn.textContent = 'Cancel';

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  // Hide the preview row while editing
  const preview = item.querySelector('.clip-preview') as HTMLDivElement;
  preview.style.display = 'none';

  item.appendChild(textarea);
  item.appendChild(actions);
  textarea.focus();
  textarea.select();

  const stopEditing = () => {
    item.classList.remove('editing');
    textarea.remove();
    actions.remove();
    preview.style.display = '';
  };

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopEditing();
  });

  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newContent = textarea.value.trim();
    if (!newContent || newContent === clip.content) {
      stopEditing();
      return;
    }
    const result = await window.api.updateClip(clip.id, newContent);
    if (result) {
      focusedIndex = index;
      await loadClips();
    } else {
      // Duplicate or error — flash red
      textarea.classList.add('error');
      setTimeout(() => textarea.classList.remove('error'), 600);
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      stopEditing();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      saveBtn.click();
    }
  });

  // Prevent the item's click-to-copy while editing
  item.addEventListener('click', (e) => {
    if (item.classList.contains('editing')) {
      e.stopImmediatePropagation();
    }
  }, { capture: true });
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

// ── Settings modal ──

function openSettings(): void {
  window.api.getSettings().then((settings) => {
    settingMaxClips.value = String(settings.maxClips);
    settingPolling.value = String(settings.pollingInterval);
    settingRetention.value = String(settings.retentionDays);
    settingLaunchLogin.checked = settings.launchAtLogin;
    settingsOverlay.classList.add('visible');
  });
}

function closeSettings(): void {
  settingsOverlay.classList.remove('visible');
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openSettings();
});

settingsClose.addEventListener('click', closeSettings);
settingsCancel.addEventListener('click', closeSettings);

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

settingsSave.addEventListener('click', async () => {
  await window.api.saveSettings({
    maxClips: parseInt(settingMaxClips.value, 10) || 1000,
    pollingInterval: parseInt(settingPolling.value, 10) || 500,
    retentionDays: parseInt(settingRetention.value, 10) || 0,
    launchAtLogin: settingLaunchLogin.checked,
  });
  closeSettings();
});

// Listen for settings open from tray menu
window.api.onSettingsOpen(() => openSettings());

// ── Stats modal ──

const statsBtn = document.getElementById('stats-btn') as HTMLButtonElement;
const statsOverlay = document.getElementById('stats-overlay') as HTMLDivElement;
const statsClose = document.getElementById('stats-close') as HTMLButtonElement;
const statsBody = document.getElementById('stats-body') as HTMLDivElement;

async function openStats(): Promise<void> {
  const stats: ClipStatistics = await window.api.getStats();
  statsBody.innerHTML = '';

  if (stats.totalClips === 0) {
    statsBody.innerHTML = '<div class="stats-empty">No clips yet. Copy something to see statistics!</div>';
    statsOverlay.classList.add('visible');
    return;
  }

  // Overview cards
  const overview = document.createElement('div');
  overview.className = 'stats-section';
  overview.innerHTML = `
    <div class="stats-section-title">Overview</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${stats.totalClips}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value">${stats.pinnedClips}</div><div class="stat-label">Pinned</div></div>
      <div class="stat-card"><div class="stat-value">${stats.totalCopies}</div><div class="stat-label">Copies</div></div>
    </div>
  `;
  statsBody.appendChild(overview);

  // Category breakdown
  if (stats.categoryBreakdown.length > 0) {
    const maxCount = Math.max(...stats.categoryBreakdown.map((c) => c.count));
    const catSection = document.createElement('div');
    catSection.className = 'stats-section';
    const barsHtml = stats.categoryBreakdown
      .map(
        (c) => `
      <div class="category-bar">
        <span class="category-bar-label">${c.category}</span>
        <div class="category-bar-track">
          <div class="category-bar-fill bar-${c.category}" style="width: ${(c.count / maxCount) * 100}%"></div>
        </div>
        <span class="category-bar-count">${c.count}</span>
      </div>`
      )
      .join('');
    catSection.innerHTML = `<div class="stats-section-title">Categories</div>${barsHtml}`;
    statsBody.appendChild(catSection);
  }

  // Top copied
  if (stats.topCopied.length > 0) {
    const topSection = document.createElement('div');
    topSection.className = 'stats-section';
    const topHtml = stats.topCopied
      .map(
        (c, i) => `
      <div class="top-clip">
        <span class="top-clip-rank">${i + 1}</span>
        <span class="top-clip-preview">${escapeHtml(c.preview.substring(0, 60))}</span>
        <span class="top-clip-count">${c.copy_count}\u00d7</span>
      </div>`
      )
      .join('');
    topSection.innerHTML = `<div class="stats-section-title">Most Copied</div>${topHtml}`;
    statsBody.appendChild(topSection);
  }

  // Recent activity (last 7 days)
  if (stats.recentActivity.length > 0) {
    const maxDay = Math.max(...stats.recentActivity.map((d) => d.count));
    const actSection = document.createElement('div');
    actSection.className = 'stats-section';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const barsHtml = stats.recentActivity
      .map((d) => {
        const pct = maxDay > 0 ? (d.count / maxDay) * 100 : 0;
        const dayLabel = dayNames[new Date(d.date + 'T00:00:00').getDay()];
        return `
      <div class="activity-bar-wrapper">
        <div class="activity-bar" style="height: ${Math.max(pct, 4)}%"></div>
        <span class="activity-label">${dayLabel}</span>
      </div>`;
      })
      .join('');
    actSection.innerHTML = `<div class="stats-section-title">Last 7 Days</div><div class="activity-chart">${barsHtml}</div>`;
    statsBody.appendChild(actSection);
  }

  statsOverlay.classList.add('visible');
}

function closeStats(): void {
  statsOverlay.classList.remove('visible');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

statsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openStats();
});

statsClose.addEventListener('click', closeStats);

statsOverlay.addEventListener('click', (e) => {
  if (e.target === statsOverlay) closeStats();
});

// ── Transform picker ──

const transformOverlay = document.getElementById('transform-overlay') as HTMLDivElement;
const transformClose = document.getElementById('transform-close') as HTMLButtonElement;
const transformBody = document.getElementById('transform-body') as HTMLDivElement;
const transformSearch = document.getElementById('transform-search') as HTMLInputElement;
const transformPreview = document.getElementById('transform-preview') as HTMLDivElement;
const transformPreviewContent = document.getElementById('transform-preview-content') as HTMLPreElement;
const transformApply = document.getElementById('transform-apply') as HTMLButtonElement;
const transformCancel = document.getElementById('transform-cancel') as HTMLButtonElement;
const transformTitle = document.getElementById('transform-title') as HTMLSpanElement;

let transformClip: ClipItem | null = null;
let transformResult: string | null = null;
let transformFocusedIndex = 0;
let filteredTransforms: TransformInfo[] = [];

async function openTransformPicker(clip: ClipItem): Promise<void> {
  transformClip = clip;
  transformResult = null;
  transformSearch.value = '';
  transformPreview.classList.add('hidden');
  transformBody.classList.remove('hidden');
  transformTitle.textContent = 'Transform Clip';

  const allTransforms = await window.api.getTransforms();
  filteredTransforms = allTransforms;
  renderTransformList(allTransforms);
  transformOverlay.classList.add('visible');
  transformSearch.focus();
}

function renderTransformList(items: TransformInfo[]): void {
  transformBody.innerHTML = '';
  const categories = ['text', 'format', 'encode', 'extract'];
  const categoryLabels: Record<string, string> = {
    text: 'Text',
    format: 'Format',
    encode: 'Encode / Decode',
    extract: 'Extract',
  };

  let globalIndex = 0;
  for (const cat of categories) {
    const catItems = items.filter((t) => t.category === cat);
    if (catItems.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'transform-section';

    const title = document.createElement('div');
    title.className = 'transform-section-title';
    title.textContent = categoryLabels[cat] || cat;
    section.appendChild(title);

    for (const t of catItems) {
      const row = document.createElement('div');
      row.className = 'transform-row';
      row.dataset.transformId = t.id;
      row.dataset.index = String(globalIndex);

      const name = document.createElement('span');
      name.className = 'transform-name';
      name.textContent = t.name;

      const desc = document.createElement('span');
      desc.className = 'transform-desc';
      desc.textContent = t.description;

      row.appendChild(name);
      row.appendChild(desc);

      row.addEventListener('click', () => previewTransform(t.id));
      row.addEventListener('mouseenter', () => {
        transformFocusedIndex = parseInt(row.dataset.index || '0', 10);
        setTransformFocus(transformFocusedIndex);
      });

      section.appendChild(row);
      globalIndex++;
    }

    transformBody.appendChild(section);
  }

  transformFocusedIndex = 0;
  setTransformFocus(0);
}

function setTransformFocus(index: number): void {
  const rows = transformBody.querySelectorAll<HTMLDivElement>('.transform-row');
  rows.forEach((r) => r.classList.remove('focused'));
  if (index >= 0 && index < rows.length) {
    transformFocusedIndex = index;
    rows[index].classList.add('focused');
    rows[index].scrollIntoView({ block: 'nearest' });
  }
}

async function previewTransform(id: string): Promise<void> {
  if (!transformClip) return;

  const result = await window.api.applyTransform(id, transformClip.content);
  if (!result.success) {
    // Show error inline
    transformPreviewContent.textContent = `Error: ${result.error}`;
    transformPreviewContent.classList.add('error');
  } else {
    transformPreviewContent.textContent = result.result || '';
    transformPreviewContent.classList.remove('error');
    transformResult = result.result || '';
  }

  transformBody.classList.add('hidden');
  transformPreview.classList.remove('hidden');
  const transform = filteredTransforms.find((t) => t.id === id);
  transformTitle.textContent = transform ? transform.name : 'Transform';
}

transformCancel.addEventListener('click', () => {
  transformPreview.classList.add('hidden');
  transformBody.classList.remove('hidden');
  transformTitle.textContent = 'Transform Clip';
  transformSearch.focus();
});

transformApply.addEventListener('click', async () => {
  if (transformResult != null && transformClip) {
    await window.api.copyTransformed(transformResult);
    closeTransformPicker();
    await loadClips();
  }
});

function closeTransformPicker(): void {
  transformOverlay.classList.remove('visible');
  transformClip = null;
  transformResult = null;
}

transformClose.addEventListener('click', closeTransformPicker);

transformOverlay.addEventListener('click', (e) => {
  if (e.target === transformOverlay) closeTransformPicker();
});

// Filter transforms as user types
transformSearch.addEventListener('input', async () => {
  const query = transformSearch.value.toLowerCase();
  const allTransforms = await window.api.getTransforms();
  filteredTransforms = query
    ? allTransforms.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.category.toLowerCase().includes(query)
      )
    : allTransforms;
  renderTransformList(filteredTransforms);
});

// Keyboard nav within transform picker
transformSearch.addEventListener('keydown', (e) => {
  const rows = transformBody.querySelectorAll<HTMLDivElement>('.transform-row');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setTransformFocus(Math.min(transformFocusedIndex + 1, rows.length - 1));
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setTransformFocus(Math.max(transformFocusedIndex - 1, 0));
    return;
  }
  if (e.key === 'Enter' && rows.length > 0) {
    e.preventDefault();
    const row = rows[transformFocusedIndex];
    if (row?.dataset.transformId) {
      previewTransform(row.dataset.transformId);
    }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!transformPreview.classList.contains('hidden')) {
      transformCancel.click();
    } else {
      closeTransformPicker();
    }
  }
});

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
  // Close modals on Escape, or close window
  if (e.key === 'Escape') {
    if (transformOverlay.classList.contains('visible')) {
      if (!transformPreview.classList.contains('hidden')) {
        transformCancel.click();
      } else {
        closeTransformPicker();
      }
      return;
    }
    if (snippetsOverlay.classList.contains('visible')) {
      closeSnippets();
      return;
    }
    if (saveSnippetOverlay.classList.contains('visible')) {
      closeSaveSnippetPrompt();
      return;
    }
    if (statsOverlay.classList.contains('visible')) {
      closeStats();
      return;
    }
    if (settingsOverlay.classList.contains('visible')) {
      closeSettings();
      return;
    }
    window.close();
    return;
  }

  // Don't process shortcuts when a modal is open
  if (settingsOverlay.classList.contains('visible')) return;
  if (statsOverlay.classList.contains('visible')) return;
  if (transformOverlay.classList.contains('visible')) return;
  if (snippetsOverlay.classList.contains('visible')) return;
  if (saveSnippetOverlay.classList.contains('visible')) return;

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

  // P to toggle pin on focused item (when not in search)
  if (e.key === 'p' && !inSearch && focusedIndex >= 0 && focusedIndex < currentClips.length) {
    e.preventDefault();
    const clip = currentClips[focusedIndex];
    const action = clip.pinned ? window.api.unpinClip(clip.id) : window.api.pinClip(clip.id);
    action.then(() => loadClips());
    return;
  }

  // E to edit focused item (when not in search)
  if (e.key === 'e' && !inSearch && focusedIndex >= 0 && focusedIndex < currentClips.length) {
    e.preventDefault();
    const clip = currentClips[focusedIndex];
    const items = clipList.querySelectorAll<HTMLDivElement>('.clip-item');
    const el = items[focusedIndex];
    if (el) startEditing(el, clip, focusedIndex);
    return;
  }

  // T to open transform picker on focused item (when not in search)
  if (e.key === 't' && !inSearch && focusedIndex >= 0 && focusedIndex < currentClips.length) {
    e.preventDefault();
    openTransformPicker(currentClips[focusedIndex]);
    return;
  }

  // S to save focused clip as snippet (when not in search)
  if (e.key === 's' && !inSearch && focusedIndex >= 0 && focusedIndex < currentClips.length) {
    e.preventDefault();
    openSaveSnippetPrompt(currentClips[focusedIndex].id);
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

// ── Snippets panel ──

const snippetsBtn = document.getElementById('snippets-btn') as HTMLButtonElement;
const snippetsOverlay = document.getElementById('snippets-overlay') as HTMLDivElement;
const snippetsClose = document.getElementById('snippets-close') as HTMLButtonElement;
const snippetsBody = document.getElementById('snippets-body') as HTMLDivElement;
const snippetsSearch = document.getElementById('snippets-search') as HTMLInputElement;
const snippetsTitle = document.getElementById('snippets-title') as HTMLSpanElement;
const snippetsNewBtn = document.getElementById('snippets-new-btn') as HTMLButtonElement;
const snippetsForm = document.getElementById('snippets-form') as HTMLDivElement;
const snippetNameInput = document.getElementById('snippet-name-input') as HTMLInputElement;
const snippetContentInput = document.getElementById('snippet-content-input') as HTMLTextAreaElement;
const snippetFormSave = document.getElementById('snippet-form-save') as HTMLButtonElement;
const snippetFormCancel = document.getElementById('snippet-form-cancel') as HTMLButtonElement;

let editingSnippetId: number | null = null;
let snippetFocusedIndex = -1;

async function loadSnippets(): Promise<void> {
  const query = snippetsSearch.value.trim();
  const snippets: SnippetItem[] = query
    ? await window.api.searchSnippets(query)
    : await window.api.getSnippets();

  renderSnippets(snippets);
}

function renderSnippets(snippets: SnippetItem[]): void {
  snippetsBody.innerHTML = '';

  if (snippets.length === 0) {
    snippetsBody.innerHTML = '<div class="snippets-empty">No snippets yet. Click "+ New" to create one!</div>';
    snippetFocusedIndex = -1;
    return;
  }

  for (let i = 0; i < snippets.length; i++) {
    snippetsBody.appendChild(createSnippetElement(snippets[i], i));
  }

  snippetFocusedIndex = 0;
  setSnippetFocus(0);
}

function createSnippetElement(snippet: SnippetItem, index: number): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'snippet-item';
  item.dataset.index = String(index);

  const info = document.createElement('div');
  info.className = 'snippet-info';

  const name = document.createElement('div');
  name.className = 'snippet-name';
  name.textContent = snippet.name;

  const preview = document.createElement('div');
  preview.className = 'snippet-preview';
  preview.textContent = snippet.content.substring(0, 80);

  info.appendChild(name);
  info.appendChild(preview);

  const actions = document.createElement('div');
  actions.className = 'snippet-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'snippet-action-btn';
  editBtn.title = 'Edit';
  editBtn.textContent = '\u270E'; // ✎
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditingSnippet(snippet);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'snippet-action-btn delete-btn';
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '\u00d7';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await window.api.deleteSnippet(snippet.id);
    loadSnippets();
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  item.appendChild(info);
  item.appendChild(actions);

  // Click to copy snippet to clipboard
  item.addEventListener('click', async () => {
    await window.api.copySnippet(snippet.id);
    item.classList.add('copied');
    setTimeout(() => {
      item.classList.remove('copied');
    }, 600);
  });

  item.addEventListener('mouseenter', () => {
    snippetFocusedIndex = index;
    setSnippetFocus(index);
  });

  return item;
}

function setSnippetFocus(index: number): void {
  const items = snippetsBody.querySelectorAll<HTMLDivElement>('.snippet-item');
  items.forEach((el) => el.classList.remove('focused'));
  if (index >= 0 && index < items.length) {
    snippetFocusedIndex = index;
    items[index].classList.add('focused');
    items[index].scrollIntoView({ block: 'nearest' });
  }
}

function openSnippets(): void {
  snippetsSearch.value = '';
  hideSnippetForm();
  snippetsOverlay.classList.add('visible');
  loadSnippets();
  snippetsSearch.focus();
}

function closeSnippets(): void {
  snippetsOverlay.classList.remove('visible');
  hideSnippetForm();
  editingSnippetId = null;
}

function showSnippetForm(title: string, name: string, content: string): void {
  snippetsTitle.textContent = title;
  snippetNameInput.value = name;
  snippetContentInput.value = content;
  snippetsForm.classList.remove('hidden');
  snippetsBody.classList.add('hidden');
  snippetNameInput.focus();
}

function hideSnippetForm(): void {
  snippetsForm.classList.add('hidden');
  snippetsBody.classList.remove('hidden');
  snippetsTitle.textContent = 'Snippets';
  editingSnippetId = null;
}

function startEditingSnippet(snippet: SnippetItem): void {
  editingSnippetId = snippet.id;
  showSnippetForm('Edit Snippet', snippet.name, snippet.content);
}

snippetsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  openSnippets();
});

snippetsClose.addEventListener('click', closeSnippets);

snippetsOverlay.addEventListener('click', (e) => {
  if (e.target === snippetsOverlay) closeSnippets();
});

snippetsNewBtn.addEventListener('click', () => {
  editingSnippetId = null;
  showSnippetForm('New Snippet', '', '');
});

snippetFormCancel.addEventListener('click', () => {
  hideSnippetForm();
  snippetsSearch.focus();
  loadSnippets();
});

snippetFormSave.addEventListener('click', async () => {
  const name = snippetNameInput.value.trim();
  const content = snippetContentInput.value.trim();
  if (!name || !content) return;

  if (editingSnippetId != null) {
    await window.api.updateSnippet(editingSnippetId, { name, content });
  } else {
    await window.api.createSnippet(name, content);
  }

  hideSnippetForm();
  snippetsSearch.focus();
  loadSnippets();
});

// Keyboard within snippet form
snippetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    hideSnippetForm();
    snippetsSearch.focus();
    loadSnippets();
  }
});

snippetContentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    hideSnippetForm();
    snippetsSearch.focus();
    loadSnippets();
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    snippetFormSave.click();
  }
});

// Search snippets
let snippetSearchTimeout: number;
snippetsSearch.addEventListener('input', () => {
  clearTimeout(snippetSearchTimeout);
  snippetSearchTimeout = window.setTimeout(() => loadSnippets(), 200);
});

// Keyboard nav within snippets list
snippetsSearch.addEventListener('keydown', (e) => {
  if (!snippetsForm.classList.contains('hidden')) return;

  const items = snippetsBody.querySelectorAll<HTMLDivElement>('.snippet-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSnippetFocus(Math.min(snippetFocusedIndex + 1, items.length - 1));
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSnippetFocus(Math.max(snippetFocusedIndex - 1, 0));
    return;
  }
  if (e.key === 'Enter' && items.length > 0 && snippetFocusedIndex >= 0) {
    e.preventDefault();
    items[snippetFocusedIndex].click();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSnippets();
  }
});

// ── Save clip as snippet prompt ──

const saveSnippetOverlay = document.getElementById('save-snippet-overlay') as HTMLDivElement;
const saveSnippetClose = document.getElementById('save-snippet-close') as HTMLButtonElement;
const saveSnippetCancel = document.getElementById('save-snippet-cancel') as HTMLButtonElement;
const saveSnippetConfirm = document.getElementById('save-snippet-confirm') as HTMLButtonElement;
const saveSnippetNameInput = document.getElementById('save-snippet-name') as HTMLInputElement;

let saveSnippetClipId: number | null = null;

function openSaveSnippetPrompt(clipId: number): void {
  saveSnippetClipId = clipId;
  saveSnippetNameInput.value = '';
  saveSnippetOverlay.classList.add('visible');
  saveSnippetNameInput.focus();
}

function closeSaveSnippetPrompt(): void {
  saveSnippetOverlay.classList.remove('visible');
  saveSnippetClipId = null;
}

saveSnippetClose.addEventListener('click', closeSaveSnippetPrompt);
saveSnippetCancel.addEventListener('click', closeSaveSnippetPrompt);

saveSnippetOverlay.addEventListener('click', (e) => {
  if (e.target === saveSnippetOverlay) closeSaveSnippetPrompt();
});

saveSnippetConfirm.addEventListener('click', async () => {
  const name = saveSnippetNameInput.value.trim();
  if (!name || saveSnippetClipId == null) return;

  await window.api.saveClipAsSnippet(saveSnippetClipId, name);
  closeSaveSnippetPrompt();
});

saveSnippetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveSnippetConfirm.click();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSaveSnippetPrompt();
  }
});

// Initial load
loadClips();
