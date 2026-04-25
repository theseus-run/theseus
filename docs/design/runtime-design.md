# Runtime Design Intent

Theseus runtime is the live process that owns active work.

It is not the HTTP server, not the web interface, not a database wrapper, and
not a game engine. It is the boundary where Theseus stops being static
definitions and becomes a running system: missions, dispatches, agents, grunts,
tools, capsules, stores, fibers, control signals, timelines, and observable
state.

This document is intent-level. It should guide topology, ownership, and naming,
but it should not freeze exact TypeScript shapes before the POC proves them.

## Core Principle

Transport adapts. Runtime owns.

If replacing WebSocket RPC with CLI, TUI, tests, or a local desktop shell would
not change the behavior, the behavior belongs to runtime.

If replacing Theseus runtime with a remote process would not change the
transport protocol, the behavior belongs to the server/transport adapter.

The runtime is the live Theseus process. The server is just one way to talk to
it.

## Why Runtime Exists

Most current coding harnesses treat active work like an opaque promise:

```txt
start task -> wait for completion or interrupt
```

That is too weak for agentic work. It makes it hard to:

- pause without killing work
- resume from a known point
- steer a running task
- inspect active state
- preserve subagent progress
- record a reconstructable timeline
- distinguish runtime control from prompt content
- replay or restore work later

Theseus needs a runtime because agent work is not only request/response. It is
active, scoped, observable, steerable work with state.

## Prior Art To Borrow

Theseus is not a game, but games have solved many runtime-control problems that
agent harnesses are now rediscovering.

Useful ideas to borrow:

- pause and resume
- save and load
- replay from normalized events
- timeline/event history
- active entities with lifecycle state
- systems that run continuously
- sinks that consume side-effect intents
- snapshots for inspection and recovery
- host adapters separate from the runtime loop

The point is not game flavor. The point is operational control.

The useful analogy is:

```txt
server / UI / CLI       -> host adapter
runtime                 -> live world/process
mission                 -> bounded objective
dispatch                -> active run
agent / grunt           -> actor under control
capsule                 -> durable memory/artifact substrate
timeline                -> reconstructable event history
sinks                   -> side-effect consumers
systems                 -> long-lived runtime processes
```

Use the metaphor where it clarifies lifecycle. Do not let it become cosplay or
an excuse for heavy abstraction.

## Server vs Runtime

The server is boring infrastructure.

It should own:

- HTTP/WebSocket lifecycle
- RPC procedure registration
- wire payload decoding and encoding
- runtime error to transport error mapping
- authentication and request policy later
- process-level host concerns such as port and workspace path

It should not own:

- tool resolution
- dispatch continuation semantics
- active dispatch registry mutation
- capsule scoping
- mission lifecycle
- runtime pause/resume/steer behavior
- primitive service composition
- event journaling decisions

The runtime owns those.

## Runtime Responsibilities

Runtime owns the live Theseus world:

- active missions
- active dispatches
- active agents and grunts
- active fibers
- tool and actor catalogs
- scoped current services
- runtime commands
- runtime control state
- event timeline
- snapshots
- persistence sinks
- runtime errors
- observable status

Runtime composes primitives. It should not become a replacement for primitives.

Dispatch remains the raw LLM/tool loop. Tool remains the typed executable
capability. Capsule remains durable memory/artifacts. Satellite remains
middleware/observation/policy. Runtime wires them into a live process.

## Host Adapters

HTTP RPC is only one host adapter.

Other possible hosts:

- CLI
- TUI
- local desktop shell
- test harness
- worker process
- future daemon
- external orchestration bridge

The runtime should be useful without the web server. A host sends commands,
observes events, and renders state. It does not decide how Theseus work is run.

## Commands And Queries

Runtime exposes commands for changing the live process:

- start work
- continue work
- inject or steer
- pause
- resume
- interrupt
- stop

Runtime exposes queries for inspection:

- list active and historical work
- read messages
- read timeline events
- read capsule events and artifacts
- inspect runtime status
- await result

Commands and queries are not transport-specific. RPC procedures, CLI commands,
and tests should all adapt to the same runtime semantics.

## Control Semantics

Interrupt should not be the only way to stop and think.

Interrupt is terminal control. It stops active work and may discard the ability
to continue that same run.

Pause is non-terminal control. It asks runtime to reach a safe point, preserve
state, and wait for resume, steer, or interrupt.

Resume continues from the preserved state.

Steer changes future work. It may add instructions, amend context, or redirect
the next action. Steering is not the same as pausing; pause is control, steer is
new intent.

The runtime should treat these as first-class lifecycle controls, not as prompt
text tricks.

## Safe Points

Pause is cooperative. Theseus should not pretend it can freeze arbitrary
JavaScript, network requests, SQLite writes, or tool subprocesses mid-stack.

Pause should take effect at meaningful safe points:

