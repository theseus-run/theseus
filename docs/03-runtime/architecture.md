# Runtime Architecture

> Status: active doctrine
> Last updated: 2026-04-26

Theseus runtime is the live mission process.

It is not the HTTP server, not the web interface, not a database wrapper, and
not a persistent-agent ontology. It is the boundary where Theseus stops being
static primitive definitions and becomes running work: missions, dispatches,
tools, capsules, stores, fibers, control signals, projections, and observable
state.

The useful analogy is a game engine:

```txt
host adapter        -> server, CLI, web, tests
runtime host        -> live world owner
mission             -> bounded objective
dispatch            -> active run
capsule             -> durable log and artifact substrate
systems             -> runtime behavior modules
sinks               -> side-effect consumers
projections         -> query/read models
stores              -> durable state backends
catalogs            -> capability resolution
snapshot            -> inspectable current state
```

Do not turn this into game cosplay. The point is operational control: pause,
resume, save, load, replay, inspect, steer, and recover.

## Self-Editable Harness

Theseus is not a plugin host. Theseus is a self-editable harness built from
durable primitives and statically wired runtime modules.

Modularity exists so agents can safely evolve the source:

- add a system for new runtime behavior
- add a satellite for dispatch-local policy or observation
- add a projection for queryable UI/debug/read state
- add a sink for event consumers and side effects
- add a capability module for tools, models, blueprints, or selection logic
- change static harness assembly when the runtime shape changes

Prefer source modules and tests over public extension APIs. The runtime should
make it obvious where to add a feature, how to wire it, what facts it emits, and
which tests prove it.

Do not introduce plugin manifests, dynamic loading, extension registries,
marketplace semantics, generic lifecycle hooks, ECS entities/components, or a
tick scheduler without an explicit design decision.

## Explicit Assembly

Theseus may support conventions and autoloading, but only through explicit
assembled harness modules.

If behavior affects what agents see, can do, observe, decide, or auto-load, the
module introducing that behavior must be visible in source wiring, named, typed,
ordered, and removable.

Good:

```typescript
const ring = Satellite.SatelliteRingLive([
  toolRecovery,
  agentsMdInstructionLoader({ paths: ["AGENTS.md"] }),
  policyGuard,
])
```

Bad:

```typescript
readAgentsMdIfExists()
mergeGlobalOrgProjectRules()
loadToolsFromPlugins()
enableAllToolsByDefault()
```

File existence alone must not change harness behavior unless an assembled
source module declares that convention. Opting out should mean removing or
changing a visible assembly entry, not hunting layered user/org/project config.

This rule applies to Theseus harness/runtime behavior: systems, satellites,
projections, sinks, tools/capabilities, instruction packs, convention loaders,
mission behavior, policy behavior, and model/instruction selection.

This rule does not prohibit ordinary server, web, build, deployment, or
environment configuration such as ports, database paths, provider credentials,
Vite config, deployment settings, HTTP/CORS settings, logging level, UI
preferences, or build tooling.

## Current Code Shape

The current runtime package is `packages/theseus-runtime`.

```txt
packages/theseus-runtime/src/
  index.ts                         public runtime contract barrel
  live.ts                          Effect Layer assembly
  registry.ts                      active dispatch handle registry
  tool-catalog.ts                  serialized spec -> concrete tools
  store/                           SQLite-backed dispatch and capsule stores
  runtime/
    types.ts                       command/control/query/session contracts
    host.ts                        TheseusRuntimeService implementation
    client.ts                      typed command/query helpers
    events.ts                      runtime event constructors
    operations.ts                  query/control execution
    systems/
      mission/system.ts            mission creation system
      dispatch/system.ts           dispatch launch/completion system
      capability/                  future capability hydration owner
    sinks/
      capsule/sink.ts              capsule event side effects
    projections/
      session/store.ts             session read model from durable events
```

`packages/theseus-server` is a host adapter. Its handlers call
`TheseusRuntime` and translate runtime errors into RPC errors. Server code must
not hydrate tools, mutate active dispatch state, bind capsules, or decide
continuation semantics.

## Runtime Host

The runtime host is the stable in-process command surface:

