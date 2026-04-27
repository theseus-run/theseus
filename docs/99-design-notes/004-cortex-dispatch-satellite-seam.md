# Design Note 004: Cortex, Dispatch, And Satellite Seam

> Status: draft
> Date: 2026-04-27

## Context

Theseus currently has a basic dispatch loop and a powerful Satellite mechanism.
Cortex exists as research notes, not implementation.

The immediate design question is how to introduce Cortex without:

- making the basic agent loop hard to understand
- weakening Satellites
- turning Satellites into the long-term context manager
- building the full Cortex architecture before the seam is proven

This note defines the first clean seam.

## Decision

Use three layers:

```txt
Dispatch   = basic execution loop + factual history
Cortex     = managed model context over time
Satellite  = active dispatch middleware / instincts
Runtime    = mission/work-node orchestration and explicit assembly
```

At each model iteration:

```txt
history
  -> Cortex renders candidate ContextFrame
  -> Satellites may rewrite/intervene
  -> model sees final ContextFrame
  -> Dispatch appends model/tool results to history
```

Pure dispatch remains available through no-op implementations:

```txt
NoopCortex        = accumulated history as model input
NoopSatelliteRing = no injection, rewrite, blocking, or side effects
Pure loop         = Dispatch + NoopCortex + NoopSatelliteRing
```

## Definitions

### Dispatch

Dispatch owns execution:

- loop control
- model calls
- tool execution
- factual message/history accumulation
- calling Cortex before model calls
- running Satellite phases
- emitting dispatch events

Dispatch should stay readable as the basic agent loop:

```txt
messages/history
render model input
call model
run tools
append results
repeat
```

### Cortex

Cortex is the managed context layer.

It selects, transforms, places, degrades, recalls, and audits what the model sees
over time.

Examples:

- place `AGENTS.md` / instruction sets in the right context section
- make skill/procedure cards available before full bodies are loaded
- keep mission brief and pinned constraints visible
- fold large tool outputs into receipts with recall handles
- mark file reads or test results stale after source changes
- omit out-of-scope or superseded context
- produce context audit events explaining why the frame looks the way it does

Cortex may rewrite what the model sees, but as a context-management decision.
It should not be the owner of live dispatch reflexes.

### Satellite

Satellites are active dispatch middleware.

They may observe and intervene at safe points. They remain powerful and may
rewrite the current frame.

Examples:

- inject a self-doubt challenge before a model call
- block a destructive tool call without authority
- recover from a tool error by replacing the visible result
- force a protocol reminder
- log thinking or tool telemetry
- abort, redirect, or inject guidance

Satellite rewrites are runtime interventions, not stable context policy.

## Boundary Rule

Use this distinction:

```txt
If the behavior maintains the model's working context over time, it belongs in Cortex.
If the behavior reacts to a specific loop step, it belongs in a Satellite.
```

Examples:

| Behavior | Owner |
|---|---|
| `AGENTS.md` always placed in instruction section | Cortex |
| skill cards selected from task/files | Cortex |
| large tool output folded into receipt with recall | Cortex |
| stale file read removed after edit | Cortex |
| random self-doubt injection | Satellite |
| destructive tool guard | Satellite |
| tool error recovery | Satellite |
| terminal report reminder after model drift | Satellite |

Borderline behavior is allowed, but the audit/event must say which layer changed
the frame and why.

## Ordering

The intended ordering is:

```txt
1. Dispatch has factual history.
2. Cortex renders a candidate ContextFrame.
3. Satellites inspect/rewrite/intervene on the candidate frame.
4. Dispatch calls the model with the final ContextFrame.
5. Dispatch appends accepted model/tool results to history.
```

Satellites can override Cortex for the current model call. That is intentional.
Cortex remains the durable context-management layer.

## Minimal First Interface

Do not start with the full `ContextItem` model, recall, remote skill registries,
or semantic compaction.

The first interface can be small:

```typescript
interface Cortex {
  readonly render: (input: {
    readonly history: ReadonlyArray<Message>;
    readonly dispatch: DispatchContext;
  }) => Effect.Effect<ContextFrame>;
}

type ContextFrame = {
  readonly messages: ReadonlyArray<Message>;
  readonly audit: ReadonlyArray<ContextAuditEvent>;
};
```

`NoopCortex`:

```typescript
const NoopCortex: Cortex = {
  render: ({ history }) => Effect.succeed({ messages: history, audit: [] }),
};
```

Concrete type names should follow the existing dispatch `Prompt.MessageEncoded`
surface when implemented. The shape above is conceptual.

## Satellite Frame Phase

Add a frame-level Satellite phase after Cortex renders and before the model call.

Possible decision shape:

```typescript
type FrameDecision =
  | { readonly _tag: "Pass" }
  | {
      readonly _tag: "InjectFrameMessages";
      readonly messages: ReadonlyArray<Message>;
      readonly reason?: string;
    }
  | {
      readonly _tag: "ReplaceFrame";
      readonly frame: ContextFrame;
      readonly reason?: string;
    }
  | { readonly _tag: "Abort"; readonly reason: string };
```

The exact names can change. The important property is that Satellites can see
Cortex's candidate frame and produce the final model-visible frame.

## Audit

Any model-visible context decision should be explainable.

Cortex audit examples:

- instruction item included
- skill card activated
- tool result folded
- stale item omitted
- mission brief placed

Satellite audit examples:

- `SelfDoubtSatellite` injected challenge
- `ToolGuardSatellite` blocked call
- `RecoverySatellite` replaced tool result
- `ProtocolSatellite` injected report reminder

Do not overbuild audit in the first implementation. Preserve the invariant that
Theseus can later answer:

```txt
Why did the model see this?
Who or what changed it?
Was this stable context policy or live Satellite intervention?
```

## Why Not Put Cortex Outside Dispatch?

A wrapper around Dispatch cannot reliably manage context at every iteration
without reimplementing the loop.

Cortex belongs inside the dispatch loop at the frame-render boundary:

```txt
before each model call
```

Runtime chooses and wires the Cortex implementation. Dispatch uses it.

## Why Not Make Satellites Cortex?

Satellites are intentionally reactive and powerful. They are good for instincts,
policy checks, telemetry, tool recovery, and weird behavioral middleware.

Cortex needs durable context-management state, provenance, recall, placement,
activation, staleness, and audit.

Keeping them separate preserves both:

```txt
Cortex manages context over time.
Satellites intervene at a point in time.
```

## First POC

The first implementation should prove the seam, not full Cortex.

Suggested steps:

1. Add minimal Cortex service and `NoopCortex`.
2. Route dispatch model calls through `cortex.render`.
3. Add a test proving `NoopCortex` preserves current pure loop behavior.
4. Add a test-only Cortex that prepends one deterministic instruction.
5. Add a frame-level Satellite hook after Cortex render and before model call.
6. Add a test proving a Satellite can alter the model-visible frame without
   mutating history.
7. Emit minimal audit events for Cortex render and Satellite frame rewrite.

Only after the seam works should Theseus add:

- local `AGENTS.md` / instruction source
- local skill/procedure card source
- remote organization procedure registry
- recall handles
- tool-result folding
- semantic compaction

## Non-Goals For First Pass

Do not start with:

- full `ContextItem` schema
- remote skill registry
- semantic search
- semantic compaction
- recall tools
- provider-specific message placement
- AGENTS conflict resolution
- skill body activation
- policy engine

The first success condition is:

```txt
history -> Cortex candidate frame -> Satellite final frame -> model call
```

## Relation To Existing Notes

This note narrows [[context-management-protocol-notes]] and
[[cortex-first-principles-architecture]] into the first dispatch-loop seam.

It also preserves the power of [[001-thinking-telemetry-satellite]] style
middleware: Satellites remain active loop participants, not passive observers.
