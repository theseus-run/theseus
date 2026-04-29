---
status: current
owner: runtime
kind: map
updated: 2026-04-28
---

# Runtime Truth Map

This map records current runtime facts with source evidence. Use it before
editing runtime docs or implementing runtime behavior.

| Claim | Evidence |
|---|---|
| Runtime exposes `submit`, `control`, `query`, and `getSnapshot` through `TheseusRuntimeService`. | `packages/theseus-runtime/src/runtime/types.ts` |
| Implemented runtime commands are `MissionCreate` and `MissionStartDispatch`. | `packages/theseus-runtime/src/runtime/types.ts` |
| Mission sessions contain `missionId`, `capsuleId`, `goal`, `criteria`, and `state`. | `packages/theseus-runtime/src/runtime/types.ts` |
| Mission creation makes a mission id, creates a SQLite-backed Capsule, writes a `mission.create` event, and records the mission-capsule link. | `packages/theseus-runtime/src/runtime/systems/mission/system.ts` |
| There is no mission table. Mission/capsule identity is linked through `runtime_mission_capsules`; mission views derive from Capsule events. | `packages/theseus-runtime/src/store/sqlite.ts`, `packages/theseus-runtime/src/runtime/projections/session/store.ts` |
| Runtime work nodes are persisted in `runtime_work_nodes`. Dispatch work nodes are the only live implemented node kind. | `packages/theseus-runtime/src/store/sqlite.ts`, `packages/theseus-runtime/src/runtime/projections/work-tree/store.ts` |
| `MissionStartDispatch` hydrates tools through `ToolCatalog`, resolves the mission Capsule, starts Dispatch, registers the active handle, and emits runtime dispatch events. | `packages/theseus-runtime/src/runtime/systems/dispatch/system.ts` |
| Root dispatch completion transitions the mission to `done` or `failed`; delegated/continued dispatches do not complete the mission by themselves. | `packages/theseus-runtime/src/runtime/systems/dispatch/system.ts` |
| Work-node control supports interrupt, inject guidance, and request status for active dispatch nodes. Pause and resume are defined but return unsupported. | `packages/theseus-runtime/src/runtime/controllers/work-node.ts` |
| Durable runtime storage currently includes dispatch records, dispatch events, dispatch snapshots, capsule events, capsule artifacts, mission-capsule links, and work nodes. | `packages/theseus-runtime/src/store/sqlite.ts` |

## Current Non-Facts

These are not implemented runtime behavior:

- file-backed `.missions/`
- `mission.md` / `mission.jsonl`
- mission lock / close / reopen commands
- automatic session close summaries
- filesystem-derived artifact manifests
- pause/resume execution semantics
- queue-based `RuntimeBus`
- persistent named-agent daemon runtime