- before the next model call
- after a model response is received
- before tool execution
- after tool execution
- before the next dispatch iteration
- before launching child actors
- between runtime command processing steps

If pause is requested during an in-flight provider call or tool call, the
runtime should let that operation finish, journal the result, and stop before
the next meaningful action.

This preserves state without corrupting work.

## Control Scope

Control should be targetable.

Possible scopes:

- one dispatch
- one grunt
- one agent
- one mission
- the whole runtime as an emergency escape hatch

Runtime-level pause should be rare. Most control should apply to a mission or
active run. Pausing a mission may eventually propagate to child agents and
grunts at their safe points.

The design should leave room for scoped propagation without forcing it into the
first implementation.

## Continuation

Continuation is not reuse.

Continuing from previous work should create a new child run with inherited
context and a parent link. It should not keep writing into the old run identity.

This gives Theseus a tree of work:

```txt
original dispatch
  -> continuation dispatch
    -> child grunt dispatch
```

The timeline remains reconstructable. The old run is not mutated into an
ambiguous new run.

## Save, Load, Snapshot, Replay

Theseus cannot make LLM calls deterministic, but it can make orchestration
auditable.

Runtime should preserve:

- normalized runtime events
- dispatch inputs
- model/tool boundaries
- tool results and failures
- control events
- snapshots sufficient for restoration
- capsule logs and artifacts

Save/load means restoring from durable state at a meaningful boundary.

Replay means reconstructing what happened from normalized events, not replaying
raw UI clicks or provider wire noise.

This is a direction, not a requirement for the first server refactor.

## Timeline

Runtime should produce a reconstructable timeline of meaningful state changes.

The timeline should eventually answer:

- what started
- who or what started it
- under which mission/context
- what tools were called
- what results returned
- what control signals were requested
- where pause was reached
- what was resumed or interrupted
- what failed
- what artifacts were produced

The timeline is not just UI decoration. It is the basis for debugging,
resumption, review, and trust.

## Systems

Systems are long-lived runtime processes.

Examples may eventually include:

- active dispatch supervision
- telemetry
- compaction
- policy observation
- provider health
- artifact indexing
- background review
- event fanout

Systems should be Effect-owned and supervised. They may fail, recover, or be
marked fatal depending on their role.

Do not introduce systems just for naming symmetry. A system should exist only
when it owns long-lived behavior.

## Sinks

Sinks consume runtime events or outputs and perform side effects.

Examples:

- SQLite journal sink
- capsule log sink
- console log sink
- web stream fanout sink
- telemetry sink
- artifact sink

Sinks keep side effects out of core control logic. Runtime emits meaningful
events; sinks decide how those events are persisted, displayed, or forwarded.

For the POC, some sink behavior may be direct calls. The boundary should still
be clear enough to extract later.

## Catalogs

Runtime owns capability catalogs.

Examples:

- tool catalog
- actor catalog
- blueprint/spec presets
- future provider catalog

Client-provided empty capability lists should not accidentally mean "all
capabilities." Broad authority should be an explicit runtime decision, not a
serialization accident.

Catalogs answer what exists and what may be selected. They should not execute
work.

## Stores

Stores own durable state. They should not own orchestration.

Examples:

- dispatch records, events, snapshots, restore, list
- capsule records, events, artifacts
- mission records and lifecycle later

Stores should not start fibers, resolve tools, or interpret agent protocol.
Runtime coordinates stores with active work.

## Error Boundary

Runtime should have runtime errors.

Transport-specific errors belong at the transport boundary. Runtime should not
throw RPC errors, HTTP errors, or UI-specific failures.

Examples of runtime-level failures:

- unknown tool
- unknown dispatch
- invalid command
- restore failed
- persistence failed
- dispatch failed
- provider unavailable

Adapters map these into RPC, CLI, UI, or test errors.

## Minimal First Slice

The first implementation should be small.

Do:

- extract runtime ownership out of RPC handlers
- keep server handlers thin
- make continuation create child runs
- bind one current capsule per dispatch
- make capability resolution explicit
- make active status reflect done and failed
- ensure runtime state directory creation is owned by the storage boundary
- reserve pause/resume vocabulary in runtime control

Do not yet build:

- universal project management ontology
- full mission control hierarchy
- elaborate actor scheduling
- external interop protocols
- deterministic LLM replay
- rich pause propagation across all nested actors
- large system/sink framework

Every new runtime primitive should pass this test:

```txt
Would this make the next coding harness session more reliable, resumable,
inspectable, or reviewable?
```

If not, park it.

## Design Posture

Theseus runtime should be boring where correctness matters and expressive where
lifecycle matters.

The goal is not to make a game. The goal is to make agent work controllable in
ways game runtimes have already made obvious: pause, resume, save, load, replay,
inspect, and steer.

Runtime is the command surface and live state owner. Server is transport.
Primitives remain primitives.
