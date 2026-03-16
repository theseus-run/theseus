/**
 * Escapes `&`, `"`, `<`, `>` — for use in XML/HTML attribute values.
 * Escapes for double-quoted HTML/XML attribute values. Single quotes are not
 * escaped — do not use this in single-quoted attribute contexts.
 *
 * Single-pass via a lookup map — avoids four sequential .replace() calls.
 */
const HTML_ATTR_MAP: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
};
const HTML_ATTR_RE = /[&"<>]/g;

export function escapeHtmlAttr(s: string): string {
  return s.replace(HTML_ATTR_RE, (c) => HTML_ATTR_MAP[c]!);
}

/**
 * Escapes `&`, `<`, `>` — for use in HTML/XML text content (not attributes).
 *
 * Single-pass via a lookup map.
 */
const HTML_CONTENT_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};
const HTML_CONTENT_RE = /[&<>]/g;

export function escapeHtmlContent(s: string): string {
  return s.replace(HTML_CONTENT_RE, (c) => HTML_CONTENT_MAP[c]!);
}

/**
 * Percent-encodes `(` and `)` in a URL to prevent premature link termination in
 * Markdown link syntax `[text](url)`.
 */
export function encodeLinkUrl(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * Percent-encodes `[` and `]` in text used as Markdown link label (image alt).
 * Prevents premature bracket closure in `![alt](src)`.
 */
export function encodeLinkLabel(text: string): string {
  return text.replace(/[[\]]/g, (c) => encodeURIComponent(c));
}

/**
 * Escapes all CommonMark ASCII punctuation metacharacters in a string so that
 * user-supplied content is treated as literal text by any markdown renderer.
 *
 * Useful when interpolating variable strings — filenames, user input, code
 * identifiers, etc. — into markdown prose where unintended formatting must be
 * suppressed:
 *
 *   <P>File: <Escape>{untrustedFilename}</Escape></P>
 *   <P>File: {escapeMarkdown(untrustedFilename)}</P>
 *
 * Escaped characters: \ ` * _ [ ] ( ) # + - . ! | ~ < >
 * These cover all CommonMark inline and block trigger characters.
 * HTML entities (&amp; etc.) are intentionally not escaped here — use
 * escapeHtmlContent for HTML attribute / tag contexts.
 */
const MARKDOWN_ESCAPE_RE = /[\\`*_[\]()#+\-.!|~<>]/g;

export function escapeMarkdown(s: string): string {
  return s.replace(MARKDOWN_ESCAPE_RE, '\\$&');
}

/**
 * Returns the minimum backtick fence length needed to safely wrap `content`
 * as a CommonMark inline code span or fenced code block.
 *
 * CommonMark rule: the fence must be a run of N backticks where N is strictly
 * greater than the longest run of consecutive backticks in the content.
 * Minimum is 1 for inline code, 3 for fenced code blocks.
 */
export function backtickFenceLength(content: string, minimum: number = 1): number {
  let maxRun = 0;
  let currentRun = 0;
  for (const ch of content) {
    if (ch === '`') {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  return Math.max(minimum, maxRun + 1);
}
