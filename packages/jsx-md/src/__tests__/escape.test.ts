import { expect, test, describe } from 'bun:test';
import { escapeHtmlAttr, escapeHtmlContent, encodeLinkUrl, encodeLinkLabel } from '../escape.ts';

// ---------------------------------------------------------------------------
// escapeHtmlAttr
// ---------------------------------------------------------------------------

describe('escapeHtmlAttr', () => {
  test('& → &amp;', () => {
    expect(escapeHtmlAttr('a & b')).toBe('a &amp; b');
  });

  test('" → &quot;', () => {
    expect(escapeHtmlAttr('say "hello"')).toBe('say &quot;hello&quot;');
  });

  test('< → &lt;', () => {
    expect(escapeHtmlAttr('a < b')).toBe('a &lt; b');
  });

  test('> → &gt;', () => {
    expect(escapeHtmlAttr('a > b')).toBe('a &gt; b');
  });

  test("single quote is NOT escaped — do not use in single-quoted attribute contexts", () => {
    expect(escapeHtmlAttr("it's fine")).toBe("it's fine");
  });

  test('empty string returns empty string', () => {
    expect(escapeHtmlAttr('')).toBe('');
  });

  test('all escapable chars together', () => {
    expect(escapeHtmlAttr('& " < >')).toBe('&amp; &quot; &lt; &gt;');
  });

  test('already-escaped input is double-escaped — no idempotency', () => {
    // escapeHtmlAttr is not idempotent: & in &amp; is re-escaped to &amp;amp;
    expect(escapeHtmlAttr('&amp;')).toBe('&amp;amp;');
  });

  test('no special chars → unchanged', () => {
    expect(escapeHtmlAttr('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// escapeHtmlContent
// ---------------------------------------------------------------------------

describe('escapeHtmlContent', () => {
  test('& → &amp;', () => {
    expect(escapeHtmlContent('a & b')).toBe('a &amp; b');
  });

  test('< → &lt;', () => {
    expect(escapeHtmlContent('a < b')).toBe('a &lt; b');
  });

  test('> → &gt;', () => {
    expect(escapeHtmlContent('a > b')).toBe('a &gt; b');
  });

  test('" is NOT escaped — unlike escapeHtmlAttr', () => {
    expect(escapeHtmlContent('say "hello"')).toBe('say "hello"');
  });

  test("single quote is NOT escaped", () => {
    expect(escapeHtmlContent("it's fine")).toBe("it's fine");
  });

  test('empty string returns empty string', () => {
    expect(escapeHtmlContent('')).toBe('');
  });

  test('all escapable chars together', () => {
    expect(escapeHtmlContent('& < >')).toBe('&amp; &lt; &gt;');
  });

  test('already-escaped input is double-escaped — no idempotency', () => {
    expect(escapeHtmlContent('&amp;')).toBe('&amp;amp;');
  });

  test('no special chars → unchanged', () => {
    expect(escapeHtmlContent('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// encodeLinkUrl
// ---------------------------------------------------------------------------

describe('encodeLinkUrl', () => {
  test(') passes through unencoded — known bug: encodeURIComponent in regex has no effect', () => {
    // The function intends to encode ) as %29 but does not at runtime.
    expect(encodeLinkUrl('https://example.com/a)b')).toBe('https://example.com/a)b');
  });

  test('( passes through unencoded — known bug', () => {
    expect(encodeLinkUrl('https://example.com/a(b')).toBe('https://example.com/a(b');
  });

  test('URL with no special chars → unchanged', () => {
    expect(encodeLinkUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  test('empty string → empty string', () => {
    expect(encodeLinkUrl('')).toBe('');
  });

  test('[ and ] in URL are not encoded — only parens are in scope', () => {
    expect(encodeLinkUrl('https://example.com/[0]')).toBe('https://example.com/[0]');
  });
});

// ---------------------------------------------------------------------------
// encodeLinkLabel
// ---------------------------------------------------------------------------

describe('encodeLinkLabel', () => {
  test('] → %5D', () => {
    expect(encodeLinkLabel('bracket]alt')).toBe('bracket%5Dalt');
  });

  test('[ → %5B', () => {
    expect(encodeLinkLabel('[bracket')).toBe('%5Bbracket');
  });

  test('both [ and ] together → both encoded', () => {
    expect(encodeLinkLabel('[text]')).toBe('%5Btext%5D');
  });

  test('no special chars → unchanged', () => {
    expect(encodeLinkLabel('plain alt text')).toBe('plain alt text');
  });

  test('empty string → empty string', () => {
    expect(encodeLinkLabel('')).toBe('');
  });

  test('( and ) in label are not encoded — only brackets are in scope', () => {
    expect(encodeLinkLabel('alt (note)')).toBe('alt (note)');
  });
});
