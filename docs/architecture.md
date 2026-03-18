# Theseus — Architecture

> Status: locked  
> Last updated: 2026-03-17

---

## What we are building

A **headless, Effect-first, actor-model agentic runtime** where a single orchestrator (`Theseus`) manages a hierarchy of persistent and ephemeral agents. Agents are **long-lived fibers** that accumulate context across tasks and can be steered mid-work — not re-spawned fresh on every invocation.

The concurrency model is deliberately Erlang/OTP-flavoured: each agent is an actor with its own mailbox, the runtime is the supervisor, and Effect replaces the BEAM's process primitives.

---

## Locked decisions

| Decision | Choice | What it rules out |
|---|---|---|
| **LLM provider** | GitHub Copilot only | Multi-provider routing, API key management, separate billing |
| **UI** | Headless — `TuiLogger` (ANSI stdout) only | Panes, re-render, keyboard input loop, streaming to UI |
| **Concurrency model** | Effect fibers + typed queues (actor-style) | Thread pools, callback hell, ad-hoc async/await orchestration |
| **State** | `Ref` / `Queue` / `PubSub` — no shared mutable state | Global singletons, event emitters, in-process pub/sub hacks |
| **Resource cleanup** | Effect `Scope` / `Layer` / fiber interruption | Manual teardown, `finally` blocks, process exit handlers |

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Bun |
| Concurrency / resources | `effect@4.0.0-beta.33` |
| Platform services | `@effect/platform-bun@4.0.0-beta.33` (FileSystem, Command, HttpClient) |
| LLM | GitHub Copilot (`api.githubcopilot.com/chat/completions`) via `CopilotProvider` Effect service |
| Prompt building | `@theseus.run/jsx-md` (in monorepo) — JSX → Markdown |
| Schema / contracts | `effect/Schema` |

### Copilot auth flow (locked)

```
1. readFileSync ~/.config/github-copilot/apps.json  → oauth_token
2. GET  api.github.com/copilot_internal/v2/token
   Authorization: Token {oauth_token}
   → { token: <bearer>, expires_at: <unix_ts> }   (cached, refreshed 60 s before expiry)
3. POST api.githubcopilot.com/chat/completions
   Authorization: Bearer {bearer}
   Copilot-Integration-Id: vscode-chat
   Editor-Version: theseus-runtime/0.0.1
   → standard OpenAI chat completions response
```

No separate API key. No additional subscription. Reuses the existing Copilot seat.

---

## Three-tier hierarchy

```
User
 │  natural language
 ▼
Theseus                          ← 1 instance, always running
 │  typed Queue messages
 ▼
Named Agents                     ← N instances, persistent fibers
 │  spawnAndAwait
 ▼
Grunts                           ← ephemeral, task-scoped fibers
```

---

## Tier 1 — Theseus (Orchestrator)

- **Single instance.** The user's sole communication channel.
- **Never does work directly.** Delegates to named agents.
- **Owns named agent lifecycle:** spawn, wake, sleep, kill.
- **Session composition:** on startup reads session context (repo, task, history), decides which named agents to pre-spawn, which skills to inject.
- **Named agent spawn requests:** when a named agent requests a peer, the request flows through Theseus. Named agents never directly spawn other named agents.

---

## Tier 2 — Named Agents (Persistent)

### Identity

| Concept | Example | Meaning |
|---|---|---|
| Class | `Forge` | Agent type — capabilities, base prompt, tool set |
| Instance | `forge-1` | Running fiber with its own inbox and state |
| Composition | `forge-typescript-coder` | Instance + injected skills |

### Lifecycle states

```
sleeping  →  working  →  sleeping
    │                       │
    └──────── stopped ───────┘
                 │
           composing  (Theseus building a new specialisation)
```

- **Sleeping:** fiber blocked on `Queue.take(inbox)`. Zero cost. Context fully preserved.
- **Working:** processing a task, LLM calls in flight, tool calls executing.
- **Composing:** Theseus assembling a specialised version (new skill stack, new system prompt).
- **Stopped:** fiber interrupted, state discarded.

### Context persistence

Each named agent carries `conversationHistory: Message[]` in `_stateRef`. History accumulates across tasks — the agent does not start fresh on each dispatch. Context compaction (summarisation) is a future concern.

### Steering (yield point model)

```
loop:
  llm_response  ← yield* callLLM(history)
  steer?        ← yield* Queue.poll(inbox)   ← yield point A
  tool_result   ← yield* executeTool(llm_response)
  steer?        ← yield* Queue.poll(inbox)   ← yield point B
  append to history
```

Steering injects a correction mid-task without killing or restarting the agent.

### Known named agents

| Name | Role |
|---|---|
| `Forge` | Code editing, file operations, refactoring |
| `Atlas` | Research, documentation, knowledge retrieval |
| `Planner` | Strategic decomposition, task planning |
| `Critic` | Review, validation, adversarial feedback |

---

## Tier 3 — Grunts (Ephemeral)

