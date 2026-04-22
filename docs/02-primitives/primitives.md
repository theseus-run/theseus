# Theseus — Primitive Stack

> Status: locked for now
> Last updated: 2026-04-02

Five irreducible primitives. Everything else is built on these or is scaffolding.
All five survive any model capability leap. None are vendor-locked.

---

## 1. Mission

The unit of work. Without a goal there is nowhere to go. Without completion criteria
there is no landing. Everything else — crew, capsule, workspace — is provisioned for
a Mission. This is the container.

```typescript
interface Mission {
  readonly id:       MissionId
  readonly goal:     string
  readonly criteria: ReadonlyArray<string>  // how we know we're done — non-negotiable
  readonly status:   "pending" | "running" | "done" | "failed" | "cancelled"
}
```

**Effect:** A `Scope` providing a `Layer` — all other primitives (Capsule, Bus, workspace
path) are services inside it. Mission closes = scope closes = everything inside is
interrupted and cleaned up.

**Ship:** *The vessel.* Hull number, flight plan, destination criteria. No criteria = the
ship never knows when to turn around.

---

## 2. Tool

The boundary between AI reasoning and the world. Even a perfect model in a 3M context
window needs to read files, run commands, fetch data. The channel between thought and
effect is always needed.

**All-Effect pipeline.** Every step on `Tool<I, O>` is an Effect — decode, execute,
validate, encode. Spread+override any step (inject logging, security scans, permission
tracking at any boundary). No sync chokepoints.

```typescript
// Mutation level — ordered, each implies access to levels below
type ToolSafety = "readonly" | "write" | "destructive"

// Typed contract between schema libraries (Zod, Effect Schema) and Tool
interface SchemaAdapter<T> {
  readonly json:   Record<string, unknown>  // JSON Schema document
  readonly decode: (raw: unknown) => T      // parse/validate — throws on invalid
}

// Runtime-facing — all pipeline steps are Effects
interface Tool<I, O> {
  // Metadata (6 fields)
  readonly name:          string
  readonly description:   string
  readonly inputSchema:   Record<string, unknown>    // JSON Schema for LLM
  readonly outputSchema?: Record<string, unknown>    // JSON Schema for LLM (optional)
  readonly safety:        ToolSafety
  readonly capabilities:  ReadonlyArray<string>

  // Pipeline steps (4 fields, all Effects)
  readonly decode:    (raw: unknown) => Effect<I, ToolErrorInput>
  readonly execute:   (input: I) => Effect<O, ToolError | ToolErrorRetriable>
  readonly validate?: (output: O) => Effect<O, ToolErrorOutput>
  readonly encode:    (output: O) => Effect<string, ToolError>
}

// Author-facing — ergonomic, SchemaAdapter generates decode/validate
type ToolDef<I, O> = {
  readonly name:          string
  readonly description:   string
  readonly inputSchema:   SchemaAdapter<I>           // generates decode + json
  readonly outputSchema?: SchemaAdapter<O>           // generates validate + json
  readonly safety:        ToolSafety
  readonly capabilities:  ReadonlyArray<string>
  readonly execute: (input: I, ctx: ToolContext) => Effect<O, ToolError | ToolErrorRetriable>
  readonly encode:  (output: O) => string            // sync — defineTool wraps in Effect
}
```

`defineTool(ToolDef) → Tool` bridges the ergonomic author config into the all-Effect
runtime interface. `inputSchema.json` becomes `inputSchema`, sync `encode` wraps in
`Effect.try`, `inputSchema.decode` wraps in `Effect.try` → `ToolErrorInput`, etc.

**Decoration via spread:** override any pipeline step without subclassing.
```typescript
const guarded = { ...readFile, decode: (raw) =>
  readFile.decode(raw).pipe(
    Effect.flatMap(input => input.path.includes(".env")
      ? Effect.fail(new ToolErrorInput({ tool: "readFile", message: "blocked" }))
      : Effect.succeed(input)),
  ),
}
```

