---
status: current
owner: docs
kind: map
updated: 2026-04-29
---

# Roadmap Status Map

This map is the internal evidence table for [roadmap](../direction/roadmap.md).
It tracks status, source docs, evidence, and promotion requirements.

## Status Vocabulary

| Status | Meaning |
|---|---|
| `shipped` | Implemented and verified. |
| `active` | Currently being built. |
| `next` | Intended soon and clear enough to plan. |
| `designed` | Accepted direction, not scheduled. |
| `research` | Needs investigation, prototype, or decision. |
| `blocked` | Dependency or unresolved decision is known. |
| `parked` | Not rejected, but not worth attention now. |
| `rejected` | Deliberately not doing. |

## Status Table

| Item | Status | Owner | Source | Evidence | Done When |
|---|---|---|---|---|---|
| Runtime work tree visibility | next | runtime | [architecture](../runtime/architecture.md), [mission-system](../runtime/mission-system.md) | `runtime_work_nodes` and `MissionWorkTree` exist; current docs say dispatch work nodes are persisted and queryable. | Running/done/failed dispatch nodes and parent/delegated/continued/branched relations are visible through runtime queries and covered by tests/docs. |
| Capsule event curation | next | runtime | [architecture](../runtime/architecture.md), [mission-system](../runtime/mission-system.md) | Current `CapsuleSink` writes curated mission and dispatch lifecycle events. | Capsule event policy is explicit, tested, and reflected in mission-facing outputs without mirroring raw runtime events. |
| Thin server/runtime boundary | next | runtime | [architecture](../runtime/architecture.md) | Docs state server is a host adapter and runtime owns orchestration. | Server handlers remain transport adapters; runtime owns tool hydration, dispatch lifecycle, active handles, and continuation semantics. |
| First operator client surface | research | clients | [clients](../clients/README.md), [architecture](../runtime/architecture.md) | `docs/clients` has no active concept note yet. | A narrow client concept note defines first views/actions against runtime command/control/query without moving orchestration into the client. |
| Mission hardening | designed | runtime | [mission-hardening](../runtime/mission-hardening.md), [not-real-yet](not-real-yet.md) | Draft note exists; current maps mark it as draft direction, not runtime behavior. | A design is promoted into current docs with exact runtime boundary, then implemented or explicitly scheduled. |
| Tool selection and catalog clarity | designed | primitives/runtime | [tool](../primitives/tool.md), [tool-composition](../primitives/tool-composition.md), [architecture](../runtime/architecture.md) | `ToolCatalog` exists; broader tools-as-arrays and executor design are not fully implemented. | Selection, hydration, and authority rules are explicit in runtime/code/docs and avoid accidental broad tool access. |
| Pause and resume safe points | designed | runtime | [architecture](../runtime/architecture.md), [mission-system](../runtime/mission-system.md) | Pause/resume vocabulary is documented; current control descriptors return unsupported. | Cooperative safe-point semantics are implemented, tested, and documented without claiming arbitrary suspension. |
| RuntimeBus transport concept | designed | runtime/clients | [architecture](../runtime/architecture.md), [primitives](../primitives/primitives.md) | RuntimeBus is current vocabulary, not implemented transport. | A concrete transport adapts command/control/query and does not replace Satellite or runtime host semantics. |
| Cortex context management | research | drafts | [context-management-protocol-notes](../drafts/context-management-protocol-notes.md) | Draft/research note only. | A bounded POC proves a runtime value proposition and promotes only the proven boundary. |
| Semantic or tool-result folding | research | drafts | [cortex-poc-semantic-folding](../drafts/cortex-poc-semantic-folding.md), [cortex-poc-tool-result-folding](../drafts/cortex-poc-tool-result-folding.md) | Draft POC notes only. | Real failure bursts justify folding behavior and identify the owning runtime or satellite boundary. |
| Outcome execution beyond coding | research | brainstorms | [theseus-outcome-execution-layer](../brainstorms/theseus-outcome-execution-layer.md), [goals](../direction/goals.md) | Direction docs name the ambition; brainstorm explores product framing. | Coding harness primitives prove transferable mission artifacts and external-system projection. |
| Plugin marketplace or generic plugin host | rejected | direction | [goals](../direction/goals.md), [self-editable-harness](../design-notes/self-editable-harness.md) | Current doctrine rejects plugin-host architecture. | No promotion unless an explicit design decision reverses the self-editable harness posture. |
| Persistent named-agent daemon runtime | rejected | archive | [persistent-agent-runtime](../archive/persistent-agent-runtime.md), [architecture](../runtime/architecture.md) | Archived and superseded by runtime host/world model. | No promotion unless current runtime doctrine is intentionally replaced. |
| Fixed crew roster as architecture | rejected | archive | [crew-scaffolding](../archive/crew-scaffolding.md), [primitives](../primitives/primitives.md) | Archived as scaffolding; primitive docs reject fixed crew as floor. | Specialist roles may appear as harness scaffolding, not primitive/runtime architecture. |
| Queue RuntimeBus as runtime base | rejected | archive | [icarus-cli-plan](../archive/icarus-cli-plan.md), [architecture](../runtime/architecture.md) | Archived and superseded by command/control/query. | No promotion unless runtime host semantics are intentionally replaced. |

## Promotion Rules

- `research` can move to `designed` only after a clear boundary and owner exist.
- `designed` can move to `next` only with `done when` criteria.
- `next` can move to `active` only when implementation work starts.
- `active` can move to `shipped` only when implementation, tests/checks, and
  docs agree.
- Rejected items require an explicit design decision to reopen.
