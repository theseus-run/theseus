# theseus

An AI agent orchestration system for running multi-step missions with specialist agents, structured audit trails, and enough opinions to be reliable in production.

## Packages

These packages are the open parts of the harness — independently useful, zero coupling to the rest of the system.

| Package | Description |
| --- | --- |
| [`@theseus.run/jsx-md`](./packages/jsx-md) | JSX/TSX renderer for Markdown. Write agent prompts and LLM instructions as typed, composable components. Zero runtime dependencies. |

## Using without Theseus

Each package works on its own. You don't need the full harness to use them. `bun add @theseus.run/jsx-md` and you're done — no lock-in, no required configuration beyond what the package itself needs.

## About

Theseus lives at [theseus.run](https://theseus.run). Built by [Roman Dubinin](https://romanonthego.com).

MIT
