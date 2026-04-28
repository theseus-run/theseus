---
status: draft
owner: drafts
kind: draft
updated: 2026-04-28
---

# Cortex first-principles architecture

Status: conceptual research note, not final design.

Date: 2026-04-25

## Premise

If Theseus were rewritten from scratch conceptually, context management should
not be hidden inside an append-only chat loop.

The current dispatch primitive is good for what it is:

```text
append-only-ish chat execution
model call
tool call
tool result
repeat
```

Satellites are also good for what they are:

```text
sidecars that observe, log, inject, block, recover, or mutate at boundaries
```

Cortex is different.

Cortex wants to be a reducer/projector:

```text
given what happened, what should be visible now?
```

That means three concepts should be separated:

```text
1. Trace      what happened
2. Cortex     what should be visible now
3. Dispatch   run one model/tool loop using a rendered view
```

## One-line architecture

```text
Dispatch appends facts to Trace; Cortex projects Trace into the next
ContextFrame; Satellites observe and intervene at boundaries.
```

## Trace

Trace is the source of truth.

It is append-only, factual, and boring.

```text
Trace = ordered event log of actual runtime facts
```

Possible event types:

```text
user_message
assistant_message
model_call_started
model_call_finished
tool_call
tool_result
tool_error
injection
policy_decision
context_rendered
fold_created
recall_requested
recall_result
task_state_changed
```

Trace is never semantically rewritten. It can be archived, paged, persisted, or
indexed, but not destructively compacted.

If the runtime needs to know what actually happened, it reads trace.

## Cortex

Cortex is a reducer/projector over trace plus external sources.

```text
Cortex = Trace + Sources + Policies -> ContextFrame
```

It owns:

```text
activation
scope
authority
freshness
garbage collection
semantic folding
recall handles
ranking
placement hints
audit
```

Cortex does not chat. Cortex does not run tools. Cortex does not mutate trace as
its primary job.

Cortex produces derived state.

If the derived state is bad, the system should be able to render again from
trace with different policy.

## ContextFrame

ContextFrame is the missing primitive.

Current systems often only have:

```text
messages[]
```

But the real runtime object should be closer to:

```ts
type ContextFrame = {
  items: ContextItem[]
  messages: ModelMessage[]
  budget: BudgetReport
  omitted: OmittedContext[]
  recalls: RecallHandle[]
  audit: CortexAuditEvent[]
}
```

`messages[]` is just one rendered output format.

It is not the source of truth.

The frame records:

- what was included
- what was omitted
- what was folded
- what was recalled
- where things came from
- why the frame looks the way it does

## Dispatch

Dispatch is the execution machine.

It should advance trace. It should not own long-term context policy.

Conceptual loop:

```text
while not done:
  frame = Cortex.render(trace, task, agent)
  result = model.call(frame.messages, tools)
  append model result to trace

  for tool call:
    append tool_call to trace
    run tool
    append tool_result or tool_error to trace
```

Dispatch asks Cortex for the next frame.

Dispatch records what happened.

Dispatch does not decide which old context remains visible forever.

## Satellites

Satellites remain sidecars.

They wrap boundaries:

```text
onTraceEvent
beforeRender
afterRender
beforeModelCall
afterModelCall
beforeTool
afterTool
onPolicyDecision
```

Good satellite jobs:

```text
telemetry
budget alarms
policy enforcement
tool blocking
human approval
debug logging
provider-specific adaptation
side-effectful monitors
```

Satellites may mutate, but mutations should become trace events or Cortex
patches. They should not silently edit the only history array.

## External sources

Cortex reads from trace and from external/domain sources.

Examples:

```text
repo
Jira
calendar
Slack
docs
skills
memory
policies
CRM
database
```

External source records are normalized into ContextItems.

Examples:

```text
AGENTS.md -> instruction item
skill description -> skill item
Jira policy -> policy item
ticket description -> task item
calendar event -> observation item
tool result -> evidence item
```

The core should not hard-code these domains.

## User transcript vs model context

This is the key conceptual break:

```text
user transcript != model context
```

The user-facing transcript can be rendered from trace.

The model-facing context can be rendered from Cortex.

They do not have to be the same.

This avoids forcing model context to be an append-only chat transcript.

## Compaction as degradation

Compaction becomes one degradation policy, not a special cliff event.

Context item fidelity:

```text
verbatim
excerpt
structured extraction
summary
receipt
archive-only
```

Garbage collection becomes lifecycle management:

```text
duplicate -> canonical reference
stale -> archived receipt
failure burst -> semantic fold
old evidence -> summary + recall
large result -> receipt + recall
```

The source material remains in trace/archive.

The frame contains whatever representation is currently useful.

## Recall

Recall is not just a tool name. It is a primitive.

Example:

```text
trace contains:
  tool_result: 80k log

cortex frame contains:
  receipt: "80k log archived as log_123"

model/user/runtime requests recall:
  recall_requested(log_123)
  recall_result(log_123, exact payload or excerpt)

next cortex frame may include:
  exact recalled payload
```

Recall should be auditable and should respect scope/access policy.

## Why this is cleaner

This architecture:

- removes hidden destructive edits
- gives Cortex a real place to be a reducer
- keeps Dispatch as an executor
- keeps Satellites as sidecars
- makes audit natural
- makes replay possible
- separates transcript display from model context
- allows deterministic garbage collection and LLM semantic folding to coexist

Replay goal:

```text
same trace + same Cortex policy -> same ContextFrame
```

LLM-powered semantic folds may weaken strict determinism, but they can still be
trace events with preserved inputs/outputs.

## Forever primitives

If designing from scratch, keep the primitive set small:

```text
TraceEvent
ContextItem
ContextSource
CortexPolicy
ContextFrame
RecallHandle
CortexAuditEvent
Dispatch
Satellite
```

Everything else is implementation detail.

## Relationship to current Theseus

Current Theseus has:

```text
dispatch loop with message accumulator
dispatch store with events and snapshots
satellite ring with boundary hooks
tool boundary with typed tools
```

That is a useful starting point, but Cortex should not be forced to be "just a
satellite" forever.

Near-term POCs may use satellites because the hooks already exist.

Long-term, Cortex wants to sit before model invocation as the renderer of the
working context:

```text
Trace / canonical state
        |
        v
Cortex reducer
        |
        v
ContextFrame / model messages
        |
        v
Satellite sidecars
        |
        v
Dispatch model call
```

## Open questions

- What is the minimal TraceEvent set?
- Should Trace be event-sourced from day one or start as normalized messages?
- Does ContextFrame include provider-native messages or provider-neutral
  messages plus renderer output?
- Are Cortex policies pure functions, Effect services, or both?
- How do satellites patch Cortex without becoming Cortex?
- Should recall results be appended to trace, added to Cortex state, or both?
- How much of current DispatchStore can become TraceStore?
- What is the first domain-neutral ContextItem shape?
- How do we make audit useful without making it noisy?
- How do we avoid over-engineering before the first useful POC?
