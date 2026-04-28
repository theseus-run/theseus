---
status: current
owner: primitives
kind: concept
updated: 2026-04-28
---

# Agent-Comm Protocol Design Intent

> Status: draft design with partial implementation
> Last updated: 2026-04-28

Agent-comm is the protocol layer for actor-to-actor coordination in Theseus.

It is not a prompt trick, not a UI format, and not raw dispatch. It exists because independent actors need a reliable way to receive orders, acknowledge intent, operate under authority, report status, fail cleanly, and return evidence-backed results.

The protocol is inspired by military and medical communication patterns because those domains are battle-tested under uncertainty, fatigue, partial information, high stakes, and noisy handoffs. Theseus does not copy their surface ceremony blindly; it borrows the durable principles: clarity, accountability, scoped authority, explicit failure channels, evidence, and reconstructable history.

This document is intent-level. It should not freeze packet schemas or TypeScript shapes before real usage proves them. The design must stay extensible and steerable.

## Current Implementation

The implemented core surface lives under `@theseus.run/core/AgentComm`.

Current exports include:

- `dispatchGruntTool`
- `report`
- `DispatchGruntLauncher`
- `DispatchGruntFailed`
- `ProtocolEnvelopeSchema`
- `OrderSchema`
- `DispatchGruntInputSchema`
- `ReportSchema`
- `DispatchGruntResultSchema`
- `SalvageSchema`

Runtime wires `DispatchGruntLauncher` in `packages/theseus-runtime` so a running
dispatch can launch a child dispatch as a `delegated` work node. The child gets
the current mission id, capsule id, parent work node id, and parent dispatch id.

Only a narrow task/report path is implemented today. Acknowledgement, amendment,
abort, status query, human actor packets, external transport packets, and
capability-card routing remain design direction.

## Core Principle

Natural language is payload, not protocol.

Actors may use prose to explain, reason, or summarize, but authoritative coordination should flow through structured protocol packets or equivalent machine-captured events. The transport may change over time.

Today, packets may be represented as LLM tool calls. Tomorrow they may be structured model outputs, MCP messages, database events, human form submissions, API calls, or native runtime channels.

The invariant is the protocol, not the transport.

## Problem

Most agent harnesses are effectively one-channel:

```txt
task -> text
```

That is too weak for multi-actor work. It cannot reliably express:

- "I completed the task."
- "I cannot complete the task because the task is underspecified."
- "I operated correctly but the requested object does not exist."
- "The tool/runtime/provider failed."
- "I need clarification."
- "I found something useful but failed to follow the formal return protocol."
- "I am acting under these exact permissions and constraints."

Theseus needs an Effect-like communication model:

```txt
Input channel
Success channel
Expected failure / blocked channel
Defect channel
Requirements / authority channel
Salvage channel
```

This is not only for coding agents. It should apply to any coordinated work between humans, LLMs, future GAI systems, deterministic services, or mixed teams.

## Actors

An actor is any unit capable of receiving tasking and producing a response.

Examples:

- main orchestrator
- grunt
- named specialist agent
- human operator
- deterministic service
- reviewer
- planner
- future higher-capability model
- external workflow system

The protocol should not assume "expensive smart model delegates to cheap dumb model." That may be a common use case, but it is not the abstraction.

The abstraction is:

```txt
Actor receives tasking.
Actor operates under authority.
Actor may request clarification or report status.
Actor terminates with complete, blocked, or defect.
Runtime adapters may produce salvage if the actor fails to emit a valid protocol packet.
```

## Protocol vs Doctrine

Agent-comm should distinguish protocol from doctrine.

Protocol is the universal coordination grammar:

- tasking
- acknowledgement
- clarification
- status
- amendment
- abort
- report
- salvage

Doctrine is domain-specific guidance for using that grammar well.

Examples:

- Coding doctrine may require file paths, line numbers, test names, and diffs as evidence.
- Medical doctrine may require symptoms, vitals, contraindications, and guideline references.
- Incident response doctrine may require timestamps, affected services, logs, and mitigation state.
- Research doctrine may require sources, quotes, methodology, and confidence.

Protocol should remain generic. Doctrine can become specialized.

## Envelope

Every protocol packet eventually needs an envelope: the boring audit substrate
that makes military-style command history reconstructable.

The envelope wraps packet payloads; it is not necessarily authored by the actor.
It answers:

- packet id
- kind / performative
- protocol version
- sender
- recipient
- mission/session/dispatch context
- parent packet id
- order id
- sequence
- timestamp
- causality links, such as replies-to or amends

Without this, "who ordered what", "who accepted what", and "what amended what"
becomes hard to reconstruct once multiple actors, amendments, retries, or
parallel dispatches exist.

Early implementations may let the runtime attach equivalent metadata through
events, dispatch records, or store entries instead of requiring the LLM actor to
fill envelope fields manually. The design invariant is that every authoritative
packet must be correlatable later.

