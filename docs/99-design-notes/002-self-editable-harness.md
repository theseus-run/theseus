# Design Note 002: Self-Editable Harness

> Status: active rationale
> Date: 2026-04-26

## Decision

Theseus should optimize for source evolution by agents, not a plugin platform.

The extension model is:

```txt
ask Theseus to add or replace a typed source module
wire it statically into the harness
add focused tests
```

It is not:

```txt
install opaque plugin
load manifest
route through generic lifecycle API
preserve compatibility for unknown third parties
```

## Why

Theseus is a harness that builds itself. The source code is the extension
surface. A future agent should be able to add a new runtime system, satellite,
projection, sink, or capability module directly, then verify the behavior with
deterministic tests.

Plugin APIs would push the project toward the wrong early constraints:

- manifests
- dynamic loading
- compatibility promises
- generic lifecycle hooks
- sandboxed third-party modules
- marketplace-style packaging
- opaque extension boundaries

Those constraints make sense for third-party ecosystems. They are premature for
an AI-maintained harness whose main advantage is that it can edit and improve
itself.

This implies a clean-break compatibility posture while the runtime is WIP.
Runtime commands, events, projections, and mission/capsule semantics may change,
but the same change must update first-party adapters, stores, tests, docs, and
skills. Do not keep old/new runtime paths in parallel unless back compatibility
is explicitly requested.

## Vocabulary

- **System**: owns runtime behavior.
- **Satellite**: dispatch-local policy/observation middleware.
- **Projection**: queryable read/debug/UI state.
- **Sink**: side-effect or event consumer.
- **Capability**: tools, models, blueprints, and selection/hydration logic.
- **Harness**: the statically assembled runtime shape.

## Rule

If an extension point requires a stable public plugin API before it can be
useful, it is probably too heavy.

If an extension point means "add a typed module, emit durable events, wire it
into the harness, and test it," it fits Theseus now.

## Consequence

Runtime code should remain modular but not generic for its own sake:

- small files with obvious ownership
- typed boundaries
- named RuntimeEvents
- systems for runtime behavior over live harness state, not generic modules
- projections over durable events
- side effects isolated in sinks
- static wiring in host/live assembly
- tests close to owning systems

Avoid god files, hidden cross-system mutation, and product-specific coupling
that spreads Mission/Capsule assumptions through unrelated modules.

Tests are part of the design surface. Because Theseus uses Effect dependency
injection, runtime behavior should usually be tested by cutting the graph at the
owning service/module and providing fake layers. Broad E2E tests are a deliberate
wiring proof, not the default. Add them only after explicit confirmation.

## Explicit Assembly

Conventions and autoloading are allowed only as explicit assembled modules.

An `AGENTS.md` loader, skill loader, MCP/tool discovery adapter, instruction
source, default policy, or model selector can exist. It must be named, typed,
ordered, and removable in source assembly.

The bad design is ambient behavior: hidden file-existence checks, layered
user/org/project behavior merges, import-order registration, broad capabilities
enabled by default, or hidden instruction loading that affects a run without a
visible assembly entry.

This rule is scoped to Theseus harness behavior. It does not apply to ordinary
server, web, build, deployment, or environment configuration.

## Scoped Events vs Capsule

The self-editable harness needs scoped event streams:

- DispatchEvent: dispatch-loop events from the Dispatch primitive
- RuntimeEvent: exact mechanical execution ledger for a run/session
- CapsuleEvent: mission-bound black box entries for decisions, evidence, artifacts,
  outcomes, review, and continuation

All are truth. They answer different questions at different scopes.

DispatchEvents answer what happened in one model/tool loop. RuntimeEvents
answer what exactly happened in runtime execution. CapsuleEvents answer what
matters about the mission. A Capsule can continue tomorrow from a new session
with a different RuntimeEvent set.

RuntimeEvent identity is the Effect/TypeScript `_tag`. The harness should not
maintain a second dot-case runtime event namespace. Storage can index `_tag` and
serialize the full tagged event. External sinks such as OpenTelemetry can adapt
events to their own naming conventions.

Capsule sinks may derive mission-relevant entries from RuntimeEvents and
selected DispatchEvents, but they should not dump raw model calls, full tool
result streams, or every low-level execution event into the mission record.

For now, one Mission owns exactly one primary Capsule. Future side quests or
sub-missions that need their own black boxes should first become mission-like
child work envelopes; each child may then own its own Capsule. Avoid
free-floating Capsules and arbitrary sub-capsule trees.
