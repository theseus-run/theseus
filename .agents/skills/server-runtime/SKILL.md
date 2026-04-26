---
name: server-runtime
description: Use when working on packages/theseus-server RPC/HTTP process assembly, runtime layer wiring, server handlers, provider configuration, or server-side serialization.
---

# Server Runtime

Use this skill for `packages/theseus-server`. For runtime host, systems, sinks,
projections, active registry, tool catalog, or SQLite runtime stores, use the
`runtime-engine` skill instead.

## Read First

- `packages/theseus-server/src/handlers.ts`
- `packages/theseus-server/src/index.ts`
- `packages/theseus-server/src/serialize.ts`
- `packages/theseus-runtime/src/index.ts`
- `packages/theseus-runtime/src/live.ts`

## Boundaries

- Handlers stay at the transport boundary. They call `TheseusRuntime` and map runtime errors to RPC errors.
- `TheseusRuntime` owns dispatch lifecycle, tool hydration, current capsule binding, registry updates, and persistence side effects.
- Tool catalog code lives in `packages/theseus-runtime`. Do not let handlers hydrate tools directly.
- Serialization belongs in `serialize.ts`; do not scatter wire-shape conversion through runtime logic.
- SQLite persistence belongs behind runtime store/capsule services or runtime projections, not server handlers.
- Server may assemble layers and providers. It must not become the runtime.
- Do not add plugin routing, dynamic extension loading, or extension registry
  semantics in server. Server exposes/adapts runtime commands and queries; it
  does not define the harness extension model.

## Error Rules

- Runtime errors should be typed tagged errors.
- Handler error mapping should be explicit and stable for clients.
- Do not leak raw causes through RPC responses unless the API contract says so.

## Verification

- Run `bun run typecheck` after runtime, handler, or RPC schema changes.
- Run relevant server/core tests when dispatch lifecycle, persistence, or serialization behavior changes.
