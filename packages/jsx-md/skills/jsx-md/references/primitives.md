# Primitives

Full output shapes for all `@theseus.run/jsx-md` components. All block elements emit a trailing `\n\n`. Inline elements emit no trailing whitespace.

## Block

| Component | Output |
|---|---|
| `H1` | `# text\n\n` |
| `H2` | `## text\n\n` |
| `H3` | `### text\n\n` |
| `H4` | `#### text\n\n` |
| `H5` | `##### text\n\n` |
| `H6` | `###### text\n\n` |
| `P` | `text\n\n` |
| `Hr` | `---\n\n` (no children) |
| `Codeblock` | `` ```lang\nbody\n``` \n\n`` — `lang` optional; `indent` shifts every body line by N spaces; fence length auto-grows if content contains backticks |
| `Blockquote` | `> text\n\n` — nested blockquotes compose: inner renders `> text`, outer prefixes → `> > text` |

## List

| Component | Output | Notes |
|---|---|---|
| `Ul` | `- item\n` per `Li` | Depth 0: trailing `\n`; nested inside `Li`: leading `\n` |
| `Ol` | `1. item\n` (auto-numbered) | Same depth behavior as `Ul`; nesting fully supported including `Ol` inside `Ol` |
| `Li` | `- text\n` | Inside `Ol`: pushes to collector, `Ol` numbers; inside `Ul`: emits `- ` bullet |
| `TaskList` | Container — mirrors `Ul` depth behavior | |
| `Task` | `- [ ] text\n` / `- [x] text\n` | `done?: boolean` prop |

Nesting example:

```tsx
<Ul>
  <Li>top
    <Ul><Li>sub-one</Li><Li>sub-two</Li></Ul>
  </Li>
</Ul>

<Ol>
  <Li>step one
    <Ol><Li>sub-step a</Li></Ol>
  </Li>
</Ol>
```

## Table

| Component | Output | Notes |
|---|---|---|
| `Table` | Full GFM table | Injects separator row after first `Tr`; separator alignment driven by `Th.align` |
| `Tr` | `\| cells \|\n` | |
| `Th` | ` content \|` | `align?: 'left' \| 'center' \| 'right'` — `:---`, `:---:`, `---:` in separator |
| `Td` | ` content \|` | |

## Inline

| Component | Output | Notes |
|---|---|---|
| `Bold` | `**text**` | Escapes inner `**` |
| `Code` | `` `text` `` | Auto-selects fence length when content contains backticks |
| `Italic` | `*text*` | |
| `Strikethrough` | `~~text~~` | Escapes inner `~~` |
| `Br` | `  \n` | Two trailing spaces — CommonMark hard line break |
| `Sup` | `<sup>text</sup>` | |
| `Sub` | `<sub>text</sub>` | |
| `Kbd` | `<kbd>text</kbd>` | |
| `Link` | `[text](url)` | `href: string` required |
| `Img` | `![alt](src)` | `src: string` required; `alt?: string` |

## Escape

| Export | Form | Behavior |
|---|---|---|
| `Escape` | Component | Escapes CommonMark metacharacters in children |
| `escapeMarkdown` | Function — `escapeMarkdown(s: string): string` | Same result, usable outside JSX |

Escaped characters: `` \ ` * _ [ ] ( ) # + - . ! | ~ < > ``

`&` is intentionally not escaped — use `escapeHtmlContent` for HTML contexts.

## Raw

| Component | Output |
|---|---|
| `Md` | Renders children verbatim — no transformation. Escape hatch for genuinely undecomposable strings (4+ mixed inline spans). |

## Other

| Component | Output | Props |
|---|---|---|
| `HtmlComment` | `<!-- text -->` (single-line) or `<!--\ntext\n-->` (multi-line) | Sanitizes `--` → `- -` and `-->` → `-- >` to prevent premature close |
| `Details` | `<details>\n<summary>…</summary>\n\nbody\n\n</details>\n` | `summary: string` required; newlines in summary collapsed to spaces |
| `Callout` | `> [!TYPE]\n> text\n\n` | `type: 'note' \| 'tip' \| 'important' \| 'warning' \| 'caution'` required |
