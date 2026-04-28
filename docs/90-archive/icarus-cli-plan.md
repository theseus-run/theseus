# Icarus CLI Plan

> Status: SUPERSEDED — see [architecture](../03-runtime/architecture.md)
> Archived: 2026-04-26

This plan targeted the old persistent actor runtime and queue-based
`RuntimeBus` implementation. It is not active implementation guidance.

Do not add `packages/icarus-cli`, `runtime-bus.ts`, `tui.ts`, or a stdin-driven
`runtime.ts` from the old plan.

Current client work should adapt to the runtime command/control/query surface
described in [architecture](../03-runtime/architecture.md). A client is a host adapter/operator surface. It
must not own runtime behavior, hydrate tools, bind capsules, or mutate active
dispatch state directly.