```typescript
interface TheseusRuntimeService {
  submit(command): Effect<RuntimeSubmission, RuntimeError>
  control(command): Effect<void, RuntimeError>
  query(query): Effect<RuntimeQueryResult, RuntimeError>
  getSnapshot(): Effect<RuntimeSnapshot>
}
```

The host owns live work orchestration. It routes commands to systems, controls
active handles, answers queries from projections/stores, and returns snapshots.

Host adapters may be HTTP RPC, CLI, tests, local desktop, worker process, or a
future daemon. Adapters translate transport payloads into runtime commands and
queries. They do not own runtime behavior.

## Commands, Control, Queries

Runtime uses three planes.

**Commands** create or start work:

- create mission
- start mission dispatch
- later: start crew member, continue mission, checkpoint

**Control** affects active work:

- inject guidance
- interrupt dispatch
- later: pause, resume, stop, scoped propagation

**Queries** inspect active or durable state:

- list/get missions
- list dispatches
- read messages
- read result
- read capsule events
- read active status

Do not model these as UI events. RPC procedures, web actions, CLI commands, and
tests should all adapt to the same runtime semantics.

## Systems

Systems own runtime behavior.

The game-engine analogy is useful here but should stay lightweight. Theseus is
not adopting ECS entities, components, tick loops, or generic schedulers.

A system is a named runtime behavior module that advances or reacts to live
harness state. It consumes commands, controls, runtime facts, or services, and
produces facts, state transitions, fibers, or calls into primitives.

Systems can be small and stateless. They do not need to be long-lived. The key
is named ownership of behavior.

Current systems:

- mission system: creates a mission, creates/binds a capsule, records the
  mission-capsule link
- dispatch system: hydrates a dispatch spec, restores continuation context,
  binds the current capsule, starts dispatch, registers the active handle,
  emits observable events, and watches completion

A system should exist when behavior has a clear runtime owner. Do not introduce
systems only for naming symmetry. Keep primitive logic in core primitives;
runtime systems compose primitives into live work.

When adding behavior, prefer a named system plus explicit wiring over a generic
registry. Static assembly is acceptable and desirable while the harness is
evolving because agents can inspect and edit it directly.

Not every module is a system:

- pure read/query state is a projection
- side-effect consumers are sinks
- dispatch-local middleware is Satellite
- static inventories are catalogs/resources
- serialization is a codec
- formatting and small transformations are ordinary helpers

Capability selection or hydration can become a system when it owns behavior,
not merely because a catalog exists.

## Runtime Facts And Capsules

Theseus has two durable truth buckets.

**Runtime facts** are the mechanical execution ledger. They answer:

```txt
What exactly happened in this run?
```

Examples:

- dispatch started
- model call requested
- tool called
- tool result returned
- satellite action emitted
- interrupt requested
- dispatch finished or failed
- projection updated

Runtime facts are run/session scoped, high-volume, replay/debug oriented, and
mostly not PR-facing. They are the right substrate for reconstruction,
projections, minimaps, telemetry, and failure analysis.

Runtime fact identity is the Effect/TypeScript `_tag`. Do not maintain a
parallel dot-case runtime event namespace. Internal code should emit tagged
facts through named constructors, for example `RuntimeFacts.dispatchStarted(...)`
returning `{ _tag: "DispatchStarted", ... }`.

Persistence may index `fact._tag` in a column, but the serialized tagged fact is
the source. First-party wire formats should preserve `_tag` unless an external
protocol requires adaptation. External protocols such as OpenTelemetry can be
served by dedicated sinks/adapters.

**Capsule events** are the durable mission record. They answer:

```txt
What matters about this mission?
```

Examples:

- mission created, locked, changed, or closed
- important decision made
- scope changed
- blocker found
- evidence produced
- artifact attached
- dispatch summarized
- result evaluated against criteria

Capsules are curated, mission scoped, durable across sessions, and review/PR
facing. For now, one Mission owns exactly one primary Capsule. A mission Capsule
may continue tomorrow from a different runtime session with a different set of
runtime facts.

Both buckets are sources of truth at different layers:

```txt
runtime facts = execution ledger
capsule       = mission record
```

