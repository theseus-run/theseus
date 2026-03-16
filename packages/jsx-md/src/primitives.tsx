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
 * 4. Nested lists are fully supported via nested Ul or Ol inside Li children.
 *    DepthContext tracks the nesting level and computes indentation automatically.
 *
 *      <Ul>
 *        <Li>top-level item
 *          <Ul><Li>sub-item one</Li><Li>sub-item two</Li></Ul>
 *        </Li>
 *      </Ul>
 *
 *      <Ol>
 *        <Li>step one
 *          <Ol><Li>sub-step a</Li><Li>sub-step b</Li></Ol>
 *        </Li>
 *      </Ol>
 */

/* @jsxImportSource @theseus.run/jsx-md */

import type { VNode } from './jsx-runtime.ts';
import { render } from './render.ts';
import { createContext, useContext, withContext } from './context.ts';
import { escapeHtmlContent, encodeLinkUrl, encodeLinkLabel, backtickFenceLength, escapeMarkdown } from './escape.ts';

// ---------------------------------------------------------------------------
// DepthContext — tracks list nesting level for Li indentation
// ---------------------------------------------------------------------------

/** Tracks the current list nesting depth. 0 = outside any list. */
const DepthContext = createContext(0);

// ---------------------------------------------------------------------------
// OlCollectorContext — collects Li items for Ol numbering
// ---------------------------------------------------------------------------

/**
 * Mutable item-collector box passed through context during Ol rendering.
 * Li pushes its rendered content into collector.items (and returns '') when
 * an OlCollector is present; Ol reads the items after rendering to number them.
 * This eliminates the sentinel-character post-processing hack and allows Ol
 * to be nested at any depth, just like Ul.
 */
type OlCollector = { items: string[] };
const OlCollectorContext = createContext<OlCollector | null>(null);

// ---------------------------------------------------------------------------
// ColSpecContext — tracks Th alignment per column for Table separator row
// ---------------------------------------------------------------------------

/**
 * Alignment value for a GFM table column.
 * 'left' → `:---`, 'center' → `:---:`, 'right' → `---:`, undefined → `---`.
 */
export type ColAlign = 'left' | 'center' | 'right';

/**
 * Mutable spec box passed through context during Table rendering.
 * Th pushes its alignment (or undefined) into spec.cols; Table reads the
 * array after the header row renders to build the GFM separator row.
 */
type ColSpec = { cols: Array<ColAlign | undefined> };
const ColSpecContext = createContext<ColSpec | null>(null);

function alignSeparator(align: ColAlign | undefined): string {
  if (align === 'left') return ':---';
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  return '---';
}

// ---------------------------------------------------------------------------
// Block elements — trailing \n\n
// ---------------------------------------------------------------------------

interface BlockProps {
  children?: VNode;
}

export function H1({ children }: BlockProps): string {
  return `# ${render(children).trim()}\n\n`;
}

export function H2({ children }: BlockProps): string {
  return `## ${render(children).trim()}\n\n`;
}

export function H3({ children }: BlockProps): string {
  return `### ${render(children).trim()}\n\n`;
}

export function H4({ children }: BlockProps): string {
  return `#### ${render(children).trim()}\n\n`;
}

export function H5({ children }: BlockProps): string {
  return `##### ${render(children).trim()}\n\n`;
}

export function H6({ children }: BlockProps): string {
  return `###### ${render(children).trim()}\n\n`;
}

export function P({ children }: BlockProps): string {
  return `${render(children)}\n\n`;
}

export function Hr(_: { children?: never } = {}): string {
  return '---\n\n';
}

interface CodeblockProps {
  lang?: string;
  children?: VNode;
  indent?: number;
}

export function Codeblock({ lang = '', children, indent = 0 }: CodeblockProps): string {
  const prefix = ' '.repeat(indent);
  const content = render(children);
  const fence = '`'.repeat(backtickFenceLength(content, 3));
  const rawLines = content.split('\n');
  // Drop trailing empty entries produced by a trailing \n in content to prevent
  // a spurious indented blank line appearing before the closing fence.
  while (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }
  const body = rawLines.map((line) => prefix + line).join('\n');
  return `${fence}${lang}\n${body}\n${fence}\n\n`;
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
  const content = render(children).trimEnd();
  const lines = content.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
  return `${lines}\n\n`;
}

// ---------------------------------------------------------------------------
// List elements
// ---------------------------------------------------------------------------

