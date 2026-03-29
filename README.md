# ClipboardHero

AI-powered clipboard history manager — local-first, open source.

Automatically captures everything you copy, classifies it (code, URL, email, phone, text), and lets you search and re-copy from history with a single shortcut.

## Features

- **Clipboard monitoring** — polls every 500ms, captures text content automatically
- **AI classification** — rule-based heuristics categorize clips as code / url / email / phone / text
- **Local SQLite storage** — all data stays on your machine (`better-sqlite3`, WAL mode)
- **Keyword search** — find any clip by content
- **Category filtering** — tabs for All, Code, URL, Email, Phone, Text
- **Quick preview** — hover over a clip to see the full content
- **One-click copy** — click any clip to copy it back to clipboard
- **Global shortcut** — `Cmd+Shift+V` (macOS) / `Ctrl+Shift+V` (Windows/Linux)
- **System tray** — runs in the background, tray icon with context menu
- **Dark theme** — Catppuccin Mocha color scheme

## Install

```bash
npm install --ignore-scripts
npm run rebuild   # rebuild native modules for Electron
```

## Usage

```bash
npm start
```

The app launches in the system tray (no dock icon on macOS). Press `Cmd+Shift+V` to toggle the floating panel.

- **Search** — type in the search bar to filter clips by content
- **Filter** — click category tabs to filter by type
- **Copy** — click any clip to copy it to your clipboard
- **Preview** — hover over a clip to see full content in the side panel
- **Delete** — hover and click the × button to remove a clip
- **Quit** — right-click the tray icon → Quit ClipboardHero

## Tech Stack

- Electron 28 + TypeScript
- better-sqlite3 (WAL mode)
- IPC via contextBridge (secure, no nodeIntegration)
- System tray + global shortcut

## Project Structure

```
src/
├── main/
│   ├── main.ts              # App entry, window, tray, shortcuts, IPC
│   ├── database.ts           # SQLite operations (CRUD)
│   ├── clipboard-watcher.ts  # Clipboard polling + change detection
│   ├── classifier.ts         # Rule-based content classification
│   └── preload.ts            # Context bridge (renderer ↔ main IPC)
└── renderer/
    ├── index.html            # UI layout
    ├── styles.css             # Dark theme (Catppuccin Mocha)
    ├── renderer.ts            # UI logic, search, filtering, copy
    └── types.d.ts             # TypeScript declarations for window.api
```

## License

MIT