Runtime facts may feed Capsule sinks, but Capsule is not a dump of raw runtime
facts. Do not store verbatim model calls, complete tool result streams, or every
low-level execution event in Capsule unless that detail is itself mission
evidence.

Capsule event types are mission-facing and do not need to match runtime fact
tags one-to-one. Converting a runtime fact into a Capsule entry is curation, not
a generic naming mapper.

Do not introduce free-floating Capsules or arbitrary nested Capsules. If future
side quests or sub-missions need separate black boxes, they should first become
mission-like child work envelopes; each child may then own its own Capsule. The
invariant remains: every Capsule belongs to exactly one structured work
envelope.

## Sinks

Sinks consume runtime facts and perform side effects.

Current sink:

- `CapsuleSink` writes mission and dispatch lifecycle events to the current
  capsule

Sinks keep side effects out of core control logic. If another side effect is
needed, prefer a named sink over scattering writes through systems or handlers.

`CapsuleSink` should curate mission-relevant facts from runtime execution. It
should not blindly mirror the execution ledger.

Examples that may become sinks later:

- runtime timeline journal
- telemetry fanout
- artifact persistence
- console/debug log
- client event stream

## Projections

Projections are read models.

Current projection:

- session projection links mission ids, dispatch ids, and capsule ids, then
  derives `MissionSession` and `DispatchSession` views from durable events and
  dispatch summaries

Projection code may read store tables directly when building a runtime read
model. It must not start work, execute tools, or mutate orchestration state.

New operator views should usually begin as projections over durable runtime
facts, not as hidden mutable state inside systems.

## Stores

Stores own durable state. They do not own orchestration.

Current stores:

- SQLite dispatch store: dispatch records, dispatch events, snapshots, restore,
  result/list support
- SQLite capsule store: capsule events and artifacts
- runtime link tables: cheap joins between missions, dispatches, and capsules

Runtime facts and Capsule events should both be append-only unless an explicit
compaction or snapshot boundary says otherwise. Keep their schemas and purposes
distinct.

## Catalogs

Catalogs resolve runtime capabilities.

Current catalog:

- `ToolCatalog` converts a serialized dispatch spec into concrete executable
  tools

Empty client tool selections mean no tools. Broad authority such as "all tools"
must be an explicit runtime/server-side decision, not a serialization accident.

Catalogs answer what exists and what may be selected. They do not execute work.

Capability selection may become its own system/module. Keep it statically wired
and typed before considering any dynamic extension mechanism.

## Active Registry

The active registry tracks live dispatch handles in the current process.

It is intentionally separate from durable stores:

- registry: active handle lookup, injection, interruption, live status
- stores: replayable events, snapshots, restoration, historical queries

Do not treat the registry as source-of-truth history. A completed dispatch may
still be queryable through durable storage after no active handle exists.

## Mission And Dispatch Semantics

Mission is the structured work envelope: objective, completion definition,
scope, authority, evidence, and lifecycle.

Mission exists so the runtime does not treat chat as the primary work object.
Freeform chat can be a client/interface mode, but runtime work should flow
through mission-like structure when it is meaningful enough to track.

The current mission system is replaceable and may gain mission types such as
implementation, research, brainstorm, review, planning, incident, or quick task.
Runtime modules should not hard-code one mission subtype unless they own that
subtype's behavior.

Dispatch is an active AI/model/tool run under a mission.

Continuation creates a child dispatch with inherited context and a parent link.
It must not mutate the old dispatch identity into a second run.

Capsule is the curated mission black box, not the raw runtime event log.
Runtime writes capsule events for mission-relevant facts, decisions, evidence,
artifacts, and outcomes. Workers should not be forced into logging ceremony for
normal work.

## Satellite Boundary

Satellite is core dispatch middleware. A `SatelliteRing` observes and influences
one dispatch through dispatch safe points.

Runtime may provide the ring to dispatch, observe resulting dispatch events, and
surface satellite actions. Runtime must not use Satellite as a synonym for
client transport, UI eventing, or global mission control.

## RuntimeBus Boundary