- Dispatched by named agents via `registry.spawnAndAwait`.
- One task, one answer, then stopped. No persistent context.
- LLM reasoning for a bounded subtask — distinct from deterministic tools.

```typescript
result ← yield* registry.spawnAndAwait(Probe, { query: "..." })
```

| Name | Task |
|---|---|
| `Probe` | Single targeted question |
| `Scope` | Codebase scan — file structure, symbols, deps |

---

## Skill / Composition system

```typescript
type Skill = {
  name: string
  instructions: JSX.Element   // rendered to Markdown via @theseus.run/jsx-md
  tools?: ToolDefinition[]
  model?: ModelOverride
}
```

Theseus composes specialised agents by stacking skills onto a base class. Rendered system prompts are deterministic from the skill set. Skills are versioned. Compositions are reproducible.

---

## Communication patterns

```
User          →  Theseus        natural language (stdin)
Theseus       →  Named Agent    typed Queue message
Named Agent   →  Theseus        typed Queue message (incl. SpawnRequest)
Named Agent   →  Grunt          spawnAndAwait
Any           →  Bus (PubSub)   broadcast for observability
```

### Message types (core)

```typescript
type OrchestratorMsg =
  | { _tag: "Task";  taskId: string; description: string }
  | { _tag: "Steer"; guidance: string }
  | { _tag: "Sleep" }
  | { _tag: "Stop" }

type AgentReport =
  | { _tag: "Done";         taskId: string; summary: string }
  | { _tag: "Blocked";      taskId: string; reason: string }
  | { _tag: "SpawnRequest"; agentClass: string; skills: Skill[]; reason: string }
```

---

## What exists today

```
packages/theseus-runtime/
├── src/
│   ├── agent.ts              BaseAgent<Msg,State> — inbox, stateRef, fiber, helpers
│   ├── registry.ts           AgentRegistry — spawn, send, stop, list
│   ├── bus.ts                MessageBus — PubSub broadcast
│   ├── tui.ts                TuiLogger — ANSI timestamped stdout
│   ├── runtime.ts            Layer wiring + main Effect
│   ├── llm/
│   │   ├── copilot.ts        CopilotProvider — auth, token cache, chat()
│   │   └── index.ts          barrel
│   └── agents/
│       ├── persistent-agent.ts   PersistentAgent — real LLM calls, yield points
│       └── coordinator.ts        CoordinatorAgent — drives the POC scenario
packages/jsx-md/              JSX → Markdown renderer
packages/jsx-md-beautiful-mermaid/
```

**Status:** `bun run start` runs end-to-end. Real Copilot LLM calls. Persistent context across tasks. Mid-task steering via `Queue.poll` yield points — all three properties verified.

---

## Coding Harness (locked)

> The tools Forge and other coding agents use to read, edit, and understand the codebase.

### Edit protocol: SEARCH/REPLACE

No semantic patch format. No JSON `{oldString, newString}`. The LLM outputs:

```
<<<<<<< SEARCH
old code here
=======
new code here
>>>>>>> REPLACE
```

We find the old text verbatim, swap it. Modern models (Claude, GPT-4) handle this well —
84%+ success rate per Aider benchmark data. The failure modes are visible and recoverable.
No fuzzy cascade. If the search text isn't found, the agent re-reads the file and retries.

### Context: TypeScript Language Service skeleton

The repo map is generated in-process using `ts.createLanguageService`. On session start,
the service emits a `.d.ts`-style skeleton — all exported signatures, zero implementation.
~400–600 tokens for this codebase. Lives in the system prompt. Always current.

No tree-sitter. No separate process. The `typescript` package is already a transitive
dependency.

### Navigation / search: TypeScript Language Service

NOT a custom SemanticStore. NOT LSP over stdio. The `typescript` package's Language
Service API runs in-process:

```typescript
import ts from "typescript"
const service = ts.createLanguageService(host, ts.createDocumentRegistry())

// find symbol by name → position
service.getNavigateToItems("PersistentAgent.run")

// blast radius: all references to a symbol
service.getReferencesAtPosition(fileName, offset)

// type errors after an edit — faster than tsc --noEmit, incremental
service.getSemanticDiagnostics(fileName)
```

The `LanguageServiceHost` is ~20 lines of boilerplate telling the service how to read
files via `Bun.file()`. Initialized once per session as an Effect `Layer`, warm for the
duration.

**Why not ts-morph:** ts-morph wraps the same API but adds dependency weight and
tracks TypeScript internal API changes. We use `typescript` directly — same capability,
one fewer abstraction.

**Why not LSP:** LSP requires a subprocess, JSON-RPC, document sync protocol, and
version management. In-process Language Service has the same capabilities with none of
the overhead.

### The four tools (complete list for v1)

| Tool | Implementation | Purpose |
|---|---|---|
| `readFile(path)` | `Bun.file(path).text()` | Read any file |
| `searchReplace(path, search, replace)` | String find + splice + write | Edit code |
| `skeleton()` | TS Language Service | Repo map in system prompt |
| `findReferences(symbolName)` | `getNavigateToItems` + `getReferencesAtPosition` | Blast radius / navigation |
| `checkDiagnostics(path)` | `getSemanticDiagnostics` | Verify after edit |

