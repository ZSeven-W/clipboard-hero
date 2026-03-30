import { describe, it, expect } from 'vitest';
import { classify, ClipCategory } from '../classifier';

describe('classify', () => {
  describe('URL detection', () => {
    it('classifies http URLs', () => {
      expect(classify('http://example.com')).toBe('url');
    });

    it('classifies https URLs', () => {
      expect(classify('https://github.com/user/repo')).toBe('url');
    });

    it('classifies URL with query params', () => {
      expect(classify('https://example.com/path?q=search&page=1')).toBe('url');
    });

    it('does not classify as URL when mixed into many lines of text', () => {
      const text = 'line1\nline2\nline3\nhttps://example.com\nline5';
      expect(classify(text)).not.toBe('url');
    });
  });

  describe('email detection', () => {
    it('classifies simple email', () => {
      expect(classify('user@example.com')).toBe('email');
    });

    it('classifies email with dots and plus', () => {
      expect(classify('first.last+tag@company.co.uk')).toBe('email');
    });

    it('does not classify as email when embedded in many lines', () => {
      const text = 'line1\nline2\nline3\nuser@example.com';
      expect(classify(text)).not.toBe('email');
    });
  });

  describe('phone detection', () => {
    it('classifies US phone number', () => {
      expect(classify('(555) 123-4567')).toBe('phone');
    });

    it('classifies international phone with +', () => {
      expect(classify('+1-555-123-4567')).toBe('phone');
    });

    it('classifies phone with spaces', () => {
      expect(classify('+86 138 0013 8000')).toBe('phone');
    });

    it('does not classify long text as phone', () => {
      expect(classify('Call me at (555) 123-4567 sometime this week if you can')).not.toBe('phone');
    });
  });

  describe('code detection', () => {
    it('classifies JavaScript imports', () => {
      expect(classify("import React from 'react';\nconst App = () => {};")).toBe('code');
    });

    it('classifies Python function', () => {
      expect(classify('def hello():\n    print("hello")\n    return True')).toBe('code');
    });

    it('classifies TypeScript interface', () => {
      const code = 'interface User {\n  name: string;\n  age: number;\n}';
      expect(classify(code)).toBe('code');
    });

    it('classifies HTML with enough lines', () => {
      // Needs lineCount > 3 with at least 1 code signal, or 2+ signals
      expect(classify('<div class="container">\n  <p>Hello</p>\n  <span>World</span>\n</div>')).toBe('code');
    });

    it('classifies multi-line code with control flow', () => {
      const code = 'function calc(x) {\n  if (x > 0) {\n    return x * 2;\n  }\n}';
      expect(classify(code)).toBe('code');
    });

    it('classifies code with arrow functions', () => {
      expect(classify('const fn = () => {\n  return 42;\n}')).toBe('code');
    });

    it('classifies C-style includes', () => {
      expect(classify('#include <stdio.h>\nint main() {\n  return 0;\n}')).toBe('code');
    });

    it('classifies single-line code with multiple signals', () => {
      expect(classify('export const MY_CONST = 42;')).toBe('code');
    });
  });

  describe('text (default) detection', () => {
    it('classifies plain text', () => {
      expect(classify('Hello, world!')).toBe('text');
    });

    it('classifies a paragraph', () => {
      expect(classify('The quick brown fox jumps over the lazy dog.')).toBe('text');
    });

    it('classifies numbers as text', () => {
      expect(classify('42')).toBe('text');
    });

    it('classifies a sentence with no special patterns', () => {
      expect(classify('Meeting tomorrow at 3pm in the conference room')).toBe('text');
    });
  });

  describe('edge cases', () => {
    it('handles whitespace-padded content', () => {
      expect(classify('  https://example.com  ')).toBe('url');
    });

    it('classifies empty-ish strings as text', () => {
      expect(classify('   ')).toBe('text');
    });

    it('returns a valid ClipCategory type', () => {
      const validCategories: ClipCategory[] = ['code', 'url', 'email', 'phone', 'text'];
      const result = classify('anything');
      expect(validCategories).toContain(result);
    });
  });
});