The protocol should borrow the useful part of FIPA/KQML performatives without
importing their full ceremony. A packet kind should be enough to distinguish
order, acknowledgement, status, clarification, amendment, abort, and report.
The concrete packet payload remains native Theseus protocol data.

## Actor Capability Card

Dispatchers should not rely only on hard-coded lore when choosing an actor.

An actor may eventually expose a lightweight capability card:

- actor id / name
- role
- capabilities
- allowed task types
- required tools or services
- authority requirements
- report doctrine
- cost or latency class, when useful

This is an intent-level discovery and routing concept, similar in spirit to
agent cards in interop protocols. It should not become a large registry design
yet. For now, it is enough that the protocol leaves room for actor metadata and
does not assume the commander already knows every subordinate by memory.

## Lifecycle

The intended communication lifecycle is:

```txt
1. Tasking
2. Acknowledgement
3. Execution
4. Status / Query / Amendment / Abort as needed
5. Terminal Report
6. Validation / Debrief
7. Salvage if formal protocol failed
```

Not every implementation must support every phase on day one. But the design should leave room for all of them.

## Tasking

Tasking is the commander's order to another actor.

A good tasking packet should make ambiguity expensive and explicit. It should answer:

- What is the objective?
- Why does this objective matter?
- What is in scope?
- What is out of scope?
- What authority does the actor have?
- What tools/resources/context are available?
- What constraints apply?
- What completion criteria define success?
- What should the actor report back?
- When should the actor stop and ask?
- What budget applies?

The "why" matters. Military doctrine calls this commander's intent. It lets the subordinate adapt when the literal plan breaks.

For agents, intent reduces brittle obedience and improves useful failure.

Scope and constraints should be treated as the order's bounds: the bounding
shape around the actor's freedom of action. Different domains may express those
bounds differently, but the invariant remains the same: the actor should know
where it may operate and where it must stop.

## Acknowledgement

Acknowledgement is the subordinate saying:

```txt
I received the tasking.
I understand it as follows.
I can proceed / cannot proceed / need clarification.
```

ACK is underrated. Without ACK, the caller often discovers misunderstanding only after the subordinate has spent budget or mutated state.

A future protocol may require ACK before tool use or before entering execution. For now, the design should reserve the phase.

Rule of thumb:

- ACK can be optional for observe-only, low-authority work in early POCs.
- ACK should be required before side effects, write-capable tool use, broad
  authority grants, or any action where misunderstanding is expensive.
- Satellites or runtime policy can enforce this later.

An ACK/read-back should restate at least:

- understood objective
- success criteria
- authority and scope
- stop or escalation conditions

ACK may itself have channels:

- accepted
- blocked
- clarification needed
- defect initializing

## Status And Handoff

Status and handoff packets should be concise but structured enough to reduce
ambiguity. SBAR is a useful doctrine pattern:

- Situation: what is happening now
- Background: relevant context
- Assessment: actor's interpretation
- Recommendation: proposed next action

SBAR should be treated as doctrine, not mandatory ceremony for every tiny
dispatch. It is most useful for handoffs, escalations, incident-style status,
and any task where context loss is expensive.

## Execution

Execution is the actor working within scoped authority.

The protocol should not assume execution is silent. Actors may emit:

- status reports
- observations
- risks
- partial findings
- clarification requests
- needs for additional authority
- warnings
- proposed amendments

Satellites can later observe or enforce these phases:

- pause execution
- require clarification
- inject amendments
- abort on risk
- compact context
- validate authority
- require terminal report

## Terminal Actor Channels

A terminal outcome should not be "text."

It should fall into one of the actor report channels.

### Complete

The actor completed the objective under the given criteria.

A complete report should include:

- summary
- result
- evidence
- criteria satisfied
- unresolved risks
- confidence or caveats where useful

### Blocked

The actor operated correctly, but the task cannot be completed as given.

Examples:

- required file does not exist
- task is underspecified
- requested state contradicts constraints
- authority is insufficient
- needed resource is missing

Blocked is not a defect. It is a valid expected-failure channel.

One important subtype is authority required: the actor could proceed if granted
additional authority, a tool, a resource, or a credential. This is not a defect,
and it is not the same as a permanent impossibility. It is a recoverable blocked
state that should tell the commander exactly what grant or resource is needed.

A blocked report should include:

- blocker
- evidence
- what was attempted
- what is needed to proceed
- recommended next action

### Defect

The machinery, protocol, runtime, or infrastructure failed.

Examples:

- search tool crashed
- provider returned malformed tool calls
- capsule/store failed
- actor could not initialize
- protocol packet was malformed
- subordinate violated required protocol

Defect means the actor/runtime cannot provide a trustworthy normal result.

A defect report should include:

- what broke
- impact
- whether work can continue
- any useful partial observations
- escalation recommendation

## Salvage

