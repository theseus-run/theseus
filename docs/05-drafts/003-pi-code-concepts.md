# Design Note 003: Pi Code Concepts Worth Lifting

> Status: draft
> Date: 2026-04-27

## Context

This note captures implementation-level ideas from Pi that may be useful for
Theseus. It is not about copying Pi's plugin system. The relevant question is:

```txt
Which concrete runtime/session/tool/context mechanics should Theseus consider
before locking its own runtime shape?
```

Pi is useful prior art because it keeps the core agent loop small while making
session history, context, tools, model changes, and UI events concrete. Theseus
should translate the useful mechanics into its own [architecture](../03-runtime/architecture.md),
[primitives](../02-primitives/primitives.md), [mission-system](../03-runtime/mission-system.md), and [isolation](../03-runtime/isolation.md) model.

References:

- [Pi site](https://pi.dev/)
- [Pi session format](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/session.md)
- [Pi SDK docs](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md)
- [Pi bash tool source](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/core/tools/bash.ts)
- [Pi rationale](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)

## Main Takeaway

The strongest ideas are not plugin APIs. They are durable execution substrate:

- tree-shaped work history, now already core to Theseus runtime topology
- branch summaries
- compaction as durable data
- split visible tool output from full tool evidence
- streaming tool progress
- explicit model/thinking timeline entries
- shell execution behind a backend interface
- operator actions that may or may not enter model context

These fit Theseus better than Pi because [mission-system](../03-runtime/mission-system.md) and Capsule give them
mission-level meaning.

## Adopted And Candidate Concepts

### 1. Work Tree Topology

Pi stores session history as JSONL entries with `id` and `parentId`, so a
session can branch in place. Theseus has already moved the equivalent runtime
idea into the core work tree: mission-scoped `WorkNode` rows, work-node
relations, and dispatch sessions derived from dispatch work nodes.

The important Theseus distinction is that the work tree is broader than a
dispatch transcript. Dispatch is one current work-node kind, not the topology
itself.

```txt
Mission
  WorkNode root
    Dispatch continuation
    Dispatch branch
    Future delegated task
    Future external work item
```

The runtime tree gives native answers to:

- continue from a known checkpoint
- fork before a failed approach
- compare alternate attempts
- preserve abandoned work without keeping it in active context
- show Icarus a navigable mission history

Status: adopted as core direction. The remaining Pi lesson is not "add a tree";
it is "use the tree as the natural home for summaries, compaction boundaries,
model changes, tool artifacts, and operator-visible navigation."

### 2. Branch Summaries

Pi records branch summaries when moving away from one branch. Theseus should
have an equivalent mission/runtime event.

Possible event:

```typescript
type DispatchBranchSummarized = {
  readonly _tag: "DispatchBranchSummarized";
  readonly missionId: Mission.Id;
  readonly workNodeId: string;
  readonly fromWorkNodeId: string;
  readonly summary: string;
  readonly evidenceRefs: ReadonlyArray<string>;
};
```

Capsule may curate a mission-facing version when the branch taught something
important, such as "approach A failed because the API cannot support it."

Branch summaries should not blindly summarize every abandoned path. They matter
when the abandoned path contains reusable evidence, decisions, or warnings.

### 3. Compaction As Durable Data

Pi stores compaction entries with summary, first kept entry, token count, and
provenance. Theseus should not treat compaction as invisible prompt surgery.

Possible runtime event:

```typescript
type DispatchContextCompacted = {
  readonly _tag: "DispatchContextCompacted";
  readonly dispatchId: Dispatch.Id;
  readonly strategy: "default" | "codeAware" | "topicAware" | "manual";
  readonly firstKeptEventId: string;
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly summary: string;
};
```

This makes context loss auditable. A later failure can be traced to what the
runtime chose to compress or drop.

Capsule should receive only mission-relevant compaction notes. RuntimeEvents
hold the exact mechanics.

### 4. Context Visibility Classes

Pi distinguishes extension state that is persisted from injected messages that
enter LLM context. Theseus should make this distinction universal.

Every runtime module should classify its output as one of:

```txt
durable state      -> persisted for runtime/projection use
model context      -> sent to the next dispatch call
operator projection -> visible in Icarus or CLI
capsule record     -> mission-facing durable evidence/decision
```

Do not let "stored" imply "sent to the model." Do not let "visible to operator"
imply "mission evidence."

This is especially important for skills, AGENTS instructions, memory, RAG,
telemetry, and operator actions.

### 5. Model And Thinking Timeline Entries

Pi records model changes and thinking-level changes as session entries. Theseus
should record comparable runtime events.

Possible events:

```typescript
type DispatchModelSelected = {
  readonly _tag: "DispatchModelSelected";
  readonly dispatchId: Dispatch.Id;
  readonly provider: string;
  readonly model: string;
  readonly reason: "initial" | "operator" | "policy" | "retry" | "branch";
};

type DispatchThinkingLevelSelected = {
  readonly _tag: "DispatchThinkingLevelSelected";
  readonly dispatchId: Dispatch.Id;
  readonly level: string;
  readonly reason: "initial" | "operator" | "policy" | "retry" | "branch";
};
```

This matters for audit and later quality analysis:

- which model implemented the change
- which model reviewed it
- whether an alternate branch used a stronger model
- whether a failure correlates with model/thinking changes

### 6. Tool Result Split

Pi's bash tool streams output, keeps a compact tail for the model/UI, and writes
the full output to a temp file when output is large. Theseus tools should
support this as a general result pattern.

Possible shape:

```typescript
type ToolPresentedResult = {
  readonly content: Presentation;
  readonly fullArtifact?: ArtifactRef;
  readonly truncation?: {
    readonly reason: "bytes" | "lines" | "policy";
    readonly shownLines: number;
    readonly totalLines?: number;
  };
};
```

This avoids a bad binary choice:

- dump huge output into context
- lose the evidence entirely

Runtime can keep the full artifact. The model receives a compact result. Capsule
can preserve the artifact only when it is mission evidence.

### 7. Streaming Tool Progress

Pi emits tool execution update events before the final tool result. Theseus
should model long-running tool calls as a lifecycle:

```txt
ToolStarted
ToolProgress
ToolCompleted
ToolFailed
```

This improves:

- Icarus live feedback
- test/install/server-log visibility
- interruption behavior
- Capsule evidence selection
- runtime replay/debuggability

The final `ToolCompleted` event should remain the canonical result. Progress
events are operational evidence, not necessarily model context.

### 8. Tool Execution Mode

Pi supports parallel tool execution but allows tools to force sequential
execution. Theseus should encode this in `ToolPolicy`.

Possible addition:

```typescript
type ToolExecutionPolicy = "parallel_safe" | "sequential";
```

Examples:

- read/search tools: often `parallel_safe`
- file writes/edits: usually `sequential`
- package installs/git mutations: `sequential`
- browser or REPL state tools: `sequential`

This should live next to `policy.interaction`, not inside dispatch-loop
incidental logic.

### 9. Command Execution Backend Interface

Pi's bash tool delegates command execution through a small `BashOperations`
interface. Theseus should apply the same idea to Sandbox/Workspace execution.

Possible service:

```typescript
interface CommandExecutor {
  readonly exec: (
    command: string,
    options: {
      readonly sandboxId: Sandbox.Id;
      readonly workspaceId: Workspace.Id;
      readonly env?: Readonly<Record<string, string>>;
      readonly timeoutMs?: number;
    },
  ) => Effect.Effect<CommandResult, CommandFailure>;
}
```

Providers can be host process, git worktree, container, microVM, cloud sandbox,
SSH, or test fake. Tool definitions should not know which provider is active.

This matches [isolation](../03-runtime/isolation.md): Sandbox is execution isolation, Workspace is source
state inside it.

### 10. Operator Actions Separate From Agent Actions

Pi has user bash commands that can be included in or excluded from model
context. Theseus should make operator actions first-class runtime events.

Possible event:

```typescript
type OperatorCommandRan = {
  readonly _tag: "OperatorCommandRan";
  readonly missionId: Mission.Id;
  readonly command: string;
  readonly workspaceId: Workspace.Id;
  readonly visibleToModel: boolean;
  readonly outputArtifact?: ArtifactRef;
};
```

Operator actions happen during real missions: checking a command manually,
fixing local state, restarting a dev server, or validating an assumption. They
should be observable without automatically contaminating dispatch context.

### 11. Workspace Identity On Resume

Pi tracks the session cwd and handles missing or cross-project resume cases.
Theseus should treat Workspace identity as a resume invariant.

Resume should distinguish:

```txt
same Workspace
reattach to compatible Workspace
fork into new Workspace
resume blocked because Workspace is missing
```

This prevents a mission from accidentally continuing in the wrong checkout,
branch, sandbox, or dirty state.

### 12. Shared Live Handle For Clients

Pi uses one `AgentSession` surface across interactive, print, RPC, and SDK
modes. Theseus has `TheseusRuntimeService`, but clients may need a narrower live
handle around a single mission or dispatch.

Possible shape:

```typescript
interface MissionRunHandle {
  readonly missionId: Mission.Id;
  readonly events: Stream.Stream<RuntimeEvent>;
  readonly control: (command: RuntimeControl) => Effect.Effect<void, RuntimeError>;
  readonly query: (query: RuntimeQuery) => Effect.Effect<RuntimeQueryResult, RuntimeError>;
  readonly dispose: Effect.Effect<void>;
}
```

This is not a second runtime. It is a client-facing handle over the runtime
command/control/query surface.

## Priority

Already adopted as core direction:

- Mission-scoped work tree topology for dispatches and future runtime work.

Highest remaining candidates:

1. Branch summaries as durable runtime/capsule events over work-tree nodes
2. Compaction as durable, inspectable data
3. Tool result split: compact visible result plus full artifact
4. Tool execution mode for parallel-safe vs sequential tools
5. Streaming tool progress events

These are runtime substrate decisions. They should be considered before the
runtime event/store/projection shape hardens.

## Non-Goals

This note does not recommend:

- Pi-style runtime plugins
- ambient extension auto-discovery
- npm/git packages as trusted harness behavior
- replacing typed Tools with raw shell-only tools
- chat/session as the root object
- collapsing Mission, Dispatch, RuntimeEvent, and CapsuleEvent

The useful lesson is concrete mechanics, not Pi's product boundary.
