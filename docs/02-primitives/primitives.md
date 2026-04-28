# Primitive Stack

> Status: active doctrine
> Last updated: 2026-04-26

Theseus has five irreducible primitives:

- Mission
- Tool
- Capsule
- Dispatch
- Satellite

Everything else is runtime composition or harness scaffolding unless current
code and design notes deliberately promote it.

Primitives should stay reusable across harness shapes. They are not an excuse to
bake one current product workflow into every package. Mission and Capsule are
current primitives, but runtime code should still compose them through systems,
sinks, and projections so alternate work models can replace pieces later.

## Mission

Mission is the structured work envelope.

It exists because chat is not a sufficient domain object. A mission gives the
system a native place for objective, completion definition, scope, authority,
evidence, and lifecycle. Freeform chat may be an interface mode, but serious
work should not depend on prompt-only structure bolted onto a chat transcript.

Current core surface lives under `@theseus.run/core/Mission`:

- `Mission.MissionId`
- `Mission.MissionRecord`
- `Mission.CurrentMission`
- `Mission.makeMissionId`
- `Mission.makeMissionRecord`
- `Mission.MissionStore`

Runtime may create mission sessions and bind missions to capsules, but Mission
itself remains the stable primitive for structured work intent.

The current mission schema is not sacred. Mission types may evolve:

- implementation
- research
- brainstorm
- review
- planning
- incident
- quick task

All mission types need some structure, but not the same ceremony. A brainstorm
mission can have loose criteria. A production incident needs authority,
evidence, and escalation policy. A typo fix can have an implicit tiny mission.

## Tool

Tool is typed, controlled world access.

Current core surface lives under `@theseus.run/core/Tool`. A tool is plain data:

```typescript
interface Tool<Input, Output, Failure, Requirements> {
  readonly name: string
  readonly description: string
  readonly input: Schema.Schema<Input>
  readonly output: Schema.Schema<Output>
  readonly failure: Schema.Schema<Failure>
  readonly policy: ToolPolicy
  readonly execute: (input: Input) => Effect.Effect<Output, Failure, Requirements>
  readonly present?: (value: ToolValue<Output, Failure>) => Effect.Effect<Presentation>
  readonly retry?: Schedule.Schedule<unknown>
}
```

The ordered world-interaction policy is `policy.interaction`:

- `pure`
- `observe`
- `write_idempotent`
- `write`
- `write_destructive`

See [tool](tool.md) for canonical Tool doctrine, [tools](tools.md) for example tool sets, and
[tool-composition](tool-composition.md) for assembly/filtering.

## Capsule

Capsule is the durable mission record: curated events, decisions, evidence, and
artifacts that should survive across sessions and be useful for review, PRs,
handoffs, and future continuation.

Capsule is mission-bound. For now, one Mission owns exactly one primary
Capsule. It is the mission black box and the source of truth for
mission-facing outputs such as PR descriptions, release notes, implementation
summaries, evidence reports, postmortems, handoffs, and resume briefs.

Current core surface lives under `@theseus.run/core/Capsule`:

- `Capsule.CurrentCapsule`
- `Capsule.CapsuleRecord`
- `Capsule.CapsuleEvent`
- `Capsule.makeCapsuleId`
- `Capsule.CapsuleStore`

Capsule is not the raw runtime event log. RuntimeEvents record exactly what
happened in a run; CapsuleEvents record what matters about the mission.
RuntimeEvents and selected DispatchEvents may feed Capsule sinks, but Capsule
should not blindly mirror model calls, tool result streams, or every low-level
execution event.

Do not create free-floating Capsules or arbitrary nested Capsules. If future
side quests or sub-missions need separate black boxes, they should first become
mission-like child work envelopes; each child may then own its own Capsule. The
invariant remains: every Capsule belongs to exactly one structured work
envelope.

Workers should not need to perform logging ceremony for normal execution.

## Dispatch

Dispatch is the model/tool loop.

Current core surface lives under `@theseus.run/core/Dispatch`:

- `Dispatch.DispatchSpec`
- `Dispatch.DispatchHandle`
- `Dispatch.DispatchEvent`
- `Dispatch.DispatchStore`
- `Dispatch.dispatch`
- `Dispatch.dispatchAwait`

Dispatch receives a spec, task, language model, satellite ring, dispatch store,
and tool requirements. It emits structured dispatch events, executes tool calls,
and returns a final `DispatchOutput`.

Runtime starts dispatches under missions, binds capsules, tracks active handles,
and persists/restores dispatch state. Runtime does not replace Dispatch.

## Satellite

Satellite is dispatch-scoped observation and policy middleware.

Current core surface lives under `@theseus.run/core/Satellite`:

- `Satellite.Satellite`
- `Satellite.SatelliteRing`
- `Satellite.SatelliteScope`
- `Satellite.SatelliteDecision`
- `Satellite.SatelliteAbort`
- `Satellite.makeSatelliteRing`
- `Satellite.SatelliteRingLive`

A `SatelliteRing` is static ordered configuration. A `SatelliteScope` is opened
per dispatch so state stays dispatch-scoped.

Satellites may observe or influence dispatch at defined safe points:

- checkpoint
- before model call
- after model call
- before tool execution
- after tool execution
- tool error

Satellites must not become client transport, hidden mailboxes, or global runtime
controllers.

## Runtime Host Is Composition

The runtime host is not a sixth primitive. It composes primitives into live work
through commands, controls, queries, systems, sinks, projections, stores,
catalogs, and active handles.

See [architecture](../03-runtime/architecture.md) for current runtime doctrine.

Sandbox and Workspace are runtime/harness concepts that may become stable
contracts, but they do not currently replace the primitive floor. Sandbox is
execution isolation. Workspace is source-state isolation inside a Sandbox. They
exist so Tool and Dispatch effects can become isolation-aware without assuming
the host checkout is the only world.

Runtime modules should depend on the narrow primitive surfaces they need. Avoid
spreading Mission/Capsule/session assumptions through unrelated systems. If a
future work model replaces Mission or a future audit model replaces Capsule
storage, unrelated dispatch, tool/model catalog, projection, and transport code should
not need a rewrite.

Keep scoped event streams distinct. DispatchEvents come from the dispatch loop.
RuntimeEvents are the runtime execution ledger. CapsuleEvents are the mission
record.

## RuntimeBus Boundary

`RuntimeBus` is the operator/client transport concept: RuntimeEvents out,
operator intent in.

It is useful product vocabulary, but it is not primitive floor and it must not
replace Satellite. If implemented, it should adapt to the runtime
command/control/query surface.

## Scaffolding

These may be useful harness layers, but they are not primitive floor:

- fixed crew roster
- named persistent agents
- grunt vs agent distinction
- skill stacking
- planning/review phases
- verification loops
- cycle caps
- context compaction
- RuntimeBus concrete transport

Design them as replaceable layers on top of primitives and runtime host
semantics.

## No Plugin Primitive

There is no plugin primitive.

Extensibility comes from typed source modules that Theseus can edit directly:
systems, satellites, projections, sinks, tool/model catalogs, and static harness
assembly. A feature that requires a stable public plugin API before it can be
useful is too heavy for the current project.
