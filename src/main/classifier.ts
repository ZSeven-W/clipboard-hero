export type ClipCategory = 'code' | 'url' | 'email' | 'phone' | 'text';

const URL_REGEX = /https?:\/\/[^\s]+/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;

const CODE_PATTERNS = [
  /^(import|export|const|let|var|function|class|interface|type|def|fn|pub|async|await)\s/m,
  /[{}]\s*$/m,
  /^\s{2,}(if|for|while|return|switch|case)\s/m,
  /=>\s*[{(]/,
  /\(\)\s*[{:]/,
  /<\/?\w+[^>]*>/,
  /^\s*(#include|#define|#import)/m,
  /;\s*$/m,
];

// Classify clipboard content using rule-based heuristics
export function classify(content: string): ClipCategory {
  const trimmed = content.trim();
  const lineCount = trimmed.split('\n').length;

  if (URL_REGEX.test(trimmed) && lineCount <= 3) return 'url';
  if (EMAIL_REGEX.test(trimmed) && lineCount <= 2) return 'email';
  if (PHONE_REGEX.test(trimmed) && trimmed.length < 30) return 'phone';

  let codeScore = 0;
  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(trimmed)) codeScore++;
  }
  if (codeScore >= 2 || (lineCount > 3 && codeScore >= 1)) return 'code';

  return 'text';
}
