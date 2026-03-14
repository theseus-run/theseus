/**
 * Markdown primitives as named TSX components.
 *
 * Components covering all markdown formatting needs:
 *   Block:  H1, H2, H3, H4, H5, H6, P, Hr, Codeblock, Blockquote
 *   List:   Ol, Ul, Li, TaskList, Task
 *   Table:  Table, Tr, Th, Td
 *   Inline: Bold, Code, Italic, Strikethrough, Link, Img
 *   Raw:    Md
 *   Other:  Callout, HtmlComment, Details
 *
 * Each is a plain function (props) => string. No React. No DOM.
 *
 * Children are passed as VNode (unevaluated). Each component calls
 * render(children) to produce the final string. This enables context
 * propagation — Ul/Ol wrap render in a withContext(DepthContext, depth+1)
 * call so nested Li components can compute their indentation level.
 *
 * ---------------------------------------------------------------------------
 * AUTHORING RULES
 * ---------------------------------------------------------------------------
 *
 * 1. Prefer components over inline markdown strings.
 *
 *      **text**        →  <Bold>text</Bold>
 *      `text`          →  <Code>text</Code>
 *      *text*          →  <Italic>text</Italic>
 *      [label](url)    →  <Link href="url">label</Link>
 *
 * 2. Bare JSX text for plain prose. {'...'} only when the string contains
 *    a character JSX cannot represent as bare text:
 *
 *      Requires {'...'}:  backtick  {  }  <  >  '
 *      Bare text is fine: letters, spaces, digits, . , : ; ! ? — – - ( ) [ ] " & * + = | / \
 *
 *      // WRONG — unnecessary wrapper
 *      <Li><Bold>P1</Bold>{': Guard clauses over nesting.'}</Li>
 *
 *      // CORRECT — bare text
 *      <Li><Bold>P1</Bold>: Guard clauses over nesting.</Li>
 *
 *      // CORRECT — must wrap, contains single quote
 *      <Li><Bold>P1</Bold>{": Dead code: delete, don't comment out."}</Li>
 *
 *      // CORRECT — must wrap, contains backtick
 *      <P>{'Format: `ROI≈X.X`'}</P>
 *
 * 3. Md is an escape hatch for genuinely undecomposable strings — typically
 *    4+ inline code spans mixed with bold and prose. Use sparingly.
 *
 *      // Legitimate Md use — 6 code spans, decomposition adds noise
 *      <Li><Md>{'**P0**: Type = `TKey`. Not `TFuncKey`, `string`, or `<Trans>`.'}</Md></Li>
 *
 *      // Not legitimate — decompose instead
 *      <Li><Md>{'**P1**: Guard clauses over nesting.'}</Md></Li>
 *
 * 4. Nested lists are supported via nested Ul inside Li children.
 *    DepthContext tracks the nesting level and computes indentation automatically.
 *
 *      <Ul>
 *        <Li>top-level item
 *          <Ul><Li>sub-item one</Li><Li>sub-item two</Li></Ul>
 *        </Li>
 *      </Ul>
 *
 * 5. Ol must be at document root (depth 0). Nesting Ol anywhere inside a Ul —
 *    including inside a Li — throws at runtime because depth > 0.
 *    Ol is for flat, top-level numbered sequences only.
 */

/* @jsxImportSource @theseus.run/jsx-md */

import type { VNode } from './jsx-runtime.ts';
import { render } from './render.ts';
import { createContext, useContext, withContext } from './context.ts';
import { escapeHtmlContent, encodeLinkUrl, encodeLinkLabel } from './escape.ts';

// ---------------------------------------------------------------------------
// DepthContext — tracks list nesting level for Li indentation
// ---------------------------------------------------------------------------

/** Tracks the current list nesting depth. 0 = outside any list. */
const DepthContext = createContext(0);

// ---------------------------------------------------------------------------
// OlContext — signals that Li is inside an Ol (uses sentinel marker)
// ---------------------------------------------------------------------------

/**
 * Signals that the current Li is being rendered inside an Ol.
 * Li emits a sentinel prefix (\x01) instead of "- " when this is true,
 * preventing Ol's post-processor from matching literal "- " content.
 */
const OlContext = createContext(false);

// ---------------------------------------------------------------------------
// Block elements — trailing \n\n
// ---------------------------------------------------------------------------

interface BlockProps {
  children?: VNode;
}

export function H1({ children }: BlockProps): string {
  return `# ${render(children ?? null)}\n\n`;
}

