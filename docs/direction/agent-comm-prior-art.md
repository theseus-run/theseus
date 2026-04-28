# Agent-comm prior art and positioning

Status: direction note, not a protocol spec.

Date: 2026-04-25

## Summary

Agent-comm is not trying to invent a new theory of communication.

The intent is conservative:

```text
take battle-tested coordination primitives
strip unnecessary ceremony
adapt them to LLM/runtime actors inside Theseus
```

The broad idea has substantial prior art:

- multi-agent communication languages
- agent-to-agent interoperability standards
- task workflow frameworks
- high-reliability human communication protocols

The Theseus-specific work is in the adaptation:

```text
military/medical-style coordination discipline
+ LLM/tool-call actors
+ Effect-like terminal channels
+ mission audit
+ runtime authority
+ evidence-backed reports
+ salvage when model protocol compliance fails
```

## Not novel in the broad sense

The generic idea of structured agent communication is old.

Important precedents:

- FIPA ACL
- KQML
- Contract Net Protocol
- SBAR / medical handoff patterns
- aviation readback/hearback discipline
- modern A2A / ACP agent protocols
- modern LLM frameworks with handoffs, tasks, guardrails, and traces

Theseus should not pretend this is a greenfield invention.

The design posture should be:

```text
The protocol should be conservative, not clever.
```

## Older multi-agent protocol prior art

### FIPA ACL

FIPA ACL defines communicative acts / performatives such as:

```text
request
agree
refuse
inform
failure
cancel
cfp
accept-proposal
reject-proposal
```

These map broadly to tasking, acknowledgement, refusal/blockage, report,
failure, cancellation, and negotiation.

Source:

- <https://jmvidal.cse.sc.edu/talks/agentcommunication/performatives.html>

### KQML

KQML separates the communication wrapper from message content and defines
performatives such as:

```text
achieve
ask-if
tell
reply
sorry
discard
eos
subscribe
monitor
broker
```

This is close to the Theseus idea that natural language is payload, not
protocol.

Source:

- <https://jmvidal.cse.sc.edu/talks/agentcommunication/kqmlperformatives.html>

### Contract Net Protocol

Contract Net Protocol is a classic task-allocation protocol:

```text
announce / call for proposals
bid
award
execute
monitor
```

This is more about negotiation and allocation than terminal reporting, but it is
important background for delegation and authority.

Example source:

- <https://www.sciencedirect.com/science/article/abs/pii/S0030402616001200>

## High-reliability human communication prior art

The Theseus protocol intentionally borrows from military, aviation, and medical
communication patterns.

Useful principles:

```text
clear tasking
commander intent / why
read-back / acknowledgement
scoped authority
handoff discipline
status reports
escalation
abort / stop conditions
evidence
failure classification
after-action review
```

These patterns exist because humans fail under ambiguity, fatigue, partial
information, stress, and noisy handoffs.

LLM agents fail under analogous conditions.

### SBAR

SBAR is a structured handoff pattern:

```text
Situation
Background
Assessment
Recommendation
```

It originated in military/aviation-style environments and became widely used in
healthcare to reduce handoff ambiguity.

Source:

- <https://en.wikipedia.org/wiki/SBAR>

## Modern LLM-space prior art

### Agent2Agent / A2A

A2A is the closest standard-style precedent.

Relevant concepts:

```text
agent discovery
task lifecycle
messages
artifacts
task states
context id
streaming updates
auth / security framing
```

A2A `Task` is explicitly a stateful entity used to achieve an outcome and
generate artifacts.

Sources:

- <https://agent2agent.info/docs/concepts/task/>
- <https://agent2agent.info/docs/concepts/artifact/>
- <https://google-a2a.github.io/A2A/specification/>

Difference from Theseus agent-comm:

A2A is primarily an interoperability protocol between independent, potentially
opaque agent systems. Theseus agent-comm is primarily an internal coordination
discipline for mission/runtime actors, though it should remain transport-neutral
and may later map onto A2A-like transports.

