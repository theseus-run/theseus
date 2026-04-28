# Cortex research notes

Status: rough research notes, not a design spec.

Date: 2026-04-25

## Working intuition

Current agent harnesses mostly treat context as an append-only transcript until
the window gets tight, then run a cliff compaction step. The compaction prompt
can be good and still produce bad UX, because the user is forced to think about
context management manually or gets compacted at an inconvenient moment.

The better abstraction is **Cortex**: a context management protocol / runtime
layer.

Rough definition:

```text
Cortex:
A runtime protocol for selecting, placing, refreshing, degrading, recalling,
and auditing the information an agent receives at each model invocation.
```

Compaction is only one operator. Other operators include instruction injection,
skill activation, stale-context invalidation, tool-result folding, recall,
pinning, ranking, and audit.

This note is not trying to lock names, tools, exact prompt slots, or final
message layout. It is trying to identify primitives that remain useful even as
models get much better.

The goal is not "summarize better". The goal is to keep the working context
clean enough that emergency compaction is rare.

## Design boundary

Do not lock into exact product decisions yet:

- exact tool names like `tool_result_recollect`
- exact placement rules like "put AGENTS.md in message X"
- exact receipt wording
- exact summary prompt
- exact threshold numbers
- exact UI labels
- exact storage backend
- exact skill discovery format
- exact model/provider integration

Those are implementation choices. This research is about durable primitives.

Rule of thumb:

```text
Imagine tomorrow's model has 10B parameters and a 5M-token context.
What still matters?
```

Likely to go away or shrink:

- emergency cliff compaction
- aggressive token shaving
- fragile prompt hacks
- manual "compact now?" UX
- tiny viewport-style tools
- summarizing only because the model cannot fit a transcript

Likely to remain:

- authority and provenance
- freshness and staleness
- scoped applicability
- activation of relevant instructions/procedures
- evidence lifecycle
- exact recall of source material
- auditability of context mutations
- privacy and access boundaries
- ranking under some budget, even if the budget is huge
- preventing stale/noisy context from poisoning reasoning

Even a 5M-token model should not receive every stale log, duplicate result,
superseded instruction, irrelevant skill, old ticket comment, and obsolete file
snapshot. Bigger context reduces pressure. It does not remove the need for
clean working context.

## Primitive candidates

These are the things Cortex should probably model directly. Concrete tools,
prompts, and render layouts can come later.

### Context item

A normalized unit of context, regardless of domain.

Examples:

```text
instruction
policy
skill/procedure
task
plan
memory
observation
evidence
artifact
conversation
tool result
```

This primitive covers AGENTS.md, skills, Jira tickets, file reads, calendar
events, tool logs, and summaries without making any of those core concepts.

### Provenance

Where an item came from and why it is trusted.

Examples:

```text
source system
source URI/path/id
created by user/agent/tool/runtime
timestamp
version/hash
parent item ids
```

Provenance survives larger context windows. The model and runtime still need to
know whether a claim came from a user, a tool, a policy file, an LLM summary, or
an external system.

### Authority

How strongly the item should constrain behavior.

Examples:

```text
system
developer
organization
workspace/project
user
agent
tool/external observation
```

Authority is separate from placement. We should not bake "system message" into
the primitive too early, because renderers/providers may change.

### Scope

When an item applies.

Examples:

```text
global
organization
workspace
project
mission
task
subtask
entity/ticket/customer
file/path/module
time window
person/team
```

This primitive covers scoped rules, nested project instructions, skills,
department policies, ticket-specific constraints, and calendar/task context.

### Lifecycle

Whether an item is active, latent, archived, pinned, stale, or superseded.

Examples:

```text
hot
warm
latent
archived
pinned
stale
superseded
expired
```

Lifecycle is the bridge between "skill activation", "garbage collection",
"compaction", and "working set rendering".

### Fidelity

How exact the visible representation is.

Examples:

```text
verbatim
excerpt
structured extraction
summary
receipt
archive-only
```

This lets us discuss compaction without starting from summary prompts.

### Recall handle

A stable way to recover exact source material.

This is a primitive, not yet a tool name. It may render later as a model tool,
UI action, resource URI, MCP resource, or runtime-only operation.

### Dependency / invalidation edge

Relationships that make context stale or superseded.

Examples:

```text
file read depends on file hash
test result depends on source state
ticket summary depends on comments included
skill index depends on skill file version
plan depends on acceptance criteria
```

This primitive matters more than token count for correctness.

### Activation policy

Rules for moving latent items into the working set.

Examples:

```text
activate when entity matches
activate when file/path matches
activate when task intent matches
activate when user invokes explicitly
activate when model requests it
activate when runtime detects risk
```