**Errors — four types, one naming convention (`ToolError*`):**

| Type | Created by | Meaning |
|---|---|---|
| `ToolError` | Tool author via `ctx.fail()` | Permanent — LLM sees and reacts |
| `ToolErrorRetriable` | Tool author via `ctx.retriable()` | Retriable — runtime retries silently |
| `ToolErrorInput` | Runtime (`callTool`) / decoration | LLM sent bad args — decode failed |
| `ToolErrorOutput` | Runtime (`callTool`) / decoration | Tool returned invalid shape — validate failed |

Defects (bugs in tools) propagate via `Effect.die` — no special class.

**ToolContext** — error factories pre-bound to the tool name, passed as second arg
to execute. Tool authors never repeat the tool name in errors:

```typescript
execute: ({ path }, { fail, retriable }) =>
  Effect.tryPromise(() => fetch(path)).pipe(
    Effect.mapError(e =>
      e instanceof TypeError
        ? retriable("network blip", e)   // runtime retries silently
        : fail("http error", e),         // LLM sees this
    ),
  )
```

**Safety** is a single ordered enum — not independent booleans. A tool that destroys
also writes. `readonly < write < destructive`. Runtime derives confirmation policy and
retry safety from this. No boolean explosion.

**No separate retry classification.** Tools compose their own resilience inside
`execute` using Effect combinators (retry, timeout, fallback). The runtime provides a
default retry for `ToolErrorRetriable` (3x exponential jittered) via `callTool`. Safety
informs retry safety: `readonly` = always safe to retry, `write`/`destructive` = not.

**Output schema** enables the runtime to validate tool output. Optional — deterministic
tools may skip it.

**Capabilities** are strings, not an exhaustive union — unions go stale. Used for
structural toolset assembly (read-only grunt = no tool with `"fs.write"`).
Orthogonal to safety: capabilities describe WHAT the tool touches, safety describes
HOW MUCH it changes the world.

Schema-agnostic: `SchemaAdapter` wraps JSON Schema + sync decoder. Adapters for Zod
(`fromZod`) and Effect Schema (`fromEffectSchema`) ship separately. MCPs are Tools.
Deterministic functions are Tools. Same interface throughout.

**`callTool` — the runtime execution pipeline:**
`decode → execute → retry ToolErrorRetriable → validate → encode → string`.
One function. "Try 3 times and die." Exhausted retries become `ToolError`.

**Effect:** Every pipeline step is `Effect<T, E>` — a named, typed effectful operation.
Error handling composed in the pipeline, not configured in data.

**Ship:** *Instruments.* Sensors, manipulators, drives. Nothing touches the universe
bare-handed.

---

## 3. Capsule

The mission's append-only log. Exists for the human reviewing the voyage — debugging,
extracting improvement patterns, feeding the next mission. Not for the AI.
Paper outlasts the companies that make printers. JSONL outlasts every framework.

```typescript
interface Capsule {
  readonly id:       CapsuleId
  readonly log:      (event: CapsuleEvent) => Effect<void>  // append-only, always
  readonly read:     () => Effect<ReadonlyArray<CapsuleEvent>>
  readonly artifact: (name: string, content: string) => Effect<void>
}

interface CapsuleEvent {
  readonly type: string   // open string — "mission.open", "tool.call", "agent.friction"
  readonly at:   string   // ISO timestamp
  readonly by:   string   // "runtime" | "forge-1" | "plugin:auto"
  readonly data: unknown  // no exhaustive type — readers parse what they understand
}
```

`type` is a string, `data` is `unknown` — not exhaustive unions. Exhaustive unions go
stale. Readers parse what they understand and ignore the rest. Same reason HTTP headers
are strings, not enums.

**Effect:** `ServiceMap.Service` wrapping a `Ref<CapsuleState>` (live) + append to JSONL
on disk (durable). Two projections of the same truth.

