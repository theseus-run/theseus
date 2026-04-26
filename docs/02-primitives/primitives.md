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

Mission is the unit of user intent: goal plus done criteria.

Current core surface lives under `@theseus.run/core/Mission`:

- `Mission.MissionId`
- `Mission.MissionRecord`
- `Mission.CurrentMission`
- `Mission.makeMissionId`
- `Mission.makeMissionRecord`
- `Mission.MissionStore`

Runtime may create mission sessions and bind missions to capsules, but Mission
itself remains the stable primitive for tracking what outcome the system is
trying to produce.

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

See [[tool]] for canonical Tool doctrine, [[tools]] for example tool sets, and
[[tool-composition]] for assembly/filtering.

## Capsule

Capsule is durable mission/run memory: append-only event history plus artifacts.

Current core surface lives under `@theseus.run/core/Capsule`:

- `Capsule.CurrentCapsule`
- `Capsule.CapsuleRecord`
- `Capsule.CapsuleEvent`
- `Capsule.makeCapsuleId`
- `Capsule.CapsuleStore`

Runtime writes capsule events as facts about work. Workers should not need to
perform logging ceremony for normal execution.

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

See [[architecture]] for current runtime doctrine.

Runtime modules should depend on the narrow primitive surfaces they need. Avoid
spreading Mission/Capsule/session assumptions through unrelated systems. If a
future work model replaces Mission or a future audit model replaces Capsule
storage, unrelated dispatch, capability, projection, and transport code should
not need a rewrite.

## RuntimeBus Boundary

`RuntimeBus` is the operator/client transport concept: runtime facts out,
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
systems, satellites, projections, sinks, capabilities, and static harness
assembly. A feature that requires a stable public plugin API before it can be
useful is too heavy for the current project.