This covers skills and scoped instructions without choosing a skill format now.

### Degradation policy

Rules for reducing fidelity under pressure or after lifecycle changes.

Examples:

```text
verbatim -> excerpt
excerpt -> summary
summary -> receipt
duplicate -> reference
failed burst -> grouped summary
stale evidence -> archived receipt
```

This covers garbage collection and compaction as one family of operations.

### Renderer

Takes selected context items and emits provider/model messages.

Renderer decisions are intentionally later-stage:

```text
which provider message role?
which order?
which XML/Markdown wrapper?
which summary wording?
which recall affordance?
```

The primitive is not "where AGENTS.md goes". The primitive is:

```text
an instruction item with authority, scope, provenance, lifecycle, and renderer hints
```

### Audit event

A record of context decisions.

Examples:

```text
item activated
item folded
item summarized
item archived
item recalled
item marked stale
item dropped from render
item pinned
```

This remains useful even if model context becomes enormous, because invisible
context mutation needs trust and debuggability.

## Motivation

Bad current UX:

```text
run normally
context fills
manual compact or auto compact at a bad time
old transcript becomes summary
hope the model still has what it needs
```

Preferred UX:

```text
runtime constantly maintains a clean working set
duplicates and stale evidence are folded early
large evidence is archived with recall handles
skills/instructions are injected only when useful
full source material is recoverable
major compaction becomes a fallback, not the normal operating mode
```

The user should not have to ask:

- should I compact now?
- will this lose something important?
- should I start a new session?
- did the harness forget because I waited too long?

They should mostly see context health if they care:

```text
hot context: 42k tokens
archived evidence: 210k tokens
folded tool results: 38
active skills: jira-triage, calendar-planning
context risk: low
```

## Domain-neutral shape

This should not be coding-specific. Coding is one profile.

Generic item model:

```ts
type ContextItem = {
  id: string
  kind:
    | "instruction"
    | "policy"
    | "skill"
    | "memory"
    | "task"
    | "plan"
    | "evidence"
    | "observation"
    | "artifact"
    | "conversation"
    | "tool-result"

  authority: "system" | "developer" | "organization" | "user" | "agent" | "tool" | "external"
  scope: Scope
  freshness: "fresh" | "stale" | "superseded" | "unknown"
  lifecycle: "hot" | "warm" | "archived" | "pinned"
  priority: number
  content?: string
  summary?: string
  recall?: RecallHandle
  provenance: Provenance
  dependsOn?: string[]
  expiresWhen?: Condition
}
```

Generic concepts:

- Source: where context comes from.
- Item: normalized unit of context.
- Scope: when it applies.
- Placement: where it is rendered in the model input.
- Lifecycle: hot, warm, stale, superseded, archived, pinned.
- Degradation: verbatim -> excerpt -> summary -> receipt -> archive only.
- Recall: exact source recovery.
- Audit: explain every mutation/injection/fold.

Examples by profile:

```text
coding:
  AGENTS.md -> instruction
  file read -> evidence
  test log -> tool-result/evidence
  git diff -> artifact
  skill -> procedural context

jira / day-to-day work:
  Jira project policy -> policy/instruction
  ticket description -> task
  acceptance criteria -> pinned task constraints
  comments -> conversation/evidence
  linked docs -> artifact/evidence
  sprint goal -> task/memory
  calendar event -> observation/task
  user preference -> memory
```

## Operators

### Placement

Decide where context belongs.

```text
system/developer: stable authority and behavior rules
early user/context: project/repo/workspace instructions
near current user: active task constraints and current decisions
tool result slots: recent evidence
assistant state: plan/progress/checklist
```

Same text in the wrong place can lose authority or be ignored. Cortex should treat
placement as a first-class decision.

### Activation

Keep latent context available, but only load it when relevant.

Examples:

```text
skill descriptions are visible, full skill loads on demand
workspace policy activates for matching project/team
Jira workflow instructions activate for ticket transition work
coding style rules activate for touched package/file scope
```

### Refresh and invalidation

Context can become stale.

Examples:

```text
file read becomes stale after edit
test result becomes stale after code change
ticket status observation becomes stale after transition
calendar context expires after meeting ends
policy/rule cache invalidates after source file changes
```

### Garbage collection

Deterministic context hygiene. No LLM required.

Examples:

```text
dedupe repeated tool results
fold identical file reads by path + content hash
mark old file reads stale after edits
collapse assistant ceremony after the action was performed
fold failed attempts after a later success
clip huge logs into structured receipts
replace old bulky evidence with recall handles
```

### Semantic folding

