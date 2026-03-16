---
name: jsx-md-beautiful-mermaid
description: Render Mermaid diagrams as ASCII/Unicode art inside @theseus.run/jsx-md components. Use when adding a <BeautifulMermaid> component to a .tsx file that renders Markdown via render(), or when a prompt or document needs a diagram rendered as terminal-friendly ASCII art.
---

# @theseus.run/jsx-md-beautiful-mermaid

Single-component companion to `@theseus.run/jsx-md`. Takes a Mermaid diagram string, calls `renderMermaidASCII()` from `beautiful-mermaid` synchronously, and returns a fenced code block (or raw ASCII) as a plain string. No DOM, no SVG, no async.

## Setup

Install both packages:

```bash
bun add @theseus.run/jsx-md @theseus.run/jsx-md-beautiful-mermaid
```

Import:

```ts
import { render } from "@theseus.run/jsx-md"
import { BeautifulMermaid } from "@theseus.run/jsx-md-beautiful-mermaid"
```

No `tsconfig.json` changes needed beyond what `@theseus.run/jsx-md` already requires.

## Authoring rules

**1. Diagram source must be multi-line. Single-line `graph LR; A --> B` syntax is NOT supported.**

```tsx
// WRONG — parser rejects single-line inline syntax
<BeautifulMermaid diagram="graph LR; A --> B --> C" />

// CORRECT — header on its own line
<BeautifulMermaid diagram={`graph LR\n  A --> B --> C`} />

// CORRECT — template literal children (preferred for longer diagrams)
<BeautifulMermaid>
  {`graph LR
    A --> B --> C`}
</BeautifulMermaid>
```

**2. `diagram` prop takes precedence over `children`. Don't pass both.**

```tsx
// WRONG — diagram prop wins, children are silently ignored
<BeautifulMermaid diagram={flowA}>{flowB}</BeautifulMermaid>

// CORRECT — use one or the other
<BeautifulMermaid diagram={flowA} />
<BeautifulMermaid>{flowB}</BeautifulMermaid>
```

**3. `block={true}` (default) wraps output in a fenced code block. Use `block={false}` only when composing the ASCII string into another context manually.**

```tsx
// Default — output is ```\n<ascii>\n```\n\n
<BeautifulMermaid diagram={flow} />

// Raw — output is the ASCII string only, no fencing
<BeautifulMermaid diagram={flow} block={false} />
```

**4. Unicode box-drawing is the default. Switch to plain ASCII only for maximum terminal compatibility.**

```tsx
// Unicode (default) — ┌ ─ │ └ ┘ ►
<BeautifulMermaid diagram={flow} />

// ASCII — + - | >
<BeautifulMermaid diagram={flow} useAscii={true} />
```

## Props

Full props table: [references/beautiful-mermaid.md](references/beautiful-mermaid.md).

| Prop | Type | Default |
|---|---|---|
| `diagram` | `string` | — |
| `children` | `string` | — |
| `block` | `boolean` | `true` |
| `useAscii` | `boolean` | `false` |
| `paddingX` | `number` | `5` |
| `paddingY` | `number` | `5` |
| `boxBorderPadding` | `number` | `1` |

All other `AsciiRenderOptions` from `beautiful-mermaid` are forwarded via spread.

## Output shape

```
```\n<ascii art>\n```\n\n
```

With `block={false}`: raw ASCII string, no trailing newline added by this component.

## Supported diagram types

Flowcharts, state diagrams, sequence diagrams, class diagrams, ER diagrams, XY charts.
