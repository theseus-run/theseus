---
name: theseus-design
description: Use for Theseus product and domain architecture decisions, especially mission-dispatch semantics, primitive boundaries, runtime concepts, operator model, package ownership, and deciding whether a concept belongs in core or scaffolding.
---

# Theseus Design

Use this skill for Theseus domain design. Do not use it as an Effect API guide; load an Effect-specific skill for Effect mechanics.

## What Theseus Is

Theseus is a mission dispatch system, not a chatbot.

Human intent: "I need X done. Go do it."

The system tracks the mission, dispatches work, records what happened, and returns a result.

Mission exists because chat is the wrong root object for serious work. Chat may
be an interface mode, but work needs a structured envelope: objective,
completion definition, scope, authority, evidence, and lifecycle.

Theseus is also a self-editable harness: agents should be able to evolve the
source by adding typed systems, satellites, projections, sinks, tool/model
catalog modules, and static assembly. It is not a plugin host.

Theseus should be isolation-native. Autonomy should be backed by explicit
execution envelopes and promotion boundaries, not only by repeated permission
prompts or command allowlists.

## Primitive Floor

Everything else is built on these or is scaffolding:

| Primitive | Why it stays |
|---|---|
| Mission | Humans need a structured work envelope with objective, completion definition, scope, authority, evidence, and lifecycle |
| Tool | Models need typed, controlled world access |
| Capsule | Missions need a durable black box for review, continuation, evidence, artifacts, and accountability |
| Dispatch | The system needs to invoke a model with context and get a result |
| Satellite | Dispatches need scoped observation and policy middleware |

`RuntimeBus` is not a synonym for Satellite. RuntimeBus is the operator/client transport concept for runtime UIs and should adapt to the runtime command/control/query surface if implemented.

`Sandbox` and `Workspace` are runtime/harness concepts, not aliases for each
other. Sandbox is execution isolation. Workspace is source-state isolation
inside a Sandbox. A git worktree is a Workspace provider, not a security
Sandbox.

## Design Tests

### Irreducibility

Before adding a primitive or package-level concept, ask: can this be removed while the mission system still works?

If yes, it is scaffolding. Keep scaffolding optional and outside primitive contracts.

### Future-Proofing

Design as if a much better model arrives soon: larger context, stronger instruction following, fewer workflow crutches.

Likely scaffolding: verification loops, planning agents, cycle caps, retry rituals, and current Grunt/Agent distinctions.

Likely primitives: Mission, Tool, Capsule, Dispatch, Satellite.

## Boundary Ownership

- Core owns primitives and stable runtime contracts.
- Tools own concrete world access.
- Server owns wiring, hydration, persistence, and transport adaptation.
- Icarus owns operator UI.
- Docs own design memory, not runtime truth.

## Concept Rules

- Define the human/operator concept before defining runtime machinery.
- Keep Mission, Tool, Capsule, Dispatch, and Satellite distinct.
- Do not rename concepts casually. If a new term appears, decide whether it replaces or refines an existing term.
- Keep UI transport separate from dispatch semantics and runtime host semantics.
- Treat the runtime host as live composition of primitives, not as a new primitive.
- Treat fixed crews, named agents, and planning loops as harness scaffolding unless promoted by a current design note.
- Prefer source-editable modules over plugin APIs, dynamic loading, manifests,
  or extension registries.
- Require explicit assembly for behavior that affects what agents see, can do,
  observe, decide, or auto-load. Conventions are allowed only when represented
  as named, typed, ordered, removable source modules.
- Treat systems as runtime behavior modules, not generic files and not full ECS
  machinery. A system advances or reacts to live harness state.
- Keep Mission/Capsule composition replaceable where possible; do not bake one
  current mission system into unrelated runtime concepts.
- Treat Capsule as the mission black box. For now, one Mission owns exactly one
  primary Capsule. Do not create free-floating Capsules or arbitrary nested
  Capsules.
- Keep Mission primitive, but allow mission schemas and mission types to evolve.
  Implementation, research, brainstorm, review, planning, incident, and quick
  task missions may need different ceremony.
- Keep isolation provider-shaped. Docker Sandboxes, Sandcastle, Vercel Sandbox,
  E2B, Daytona, Modal, local Docker/Podman, host mode, and test fakes are
  candidate providers, not primitive doctrine.
- Treat tool/model execution as Sandbox/Workspace-relative where world effects
  are involved. Promotion back to host/project truth should be explicit.
- Prefer clean-break evolution for WIP runtime contracts. When a contract
  changes, migrate first-party adapters, tests, docs, and skills in the same
  pass instead of preserving compatibility shims.
- Keep design notes honest about status: current doctrine, draft idea, or superseded history.
- Treat skills, crews, agents, retries, and planning loops as harness/scaffolding unless the primitive floor would break without them.

## Decision Checklist

- Does the design pass the irreducibility test?
- Does it survive a stronger model?
- Does it define one concept clearly?
- Is it in the right ownership layer?
- Does it create duplicate terminology?
- Does it accidentally turn scaffolding into a primitive?
- Is it useful to an operator dispatching real work?
- Does it need a plugin API, or can Theseus add a typed source module and static wiring?
- Is behavior introduced through explicit assembly, or hidden behind ambient
  file/config discovery?
- Could an alternate mission or audit model replace this part without rewriting unrelated packages?
- Does this treat chat as the domain object instead of an interface mode?
- Does this assume host execution or host checkout when it should carry
  Sandbox/Workspace identity?
