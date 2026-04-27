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
- tool catalog hydration: `src/tool-catalog.ts`
- durable state: `src/store/`
- isolation doctrine: `docs/03-runtime/isolation.md`

## Current Model

The runtime is a live mission/world host. It exposes command, control, query,
and snapshot ports through `TheseusRuntimeService`.

The runtime is not a plugin host. It is statically wired source that agents can
edit. Modularity exists to make source evolution safe, not to support opaque
third-party extensions.

The runtime should be isolation-native. Do not assume tool execution happens
against the host checkout. Sandbox is execution isolation; Workspace is
source-state isolation inside a Sandbox.

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

## Explicit Assembly

Behavior that changes what Theseus agents see, can do, observe, decide, or
auto-load must be explicit in harness assembly.

Allowed pattern:

- named source module
- typed inputs/outputs
- explicit order
- visible wiring in `live.ts`, `host.ts`, a ring, or another assembly module
- opt out by removing/changing the assembly entry

Disallowed pattern:

- hidden file-existence behavior
- implicit `AGENTS.md`/skill/instruction loading
- import-order registration
- auto-discovered tools/satellites/systems
- layered user/org/project behavior merges that affect agent execution
- broad tool/model grants by default

Autoloading is allowed when it is owned by an explicit assembled module, such
as an `agentsMdInstructionLoader` satellite/source that can be removed from the
ring or harness assembly.

This rule is scoped to Theseus harness/runtime behavior. It does not forbid
ordinary server, web, build, deployment, or environment configuration.

## Module Shape

- `host.ts` should route and compose; avoid growing behavior there.
- `types.ts` owns runtime protocol contracts; keep variants explicit and
  exhaustively matched.
- `systems/*/system.ts` owns runtime behavior for one concept: commands,
  controls, events, or services in; events, state transitions, fibers, or
  primitive calls out.
- `sinks/*` owns side-effect consumers.
- `projections/*` owns read models and query derivation.
- `store/*` owns durable persistence backends.
- `registry.ts` owns active in-process handles only.

Add a new module only when it names a real runtime responsibility. Avoid generic
`utils`, mixed service bags, and old/new parallel paths.

A system does not need to be long-lived or heavyweight, but it must own a
behavior slice that advances or reacts to live harness state. Do not call every
module a system. Pure read shape is a projection. Side-effect consumer is a
sink. Dispatch-safe-point middleware is Satellite. Static inventory is a
catalog/resource unless it owns selection or hydration behavior.

## Feature Addition Pattern

When adding runtime behavior, prefer this order:

1. Identify whether the feature is a system, satellite, projection, sink, or
   tool/model catalog module.
2. Add or extend the narrow typed module.
3. Emit named RuntimeEvents if other modules or operators need to observe it.
4. Wire it statically through `host.ts`, `live.ts`, or the nearest existing
   assembly point.
5. Add focused tests next to the owning package/module.

Examples:

- file minimap: add file activity events, a file activity system or dispatch
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
- RuntimeEvents and CapsuleEvents should be append-only events.
- Sandbox and Workspace are distinct axes:
  - Sandbox controls execution isolation: process space, filesystem root,
    network, secrets, mounts, resources, and host access.
  - Workspace controls source-state isolation: checkout, branch, patch, diff,
    dirty state, and merge base.
- A git worktree is a Workspace provider, not a security Sandbox.
- Tools and model calls should execute against a Sandbox and usually target a Workspace.
  Promotion across workspace/sandbox boundaries should be explicit.
- Do not lock runtime contracts to Docker Sandboxes, Sandcastle, Vercel
  Sandbox, E2B, Daytona, Modal, Podman, or git worktrees. Treat them as
  provider candidates wired explicitly through source.
- RuntimeEvent identity is `_tag`. Do not create a parallel dot-case runtime
  event namespace. Persist `_tag` for indexing and serialize the tagged event as
  JSON.
- Emit RuntimeEvents through named constructors in `runtime/events.ts` or the
  owning event module; do not duplicate `_tag` literals across systems.
- Event streams are scoped by source and audience:
  - DispatchEvents are dispatch-loop events from the Dispatch primitive
  - RuntimeEvents are the mechanical runtime ledger for one run/session
  - CapsuleEvents are curated mission record entries for review, evidence,
    decisions, artifacts, and continuation
- For now, one Mission owns exactly one primary Capsule. Do not introduce
  free-floating Capsules or arbitrary nested Capsules.
- Future side quests/sub-missions that need separate black boxes should become
  mission-like child work envelopes first; each child may then own its own
  Capsule.
- Do not mirror raw model calls or complete tool result streams into Capsule by
  default. Capsule sinks should select mission-relevant events.
- CapsuleEvent strings and OpenTelemetry span/metric names are adapter outputs,
  not RuntimeEvent identities.
- Keep Mission/Capsule assumptions local to the systems, sinks, and projections
  that actually need them. Future work models should not require rewriting
  unrelated runtime modules.
- Mission is primitive as structured work intent, but the current mission schema
  and mission types are evolvable. Do not hard-code one implementation-mission
  lifecycle into unrelated runtime systems.

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

## Testing Doctrine

Use Effect DI to cut the graph and test the behavior owner in isolation.

Default to focused owner tests with fake layers, fake services, fake stores,
fake RuntimeEvents, deterministic clocks/ids/models, and package-local test
helpers.

Expected tests:

- systems: command/control/fact/lifecycle behavior
- projections: derivation from stored events
- sinks: curation and side effects
- tool/model catalog modules: selection and hydration
- codecs: `_tag` round trips and unknown boundary handling
- registries/stores: direct behavior

Tests are executable design context for future agents. Prefer explicit,
readable assertions over one broad scenario that hides the contract.

Narrow package integration tests are allowed when they prove local assembly of a
few services. Do not add broad runtime/server/web E2E tests without explicit
user confirmation or an explicit wiring-proof request.

## Compatibility

Default to clean-break replacement. Do not preserve stale runtime contracts with
aliases, shims, v1/v2 paths, compatibility re-exports, or parallel old/new
flows unless the user explicitly requests back compatibility.

When changing runtime contracts:

- update first-party server/web/client callers in the same pass
- update stores, projections, sinks, serializers, tests, docs, and skills that
  consume changed RuntimeEvents
- update active design docs and skills when Mission/Capsule semantics change
- leave one coherent path, not a migration maze
