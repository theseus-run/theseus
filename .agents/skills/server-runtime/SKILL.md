---
name: server-runtime
description: Use when working on packages/theseus-server runtime wiring, RPC handlers, tool catalog hydration, dispatch registry, SQLite persistence, or server-side serialization.
---

# Server Runtime

Use this skill for `packages/theseus-server`.

## Read First

- `packages/theseus-server/src/runtime.ts`
- `packages/theseus-server/src/handlers.ts`
- `packages/theseus-server/src/tool-catalog.ts`
- `packages/theseus-server/src/registry.ts`
- `packages/theseus-server/src/serialize.ts`

## Boundaries

- Handlers stay at the transport boundary. They call `TheseusRuntime` and map runtime errors to RPC errors.
- `TheseusRuntime` owns dispatch lifecycle, tool hydration, current capsule binding, registry updates, and persistence side effects.
- Tool catalog code resolves serialized tool specs into concrete tools. Do not let handlers hydrate tools directly.
- Serialization belongs in `serialize.ts`; do not scatter wire-shape conversion through runtime logic.
- SQLite persistence should remain behind store/capsule services, except for narrowly scoped read models that already live in runtime.

## Error Rules

- Runtime errors should be typed tagged errors.
- Handler error mapping should be explicit and stable for clients.
- Do not leak raw causes through RPC responses unless the API contract says so.

## Verification

- Run `bun run typecheck` after runtime, handler, or RPC schema changes.
- Run relevant server/core tests when dispatch lifecycle, persistence, or serialization behavior changes.
