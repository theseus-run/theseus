# `@theseus.run/jsx-md-beautiful-mermaid`

`BeautifulMermaid` component for `@theseus.run/jsx-md`. Converts a Mermaid diagram to ASCII/Unicode art — synchronous, no DOM, no SVG.

---

## Why separate

[`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid) ships the ELK.js layout engine and weighs ~2.1 MB unpacked. `@theseus.run/jsx-md` is zero-dependency on purpose. This package is the opt-in bridge for when you need diagrams in your markdown output.

---

## Install

```bash
bun add @theseus.run/jsx-md @theseus.run/jsx-md-beautiful-mermaid
# npm install @theseus.run/jsx-md @theseus.run/jsx-md-beautiful-mermaid
# pnpm add @theseus.run/jsx-md @theseus.run/jsx-md-beautiful-mermaid
```

Ships TypeScript source and compiled ESM output with sourcemaps. Bun resolves the TypeScript source directly. Node.js (≥18) and bundlers use the compiled output — no configuration needed.

---

## Usage

```tsx
import { render, H2, P } from "@theseus.run/jsx-md";
import { BeautifulMermaid } from "@theseus.run/jsx-md-beautiful-mermaid";

const ArchitectureSection = () => (
  <>
    <H2>Request Flow</H2>
    <P>Each agent mission follows this path:</P>
    <BeautifulMermaid>
      {`graph LR
        User --> Orchestrator
        Orchestrator --> Planner
        Orchestrator --> Executor
        Executor --> Tools
        Executor --> Orchestrator`}
    </BeautifulMermaid>
  </>
);

const prompt = render(<ArchitectureSection />);
```

Output:

````
## Request Flow

Each agent mission follows this path:

```
┌──────┐     ┌──────────────┐     ┌─────────┐
│      │     │              │     │         │
│ User │────►│ Orchestrator │────►│ Planner │
│      │     │              │     │         │
└──────┘     └──────────────┘     └─────────┘
                    │
                    ▼
               ┌──────────┐
               │          │
               │ Executor │────►  Tools
               │          │
               └──────────┘
```
````

`render()` is synchronous — no await, no promises.

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `diagram` | `string` | — | Mermaid source. |
| `children` | `string` | — | Mermaid source as children (template literal friendly). `diagram` prop takes precedence. |
| `block` | `boolean` | `true` | Wrap output in a fenced code block. |
| `useAscii` | `boolean` | `false` | Use plain ASCII (`+`, `-`, `|`, `>`) instead of Unicode box-drawing (`┌`, `─`, `│`, `►`). |
| `paddingX` | `number` | `5` | Horizontal spacing between nodes. |
| `paddingY` | `number` | `5` | Vertical spacing between nodes. |
| `boxBorderPadding` | `number` | `1` | Padding inside node boxes. |

All other `beautiful-mermaid` ASCII options are forwarded directly via spread.

---

## Supported diagram types

Inherited from `beautiful-mermaid`: flowcharts, state diagrams, sequence diagrams, class diagrams, ER diagrams, XY charts.

---

## License

MIT — see [LICENSE](../../LICENSE).

Built by [Roman Dubinin](https://romanonthego.dev). Part of [Theseus](https://theseus.run).
