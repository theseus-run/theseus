---
status: archived
owner: archive
kind: archive
updated: 2026-04-28
---

# Semantic Coding Harness

> Status: SUPERSEDED — see [architecture](../runtime/architecture.md) § Coding Harness
> Last updated: 2026-03-18
>
> The SemanticStore and semantic patch format were dropped after analysis:
> SEARCH/REPLACE + TS Language Service (in-process) covers the same ground
> with far less implementation surface. This doc is kept for design archaeology only.

---

## Thesis

Every existing coding agent — OpenCode, Aider, Claude Code, SWE-agent — treats the codebase
as a **text file tree**. Edits are expressed as positional operations: exact strings to find,
line numbers to target, diffs to apply. The entire apparatus of fuzzy matching (9-level
cascades, flexible patching, retry loops) exists to compensate for one structural mistake:
**positional addressing of a semantic artifact**.

Code is not a file tree. It is a **graph of named declarations** that reference each other.
The file system is just a persistence layer. Editing at the declaration level, addressed by
name rather than position, eliminates the root cause of most agent editing failures.

This document specifies what that looks like for Theseus.

---

## What is broken in the current state of the art

### 1. Positional addresses are fragile

SEARCH/REPLACE finds by exact text. Line numbers drift the moment any prior edit lands.
The 9-level fuzzy cascade in OpenCode and the flexible patching in Aider are patches over
this broken foundation — elaborate machinery that exists entirely because the address space
(character positions, exact strings) is unstable.

### 2. Verification is reactive, not proactive

Current flow universally: **write → verify → retry**. The agent writes blindly and discovers
failure after the fact. The retry loop costs latency, tokens, and often fails anyway.
Nobody runs blast radius analysis *before* writing. Nobody knows what will break until it does.

### 3. Multi-agent file editing has no concurrency model

Two grunts editing the same file is a race condition. Every system avoids it by serialising
grunt dispatch, which throws away the parallelism the actor model is supposed to enable.
Files are shared mutable state — the exact problem Effect was designed to solve in memory,
never applied to the filesystem.

### 4. Context is a flat blob

The repo map, file reads, tool results — all flat text appended sequentially to the context
window. A file read 15 turns ago competes with the current task for attention. There is no
spatial memory. The agent either has everything or re-reads.

### 5. Edit format is a prompt engineering workaround

SEARCH/REPLACE, JSON `{oldString, newString}`, unified diffs — all of these encode a
structured operation (replace declaration A with declaration B) as natural language text and
parse it back out. The LLM fails at the *encoding step*, not the reasoning step. This is
where OpenCode's 9-level cascade spends most of its complexity budget.

---

## Core insight: declarations as the unit

A TypeScript codebase is a set of **named declarations** — functions, classes, types,
interfaces, constants — that reference each other across file boundaries. The file is just
a namespace grouping.

If the runtime models the codebase at declaration granularity instead of file granularity:

- **Addressing** becomes `file::DeclarationName` or `file::Class.method` — stable regardless
  of surrounding edits
- **Reading** returns only the needed declaration (20 lines, not 200)
- **Writing** replaces a named node in the AST — no fuzzy matching
- **Concurrency** can lock at declaration level — two grunts editing different functions in
  the same file proceed in parallel
- **Blast radius** is readable from the import graph before any write happens

---

## The SemanticStore

A new Effect service. The single source of truth for code structure.

```typescript
class SemanticStore extends ServiceMap.Service<SemanticStore, {
  // Read one declaration by semantic address
  get: (addr: SemanticAddress) => Effect.Effect<Declaration, DeclarationNotFound>

  // List all top-level declarations in a file
  list: (path: string) => Effect.Effect<ReadonlyArray<DeclarationMeta>>

  // Replace a declaration — optimistic, version-checked
  // Fails with StaleVersion if another agent edited it since addr was read
  replace: (
    addr: SemanticAddress,
    newSource: string,
    version: string
  ) => Effect.Effect<void, StaleVersion | ParseError | TypeError>

  // Full codebase skeleton — all declarations, signatures only, ~500 tokens
  skeleton: () => Effect.Effect<string>

  // Blast radius: what will transitively break if this declaration changes?
  blastRadius: (addr: SemanticAddress) => Effect.Effect<ReadonlyArray<SemanticAddress>>

  // Live stream of changed addresses (from Bun file watcher)
  watch: () => Stream.Stream<SemanticAddress>
}>()("SemanticStore") {}
```