export function H2({ children }: BlockProps): string {
  return `## ${render(children ?? null)}\n\n`;
}

export function H3({ children }: BlockProps): string {
  return `### ${render(children ?? null)}\n\n`;
}

export function H4({ children }: BlockProps): string {
  return `#### ${render(children ?? null)}\n\n`;
}

export function H5({ children }: BlockProps): string {
  return `##### ${render(children ?? null)}\n\n`;
}

export function H6({ children }: BlockProps): string {
  return `###### ${render(children ?? null)}\n\n`;
}

export function P({ children }: BlockProps): string {
  return `${render(children ?? null)}\n\n`;
}

export function Hr(): string {
  return '---\n\n';
}

interface CodeblockProps {
  lang?: string;
  children?: VNode;
  indent?: number;
}

export function Codeblock({ lang = '', children, indent = 0 }: CodeblockProps): string {
  const prefix = ' '.repeat(indent);
  const rawLines = render(children ?? null).split('\n');
  // Drop trailing empty entries produced by a trailing \n in content to prevent
  // a spurious indented blank line appearing before the closing fence.
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }
  const body = rawLines.map((line) => prefix + line).join('\n');
  return `\`\`\`${lang}\n${body}\n\`\`\`\n\n`;
}

/**
 * Blockquote — prefixes every content line with `> `.
 * Trailing blank lines are stripped before prefixing so the output ends
 * cleanly with `\n\n` rather than `> \n> \n\n`.
 * Empty lines within the content get a bare `>` (no trailing space) to
 * avoid invisible trailing whitespace in the rendered output.
 * Nested blockquotes compose naturally: the inner renders `> text\n\n`,
 * trimEnd strips the trailing newlines, then the outer prefixes each line
 * with `> `, producing `> > text`.
 */
export function Blockquote({ children }: BlockProps): string {
  const content = render(children ?? null).trimEnd();
  const lines = content.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
  return `${lines}\n\n`;
}

// ---------------------------------------------------------------------------
// List elements
// ---------------------------------------------------------------------------

