export interface Transform {
  id: string;
  name: string;
  description: string;
  category: 'text' | 'format' | 'encode' | 'extract';
  apply: (input: string) => string;
}

// ── Text transforms ──

function toUpperCase(input: string): string {
  return input.toUpperCase();
}

function toLowerCase(input: string): string {
  return input.toLowerCase();
}

function toTitleCase(input: string): string {
  return input.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

function trimWhitespace(input: string): string {
  return input.trim();
}

function trimLines(input: string): string {
  return input
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}

function sortLines(input: string): string {
  return input.split('\n').sort().join('\n');
}

function sortLinesDesc(input: string): string {
  return input.split('\n').sort().reverse().join('\n');
}

function removeDuplicateLines(input: string): string {
  const seen = new Set<string>();
  return input
    .split('\n')
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join('\n');
}

function reverseLines(input: string): string {
  return input.split('\n').reverse().join('\n');
}

function reverseString(input: string): string {
  return [...input].reverse().join('');
}

// ── Format transforms ──

function formatJSON(input: string): string {
  return JSON.stringify(JSON.parse(input), null, 2);
}

function minifyJSON(input: string): string {
  return JSON.stringify(JSON.parse(input));
}

function stripHTMLTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

function escapeHTML(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeHTML(input: string): string {
  return input
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

// ── Encode/decode transforms ──

function encodeBase64(input: string): string {
  return Buffer.from(input, 'utf-8').toString('base64');
}

function decodeBase64(input: string): string {
  return Buffer.from(input, 'base64').toString('utf-8');
}

function encodeURIComponent_(input: string): string {
  return encodeURIComponent(input);
}

function decodeURIComponent_(input: string): string {
  return decodeURIComponent(input);
}

// ── Extract transforms ──

function extractURLs(input: string): string {
  const urls = input.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi);
  return urls ? [...new Set(urls)].join('\n') : '';
}

function extractEmails(input: string): string {
  const emails = input.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return emails ? [...new Set(emails)].join('\n') : '';
}

function countStats(input: string): string {
  const chars = input.length;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const lines = input.split('\n').length;
  return `Characters: ${chars}\nWords: ${words}\nLines: ${lines}`;
}

// ── Registry ──

export const transforms: Transform[] = [
  // Text
  { id: 'uppercase', name: 'UPPERCASE', description: 'Convert to uppercase', category: 'text', apply: toUpperCase },
  { id: 'lowercase', name: 'lowercase', description: 'Convert to lowercase', category: 'text', apply: toLowerCase },
  { id: 'titlecase', name: 'Title Case', description: 'Capitalize first letter of each word', category: 'text', apply: toTitleCase },
  { id: 'trim', name: 'Trim Whitespace', description: 'Remove leading/trailing whitespace', category: 'text', apply: trimWhitespace },
  { id: 'trim-lines', name: 'Trim Lines', description: 'Trim whitespace from each line', category: 'text', apply: trimLines },
  { id: 'sort-lines', name: 'Sort Lines', description: 'Sort lines alphabetically', category: 'text', apply: sortLines },
  { id: 'sort-lines-desc', name: 'Sort Lines (Z-A)', description: 'Sort lines reverse alphabetically', category: 'text', apply: sortLinesDesc },
  { id: 'remove-dupes', name: 'Remove Duplicates', description: 'Remove duplicate lines', category: 'text', apply: removeDuplicateLines },
  { id: 'reverse-lines', name: 'Reverse Lines', description: 'Reverse the order of lines', category: 'text', apply: reverseLines },
  { id: 'reverse-string', name: 'Reverse String', description: 'Reverse entire string', category: 'text', apply: reverseString },

  // Format
  { id: 'format-json', name: 'Format JSON', description: 'Pretty-print JSON', category: 'format', apply: formatJSON },
  { id: 'minify-json', name: 'Minify JSON', description: 'Minify JSON to one line', category: 'format', apply: minifyJSON },
  { id: 'strip-html', name: 'Strip HTML', description: 'Remove all HTML tags', category: 'format', apply: stripHTMLTags },
  { id: 'escape-html', name: 'Escape HTML', description: 'Escape HTML special characters', category: 'format', apply: escapeHTML },
  { id: 'unescape-html', name: 'Unescape HTML', description: 'Unescape HTML entities', category: 'format', apply: unescapeHTML },

  // Encode/Decode
  { id: 'encode-base64', name: 'Base64 Encode', description: 'Encode to Base64', category: 'encode', apply: encodeBase64 },
  { id: 'decode-base64', name: 'Base64 Decode', description: 'Decode from Base64', category: 'encode', apply: decodeBase64 },
  { id: 'encode-uri', name: 'URL Encode', description: 'Encode URI component', category: 'encode', apply: encodeURIComponent_ },
  { id: 'decode-uri', name: 'URL Decode', description: 'Decode URI component', category: 'encode', apply: decodeURIComponent_ },

  // Extract
  { id: 'extract-urls', name: 'Extract URLs', description: 'Extract all URLs', category: 'extract', apply: extractURLs },
  { id: 'extract-emails', name: 'Extract Emails', description: 'Extract all email addresses', category: 'extract', apply: extractEmails },
  { id: 'count-stats', name: 'Count Stats', description: 'Count characters, words, lines', category: 'extract', apply: countStats },
];

export function getTransformList(): Array<{ id: string; name: string; description: string; category: string }> {
  return transforms.map(({ id, name, description, category }) => ({ id, name, description, category }));
}

export function applyTransform(id: string, input: string): { success: true; result: string } | { success: false; error: string } {
  const transform = transforms.find((t) => t.id === id);
  if (!transform) {
    return { success: false, error: `Unknown transform: ${id}` };
  }

  try {
    const result = transform.apply(input);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Transform failed' };
  }
}
