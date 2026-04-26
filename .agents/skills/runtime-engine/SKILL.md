---
name: runtime-engine
description: Use when working on packages/theseus-runtime runtime host, command/control/query contracts, systems, sinks, projections, active dispatch registry, tool catalog hydration, SQLite runtime stores, snapshots, or runtime tests.
---

# Runtime Engine

Use this skill for `packages/theseus-runtime`.

Load `theseus-design` as companion context when the work affects mission,
dispatch, capsule, satellite, or runtime ownership doctrine. Load
`effect-concurrency-lifecycle` for fibers, interruption, streams, scopes,
queues, or background completion watchers. Load `effect-services-layers` for
Layer/service wiring.

## Read First

- `docs/03-runtime/architecture.md`
- `packages/theseus-runtime/package.json`
- `packages/theseus-runtime/src/index.ts`
- `packages/theseus-runtime/src/live.ts`
- `packages/theseus-runtime/src/runtime/types.ts`
- `packages/theseus-runtime/src/runtime/host.ts`
- nearest package-local tests before changing behavior

Then read only the relevant slice:

- commands/control/query: `src/runtime/types.ts`, `src/runtime/client.ts`, `src/runtime/operations.ts`
- mission behavior: `src/runtime/systems/mission/system.ts`
- dispatch behavior: `src/runtime/systems/dispatch/system.ts`
- side effects: `src/runtime/sinks/`
- read models: `src/runtime/projections/`
- active handles: `src/registry.ts`
- capability hydration: `src/tool-catalog.ts`
- durable state: `src/store/`

## Current Model

The runtime is a live mission/world host. It exposes command, control, query,
and snapshot ports through `TheseusRuntimeService`.

The runtime is not a plugin host. It is statically wired source that agents can
edit. Modularity exists to make source evolution safe, not to support opaque
third-party extensions.

The runtime owns:

- mission creation and mission/capsule links
- dispatch start, continuation, completion watching, and active handle registry
- current capsule binding for running work
- tool catalog hydration from serialized dispatch specs
- runtime command/control/query semantics
- projections over durable runtime state
- runtime-level errors

The runtime does not own:

- HTTP/RPC wire shape
- provider-specific transport details
- web UI state
- fixed crew/product ontology
- primitive implementation internals from core

## Boundaries

- `theseus-core` owns primitives: Mission, Tool, Capsule, Dispatch, Satellite.
- `theseus-runtime` composes primitives into live work.
- `theseus-server` adapts transport to runtime commands and queries.
- `icarus-web` renders operator state and sends operator intent.

Do not move server concerns into runtime. Do not move runtime behavior into
server handlers. Do not turn crew scaffolding into required runtime structure.
Do not introduce plugin APIs, dynamic loading, manifests, extension registries,
or generic lifecycle hooks unless explicitly requested.

## Module Shape

- `host.ts` should route and compose; avoid growing behavior there.
- `types.ts` owns runtime protocol contracts; keep variants explicit and
  exhaustively matched.
- `systems/*/system.ts` owns live behavior for one runtime concept.
- `sinks/*` owns side-effect consumers.
- `projections/*` owns read models and query derivation.
- `store/*` owns durable persistence backends.
- `registry.ts` owns active in-process handles only.

Add a new module only when it names a real runtime responsibility. Avoid generic
`utils`, mixed service bags, and old/new parallel paths.

## Feature Addition Pattern

When adding runtime capability, prefer this order:

1. Identify whether the feature is a system, satellite, projection, sink, or
   capability module.
2. Add or extend the narrow typed module.
3. Emit named runtime facts if other modules or operators need to observe it.
4. Wire it statically through `host.ts`, `live.ts`, or the nearest existing
   assembly point.
5. Add focused tests next to the owning package/module.

Examples:

- file minimap: add file activity facts, a file activity system or dispatch
  observation seam, and a projection
- stricter policy: add a `Satellite` and policy events
- alternate mission behavior: replace or fork mission system wiring while
  preserving useful command/query contracts
- new audit output: add a sink

If the proposed design starts with a public plugin API, first try a typed source
module and static wiring instead.

## Runtime Semantics

- Commands start or create work.
- Control affects active work.
- Queries inspect active or durable state.
- Snapshots summarize current state without becoming a second store.
- Continuation creates a child dispatch with inherited context and a parent
  link. Do not mutate the old dispatch into a new run.
- Empty tool selections mean no tools. Broad authority must be explicit.
- Active registry state is not durable history.
- Runtime events and capsule events should be append-only facts.
- Keep Mission/Capsule assumptions local to the systems, sinks, and projections
  that actually need them. Future work models should not require rewriting
  unrelated runtime modules.

## Satellite And RuntimeBus

Satellite is dispatch-scoped middleware from core. Runtime provides a
`SatelliteRing` to dispatch and observes dispatch events.

`RuntimeBus` is an operator/client transport concept. If implemented, it should
adapt to runtime command/control/query semantics. Do not use it as a synonym for
Satellite or as a second runtime host.

## Verification

- Read package scripts before running commands.
- For runtime-only type changes, prefer `bun run typecheck` at the root when
  public contracts or server imports are affected.
- For runtime behavior changes, run focused runtime tests first:
  `bun test packages/theseus-runtime/src/runtime`
- Run server/core tests when RPC serialization, dispatch events, or primitive
  contracts change.