export function Ul({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  // Reset OlContext so Li items inside a Ul nested within Ol emit "- " not the Ol sentinel
  const rendered = withContext(OlContext, false, () =>
    withContext(DepthContext, depth + 1, () => render(children ?? null)),
  );
  // Add trailing newline only at the outermost list level
  return depth === 0 ? `${rendered}\n` : rendered;
}

/**
 * Ordered list — auto-numbers Li children at the current depth level.
 *
 * Ul/Ol increment the depth before rendering children, so Li items know
 * their indentation. When OlContext is true, Li emits a sentinel prefix
 * (\x01) instead of "- ", which Ol replaces with numbered prefixes. This
 * prevents false matches on Li content that literally begins with "- ".
 *
 * Constraint: Ol must be at document root (depth 0). Nesting Ol anywhere
 * inside a Ul — including inside a Li — throws at runtime because depth > 0.
 * Ol is for flat, top-level numbered sequences only.
 */
export function Ol({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  if (depth > 0) {
    throw new Error('Ol cannot be used inside any list container (Ul, Ol, or TaskList) — depth must be 0.');
  }
  const MARKER = '\x01';
  const rendered = withContext(OlContext, true, () =>
    withContext(DepthContext, depth + 1, () => render(children ?? null)),
  );
  let counter = 0;
  return rendered.replace(/^\x01/gm, () => `${++counter}. `) + '\n';
}

export function Li({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  const isInOl = useContext(OlContext);
  // depth is already incremented by the enclosing Ul/Ol, so depth 1 = top-level.
  // Math.max guard: safe when Li is used outside Ul/Ol (depth=0).
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const inner = render(children ?? null).trimEnd();
  if (isInOl) {
    // \x01 is the sentinel Ol replaces with a number — prevents "- " content from being matched
    return `${indent}\x01${inner}\n`;
  }
  return `${indent}- ${inner}\n`;
}

// ---------------------------------------------------------------------------
// Table elements
// ---------------------------------------------------------------------------

/**
 * Th and Td are semantically identical in GFM — position determines header
 * styling, not cell type. Both return ` content |` (trailing pipe delimiter).
 * Tr prepends the leading `|` to form a complete row line.
 */
export function Th({ children }: { children?: VNode }): string {
  return ` ${render(children ?? null)} |`;
}

export function Td({ children }: { children?: VNode }): string {
  return ` ${render(children ?? null)} |`;
}

export function Tr({ children }: { children?: VNode }): string {
  return `|${render(children ?? null)}\n`;
}

/**
 * Table — renders Tr children, then injects a GFM separator row after the
 * first row (the header). Column count is derived from the first row's pipe
 * count so no column metadata needs to be threaded through context.
 */
export function Table({ children }: { children?: VNode }): string {
  const rendered = render(children ?? null);
  const lines = rendered.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return '';
  }
  const headerLine = lines[0]!;
  const colCount = headerLine.split('|').filter((s) => s.trim().length > 0).length;
  const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
  const bodyLines = lines.slice(1);
  return [headerLine, separator, ...bodyLines].join('\n') + '\n\n';
}

// ---------------------------------------------------------------------------
// Inline elements — no trailing whitespace
// ---------------------------------------------------------------------------

interface InlineProps {
  children?: VNode;
}

export function Bold({ children }: InlineProps): string {
  return `**${render(children ?? null)}**`;
}

export function Code({ children }: InlineProps): string {
  return `\`${render(children ?? null)}\``;
}

export function Italic({ children }: InlineProps): string {
  return `*${render(children ?? null)}*`;
}

export function Strikethrough({ children }: InlineProps): string {
  return `~~${render(children ?? null)}~~`;
}

interface LinkProps {
  href: string;
  children?: VNode;
}

export function Link({ href, children }: LinkProps): string {
  return `[${render(children ?? null)}](${encodeLinkUrl(href)})`;
}

interface ImgProps {
  src: string;
  alt?: string;
}

export function Img({ src, alt = '' }: ImgProps): string {
  return `![${encodeLinkLabel(alt)}](${encodeLinkUrl(src)})`;
}

// ---------------------------------------------------------------------------
// Raw passthrough — escape hatch only, see AUTHORING RULES above
// ---------------------------------------------------------------------------

export function Md({ children }: BlockProps): string {
  return render(children ?? null);
}

// ---------------------------------------------------------------------------
// TaskList + Task — GFM task list items
// ---------------------------------------------------------------------------

export function TaskList({ children }: { children?: VNode }): string {
  const depth = useContext(DepthContext);
  const rendered = withContext(DepthContext, depth + 1, () => render(children ?? null));
  // Mirror Ul: trailing \n only at outermost task list level
  return depth === 0 ? `${rendered}\n` : rendered;
}

export function Task({ children, done }: { children?: VNode; done?: boolean }): string {
  const depth = useContext(DepthContext);
  // Math.max guard matches Li's defensive pattern — safe when Task is used outside TaskList (depth=0)
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const prefix = done ? '[x]' : '[ ]';
  // NOTE: nested TaskList inside a Task appends first inner item inline (same known
  // limitation as Li with nested Ul — structural fix requires block-aware rendering)
  const inner = render(children ?? null).trimEnd();
  return `${indent}- ${prefix} ${inner}\n`;
}

// ---------------------------------------------------------------------------
// Callout — GitHub-flavored alert blockquote
// ---------------------------------------------------------------------------

export type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

export function Callout({
  children,
  type,
}: {
  children?: VNode;
  type: CalloutType;
}): string {
  const inner = render(children ?? null).trimEnd();
  const lines = inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
  return `> [!${type.toUpperCase()}]\n${lines}\n\n`;
}

// ---------------------------------------------------------------------------
// HtmlComment — renders <!-- content --> (single-line or multi-line)
// ---------------------------------------------------------------------------

export function HtmlComment({ children }: { children?: VNode }): string {
  const inner = render(children ?? null).trimEnd();
  // Use .trim() only for the empty-check: whitespace-only content → <!-- -->
  if (!inner.trim()) {
    return `<!-- -->\n`;
  }
  if (inner.includes('\n')) {
    return `<!--\n${inner}\n-->\n`;
  }
  return `<!-- ${inner} -->\n`;
}

// ---------------------------------------------------------------------------
// Details — GitHub collapsible section
// ---------------------------------------------------------------------------

export function Details({
  children,
  summary,
}: {
  children?: VNode;
  summary: string;
}): string {
  // trimEnd() required: GitHub needs a blank line before </details> to render body as markdown.
  // The \n\n in the template provides that; trimEnd prevents double-blank-lines.
  const body = render(children ?? null).trimEnd();
  return `<details>\n<summary>${escapeHtmlContent(summary)}</summary>\n\n${body}\n\n</details>\n`;
}
