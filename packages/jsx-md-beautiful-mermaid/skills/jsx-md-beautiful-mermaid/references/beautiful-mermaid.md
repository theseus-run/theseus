# BeautifulMermaid — reference

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `diagram` | `string` | — | Mermaid diagram source. Use when source is a variable. |
| `children` | `string` | — | Mermaid diagram source as template literal children. `diagram` prop takes precedence if both are provided. |
| `block` | `boolean` | `true` | Wrap ASCII output in a fenced code block (```` ``` ````). Disable to get the raw ASCII string. |
| `useAscii` | `boolean` | `false` | Use plain ASCII characters (`+`, `-`, `|`, `>`) instead of Unicode box-drawing (`┌`, `─`, `│`, `►`). |
| `paddingX` | `number` | `5` | Horizontal spacing between nodes. |
| `paddingY` | `number` | `5` | Vertical spacing between nodes. |
| `boxBorderPadding` | `number` | `1` | Padding inside node boxes. |

All remaining props extend `AsciiRenderOptions` from `beautiful-mermaid` (minus `colorMode`, which is irrelevant in non-terminal contexts) and are forwarded directly to `renderMermaidASCII()`.

## Diagram syntax

The header **must be on its own line**. Single-line syntax (`graph LR; A --> B`) is not supported.

### Flowchart

```
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Done]
  B -->|No| D[Retry]
  D --> A
```

Directions: `TD` (top-down), `LR` (left-right), `BT` (bottom-top), `RL` (right-left).

### State diagram

```
stateDiagram-v2
  [*] --> Idle
  Idle --> Processing: start
  Processing --> Complete: done
  Complete --> [*]
```

### Sequence diagram

```
sequenceDiagram
  Alice->>Bob: Hello Bob!
  Bob-->>Alice: Hi Alice!
```

### Class diagram

```
classDiagram
  Animal <|-- Duck
  Animal: +int age
  Duck: +swim()
```

### ER diagram

```
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
```

### XY chart

```
xychart-beta
  title "Monthly Revenue"
  x-axis [Jan, Feb, Mar, Apr, May, Jun]
  y-axis "Revenue ($K)" 0 --> 500
  bar [180, 250, 310, 280, 350, 420]
```

## Output examples

### Unicode (default)

```
┌───┐     ┌───┐     ┌───┐
│   │     │   │     │   │
│ A │────►│ B │────►│ C │
│   │     │   │     │   │
└───┘     └───┘     └───┘
```

### ASCII (`useAscii={true}`)

```
+---+     +---+     +---+
|   |     |   |     |   |
| A |---->| B |---->| C |
|   |     |   |     |   |
+---+     +---+     +---+
```
