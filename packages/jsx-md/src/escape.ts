/**
 * Escapes `&`, `"`, `<`, `>` — for use in XML/HTML attribute values.
 * Escapes for double-quoted HTML/XML attribute values. Single quotes are not
 * escaped — do not use this in single-quoted attribute contexts.
 */
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapes `&`, `<`, `>` — for use in HTML/XML text content (not attributes). */
export function escapeHtmlContent(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
