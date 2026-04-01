import { describe, it, expect } from 'vitest';
import { applyTransform, getTransformList, transforms } from '../transforms';

describe('transforms', () => {
  describe('getTransformList', () => {
    it('returns all transforms with metadata', () => {
      const list = getTransformList();
      expect(list.length).toBe(transforms.length);
      for (const item of list) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('category');
      }
    });

    it('does not expose the apply function', () => {
      const list = getTransformList();
      for (const item of list) {
        expect(item).not.toHaveProperty('apply');
      }
    });
  });

  describe('applyTransform', () => {
    it('returns error for unknown transform', () => {
      const result = applyTransform('nonexistent', 'test');
      expect(result).toEqual({ success: false, error: 'Unknown transform: nonexistent' });
    });

    it('returns error for invalid JSON when formatting', () => {
      const result = applyTransform('format-json', 'not json');
      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toBeTruthy();
    });
  });

  describe('text transforms', () => {
    it('uppercase', () => {
      const result = applyTransform('uppercase', 'Hello World');
      expect(result).toEqual({ success: true, result: 'HELLO WORLD' });
    });

    it('lowercase', () => {
      const result = applyTransform('lowercase', 'Hello World');
      expect(result).toEqual({ success: true, result: 'hello world' });
    });

    it('title case', () => {
      const result = applyTransform('titlecase', 'hello world foo');
      expect(result).toEqual({ success: true, result: 'Hello World Foo' });
    });

    it('title case handles mixed case', () => {
      const result = applyTransform('titlecase', 'hELLO wORLD');
      expect(result).toEqual({ success: true, result: 'Hello World' });
    });

    it('trim whitespace', () => {
      const result = applyTransform('trim', '  hello  ');
      expect(result).toEqual({ success: true, result: 'hello' });
    });

    it('trim lines', () => {
      const result = applyTransform('trim-lines', '  hello  \n  world  ');
      expect(result).toEqual({ success: true, result: 'hello\nworld' });
    });

    it('sort lines ascending', () => {
      const result = applyTransform('sort-lines', 'banana\napple\ncherry');
      expect(result).toEqual({ success: true, result: 'apple\nbanana\ncherry' });
    });

    it('sort lines descending', () => {
      const result = applyTransform('sort-lines-desc', 'banana\napple\ncherry');
      expect(result).toEqual({ success: true, result: 'cherry\nbanana\napple' });
    });

    it('remove duplicate lines', () => {
      const result = applyTransform('remove-dupes', 'foo\nbar\nfoo\nbaz\nbar');
      expect(result).toEqual({ success: true, result: 'foo\nbar\nbaz' });
    });

    it('remove duplicates preserves order', () => {
      const result = applyTransform('remove-dupes', 'c\na\nb\na\nc');
      expect(result).toEqual({ success: true, result: 'c\na\nb' });
    });

    it('reverse lines', () => {
      const result = applyTransform('reverse-lines', 'first\nsecond\nthird');
      expect(result).toEqual({ success: true, result: 'third\nsecond\nfirst' });
    });

    it('reverse string', () => {
      const result = applyTransform('reverse-string', 'hello');
      expect(result).toEqual({ success: true, result: 'olleh' });
    });

    it('reverse string handles emoji', () => {
      const result = applyTransform('reverse-string', 'ab');
      expect(result).toEqual({ success: true, result: 'ba' });
    });
  });

  describe('format transforms', () => {
    it('format JSON', () => {
      const result = applyTransform('format-json', '{"a":1,"b":2}');
      expect(result).toEqual({
        success: true,
        result: '{\n  "a": 1,\n  "b": 2\n}',
      });
    });

    it('format JSON with nested objects', () => {
      const result = applyTransform('format-json', '{"user":{"name":"test","age":25}}');
      expect(result.success).toBe(true);
      expect((result as { success: true; result: string }).result).toContain('  "user"');
    });

    it('minify JSON', () => {
      const input = '{\n  "a": 1,\n  "b": 2\n}';
      const result = applyTransform('minify-json', input);
      expect(result).toEqual({ success: true, result: '{"a":1,"b":2}' });
    });

    it('format JSON fails on invalid input', () => {
      const result = applyTransform('format-json', '{invalid}');
      expect(result.success).toBe(false);
    });

    it('strip HTML tags', () => {
      const result = applyTransform('strip-html', '<p>Hello <b>world</b></p>');
      expect(result).toEqual({ success: true, result: 'Hello world' });
    });

    it('strip HTML handles self-closing tags', () => {
      const result = applyTransform('strip-html', 'Line<br/>break');
      expect(result).toEqual({ success: true, result: 'Linebreak' });
    });

    it('escape HTML', () => {
      const result = applyTransform('escape-html', '<div class="test">a & b</div>');
      expect(result).toEqual({
        success: true,
        result: '&lt;div class=&quot;test&quot;&gt;a &amp; b&lt;/div&gt;',
      });
    });

    it('unescape HTML', () => {
      const result = applyTransform('unescape-html', '&lt;p&gt;Hello &amp; &#39;World&quot;&lt;/p&gt;');
      expect(result).toEqual({
        success: true,
        result: "<p>Hello & 'World\"</p>",
      });
    });

    it('escape then unescape is identity', () => {
      const original = '<div class="test">a & b \'c\'</div>';
      const escaped = applyTransform('escape-html', original);
      expect(escaped.success).toBe(true);
      const unescaped = applyTransform('unescape-html', (escaped as { success: true; result: string }).result);
      expect(unescaped).toEqual({ success: true, result: original });
    });
  });

  describe('encode/decode transforms', () => {
    it('base64 encode', () => {
      const result = applyTransform('encode-base64', 'Hello World');
      expect(result).toEqual({ success: true, result: 'SGVsbG8gV29ybGQ=' });
    });

    it('base64 decode', () => {
      const result = applyTransform('decode-base64', 'SGVsbG8gV29ybGQ=');
      expect(result).toEqual({ success: true, result: 'Hello World' });
    });

    it('base64 encode then decode is identity', () => {
      const original = 'Some text with special chars: éàü';
      const encoded = applyTransform('encode-base64', original);
      expect(encoded.success).toBe(true);
      const decoded = applyTransform('decode-base64', (encoded as { success: true; result: string }).result);
      expect(decoded).toEqual({ success: true, result: original });
    });

    it('URL encode', () => {
      const result = applyTransform('encode-uri', 'hello world&foo=bar');
      expect(result).toEqual({ success: true, result: 'hello%20world%26foo%3Dbar' });
    });

    it('URL decode', () => {
      const result = applyTransform('decode-uri', 'hello%20world%26foo%3Dbar');
      expect(result).toEqual({ success: true, result: 'hello world&foo=bar' });
    });

    it('URL encode then decode is identity', () => {
      const original = 'query=hello world&page=1';
      const encoded = applyTransform('encode-uri', original);
      expect(encoded.success).toBe(true);
      const decoded = applyTransform('decode-uri', (encoded as { success: true; result: string }).result);
      expect(decoded).toEqual({ success: true, result: original });
    });
  });

  describe('extract transforms', () => {
    it('extract URLs from text', () => {
      const input = 'Visit https://example.com and http://test.org/path for more info';
      const result = applyTransform('extract-urls', input);
      expect(result).toEqual({
        success: true,
        result: 'https://example.com\nhttp://test.org/path',
      });
    });

    it('extract URLs deduplicates', () => {
      const input = 'https://example.com and https://example.com again';
      const result = applyTransform('extract-urls', input);
      expect(result).toEqual({ success: true, result: 'https://example.com' });
    });

    it('extract URLs returns empty for no matches', () => {
      const result = applyTransform('extract-urls', 'no urls here');
      expect(result).toEqual({ success: true, result: '' });
    });

    it('extract emails from text', () => {
      const input = 'Contact alice@example.com or bob@test.org for help';
      const result = applyTransform('extract-emails', input);
      expect(result).toEqual({
        success: true,
        result: 'alice@example.com\nbob@test.org',
      });
    });

    it('extract emails deduplicates', () => {
      const input = 'alice@example.com and alice@example.com again';
      const result = applyTransform('extract-emails', input);
      expect(result).toEqual({ success: true, result: 'alice@example.com' });
    });

    it('extract emails returns empty for no matches', () => {
      const result = applyTransform('extract-emails', 'no emails here');
      expect(result).toEqual({ success: true, result: '' });
    });

    it('count stats', () => {
      const input = 'Hello World\nSecond line';
      const result = applyTransform('count-stats', input);
      expect(result).toEqual({
        success: true,
        result: 'Characters: 23\nWords: 4\nLines: 2',
      });
    });

    it('count stats handles empty string', () => {
      const result = applyTransform('count-stats', '');
      expect(result).toEqual({
        success: true,
        result: 'Characters: 0\nWords: 0\nLines: 1',
      });
    });

    it('count stats handles single word', () => {
      const result = applyTransform('count-stats', 'hello');
      expect(result).toEqual({
        success: true,
        result: 'Characters: 5\nWords: 1\nLines: 1',
      });
    });
  });

  describe('edge cases', () => {
    it('all transforms have unique IDs', () => {
      const ids = transforms.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all transforms have valid categories', () => {
      const validCategories = ['text', 'format', 'encode', 'extract'];
      for (const t of transforms) {
        expect(validCategories).toContain(t.category);
      }
    });

    it('handles empty string input for text transforms', () => {
      const textTransforms = ['uppercase', 'lowercase', 'titlecase', 'trim', 'sort-lines', 'remove-dupes', 'reverse-string'];
      for (const id of textTransforms) {
        const result = applyTransform(id, '');
        expect(result.success).toBe(true);
      }
    });
  });
});