`RuntimeBus` is the operator/client transport concept: runtime facts out,
operator intent in. It is not currently the implemented runtime host in this
package, and it is not a primitive that replaces Satellite.

If a concrete bus is introduced, it should adapt to the command/control/query
surface instead of becoming a second runtime.

## Safe Points

Pause/resume are target semantics, not prompt tricks.

Pause should be cooperative and happen at meaningful safe points:

- before the next model call
- after a model response
- before tool execution
- after tool execution
- before the next dispatch iteration
- before launching child work
- between runtime command processing steps

Do not pretend runtime can freeze arbitrary JavaScript, provider calls, SQLite
writes, or subprocesses mid-stack. Let in-flight external work finish, journal
the result, then stop before the next meaningful action.

## Error Boundary

Runtime errors are runtime-level tagged errors.

Examples:

- unknown tool
- unknown mission or dispatch
- dispatch failed
- invalid command
- restore failed
- persistence failed
- provider unavailable

Adapters map these into RPC, CLI, UI, or test errors. Runtime must not throw
transport-specific errors.

## Compatibility Posture

Theseus runtime is still WIP. Prefer clean-break replacement over compatibility
layers when the design improves.

Runtime contracts may change, including commands, controls, queries, facts,
sessions, projections, and errors. The same pass must migrate first-party
adapters, stores, sinks, projections, tests, docs, and skills that depend on the
changed contract.

Rules:

- if `RuntimeCommand`, `RuntimeControl`, or `RuntimeQuery` changes, update
  server handlers and web/client callers in the same pass
- if a runtime fact changes, update stores, projections, sinks, serializers,
  tests, and docs in the same pass
- if Mission/Capsule semantics change, update active docs and skills in the
  same pass
- do not keep old/new command or event paths in parallel
- do not add legacy aliases, v1/v2 shims, compatibility re-exports, or migration
  layers unless explicitly requested

Clean-break does not mean partial. Every refactor should leave one coherent
first-party path.

## Testing Posture

Runtime tests should follow ownership boundaries.

Effect dependency injection gives Theseus clean graph cut points. Use them.
Default to isolated owner tests with fake services, fake stores, fake runtime
facts, deterministic clocks/ids/models, and package-local layers.

Testing is not only regression protection. In this repo, tests are executable
design context for future agents. They show concrete contracts, examples, and
expected behavior, which reduces hallucinated APIs and hidden assumptions.

Rules:

- systems get focused tests for command/control/fact/lifecycle behavior
- projections get focused tests for derivation from stored facts
- sinks get focused tests for curation and side effects
- capability/catalog modules get focused tests for selection and hydration
- codecs get focused tests for `_tag` round trips and unknown boundary handling
- registries/stores get direct tests for their behavior
- server adapter tests are required when public RPC behavior changes

Narrow package integration tests are allowed when they prove local assembly of a
few services. Broad runtime/server/web E2E tests are not the default and should
not be added without explicit user confirmation or an explicit wiring-proof
request.

## What Not To Reintroduce

The older persistent actor-daemon design is not active doctrine. Do not steer
runtime work toward:

- one root supervisor actor named Theseus
- persistent named agent fibers as the required runtime base
- fixed Forge/Atlas/Critic lifecycle as runtime architecture
- mailbox/controller/satellite semantics for every worker
- RuntimeBus queues as the only runtime command surface
- server-owned tool hydration or dispatch lifecycle

Crew, skills, named agents, planning loops, and specialist rosters are harness
scaffolding unless the primitive floor would break without them.

Also do not reintroduce plugin architecture as a substitute for modular source
structure. If a feature can be added by a typed module and static wiring, use
that path.

## Minimal Next Direction

Prefer small changes that make runtime work more controllable, inspectable, or
recoverable:

- keep server handlers thin
- keep command/control/query contracts explicit
- move side effects into named sinks
- move read models into named projections
- make continuation and parent links durable and queryable
- make active status truthful for running, done, and failed work
- reserve pause/resume vocabulary without faking hard suspension
- add tests around runtime systems and projections when behavior changes

Every new runtime concept should pass this test:

```txt
Would this make the next coding harness session more reliable, resumable,
inspectable, or reviewable?
```

If not, park it.
