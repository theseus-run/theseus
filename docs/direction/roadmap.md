---
status: current
owner: direction
kind: concept
updated: 2026-04-29
---

# Roadmap

> Status: active planning shell

This roadmap describes the intended shape of Theseus work. It is conservative:
it separates what exists, what is practical next, what is designed but not
scheduled, and what is deliberately not planned.

Use [roadmap-status-map](../maps/roadmap-status-map.md) for the internal
evidence table.

## Now

Work that should make the current coding harness more controllable,
inspectable, recoverable, or usable.

| Item | Status | Why It Matters |
|---|---|---|
| Runtime work tree visibility | next | Operators need truthful mission work state before richer clients can be useful. |
| Capsule event curation | next | Mission outputs need a durable review-facing record, not only raw runtime events. |
| Thin server/runtime boundary | next | Runtime behavior should stay owned by `packages/theseus-runtime`, with server as adapter. |
| First operator client surface | research | `docs/clients` has no active concept note yet; client work needs a narrow first shape. |

## Next

Designed or likely near-term work that needs sharper scope before execution.

| Item | Status | Why It Matters |
|---|---|---|
| Mission hardening | designed | Raw user intent needs a path into dispatchable missions without forcing ceremony on small tasks. |
| Tool selection and catalog clarity | designed | Tool authority needs explicit selection and hydration before broader autonomy. |
| Pause and resume safe points | designed | Runtime should reserve cooperative control semantics without pretending it can freeze arbitrary work. |
| RuntimeBus transport concept | designed | Client/operator surfaces need transport vocabulary, but it must adapt to command/control/query. |

## Later

Research or larger architecture work that should not block the near-term
runtime wedge.

| Item | Status | Why It Matters |
|---|---|---|
| Cortex context management | research | Context durability and recall may become important after event/projection surfaces stabilize. |
| Semantic or tool-result folding | research | Folding needs evidence from real failure bursts before becoming runtime doctrine. |
| Outcome execution beyond coding | research | The primitives should support this ambition, but the wedge remains coding harness first. |

## Not Planned

These paths are not active roadmap items.

| Item | Reason |
|---|---|
| Plugin marketplace or generic plugin host | Theseus is a self-editable harness with explicit source assembly. |
| Persistent named-agent daemon runtime | Superseded by the current runtime host/world model. |
| Fixed crew roster as architecture | Crew and specialist roles are harness scaffolding, not primitive floor. |
| Queue RuntimeBus as the runtime base | Superseded by runtime command/control/query. |

## Rules

- Do not promote a roadmap item without updating
  [roadmap-status-map](../maps/roadmap-status-map.md).
- Do not mark work as shipped unless implementation, tests/checks, and docs
  agree.
- Do not use dates unless the project accepts date pressure.
- Keep loose ideas in [brainstorms](../brainstorms/README.md) and unadopted
  designs in [drafts](../drafts/README.md).
