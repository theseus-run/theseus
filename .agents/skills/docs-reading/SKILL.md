---
name: docs-reading
description: Use before coding or reviewing Theseus runtime, primitive, server, client, or architecture changes when docs may define the intended boundary, status, or domain vocabulary.
---

# Theseus Docs Reading

Use this skill before code changes when docs may contain the boundary contract.
The goal is to read the right docs without treating drafts or brainstorms as
implemented truth.

## Read Order

Always start with:

1. `docs/README.md`
2. the section README for the package or concept you are touching
3. the nearest current concept note in `direction`, `primitives`, `runtime`,
   or `clients`

Then read source code and tests. Docs guide what to inspect; code proves what
exists.

## Status Semantics

- `direction`, `primitives`, `runtime`, `clients`: current doctrine
  or current implementation notes.
- `drafts`: proposals, research, or POCs. Useful context, not authority.
- `brainstorms`: speculative ideas. Never implementation authority.
- `archive`: superseded history. Read only to avoid reintroducing old paths.
- `design-notes`: adopted or active rationale. Use to understand why a
  current concept exists, then verify against current code.

If a draft conflicts with current docs or code, current docs/code win. Mention
the conflict if it affects the task.

## Package Pointers

- Core primitives: `docs/primitives/primitives.md`, plus the specific note
  such as `tool.md` or `agent-comm.md`.
- Runtime: `docs/runtime/architecture.md`,
  `docs/runtime/mission-system.md`, and `docs/runtime/isolation.md`.
- Server: read runtime docs first, then server package code; server is a host
  adapter, not runtime owner.
- Client/operator surfaces: `docs/clients/README.md` and runtime command,
  control, query contracts.
- Design changes: also read `docs/design-notes/self-editable-harness.md`
  and relevant drafts only if the task is exploring new direction.

## Coding-Agent Rules

- Verify before asserting a doc is current.
- Do not implement from `drafts`, `brainstorms`, or `archive` unless
  the user explicitly asks to promote that design.
- When code and active docs disagree, report the mismatch and update docs if the
  task includes docs maintenance.
- Do not import archived crew, lock-session, queue RuntimeBus, or plugin-host
  architecture into current runtime work.
- Link docs with relative Markdown links when editing docs.