### Types

```typescript
// "persistent-agent.ts::PersistentAgent.run"
// "llm/copilot.ts::CopilotProvider"
// "registry.ts::AgentRegistryLive"
type SemanticAddress = `${string}::${string}`

interface Declaration {
  address:      SemanticAddress
  kind:         "function" | "class" | "method" | "type" | "const" | "interface" | "enum"
  source:       string                      // full source text of this declaration only
  signature:    string                      // first line(s) — for skeleton
  version:      string                      // sha256 of source; used as optimistic lock
  startLine:    number                      // position in file (for splicing)
  endLine:      number
  dependencies: ReadonlyArray<SemanticAddress>  // what this declaration references
  dependents:   ReadonlyArray<SemanticAddress>  // what references this declaration
}
```

### Implementation layer

Backed by the **TypeScript compiler API** — not tree-sitter, not regex, not a separate
language server process. The `typescript` npm package exposes `ts.createSourceFile`,
`ts.forEachChild`, and the full type checker API. This is the same AST that `tsserver`
and `tsc` use internally, available in-process.

```typescript
import ts from "typescript"

// Parse a file into declarations
const parse = (filePath: string, source: string): Declaration[] => {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const decls: Declaration[] = []
  ts.forEachChild(sf, node => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ...) {
      decls.push(extractDeclaration(sf, node, filePath))
    }
  })
  return decls
}
```

The store keeps an in-memory `HashMap<SemanticAddress, Declaration>`, updated by a Bun
file watcher (`Bun.watch`) that re-parses changed files incrementally. No Ollama. No
embeddings. No tree-sitter binary. Only the TypeScript compiler that is already a dev
dependency.

### Concurrency via STM

Concurrent writes to the same declaration are serialised using Effect's `STM` module.
Writes to different declarations in the same file proceed in parallel. The version check
(`StaleVersion` error) ensures optimistic concurrency: a grunt that read declaration v1
and tries to write cannot accidentally overwrite a concurrent grunt's v2.

```typescript
// Inside SemanticStore.replace — conceptually:
STM.atomically(
  STM.gen(function* () {
    const current = yield* TRef.get(declRef)
    if (current.version !== expectedVersion) yield* STM.retry  // or fail
    yield* TRef.set(declRef, newDecl)
  })
)
```

---

## The Semantic Patch edit format

The LLM stops encoding edits as structured text (SEARCH/REPLACE, diffs, JSON). Instead,
the LLM's edit response contains one or more **semantic patch blocks**:

```
EDIT persistent-agent.ts::PersistentAgent.run
---
override run(): Effect.Effect<never, never, never> {
  const self = this
  return Effect.gen(function* () {
    while (true) {
      const msg = yield* Queue.take(self._inbox)
      if (msg._tag !== "Task") continue

      const response = yield* self._callLLM(buildMessages(yield* Ref.get(self._stateRef)))

      // yield point A
      const steer = yield* Queue.poll(self._inbox)

      // execute tool calls from response
      const toolResults = yield* executeTools(response.toolCalls ?? [])

      // yield point B
      yield* Queue.poll(self._inbox)

      yield* Ref.update(self._stateRef, appendTurn(response, toolResults))
      yield* self.send(msg.replyTo, { _tag: "TaskDone", taskId: msg.taskId })
    }
  }) as Effect.Effect<never, never, never>
}
---
```

### Format spec

```
EDIT <semantic-address>
---
<valid TypeScript source for this declaration>
---
```

Multiple `EDIT` blocks may appear in one response. The server processes them in order.

