# `@theseus.run/jsx-md`

JSX runtime that outputs Markdown strings — typed props, Context API, XML intrinsics, zero runtime dependencies.

→ [Why this exists](https://romanonthego.dev/blog/jsx-that-outputs-markdown)

## Prior art

[dbartholomae/jsx-md](https://github.com/dbartholomae/jsx-md) (2019, inactive) and [eyelly-wu/jsx-to-md](https://github.com/eyelly-wu/jsx-to-md) are built for documentation generation — READMEs, changelogs. They work well for that. `dbartholomae/jsx-md` predates `jsxImportSource` and uses file-level pragma comments; its `render()` returns a Promise.

`@theseus.run/jsx-md` targets agent instructions assembled at call time: `render()` is synchronous, Context API ships with it, and any lowercase tag is an XML intrinsic.

---

## Install

```bash
bun add @theseus.run/jsx-md
# npm install @theseus.run/jsx-md
# pnpm add @theseus.run/jsx-md
```

**AI coding agent skill** (OpenCode, Cursor, Copilot, Claude Code):

```bash
npx skills add https://github.com/theseus-run/theseus/tree/master/packages/jsx-md
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@theseus.run/jsx-md"
  }
}
```

Ships TypeScript source and compiled ESM output with sourcemaps. Bun resolves the TypeScript source directly. Node.js (≥18) and bundlers (Vite, tsup, esbuild) use the compiled output — no configuration needed, the `exports` map handles it transparently.

---

## Usage

```tsx
import { render, H2, P, Ul, Li, Bold, Code } from "@theseus.run/jsx-md";

const ReviewerPrompt = ({ repo }: { repo: string }) => (
  <>
    <H2>Role</H2>
    <P>You are a precise code reviewer. Find bugs, not style issues.</P>

    <H2>Rules</H2>
    <Ul>
      <Li>Flag <Bold>P0</Bold> issues first — do not bury them.</Li>
      <Li>One finding per comment. No compound observations.</Li>
      <Li>Use <Code>inline code</Code> when referencing identifiers.</Li>
    </Ul>
  </>
);

const prompt = render(<ReviewerPrompt repo="cockpit" />);
// "## Role\n\nYou are a precise code reviewer..."
```

`render()` returns a plain string. No virtual DOM, no React runtime. Same input, same string, every time.

---

## Context API

Avoids prop-drilling through shared fragment trees. Same shape as React — `createContext`, `useContext`, `Context.Provider` — synchronous, no rules-of-hooks.

```tsx
import { render, createContext, useContext, Ul, Li, Code } from "@theseus.run/jsx-md";

const HarnessCtx = createContext<'opencode' | 'copilot'>('copilot');

const StepsSection = () => {
  const harness = useContext(HarnessCtx);
  return (
    <Ul>
      <Li>Always verify output before claiming done.</Li>
      {harness === 'opencode' && <Li>Use <Code>task()</Code> for multi-step subtasks.</Li>}
    </Ul>
  );
};

// Wire it once at the root — no prop threading:
const prompt = render(
  <HarnessCtx.Provider value="opencode">
    <StepsSection />
  </HarnessCtx.Provider>
);
```

`useContext` returns the default when called outside a Provider. Providers nest — innermost wins.

---

## XML intrinsics

Any lowercase JSX tag renders as an XML block. No imports, no registration:

```tsx
const ReviewerPrompt = ({ repo, examples }: Props) => (
  <>
    <context>
      <P>Repository: {repo}. Language: TypeScript. Package manager: bun.</P>
    </context>

    <instructions>
      <H2>Role</H2>
      <P>You are a precise code reviewer. Find bugs, not style issues.</P>
    </instructions>

    {examples.length > 0 && (
      <examples>
        {examples.map((ex, i) => (
          <example index={i + 1}>
            <Md>{ex}</Md>
          </example>
        ))}
      </examples>
    )}
  </>
);
```

Attributes are typed — `index={1}` serializes to `index="1"`. Boolean `true` renders bare, `false`/`null`/`undefined` are omitted. Empty tags self-close.

---

## Primitives

| Component | Output |
|---|---|
| `H1`–`H6` | `#`–`######` headings |
| `P` | Paragraph (blank line separated) |
| `Hr` | `---` horizontal rule |
| `Codeblock` | Fenced code block (`lang` prop optional) |
| `Blockquote` | `>` blockquote |
| `Ul` | Unordered list |
| `Ol` | Ordered list (auto-numbered, nesting supported) |
| `Li` | List item (supports nested `Ul` or `Ol` inside `Li`) |
| `TaskList` | Task list container |
| `Task` | `- [ ]` / `- [x]` task item (`done` prop) |
| `Table` | Markdown table |
| `Tr` | Table row |
| `Th` | Table header cell (`align`: `left`, `center`, `right`) |
| `Td` | Table data cell |
| `Bold` | `**bold**` |
| `Code` | `` `inline code` `` |
| `Italic` | `*italic*` |
| `Strikethrough` | `~~strikethrough~~` |
| `Br` | Hard line break (`  \n` — two trailing spaces) |
| `Sup` | `<sup>content</sup>` superscript |
| `Sub` | `<sub>content</sub>` subscript |
| `Kbd` | `<kbd>content</kbd>` keyboard key |
| `Escape` | Escapes CommonMark metacharacters in children |
| `Link` | `[text](url)` |
| `Img` | `![alt](src)` |
| `Md` | Raw Markdown passthrough — renders verbatim, no transformation |
| `HtmlComment` | `<!-- comment -->` — invisible to most renderers, useful for LLM-only instructions |
| `Details` | `<details><summary>` collapsible block |
| `Callout` | GitHub-style admonition (`type`: `note`, `tip`, `important`, `warning`, `caution`) |

---

## Utilities

### `escapeMarkdown(s: string): string`

Escapes all CommonMark ASCII punctuation metacharacters with a backslash so user-supplied strings are treated as literal text by any markdown renderer.

```tsx
import { escapeMarkdown, Escape, P } from "@theseus.run/jsx-md";

// Function form
const safe = escapeMarkdown(untrustedInput); // "**bold**" → "\\*\\*bold\\*\\*"

// Component form — same result, composable in JSX
render(<P>File: <Escape>{untrustedFilename}</Escape></P>);
```

Escaped characters: `` \ ` * _ [ ] ( ) # + - . ! | ~ < > ``

`&` is intentionally not escaped — use `escapeHtmlContent` for HTML contexts.

---

## License

MIT — see [LICENSE](../../LICENSE).

Built by [Roman Dubinin](https://romanonthego.dev). Part of [Theseus](https://theseus.run).
