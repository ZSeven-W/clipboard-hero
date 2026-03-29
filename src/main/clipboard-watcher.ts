import { clipboard } from 'electron';
import { classify } from './classifier';
import { insertClip, Clip } from './database';

let lastContent = '';
let intervalId: NodeJS.Timeout | null = null;
let onChangeCallback: ((clip: Clip) => void) | null = null;
let skipNext = false;

// Tell the watcher to ignore the next clipboard change (used when we copy a clip back)
export function skipNextChange(): void {
  skipNext = true;
}

export function startWatching(onChange: (clip: Clip) => void, interval = 500): void {
  onChangeCallback = onChange;
  lastContent = clipboard.readText();

  intervalId = setInterval(() => {
    const currentText = clipboard.readText();
    if (!currentText || currentText === lastContent) return;

    lastContent = currentText;

    if (skipNext) {
      skipNext = false;
      return;
    }

    const category = classify(currentText);
    const clip = insertClip(currentText, category);

    if (clip && onChangeCallback) {
      onChangeCallback(clip);
    }
  }, interval);
}

export function updateInterval(newInterval: number): void {
  if (onChangeCallback) {
    stopWatching();
    startWatching(onChangeCallback, newInterval);
  }
}

export function stopWatching(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