### Server-side application

For each block:

1. **Parse** — `ts.createSourceFile` on the block source. Syntax error → reject immediately,
   no disk write.
2. **Locate** — `SemanticStore.get(addr)` to find current position in file.
3. **Splice** — replace `[startLine, endLine]` in the file with the new source, preserving
   surrounding indentation context.
4. **Verify** — run `tsc --noEmit` on the project (via `Bun.$`). Errors are structured
   `file:line:col: error TSxxxx: message` — inject as the next LLM turn.
5. **Commit** — update the SemanticStore's in-memory index.

No fuzzy matching at any step. The LLM writes valid TypeScript. The runtime handles
placement. The TypeScript compiler validates correctness.

### Why not JSON tool calls for writes?

Aider's benchmark data is clear: LLMs produce fewer errors with text-embedded code blocks
than with JSON-encoded source strings. TypeScript template literals, generics with `<`,
multiline strings, and decorators all have characters that require escaping inside JSON
strings. The LLM fails at *encoding*, not reasoning. Semantic patch blocks are plain
TypeScript — no escaping, no JSON wrapper, natural output.

JSON tool calls are still used for **reads** (`SemanticStore.get`, `SemanticStore.list`,
`shell`) where structured parameters are safe and precise. Reads are tool calls. Writes
are text blocks. Each protocol is used where it is reliable.

---

## Pre-write blast radius

Before dispatching any grunt to edit a declaration, the architect agent runs:

```typescript
const affected = yield* SemanticStore.blastRadius(
  "persistent-agent.ts::PersistentAgent"
)
// → [
//     "agents/coordinator.ts::CoordinatorAgent.run",   // imports PersistentAgent
//     "registry.ts::AgentRegistryLive",                // uses BaseAgent (supertype)
//     "index.ts::*"                                    // re-exports
//   ]
```

The blast radius is derived from the import/dependency graph already computed by the
TypeScript compiler as part of `SemanticStore` initialisation — no extra analysis step.

The architect now knows the full impact surface before any file changes. It can:
- Dispatch coordinated grunts for all affected declarations in parallel
- Choose a non-breaking approach (add an overload rather than change the signature)
- Warn the user if the blast radius is unexpectedly wide

This converts the failure mode from "write → discover broken imports → retry loop" to
"know impact → decide → write once → verify → done."

---

## CodeSession — edits as Effect Scopes

Every agent work session is a scoped Effect. The Scope manages:

- Shadow copies of files being modified (for rollback on failure or interrupt)
- Optimistic locks on declarations being written
- A verification gate before the Scope closes (tsc must pass)
- A transaction record in the session log

```typescript
Effect.scoped(
  Effect.gen(function* () {
    const session = yield* CodeSession.begin("add tool execution to PersistentAgent")

    // Blast radius check
    const affected = yield* session.blastRadius("persistent-agent.ts::PersistentAgent.run")
    yield* session.acknowledgeImpact(affected)

    // Dispatch grunt per affected declaration — parallel where declarations are independent
    yield* Effect.all(
      affected.map(addr => session.dispatchGrunt(addr, instruction)),
      { concurrency: "unbounded" }
    )

    // Gate: all tsc errors must be resolved before scope closes
    yield* session.verify()

    // Scope closes cleanly: shadow copies discarded, locks released, transaction committed
  })
)
// On any failure: Scope finaliser restores shadow copies, releases all locks
```

Failure at `verify()` triggers the Scope finaliser — shadow copies are restored, locks
released, the failed transaction is recorded with full context for retry or escalation.
No partial edits ever land on disk. The codebase is always in a valid (or original) state.

This is the `propose_commit` pattern from ContextPlus, but implemented natively as an
Effect `Scope` rather than as an external MCP tool with a separate shadow directory.

---

## The skeleton as a live Effect Stream

The repo map is not a one-shot snapshot. It is a reactive stream derived from the
SemanticStore's file watcher:

