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

Theseus is also a self-editable harness: agents should be able to evolve the
source by adding typed systems, satellites, projections, sinks, and capability
modules. It is not a plugin host.

## Primitive Floor

Everything else is built on these or is scaffolding:

| Primitive | Why it stays |
|---|---|
| Mission | Humans need a job tracker with a goal and done criteria |
| Tool | Models need typed, controlled world access |
| Capsule | Humans need durable run logs for debugging and improvement |
| Dispatch | The system needs to invoke a model with context and get a result |
| Satellite | Dispatches need scoped observation and policy middleware |

`RuntimeBus` is not a synonym for Satellite. RuntimeBus is the operator/client transport concept for runtime UIs and should adapt to the runtime command/control/query surface if implemented.

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
- Keep Mission/Capsule composition replaceable where possible; do not bake one
  current mission system into unrelated runtime concepts.
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
- Could an alternate mission or audit model replace this part without rewriting unrelated packages?
