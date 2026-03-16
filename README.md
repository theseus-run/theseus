# theseus

An AI agent orchestration system for running multi-step missions with specialist agents, structured audit trails, and enough opinions to be reliable in production.

## Packages

These packages are the open parts of the harness — independently useful, zero coupling to the rest of the system.

### `jsx-md` family

- **[`@theseus.run/jsx-md`](./packages/jsx-md)**
    
    JSX/TSX renderer for Markdown. Write agent prompts and LLM instructions as typed, composable components. Zero runtime dependencies.

- **[`@theseus.run/jsx-md-beautiful-mermaid`](./packages/jsx-md-beautiful-mermaid)**

    `BeautifulMermaid` component for `@theseus.run/jsx-md`. Renders Mermaid diagrams as ASCII/Unicode art via [`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid).


## About

Theseus lives at [theseus.run](https://theseus.run). Built by [Roman Dubinin](https://romanonthego.com).

MIT