export function Ul({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  // Clear OlCollectorContext so Li items inside a Ul nested within Ol
  // render as "- " bullet items, not push to the outer Ol's collector.
  const rendered = withContext(OlCollectorContext, null, () =>
    withContext(DepthContext, depth + 1, () => render(children)),
  );
  // At depth 0 (outermost): trailing \n to form a block.
  // At depth > 0 (nested): leading \n so the sublist starts on its own line
  // when concatenated with the parent Li text.
  return depth === 0 ? `${rendered}\n` : `\n${rendered}`;
}

/**
 * Ordered list — auto-numbers Li children at the current depth level.
 *
 * Ul/Ol increment the depth before rendering children, so Li items know
 * their indentation. When an OlCollector is present in context, Li pushes
 * its content to collector.items and returns '' — Ol then numbers the
 * collected items. This pattern supports Ol at any nesting depth, including
 * Ol inside Ol, Ol inside Ul, etc.
 */
export function Ol({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  const collector: OlCollector = { items: [] };
  withContext(OlCollectorContext, collector, () =>
    withContext(DepthContext, depth + 1, () => render(children)),
  );
  const indent = '  '.repeat(depth);
  const numbered = collector.items
    .map((item, i) => `${indent}${i + 1}. ${item}`)
    .join('');
  return depth === 0 ? `${numbered}\n` : `\n${numbered}`;
}

export function Li({ children }: BlockProps): string {
  const depth = useContext(DepthContext);
  const collector = useContext(OlCollectorContext);
  // depth is already incremented by the enclosing Ul/Ol, so depth 1 = top-level.
  // Math.max guard: safe when Li is used outside Ul/Ol (depth=0).
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const inner = render(children).trimEnd();
  if (collector) {
    // Inside Ol: push content to collector; Ol will number items after rendering.
    collector.items.push(`${inner}\n`);
    return '';
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
 *
 * Th also increments the ColCountContext counter so Table knows how many
 * columns the header row has without parsing pipe characters.
 */
export function Th({ children, align }: { children?: VNode; align?: ColAlign }): string {
  const spec = useContext(ColSpecContext);
  if (spec) spec.cols.push(align);
  return ` ${render(children)} |`;
}

export function Td({ children }: { children?: VNode }): string {
  return ` ${render(children)} |`;
}

export function Tr({ children }: { children?: VNode }): string {
  return `|${render(children)}\n`;
}

/**
 * Table — renders Tr children, then injects a GFM separator row after the
 * first row (the header). Column count is obtained from ColCountContext which
 * Th increments during rendering — correct even when cells contain '|'.
 */
export function Table({ children }: { children?: VNode }): string {
  const spec: ColSpec = { cols: [] };
  const rendered = withContext(ColSpecContext, spec, () => render(children));
  const lines = rendered.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return '';
  }
  const separator = '| ' + spec.cols.map(alignSeparator).join(' | ') + ' |';
  const headerLine = lines[0]!;
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
  const inner = render(children).replace(/\*\*/g, '\\*\\*');
  return `**${inner}**`;
}

export function Code({ children }: InlineProps): string {
  const inner = render(children);
  const fence = '`'.repeat(backtickFenceLength(inner));
  return `${fence}${inner}${fence}`;
}

export function Italic({ children }: InlineProps): string {
  return `*${render(children)}*`;
}

export function Strikethrough({ children }: InlineProps): string {
  const inner = render(children).replace(/~~/g, '\\~\\~');
  return `~~${inner}~~`;
}

export function Br(_: { children?: never } = {}): string {
  return '  \n';
}

export function Sup({ children }: InlineProps): string {
  return `<sup>${render(children)}</sup>`;
}

export function Sub({ children }: InlineProps): string {
  return `<sub>${render(children)}</sub>`;
}

export function Kbd({ children }: InlineProps): string {
  return `<kbd>${render(children)}</kbd>`;
}

export function Escape({ children }: InlineProps): string {
  return escapeMarkdown(render(children));
}

interface LinkProps {
  href: string;
  children?: VNode;
}

export function Link({ href, children }: LinkProps): string {
  return `[${render(children)}](${encodeLinkUrl(href)})`;
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
  return render(children);
}

// ---------------------------------------------------------------------------
// TaskList + Task — GFM task list items
// ---------------------------------------------------------------------------

export function TaskList({ children }: { children?: VNode }): string {
  const depth = useContext(DepthContext);
  const rendered = withContext(DepthContext, depth + 1, () => render(children));
  // Mirror Ul: at depth 0 trailing \n, at depth > 0 leading \n
  return depth === 0 ? `${rendered}\n` : `\n${rendered}`;
}

export function Task({ children, done }: { children?: VNode; done?: boolean }): string {
  const depth = useContext(DepthContext);
  // Math.max guard matches Li's defensive pattern — safe when Task is used outside TaskList (depth=0)
  const indent = '  '.repeat(Math.max(0, depth - 1));
  const prefix = done ? '[x]' : '[ ]';
  const inner = render(children).trimEnd();
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
  const inner = render(children).trimEnd();
  const lines = inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
  return `> [!${type.toUpperCase()}]\n${lines}\n\n`;
}

// ---------------------------------------------------------------------------
// HtmlComment — renders <!-- content --> (single-line or multi-line)
// ---------------------------------------------------------------------------

export function HtmlComment({ children }: { children?: VNode }): string {
  const inner = render(children).trimEnd();
  // Use .trim() only for the empty-check: whitespace-only content → <!-- -->
  if (!inner.trim()) {
    return `<!-- -->\n`;
  }
  // Sanitize in a single pass (left-to-right alternation):
  // '-->': closes comment prematurely → replace '>' with ' >' to break the sequence
  // '--': invalid per HTML spec → replace second '-' with ' -'
  const safe = inner.replace(/-->|--/g, (m) => (m === '-->' ? '-- >' : '- -'));
  if (safe.includes('\n')) {
    return `<!--\n${safe}\n-->\n`;
  }
  return `<!-- ${safe} -->\n`;
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
  // Newlines in summary break the <summary> element — collapse to spaces.
  const safeSummary = escapeHtmlContent(summary.replace(/\n/g, ' '));
  // trimEnd() required: GitHub needs a blank line before </details> to render body as markdown.
  // The \n\n in the template provides that; trimEnd prevents double-blank-lines.
  const body = render(children).trimEnd();
  return `<details>\n<summary>${safeSummary}</summary>\n\n${body}\n\n</details>\n`;
}
