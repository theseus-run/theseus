---
name: dispatch-satellite
description: Use when working on the Theseus dispatch loop, dispatch store, tool-call execution, satellite middleware, dispatch events, or intervention policy in packages/theseus-core/src/dispatch and packages/theseus-core/src/satellite.
---

# Dispatch And Satellite

Use this skill for dispatch-loop and satellite middleware changes.

## Read First

- `packages/theseus-core/src/Dispatch.ts`
- `packages/theseus-core/src/dispatch/dispatch.ts`
- `packages/theseus-core/src/dispatch/step.ts`
- `packages/theseus-core/src/satellite/types.ts`
- `packages/theseus-core/src/satellite/ring.ts`

## Terms

- **Dispatch**: the model/tool loop that turns a task and spec into events and final output.
- **Satellite**: dispatch-scoped observation and policy middleware.
- **SatelliteRing**: ordered static middleware configuration.
- **SatelliteScope**: per-dispatch state and resources opened from the ring.
- **RuntimeBus**: operator/client transport concept. Do not use it as a synonym for Satellite.

## Rules

- Keep dispatch headless. UI and operator transport belong outside core.
- Satellites may observe, transform, block, replace, recover, or abort through typed decisions.
- Satellites must not smuggle direct mailbox writes or hidden side channels into the dispatch loop.
- Preserve ordered ring semantics: non-terminal decisions feed later satellites.
- Keep satellite state scoped to one dispatch. Do not put per-dispatch mutable state on the static ring.
- Preserve event shapes used by server/client serialization unless deliberately migrating them.
- Convert `SatelliteAbort` at the dispatch boundary according to the existing dispatch error model.

## Verification

- Run focused dispatch/satellite tests after behavioral changes:
  - `bun test packages/theseus-core/src/dispatch`
  - `bun test packages/theseus-core/src/satellite`
- Run `bun run typecheck` when public event, decision, or store types change.