```typescript
const skeleton: Stream.Stream<string> = SemanticStore.watch().pipe(
  Stream.mapEffect(() => SemanticStore.skeleton()),
  Stream.debounce("500 millis")
)
```

The `skeleton()` output is the concatenation of every declaration's `signature` field —
all exports, all types, all function signatures, zero implementation. For Theseus's
current codebase this is approximately 400–600 tokens. It lives permanently in the
system prompt and is always current. The agent never reasons about stale structure.

Approximate skeleton output for Theseus today:

```typescript
// agent.ts
export type AgentId = string
export interface RuntimeContext { send(...): ...; publish(...): ...; log(...): ... }
export abstract class BaseAgent<Msg, State> {
  abstract readonly id: AgentId
  abstract readonly initialState: State
  handle(msg: Msg, state: State): Effect<State>
  run?(): Effect<never, never, never>
}

// registry.ts
export class AgentRegistry extends ServiceMap.Service<...>()("AgentRegistry") {}
export declare const AgentRegistryLive: Layer<AgentRegistry, ...>

// llm/copilot.ts
export class CopilotProvider extends ServiceMap.Service<...>()("CopilotProvider") {}
export declare const CopilotProviderLive: Layer<CopilotProvider>

// ... etc
```

---

## Shell layer (narrower than it would otherwise be)

With `SemanticStore` handling file read/write/navigate, the shell tool covers only what
cannot be expressed as a declaration operation:

- Running tests: `` Bun.$`bun test` ``
- Type checking: `` Bun.$`bun tsc --noEmit` ``
- Git operations: `` Bun.$`git diff --staged` ``
- Running the agent itself for self-testing

`Bun.$` is the substrate — a cross-platform bash-like shell that runs in-process (no
system shell invocation), escapes all interpolated values by default, and exposes
`.text()`, `.lines()`, `.json()` output adapters. Wrapped in a single Effect helper:

```typescript
const shell = (strings: TemplateStringsArray, ...args: unknown[]) =>
  Effect.promise(() => $`${strings}${args}`.nothrow().text())
    .pipe(Effect.map(out => out.trim()))
```

Ripgrep for text search (`rg "symbol" src/ -n`) remains available via shell when the
SemanticStore's structured blast radius is insufficient (e.g., searching string literals,
comments, JSX props).

---

## How this maps to Theseus's actor architecture

The architect/editor split is already implicit in Theseus's tier model. This design
makes it explicit:

```
Named Agent (Forge, Planner, etc.) — the architect
  Has skeleton in system prompt (permanent, live-updated)
  Uses SemanticStore.get to read specific declarations
  Runs blastRadius before any write
  Opens a CodeSession (Effect Scope) per task
  Dispatches grunt editors via registry.spawnAndAwait

Grunt (Editor) — per declaration, ephemeral
  Receives: declaration source + context + instruction
  System prompt: "You are a code editor. Output one EDIT block. No explanation."
  Outputs: one EDIT semantic patch block
  Runtime applies, runs tsc --noEmit, reports errors
  Retry loop: up to 3 iterations, then escalate with error context to architect

Grunt (Verifier) — optional, post-session
  Runs bun test after a CodeSession commits
  Reports failures as a structured message back to the architect
```

The grunt editor's system prompt is intentionally stripped down — no repo map, no history,
just the file context and the task. This mirrors Aider's `editor-diff` mode, which uses
a simpler prompt focused only on editing rather than reasoning.

---

## Verification model

```
WRITE ATTEMPT
  ↓
Parse block source   (ts.createSourceFile — syntax only, instant)
  ↓ syntax error → reject, no disk write, retry
Splice into file     (SemanticStore.replace)
  ↓ StaleVersion → re-read, re-attempt
tsc --noEmit         (Bun.$, ~200ms for Theseus's codebase)
  ↓ type errors → inject as next LLM turn, retry (max 3)
bun test             (only on CodeSession.verify, not per edit)
  ↓ test failures → structured report to architect
COMMIT               (CodeSession Scope closes cleanly)
```

