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

## Sinks

Sinks consume runtime facts and perform side effects.

Current sink:

- `CapsuleSink` writes mission and dispatch lifecycle events to the current
  capsule

Sinks keep side effects out of core control logic. If another side effect is
needed, prefer a named sink over scattering writes through systems or handlers.

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

Durable events should be append-only unless an explicit compaction or snapshot
boundary says otherwise.

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

Mission is the user-facing unit of intent: goal, criteria, capsule, and eventual
evidence.

Dispatch is an active AI/model/tool run under a mission.

Continuation creates a child dispatch with inherited context and a parent link.
It must not mutate the old dispatch identity into a second run.

Capsule is the durable mission/run log. Runtime writes capsule events as facts
about what happened; workers should not be forced into logging ceremony for
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
