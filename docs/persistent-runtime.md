# Theseus - Persistent Runtime

> Status: locked
> Last updated: 2026-03-22

---

## What we are building

Theseus is a **headless daemon** supervising a graph of persistent AI agents.

Icarus is not the runtime. Icarus is a **client** that attaches to the runtime over a communication channel and lets the operator:

- dispatch work
- inspect the live graph
- attach to a specific agent session
- steer a specific agent or task
- observe progress without owning execution

For prototyping, `icarus-cli` may still boot an in-process runtime. That does **not** change the target model: the runtime is server-first, clients are attachable surfaces.

---

## Core difference from OpenCode

OpenCode-style subagents are mostly disposable helpers: spawn, do one bounded thing, return, disappear.

Theseus named agents are different.

They are **background workers with identity**:

- long-lived
- addressable by stable id
- able to work in parallel
- able to retain context across tasks
- observable while running
- steerable while running
- wakeable, sleepable, forkable, destroyable

This is the load-bearing architectural choice.

---

## Runtime topology

```text
Icarus CLI / Icarus Web / other clients
          |
          | attach / command / subscribe
          v
   Theseus Runtime (headless daemon)
   |- transport adapter
   |- event log + live streams
   |- agent registry
   |- supervisor: theseus
   |  |- atlas-1
   |  |- forge-1
   |  |- forge-2
   |  `- critic-1
   `- ephemeral child agents
      |- scope#17
      `- probe#18
```

---

## Terms (locked)

### Theseus

The root supervisor and sole orchestrator.

- owns the runtime graph
- owns named-agent lifecycle
- schedules top-level work
- approves or rejects persistent-agent creation/fork/destruction
- aggregates results for the operator
- remains the default user-facing entry point

### Named agent

A persistent background agent with stable identity.

Examples: `forge-1`, `forge-2`, `atlas-1`, `critic-1`.

Properties:

- has a mailbox
- has retained memory/context
- has an execution state
- may own child agents
- may be observed and steered

### Child agent

An ephemeral, task-scoped agent spawned by Theseus or by a named agent.

- bounded purpose
- no stable long-term identity requirement
- may be destroyed immediately after completion
- used for fan-out, probing, review, search, narrow research

### Satellite

The official term for an attached sidecar monitor/controller-helper.

Implementation pattern: sidecar.
Product/runtime term: **Satellite**.

A Satellite observes an agent's structured trace and emits observations. It does **not** write directly into the worker mailbox.

### Controller

The only injection point attached to an agent.

The Controller:

- receives observations from Satellites
- arbitrates competing advice
- rate-limits interventions
- decides whether to inject guidance into the mailbox
- owns context-compaction checkpoints

There is exactly one Controller per live agent.

---

## Graph model

The runtime is a live graph, not a flat list.

```text
theseus
|- atlas-1
|- forge-1
|  `- scope#12
`- forge-2
   |- probe#19
   `- critic#20

client:web-1 ---- attached_to ---- forge-2
task:runtime-refactor ---- assigned_to ---- forge-2
forge-3 ---- forked_from ---- forge-1
```

Useful edge types:

- `supervises`
- `spawned`
- `forked_from`
- `assigned_to`
- `attached_to`
- `observed_by`

The graph is first-class runtime state and must be inspectable by Icarus.

---

## Scheduling model (locked)

### Rule 1 - one top-level task per named agent

A named agent handles at most one top-level task at a time.

Parallelism comes from multiple named agents, not from multiplexing unrelated top-level tasks through one memory stream.

### Rule 2 - named agents may fan out with child agents

A named agent may spawn bounded child agents for subproblems.

Examples:

- `forge-2` spawns `scope#12` to scan blast radius
- `forge-2` spawns `critic#13` to review a diff

### Rule 3 - Theseus owns persistent lifecycle

Named agents may request new persistent peers, but Theseus remains the supervisor of persistent lifecycle.

Named agents do not silently create immortal peers.

### Rule 4 - steering is target-specific

Steering is addressed to a concrete target:

- Theseus
- a named agent
- optionally a specific task within an agent

Steering is not reinterpreted as a new global user turn unless explicitly aimed at Theseus.

---

## Lifecycle (locked)

Named-agent states:

```text
absent -> starting -> idle -> working -> waiting -> idle
   |         |                    |         |
   |         `--------------------'         |
   |                                        v
   |-> destroyed <- stopping <- sleeping <-'