LLM-powered compression of bounded objects, not the whole session.

Better:

```text
summarize this failed-test burst
summarize this 80k build log
summarize these 9 comments on Jira ticket ABC-123
summarize completed phase "triage"
```

Worse:

```text
summarize entire conversation because context is full
```

The summary is an index card, not the source of truth.

### Recall

Archived material remains exact and recoverable.

Examples:

```text
tool_result_recollect(callId)
recall_evidence(groupId)
recall_message_range(rangeId)
recall_artifact_snapshot(id)
recall_by_query(query, filters)
```

Receipt shape:

```text
[compacted evidence]
id: evgrp_42
kind: failed-attempt-burst
summary: Tried npm test 5 times. Failures were config-related until tsconfig path alias was fixed. Final run passed.
contains:
- shell_18
- shell_19
- shell_20
- shell_21
- shell_22
recall: recall_evidence({"id":"evgrp_42"})
```

### Pinning

Some items are non-evictable until an expiry condition.

Examples:

```text
user constraint
acceptance criteria
current bug hypothesis
pending reviewer comment
current plan step
organization policy
```

### Audit

Every context mutation should be explainable.

Examples:

```text
activated jira-transition skill because current task mentions ticket status
injected project policy because ticket.project = PAYMENTS
folded 5 shell errors into evgrp_42
archived duplicate read_file result tool_91 as duplicate of tool_77
marked read_file src/foo.ts stale after edit_3
kept acceptance criteria pinned because task is not complete
```

## Prior art map

### MemGPT / Letta

Closest conceptual prior art.

Relevant ideas:

- context window as managed memory
- in-context/core memory
- archival memory
- recall memory
- tools for editing/searching memory
- automatic compaction of older messages into summaries while full history is
  available in recall storage

Sources:

- <https://docs.letta.com/concepts/memory-management>
- <https://docs.letta.com/guides/agents/architectures/memgpt>
- <https://docs.letta.com/guides/agents/context-engineering>

Difference from Cortex idea:

Letta is broad agent memory. Cortex should include memory but also activation,
placement, instruction policy, skill loading, evidence lifecycle, exact recall,
and audit. For coding harnesses it should know about file snapshots, stale
reads, failed attempts, logs, and tool traces through adapters. For non-coding
agents it should know about tickets, calendars, docs, tasks, etc. through
other adapters.

### LangGraph / Deep Agents memory

Relevant ideas:

- semantic, episodic, procedural memory
- skills as procedural memory
- on-demand skill loading
- background consolidation / sleep-time compute
- filesystem-backed memory
- scoped memory by user/agent/organization

Sources:

- <https://docs.langchain.com/oss/python/deepagents/long-term-memory>
- <https://docs.langchain.com/oss/python/concepts/memory>

Difference from Cortex idea:

This is memory-centric. Cortex is invocation-centric: decide what is visible now,
where it is placed, what is stale, what is folded, what is pinned, and how exact
source material is recovered.

### LlamaIndex Memory

Relevant ideas:

- short-term FIFO memory
- long-term memory blocks
- flush policy when short-term exceeds token ratio
- memory block priorities
- merging short-term and long-term memories into context

Sources:

- <https://docs.llamaindex.ai/en/stable/examples/memory/memory/>
- <https://docs.llamaindex.ai/en/stable/api_reference/memory/memory/>

Difference from Cortex idea:

Good prior art for block/priority/flush mechanics. Cortex would generalize beyond
chat messages and memory blocks into instructions, skills, evidence, tools,
tasks, policies, and audit.

### Cursor Rules / AGENTS.md

Relevant ideas:

- reusable scoped instructions
- project rules
- user rules
- AGENTS.md
- always included, auto-attached by glob, or agent-requested rules
- active rules shown in UI

Source:

- <https://docs.cursor.com/en/context>

Difference from Cortex idea:

This covers instruction activation/scoping, not the whole lifecycle of context
items and evidence.

### Claude Skills

Relevant ideas:

- progressive disclosure
- cheap skill index in context
- full skill content loads only when invoked
- skill descriptions are critical for automatic activation
- tool restrictions per skill

Sources:

- <https://code.claude.com/docs/en/skills>
- <https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices>

Difference from Cortex idea:

This is excellent prior art for procedural context activation. Cortex would treat
skills as one kind of context item, among policies, task state, observations,
evidence, and memory.

### MCP

Relevant ideas:

- tools/resources/prompts as standard server-provided capabilities
- prompts can embed resources
- clients discover resources/prompts/tools

Sources:

- <https://www.anthropic.com/news/model-context-protocol>
- <https://modelcontextprotocol.org/specification/draft/server/prompts>