### IBM ACP / BeeAI

IBM's Agent Communication Protocol is another direct precedent.

Relevant concepts:

```text
framework-agnostic agents
HTTP-native communication
sync and async interaction
agent discovery
standardized message exchange
agent interoperability
```

Sources:

- <https://www.ibm.com/think/topics/agent-communication-protocol>
- <https://research.ibm.com/projects/agent-communication-protocol>
- <https://research.ibm.com/blog/agent-communication-protocol-ai>

Difference from Theseus agent-comm:

ACP focuses on interop across frameworks and organizations. Theseus agent-comm
focuses on reliable tasking/reporting semantics inside the mission runtime:
authority, evidence, blocked vs defect, salvage, and audit.

### OpenAI Agents SDK handoffs

OpenAI Agents SDK supports handoffs between specialist agents.

Relevant concepts:

```text
handoffs represented as tools
typed handoff payloads
handoff input filters
run context
guardrails
tracing
sessions
```

Source:

- <https://openai.github.io/openai-agents-js/guides/handoffs/>

Difference from Theseus agent-comm:

Handoffs are delegation mechanics. Theseus agent-comm is trying to define the
broader communication contract: tasking, acknowledgement, clarification, status,
terminal channel, evidence, authority, amendment, abort, and salvage.

### CrewAI Tasks

CrewAI has structured task objects.

Relevant concepts:

```text
task description
expected output
agent assignment
task tools
task dependencies/context
output files
task outputs
guardrails
human review
```

Source:

- <https://docs.crewai.com/concepts/tasks>

Difference from Theseus agent-comm:

CrewAI tasks are workflow/task definitions. Theseus agent-comm is lower-level
coordination grammar for actor-to-actor communication inside or across
workflows.

## What seems distinct in Theseus

The distinct part is not "agents communicate."

The distinct part is this combination:

```text
battle-tested human coordination primitives
+ transport-neutral packet intent
+ LLM/tool-call implementation path
+ Effect-style success / expected failure / defect separation
+ explicit authority and scope
+ evidence-backed terminal reports
+ salvage as non-authoritative recovery
+ mission audit orientation
```

Most modern LLM agent frameworks expose some of:

```text
handoff
task lifecycle
agent discovery
tool calling
structured outputs
guardrails
tracing
artifacts
```

They do not usually foreground:

```text
read-back / ACK discipline
complete vs blocked vs defect
salvage after protocol failure
criteria-to-evidence linkage
authority as tasking primitive
mission-level audit
```

That is where Theseus can be opinionated.

## Positioning

Good positioning:

```text
Agent-comm does not invent coordination theory.
It adapts proven coordination discipline to LLM/runtime actors.
```

Another phrasing:

```text
FIPA/KQML/A2A/ACP solve broad agent communication and interoperability.
SBAR/readback/handoff doctrine solve reliable human coordination.
Theseus agent-comm borrows from both, then narrows the result to mission-grade
actor coordination inside an agentic runtime.
```

## Implications for design

Do:

- keep protocol generic
- keep transport replaceable
- keep packet schemas extensible
- preserve complete / blocked / defect distinction
- treat salvage as recovery, not a normal actor channel
- model authority explicitly
- require evidence where completion matters
- keep doctrine separate from protocol
- allow human actors

Do not:

- claim theoretical novelty
- import all FIPA/KQML ceremony
- overfit to current tool-call transport
- make this only about coding agents
- confuse interop protocol with internal mission discipline
- make every status update a required ritual

## Open questions

- Should Theseus agent-comm eventually map to A2A tasks/artifacts?
- Should external agent interoperability use A2A/ACP while internal actors use
  native Theseus packets?
- What is the minimum envelope needed for audit and causality?
- How much ACK/read-back should be required before side effects?
- How should authority grants connect to runtime-enforced tool policies?
- How should criteria satisfaction link to evidence?
- Which parts are protocol, and which parts are doctrine?