```

State meanings:

- `absent` - does not exist in memory
- `starting` - being created and hydrated
- `idle` - alive, ready, no active task
- `working` - actively executing a task
- `waiting` - blocked on tool, user input, or external dependency
- `sleeping` - retained in memory but not scheduled for work
- `stopping` - being interrupted and cleaned up
- `destroyed` - removed; volatile state gone

Operations:

- `wake` - create a new agent or revive a sleeping one
- `sleep` - keep memory, stop scheduling work
- `fork` - clone a live or sleeping agent into a new id
- `destroy` - fully remove the agent and its volatile state

`sleep` and `destroy` are not synonyms.

---

## Communication planes

### Control plane

Used by Icarus and Theseus to command the runtime.

Examples:

- dispatch task
- wake agent
- fork agent
- sleep agent
- destroy agent
- steer agent
- attach client
- detach client
- cancel task

### Event plane

Used by the runtime to publish facts about live execution.

Examples:

- agent spawned
- agent state changed
- task started
- task finished
- tool called
- tool failed
- graph changed
- intervention injected
- compaction applied

### Transcript plane (deferred)

Richer replay/streaming of session transcripts is expected later but is not required to lock the topology.

---

## Attach / peek / steer

These operations are part of the target design.

### Peek

Read-only snapshot of an agent:

- state
- current task
- recent transcript
- current memory summary
- child agents
- attached clients
- recent interventions

### Attach

Subscribe to a live agent session from an Icarus client.

Attach does not transfer ownership of the runtime. It grants visibility into a running agent and its events.

### Steer

Inject operator guidance to a specific agent or task through that target's Controller.

Steer is live guidance, not a synthetic user turn routed back through Theseus unless the target is Theseus itself.

---

## Satellites and Controllers (locked)

### Why Satellites exist

Persistent agents accumulate noise, stale assumptions, repeated tool traces, and budget drift. Satellites exist to observe this and produce structured observations while the agent works.

### Satellite contract

Satellites may:

- observe structured trace
- emit observations
- propose interventions
- propose context compaction

Satellites may not:

- write directly into the worker mailbox
- mutate memory unilaterally
- execute tools as the worker
- bypass the Controller

### Controller contract

The Controller is the only component allowed to:

- inject guidance into the mailbox
- accept or reject Satellite proposals
- checkpoint and compact context
- escalate to Theseus
- suppress low-value or conflicting interventions

### Inputs Satellites observe

Satellites watch structured trace, not hidden chain-of-thought.

Examples:

- task metadata
- conversation transcript
- tool calls and results
- retries and failures
- code diffs / touched files
- token and time budgets
- working-memory summaries

### Intervention model

Default path:

```text
Satellite -> Observation -> Controller -> optional Intervention -> mailbox
```

Not:

```text
Satellite -> mailbox
```

### Default Satellite types

- `Critic` - wrong assumptions, suspicious edits, contradictions
- `Memory` - compaction, summarization, tool-result folding
- `Budget` - tokens, time, tool churn, loop alerts
- `Policy` - unsafe command or permission violations
- `Observer` - produces compact operator-facing status for attach/peek views

### Operating rule

Satellites should be high-signal and low-frequency.

The bad version is many LLMs constantly whispering into one worker.
The good version is sparse, attributable, audited interventions.

---

## Memory model (locked at high level)

Named-agent memory is not just "keep the last N messages".

Each persistent agent should converge on four buckets:

- `identity memory` - stable traits, long-lived context, preferences
- `task memory` - active and recent task state
- `working set` - the current prompt context sent to the main model
- `archive` - older transcript and tool trace retained outside the hot window

Compaction happens at Controller-owned checkpoints:

- after tool batches
- between major task phases
- before an LLM call when nearing context limit
- after task completion

Continuous silent rewriting is explicitly not the design.

---

## Prototype mode vs target mode

### Prototype mode (allowed)

- `icarus-cli` may instantiate the runtime in-process
- transport may be in-memory queues
- durability may be minimal

### Target mode (locked)

- Theseus runs as a headless daemon on a server
- Icarus clients attach remotely
- agent graph outlives any single client session
- attach / detach / reconnect is normal

Prototype mode is an implementation shortcut, not the architectural truth.

---

## What we are explicitly not doing right now

- No claim of distributed multi-node actor semantics yet
- No direct Satellite-to-mailbox injection
- No unrestricted concurrent top-level tasks inside one named agent
- No prompt-only safety boundaries where runtime enforcement is feasible
- No requirement that every agent is durable across process restart in v1
- No attempt to standardize the full wire protocol in this doc

---

## Near-term implications for the runtime

1. `Theseus` must schedule named agents asynchronously, not block as a pure request/reply wrapper.
2. `AgentRegistry` must evolve into a real supervisor/graph registry.
3. Steering must target the active worker, not bounce back through Theseus as a new user turn.
4. Attach/peek must become first-class operations in the runtime model.
5. Controller and Satellite hooks must be designed into the agent loop from the start.

---

## North star

Theseus is a headless supervisor of persistent, named, background agents. Icarus is an attachable control surface. Agents can be created, forked, slept, destroyed, inspected, and steered. Satellites observe; Controllers arbitrate; the worker stays coherent.