Difference from Cortex idea:

MCP connects models/clients to external tools and data. It does not define
runtime policy for what enters the model context, when to compact, where to
place instructions, how to degrade evidence, or how to audit context decisions.

Useful separation:

```text
MCP connects data/tools.
Skills define procedures.
Memory stores durable state.
Cortex decides what enters this model invocation.
```

### Current CLI compactors

Relevant systems:

- Codex auto/manual compaction
- opencode session compaction/prune
- Copilot CLI / VS Code Copilot background summarization

Observed shape:

- threshold-based compaction
- whole-history or large-history summarization
- preserve some recent tail
- sometimes background summarization
- sometimes pruning old tool outputs

Sources:

- <https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs>
- <https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/compaction.ts>
- <https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/overflow.ts>
- <https://docs.github.com/en/enterprise-cloud%40latest/copilot/concepts/agents/copilot-cli/context-management>
- <https://raw.githubusercontent.com/microsoft/vscode-copilot-chat/main/src/extension/intents/node/agentIntent.ts>

Difference from Cortex idea:

These are pressure valves. Cortex should be a continuous context hygiene and
rendering layer.

## Why this may not be a standard thing already

Non-speculative version: the pieces exist, but they are scattered.

Likely engineering pressures visible from public designs:

- Many systems grew from chat transcript arrays.
- Emergency summarization is simpler to ship than typed runtime context.
- Memory frameworks are memory-centric, not full invocation-context managers.
- Provider APIs accept messages; they do not provide a context allocator.
- Invisible mutation needs audit, or users lose trust.
- Recall tools require good receipts and model behavior that actually uses them.
- Domain-specific evidence lifecycle is hard to make generic.

## Possible protocol stages

```text
1. collect
   gather candidate context items from sources

2. normalize
   convert source-specific data into ContextItem records

3. invalidate
   mark stale/superseded/expired items

4. activate
   select latent policies, skills, memories, task records, evidence

5. fold
   dedupe, group, summarize, receipt, archive

6. rank
   choose what fits the current budget

7. place
   render selected items into the right prompt/message positions

8. call
   run the model

9. observe
   capture tool calls, messages, results, state changes

10. audit
   log why context decisions were made
```

## Possible APIs

Very rough:

```ts
interface ContextSource {
  name: string
  collect(input: CollectInput): Effect<ReadonlyArray<ContextItem>>
}

interface ContextPolicy {
  name: string
  apply(input: PolicyInput): Effect<ContextPatch>
}

interface ContextRenderer {
  render(input: RenderInput): Effect<ReadonlyArray<ModelMessage>>
}

interface ContextArchive {
  put(item: ContextItem, payload: unknown): Effect<RecallHandle>
  recall(handle: RecallHandle): Effect<unknown>
  search(query: RecallQuery): Effect<ReadonlyArray<RecallResult>>
}

interface ContextAudit {
  record(event: ContextAuditEvent): Effect<void>
}
```

Potential item events:

```text
created
activated
deactivated
pinned
unpinned
marked-stale
superseded
folded
summarized
archived
recalled
placed
dropped
```

## Non-goals / traps

- Do not ask the model what context it wants every turn.
- Do not make everything semantic search.
- Do not make summaries authoritative.
- Do not hide irreversible deletion behind "compaction".
- Do not hard-code coding concepts into the core protocol.
- Do not inject every skill/rule just because it exists.
- Do not break authority ordering by placing policy-like text too low.
- Do not assume the model will recall archived evidence unless receipts are
  clear and recall is cheap.

## Open questions

- What is the minimal `ContextItem` shape?
- How much of authority/placement should be protocol vs renderer convention?
- Should recall be by exact id only at first, or also by query?
- How should receipts be phrased so models use them correctly?
- What audit events should be user-visible vs debug-only?
- How to handle sensitive archived context across agents/tasks/users?
- How to avoid cache busting when context is continuously rewritten?
- How to measure context health?
- What is the first profile to prove the protocol: coding, Jira, or personal
  task management?
- Should Cortex own skill activation, or should skills remain a separate system
  that emits context items?
- What is the degradation order under pressure?
- How do pinned items expire?

## Rough thesis

The useful thing is not a better compaction prompt. The useful thing is a
runtime that treats context as managed state.

Memory is what persists. Cortex is what is visible now.

The best version is:

```text
domain-neutral core
domain-specific adapters
deterministic hygiene first
LLM summaries only for bounded objects
exact recall always available for archived evidence
auditable context mutations
```

If this works, the user stops managing context manually. The agent receives the
right information, at the right authority level, in the right place, at the
right fidelity, with a way to recover exact source material when needed.
