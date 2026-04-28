---
status: current
owner: docs
kind: map
updated: 2026-04-28
---

# Coding Agent Reading Map

Use this map before coding or reviewing changes where Theseus concepts matter.
Docs orient the work; source code verifies what exists.

## Start Here

1. [Docs index](../README.md)
2. The section README for the package or concept
3. The nearest current concept note
4. Relevant source files and tests

## Runtime Work

Read:

- [Runtime index](../runtime/README.md)
- [Runtime architecture](../runtime/architecture.md)
- [Mission system](../runtime/mission-system.md)
- [Isolation and workspaces](../runtime/isolation.md)

Then inspect `packages/theseus-runtime`.

Do not reintroduce archived queue RuntimeBus, persistent named-agent daemon, or
file-backed mission lock/session plans.

## Primitive Work

Read:

- [Primitive index](../primitives/README.md)
- [Primitive stack](../primitives/primitives.md)
- the specific primitive note, such as [tool](../primitives/tool.md) or
  [agent-comm](../primitives/agent-comm.md)

Then inspect `packages/theseus-core` and nearest tests.

## Server Work

Read runtime docs first. Server adapts transport and providers to runtime; it
does not own runtime behavior.

Then inspect `packages/theseus-server`.

## Client Work

Read:

- [Clients index](../clients/README.md)
- runtime command/control/query contracts in source

Client code is an operator surface. It must not become runtime orchestration.

## Design Exploration

Read current docs first. Then use:

- [Design notes](../design-notes/README.md) for adopted rationale
- [Drafts](../drafts/README.md) for proposals and POCs
- [Brainstorms](../brainstorms/README.md) for wild ideas
- [Archive](../archive/README.md) to avoid restoring superseded designs

Drafts, brainstorms, and archive are not implementation authority unless the
user explicitly asks to promote them.
