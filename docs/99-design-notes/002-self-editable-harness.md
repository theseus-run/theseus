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

If an extension point means "add a typed module, emit durable facts, wire it
into the harness, and test it," it fits Theseus now.

## Consequence

Runtime code should remain modular but not generic for its own sake:

- small files with obvious ownership
- typed boundaries
- named runtime facts
- projections over durable events
- side effects isolated in sinks
- static wiring in host/live assembly
- tests close to owning systems

Avoid god files, hidden cross-system mutation, and product-specific coupling
that spreads Mission/Capsule assumptions through unrelated modules.