Storage: `{workspace}/.capsules/{capsuleId}/` — `capsule.jsonl` + `artifacts/`

**Ship:** *The black box.* Append-only. Survives the crash. You don't edit the ship's
log — you read it afterward and improve the next mission.

---

## 4. Dispatch

The atomic AI invocation unit. Give it a context, a task, and tools — get a result back.
The tool-calling loop lives inside. History management lives inside. The LLM provider is
injected — nothing here is OpenAI-specific, Anthropic-specific, or Copilot-specific.

```typescript
// The only LLM contract the runtime cares about
interface LLMProvider {
  readonly call: (
    messages: ReadonlyArray<Message>,
    tools:    ReadonlyArray<ToolDefinition>,
  ) => Effect<LLMResponse, LLMError>
}

// What you dispatch
interface Blueprint {
  readonly systemPrompt: string                          // any string — JSX, template, hardcoded
  readonly tools:        ReadonlyArray<Tool<unknown, unknown>>
  readonly model?:       string
}

// The act
const dispatch: (
  blueprint: Blueprint,
  task:      string,
) => Effect<string, never, LLMProvider | Capsule>
//                          ↑ injected      ↑ logs dispatch + result automatically
```

`systemPrompt` is `string`. JSX-md, template literals, hardcoded prose, generated from a
database — Dispatch does not care. Swap `LLMProvider` when the next model drops.
Nothing else changes.

**Effect:** `Queue.offer` into an agent fiber's inbox → internal tool-calling loop →
`Deferred.succeed` with the final result. The fiber is forked inside Dispatch; the
caller awaits the Deferred.

**Ship:** *Launch sequence.* Orders given, crew deployed. How the crew thinks is the
model's problem. You wait for the signal.

---

## 5. RuntimeBus

The observable surface of a running mission. Telemetry out, commands in. What makes the
runtime connectable to any interface — CLI today, web tomorrow — without touching the
runtime internals.

```typescript
interface RuntimeBus {
  readonly events:   Queue.Queue<RuntimeEvent>    // runtime → observer
  readonly commands: Queue.Queue<RuntimeCommand>  // observer → runtime
}

type RuntimeEvent =
  | { _tag: "log";    level: string; message: string; ts: number }
  | { _tag: "status"; entity: string; status: string; ts: number }
  | { _tag: "event";  type: string;  data: unknown;  ts: number }  // open escape hatch

type RuntimeCommand =
  | { _tag: "dispatch"; instruction: string }
  | { _tag: "steer";    guidance:    string }
  | { _tag: "stop" }
```

The `event` escape hatch means new event types flow through without versioning or breaking
old consumers.

**Effect:** Two `Queue.unbounded` instances. The interface layer drains `events` and
writes to `commands`. The runtime reads `commands` and writes to `events`. They share
nothing else.

**Ship:** *Subspace comms.* Telemetry streams back to Earth. Occasionally a message
arrives from mission control. The ship operates independently either way.

---

## What collapses if a vastly better model drops tomorrow

| Thing | Why it collapses |
|---|---|
| Skill stacking / prompt injection | 3M context — just describe the project |
| Grunt vs Agent distinction | Persistent history is cheap; distinction meaningless |
| Verification loop (Sentinel) | Model self-verifies reliably |
| Planning phase (Atlas) | Model plans inline in one pass |
| Handoff context structs | Just include relevant capsule events in context |
| Cycle caps | Model doesn't fail that way anymore |

The five primitives above: none of them collapse.

---

## What is not in scope yet

- Fixed agent roster (forge, crusher, sentinel, atlas) — harness built on top of these
- Skill system — Blueprint factory convenience, not a primitive
- MissionRunner phases — scaffolding, not load-bearing
- Workspace isolation — `WorkspaceContext` is just a path for now; isolation slots in later
- Web client / RuntimeServer — deferred until runtime is solid
- Cross-mission coordination
- Context compaction / crash recovery