Salvage is best-effort runtime recovery when formal protocol failed.

Examples:

- model stopped without valid report
- malformed report payload
- exceeded iteration limit after collecting useful facts
- actor returned prose instead of packet

Salvage is useful but non-authoritative. It is not an actor-emitted terminal
channel.

It may inform the commander, but it does not satisfy protocol completion. It should be clearly marked as recovered material, not a successful report.

Military analogy: last known transmission after comms failure.

## Evidence

Reports should be evidence-backed.

A claim without evidence may still be useful, but the protocol should prefer reports that can be checked, replayed, or audited.

Evidence is generic at the protocol level:

- observation
- artifact
- source
- measurement
- tool result
- log reference
- human note
- file reference
- event reference

Doctrine decides which evidence is required for a domain.

Reports may also reference artifacts: durable work products rather than just
claims or observations. An artifact reference may include:

- artifact id, path, or URI
- name and type
- description
- whether the artifact is final or intermediate
- relation to success criteria

Artifacts matter because Theseus should preserve useful work products, not just
chat residue.

Evidence should also link back to completion criteria. A report can contain
evidence and still fail to prove completion if the evidence does not support the
criteria it claims to satisfy.

The protocol should leave room for criteria satisfaction:

```txt
criterion
status: satisfied | unsatisfied | unknown
evidence refs
notes
```

This lets the commander distinguish "the actor found evidence" from "the actor
proved the requested objective under the declared criteria."

## Authority

Authority is part of the protocol, not an implementation detail.

An actor should know:

- what actions are allowed
- what tools are allowed
- what scope is allowed
- what budget applies
- what must be escalated
- who can amend or abort the task
- what resources are available

Without authority, tasking is just a request.

Authority has two forms:

- Declared authority: actor-readable tasking text rendered in the order.
- Enforced authority: runtime capability grants, tool scopes, policies,
  satellites, sandboxing, or server checks.

Declared authority without enforcement is protocol theater. It is useful as
instructional context, but it is not trustworthy by itself.

Orders should eventually reference enforceable grants or policies, and the
runtime should decide what is actually available. The packet tells the actor how
to understand its authority; the runtime enforces what the actor can really do.

## Protocol Adapter Boundary

Theseus native agent-comm is internal mission-grade coordination. It should be
generic and transport-neutral, but it does not need to be identical to any
external protocol.

A2A, ACP, MCP, or future standards may become interop adapters:

- native Theseus packets inside the runtime
- A2A/ACP-style tasks, artifacts, or agent cards at external boundaries
- explicit mapping code where the concepts naturally fit

Do not import whole external schemas unless they pull their weight. The native
protocol should stay small, auditable, and shaped around Theseus mission
semantics.

## Amendment and Abort

Real work changes. The protocol should allow steering.

Amendment means the commander changes tasking while preserving traceability:

```txt
Previous order remains recorded.
New amendment modifies scope, criteria, authority, or context.
```

Abort means execution should stop.

Abort is not the same as failure. It is a command decision.

Future satellites or humans may issue aborts when they detect risk, stale context, runaway cost, or changed priorities.

## Human Compatibility

Agent-comm should still make sense when one actor is human.

A human can receive tasking, acknowledge it, request clarification, report status, and return a terminal report. The same protocol should apply.

This prevents the design from collapsing into model-specific prompt engineering.

## Future Model Improvement

As models improve, some scaffolding becomes redundant:

- repetitive prompt reminders
- strict formatting examples
- defensive compliance language
- retry loops for malformed packets
- basic protocol-policing satellites

But the protocol itself remains useful.

Even excellent actors need:

- identity
- tasking
- scope
- authority
- evidence
- failure channels
- traceability
- handoff semantics
- auditability

The irreducible complexity is coordination under uncertainty, not model obedience.

## Design Posture

We should not overfit the first implementation.

The near-term implementation can start small:

- structured tasking
- rendered briefing
- structured report tool
- fallback salvage
- clear complete / blocked / defect distinction

But the design should leave room for:

- ACK before execution
- SITREP/status packets
- clarification packets
- amendments
- aborts
- richer evidence
- domain doctrine
- dynamic report expectations
- non-tool transports
- human participants

## Non-Goals For Now

Agent-comm should not currently try to solve:

- full security policy
- complete sandboxing
- universal workflow engine semantics
- domain-specific report schemas for every task type
- streaming UI protocol
- all future agent hierarchy patterns
- perfect enforcement before real-world evidence

The goal is a clean protocol intent that can grow from actual usage.

## North Star

Agent-comm should let the runtime answer:

```txt
Who ordered what?
Who accepted it?
Under what authority?
What did they do?
What did they claim?
What evidence supports the claim?
Did they complete the criteria?
If not, was it blocked, defective, aborted, or unstructured?
What useful information can still be salvaged?
```

That is the durable core. Everything else is implementation strategy.
