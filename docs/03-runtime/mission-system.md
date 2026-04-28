# Mission System

> Status: current implementation
> Last updated: 2026-04-28

This note describes the mission system that exists in the current runtime code.
It does not describe the older file-backed lock/session plan.

The current implementation is intentionally small:

```txt
MissionCreate command
  -> Mission id
  -> Capsule id
  -> mission.create CapsuleEvent
  -> runtime_mission_capsules link
  -> MissionSession projection

MissionStartDispatch command
  -> hydrate dispatch spec through ToolCatalog
  -> find mission capsule
  -> create dispatch-backed work node
  -> start Dispatch
  -> register active handle
  -> emit runtime dispatch stream
  -> write curated CapsuleEvents
  -> update durable work-node status on completion
```

The active runtime owner is `packages/theseus-runtime`.

## Implemented Surface

Runtime exposes mission work through `TheseusRuntimeService`:

```typescript
interface TheseusRuntimeService {
  readonly submit: (command: RuntimeCommand) => Effect<RuntimeSubmission, RuntimeError>
  readonly control: (command: RuntimeControl) => Effect<void, RuntimeError>
  readonly query: (query: RuntimeQuery) => Effect<RuntimeQueryResult, RuntimeError>
  readonly getSnapshot: () => Effect<RuntimeSnapshot>
}
```

Implemented mission commands:

- `MissionCreate`
- `MissionStartDispatch`

Implemented mission queries:

- `MissionList`
- `MissionGet`
- `MissionWorkTree`
- `CapsuleEvents`

There is no implemented lock command, close command, reopen command, `.missions/`
directory, `mission.md`, `mission.jsonl`, or automatic session close artifact
generation.

## Mission Primitive

The core Mission primitive is a structured work envelope:

```typescript
interface Mission {
  readonly id: MissionId
  readonly goal: string
  readonly criteria: ReadonlyArray<string>
  readonly status: MissionStatus
  readonly createdAt: string
}
```

Current runtime mission sessions expose:

```typescript
interface MissionSession {
  readonly missionId: string
  readonly capsuleId: string
  readonly goal: string
  readonly criteria: ReadonlyArray<string>
  readonly state: "pending" | "running" | "done" | "failed"
}
```

The session state is derived from Capsule events, not from a mission table.

## Capsule Binding

Every runtime mission gets one primary Capsule.

Mission creation:

1. calls `Mission.makeMissionId(input.slug)`
2. creates or opens a SQLite-backed current Capsule
3. calls `Mission.makeMissionRecord(...)`
4. writes a `mission.create` CapsuleEvent
5. records the mission-to-capsule link in `runtime_mission_capsules`

That link is the durable join used by runtime queries and dispatch start.

Capsule remains the mission-facing record. It is not the raw runtime event log.
The current sink writes only curated lifecycle events:

- `mission.create`
- `mission.transition`
- `dispatch.start`
- `dispatch.done`
- `dispatch.failed`

## Runtime Storage

Current persistence is SQLite at the runtime DB path.

Relevant tables:

- `capsule_events`
- `capsule_artifacts`
- `runtime_mission_capsules`
- `runtime_work_nodes`
- `dispatch_records`
- `dispatch_events`
- `dispatch_snapshots`

There is no mission table. Mission read models are projections over capsule
events plus `runtime_mission_capsules`.

## Dispatch Under A Mission

`MissionStartDispatch` requires an existing mission id.

The dispatch system:

1. hydrates the serialized dispatch spec with `ToolCatalog`
2. restores continuation context when `continueFrom` is provided
3. resolves the mission capsule through `runtime_mission_capsules`
4. creates a dispatch-backed `WorkNode`
5. starts `Dispatch.dispatch(...)`
6. registers the active dispatch handle
7. writes `dispatch.start`
8. forks completion watching

Root dispatches currently move the mission from `pending` to `running`, then to
`done` or `failed` when the dispatch completes. Delegated or continued dispatches
do not complete the mission by themselves.

## Work Tree

Runtime represents active and historical work through work nodes.

Current work-node kinds:

- `dispatch`
- `task`
- `external`

Only `dispatch` nodes are implemented as live runtime work today.

Current relations:

- `root`
- `delegated`
- `continued`
- `branched`

The dispatch system records `runtime_work_nodes` rows for dispatch work and
updates state, iteration, usage, and completion time as the dispatch progresses.

`MissionWorkTree` reads those rows back as `WorkNodeSession` values.

## Control

The implemented control path is work-node control.

Supported for active dispatch-backed nodes:

- interrupt
- inject guidance
- request status

Defined but not implemented:

- pause
- resume

Non-dispatch nodes return unsupported control descriptors.

## What Is Design Direction, Not Current Code

These ideas remain valid design direction but are not implemented by the current
mission system:

- mission hardening / clarification before dispatch
- explicit mission lock
- immutable mission briefs
- mission close and reopen
- automatic session records
- transcript-derived friction analysis
- filesystem-derived artifact manifests
- operator approval gates
- multiple mission types with different ceremony

Keep those in concept or design-note docs until code exists. Active runtime docs
should not describe them as available behavior.

## Related Notes

- [architecture](architecture.md)
- [mission-hardening](mission-hardening.md)
- [primitives](../02-primitives/primitives.md)
- [crew-scaffolding](../90-archive/crew-scaffolding.md)