This is a three-stage gate: syntax → types → behaviour. Each gate produces structured
errors that feed directly into the LLM's next turn. The LLM never needs to guess what
went wrong — it reads the compiler output.

---

## Comparison with existing approaches

| Problem | OpenCode / Aider / Claude Code | This design |
|---------|-------------------------------|-------------|
| Edit fragility | 9-level fuzzy cascade, retry loops | Semantic splice by name — no matching |
| Multi-agent concurrency | Serial dispatch (wasted parallelism) | STM declaration-level locking |
| Context waste | Read whole files for small edits | Read only the declaration (~20 lines vs ~200) |
| Post-write breakage discovery | Write → verify → retry (expensive) | Blast radius before write + Scope verification gate |
| Stale context | Regenerate map on demand | Live stream from Bun file watcher |
| Edit format fragility | JSON escaping, exact-text matching | LLM writes valid TS; server places it by AST |
| Partial failed edits landing | Possible without careful tooling | Impossible — Scope finaliser restores on any failure |

---

## What needs to be built (ordered)

### Phase 1 — SemanticStore (foundation)

1. `ts.createSourceFile` based declaration parser for TypeScript/TSX
2. `HashMap<SemanticAddress, Declaration>` in-memory index as Effect `Ref`
3. Bun file watcher (`Bun.watch`) → incremental re-parse → index update
4. `skeleton()` — concatenate all `Declaration.signature` fields
5. `get(addr)` and `list(path)` — read queries
6. `replace(addr, newSource, version)` — STM-locked optimistic write with file splice
7. `blastRadius(addr)` — walk dependency graph from import analysis
8. `SemanticStoreLive` Layer — wires all of the above

### Phase 2 — Semantic patch protocol

9. Semantic patch parser — extract `EDIT addr\n---\nsource\n---` blocks from LLM response
10. Block validator — `ts.createSourceFile` syntax check before disk write
11. Apply loop — `replace` + `tsc --noEmit` + error injection
12. Retry wrapper — up to 3 iterations per block, escalate on exhaustion

### Phase 3 — CodeSession

13. `CodeSession.begin(intent)` — opens Effect Scope, creates shadow copies
14. `CodeSession.dispatchGrunt(addr, instruction)` — `registry.spawnAndAwait` grunt editor
15. `CodeSession.verify()` — tsc + bun test gate; failure triggers Scope finaliser
16. Transaction log — record intent, addresses, result, error (for self-improvement)

### Phase 4 — Shell + agent wiring

17. `shell` Effect helper wrapping `Bun.$`
18. Skeleton stream wired into named agent system prompt
19. `Forge` named agent — architect loop using SemanticStore + CodeSession
20. Grunt editor — stripped prompt, EDIT block output, retry loop

---

## Open questions

- **Declaration granularity for classes:** should `Class.method` be individually addressable,
  or only the whole class? Individually addressable is more efficient; whole-class is simpler
  to implement and avoids splice bugs in class bodies.

- **TypeScript compiler performance:** `ts.createProgram` with full type checking is slow
  (~2s for a medium project). For the SemanticStore index we only need parse-level AST
  (no type checking) — `ts.createSourceFile` alone is ~10ms per file. Type checking is
  reserved for the verification step (`tsc --noEmit`), not for indexing.

- **Non-TypeScript files:** `package.json`, `.md`, `.sh`, config files. These cannot be
  addressed semantically. Fall back to whole-file read/write for non-TS files. The
  SemanticStore delegates to a plain `FileStore` for these.

- **Context compaction and declarations:** as conversationHistory grows, the agent accumulates
  references to declaration versions that no longer exist. The compaction strategy needs to
  be declaration-aware — summary should preserve semantic addresses, not line numbers.

- **Self-modification safety:** Theseus editing its own runtime while it's running. The
  CodeSession Scope gives us atomicity, but we need to ensure the edited code is not
  loaded into the running process mid-session. Bun's module cache complicates hot-reload.
  Strategy: edits land on disk; restart is explicit (`bun run start`); no hot-reload in v1.