### Verification model

```
searchReplace(path, old, new)
  ↓
checkDiagnostics(path)        ← in-process, incremental, ms not seconds
  ↓ errors → inject into next LLM turn, retry (max 3)
bun test                      ← only after all edits land, via shell tool
  ↓ failures → structured report to Forge
DONE
```

No shadow copies. No STM. No CodeSession. No optimistic locking. Verification is fast
enough to run after every individual edit.

### What is explicitly NOT being built

- **SemanticStore** — custom AST index with `HashMap<SemanticAddress, Declaration>`.
  The TS Language Service provides blast radius and diagnostics without building this.
- **Semantic patch format** (`EDIT addr\n---\nsource\n---`). Adds LLM address precision
  requirement and silent failure modes. SEARCH/REPLACE is simpler and empirically good.
- **STM declaration-level locking** — premature optimisation. Serial grunt dispatch
  for now; concurrency revisited when we actually hit the limit.
- **CodeSession Scope with shadow copies** — rollback via shadow copy is valuable but
  deferred. Verification gate (`checkDiagnostics` + `bun test`) catches errors without
  needing file-level transactions in v1.

---

## What is not yet built (ordered)

1. **TS Language Service Layer** — `LanguageServiceHost` boilerplate + Effect `Layer`
2. **FileSystem tools** — `readFile`, `searchReplace` using `Bun.file()` + Effect wrappers
3. **Shell execution** — `Command` service, capture stdout/stderr as Effect streams
3. **Theseus basic loop** — receives user input from stdin, dispatches to named agents
4. **Skill system** — `Skill` type, jsx-md rendering pipeline, composition at spawn time
5. **`registry.spawnAndAwait`** — grunt dispatch: spawn ephemeral agent, await result, auto-stop
6. **Theseus session composition** — on startup: read context, plan agent set, compose specialisations
7. **Named agent spawn requests** — `SpawnRequest` message type, Theseus approval loop
8. **Context compaction** — summarise history when it exceeds a threshold
9. **State persistence** — serialize agent state to disk, resume from checkpoint

---

## Open questions

- **Sleep vs disk persistence:** sleeping = fiber on `Queue.take` for now. Disk persistence deferred until context compaction is clear.
- **Grunt model selection:** inherit caller's model or always use a cheaper/faster one?
- **Theseus autonomy level:** how much can Theseus decide without user confirmation? Per-session config or per-action type?
- **Named → Named spawning depth:** capped at 1 level via Theseus today. Revisit if Planner → Critic → SubCritic patterns emerge.

---

## Deferred ideas — research backlog

> Status: locked for reference. Do not implement until explicitly scheduled.  
> Sources: cocoindex-code (`indexer.py`), Morph Compact SDK, Context+ (TypeScript MCP, tree-sitter WASM + Ollama).

### Harness tool improvements

**A — `fileSkeleton` tool**  
Return all exported symbols with line ranges using `languageService.getNavigateToItems("*")`.  
No file body. Example output: `export function verifyToken (L20–L58)`.  
Forge calls this first; reads only the spans it needs. Highest token-savings idea available without embeddings.

**B — File-read staleness tracking**  
Maintain `Map<absPath, mtimeMs>` at harness level. Record mtime after every successful `readFile` or `searchReplace`.  
On next access, if mtime changed, prepend: `⚠ This file was modified since your last read (current content shown).`  
Prevents stale-mental-model edits when shell tool runs a formatter between reads.

**C — `readFile` with symbol anchor**  
Add optional `symbol` param to `readFile`. Use `languageService.getNavigateToItems(symbol)` to find the definition span, return only that function/class body + N context lines.  
Turns a 500-line file read into a ~30-line targeted read.

**F — `findReferences` call-site context**  
Current output: `src/middleware/guard.ts:33:5`.  
Enhanced output: `src/middleware/guard.ts:33  verifyToken(token)  (read)`.  
Return the actual source line alongside coordinates. No extra round-trips for the agent.

### Context management (fully deferred — do not start)

**G — Objective vs query-based compaction**  
Two modes: (1) between tasks, no query — drop tool results for files not mentioned in upcoming task; (2) mid-task with query — weight keep/drop by relevance to current instruction string.

**H — Verbatim deletion only**  
Compaction must only delete whole messages, never rewrite or summarise. Every surviving message is byte-for-byte identical. Prevents hallucinated context drift.

**I — `preserve_recent: N`**  
Always keep the last N message pairs untouched, regardless of compaction pressure.

**J — Compaction audit log**  
Log which messages were dropped to TuiLogger: `"Dropped 3 tool results (readFile utils.ts, shell grep, listDir)"`. Operator-visible.

**K — Compaction as a coordinator step**  
Run compaction between tasks: after forge sends `TaskDone`, before coordinator dispatches the next task. Never mid-task. The coordinator is already the correct insertion point.
