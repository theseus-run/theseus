# Theseus Design Skill

You are designing something in the **Theseus** codebase. Apply these principles throughout.

---

## What Theseus is

Mission dispatch system, not a chatbot. Named after the ship in *Blindsight* (Peter Watts).

> "I need X done. Go do it."

You dispatch a goal with done criteria. Crew executes. You await results. You don't talk to the engines.

Stack: **Bun + Effect v4 (beta.50) + TypeScript + Biome**.

---

## The five primitives (the floor)

Everything else is built on these or is scaffolding.

| Primitive | Why it stays |
|---|---|
| **Mission** | Humans always need a job tracker with a goal and done criteria |
| **Tool** | Models always need typed, controlled world access |
| **Capsule** | Humans always need voyage logs — to debug, to improve |
| **Dispatch** | You always need to invoke an AI with context and get a result |
| **RuntimeBus** | You always need to observe a running job and occasionally intervene |

Build primitives before harness. The harness, crew roster, and skill system sit on top.

---

## Design principles

### 1. Irreducibility test

Before adding anything: can you remove it and still have a working mission system?
If yes — it is not a primitive. It is scaffolding. Design scaffolding as optional layers on top,
never as assumptions the primitives are built around.

### 2. Future-proof test

Design as if a 10x better model (3M context, dramatically improved instruction following) drops next month.
What becomes obsolete immediately is scaffolding. What remains is a primitive.

Scaffolding that will thin: verification loops, planning agents, cycle caps, retry logic, Grunt/Agent distinction.

### 3. Effect-first — no sync chokepoints

Every pipeline step that touches the world, validates data, or can fail must be an `Effect`.
No sync `(x: T) => U` in public interfaces where failure is possible or interception is useful.

```typescript
// Wrong — sync chokepoint, can't inject logging or error handling
readonly decode: (raw: unknown) => T

// Right — Effect, composable
readonly decode: (raw: unknown) => Effect<T, SomeError>
```

Why: inject logging, auth checks, rate limiting, metrics at any boundary without touching the core.

### 4. Two-layer design: author-facing vs runtime-facing

Author-facing (ergonomic, what humans write):
- Sync where natural (e.g., `encode: (O) => string`)
- `SchemaAdapter` instead of raw `Effect` for decode/validate
- Context object pre-bound to name so authors don't repeat themselves
- Named `*Def` type

Runtime-facing (all-Effect, what the system uses):
- Every pipeline step is an `Effect`
- Plain data fields for schemas (JSON only, no adapter methods)
- Named `*` type (no suffix)

A `define*` function bridges author → runtime:
```typescript
// Author writes ToolDef, defineTool returns Tool
const defineTool = (def: ToolDef<I, O>): Tool<I, O> => { ... }
```

### 5. Spread composability — plain interface fields only

Runtime interfaces must be plain objects with named function fields.
No class hierarchy. No plugin registry. No middleware stack.

Override any step via spread:
```typescript
const guarded = {
  ...readFile,
  decode: (raw) => readFile.decode(raw).pipe(
    Effect.flatMap(input =>
      input.path.includes(".env")
        ? Effect.fail(new ToolErrorInput({ tool: "readFile", message: "blocked" }))
        : Effect.succeed(input),
    ),
  ),
}
```

This only works because every step is a named field on a plain interface.

### 6. Errors — flat tagged classes, named prefixes

Two flavours, both yieldable:

```typescript
// Data.TaggedError — plain tagged error
class ToolDefect extends Data.TaggedError("ToolDefect")<{
  readonly tool: string
  readonly message: string
  readonly cause?: unknown
}> {}

// Schema.TaggedErrorClass — schema-backed, rides through typed Failure channel
class DelegateFailed extends Schema.TaggedErrorClass<DelegateFailed>()(
  "DelegateFailed",
  { reason: Schema.String }
) {}
```

Rules:
- All errors for a primitive share a naming prefix: `Tool*`, `Capsule*`, `Mission*`
- 3–4 error classes max per primitive, flat — no nested hierarchy
- Tool runtime errors: `ToolInputError` (bad caller input), `ToolOutputError` (bad output shape), `ToolDefect` (tool crashed). Authors define their own *typed failure* `F` via `Schema.TaggedErrorClass` — this is the tool's declared `failure:` channel, absorbed by Presentation (isError: true) at the dispatch layer, not surfaced as a runtime error.
- Defects (bugs) propagate via `Effect.die` — no special error class for them

Catch with `Effect.catchTag("ToolInputError", ...)` — never catch `unknown`.

### 7. Typed failure channel — not an error bag

The new `Tool<I, O, F, R>` declares its author-level failure shape `F` via a schema-backed
tagged error. Authors fail by constructing that error directly — no name pre-binding needed:

```typescript
// Author defines (or imports) a typed failure for this tool
class ToolFailure extends Schema.TaggedErrorClass<ToolFailure>()(
  "ToolFailure", { message: Schema.String }
) {}

// Author writes this:
execute: ({ path }) =>
  Effect.tryPromise({
    try: () => Bun.file(path).text(),
    catch: (e) => new ToolFailure({ message: `cannot read ${path}: ${e}` }),
  })
```

The dispatch layer absorbs `F` into the tool's Presentation (`isError: true`, encoded
failure in `structured`) so the LLM sees it as a structured tool-result, not an exception.
Runtime-level errors (`ToolInputError`, `ToolDefect`) still surface to the caller as errors.

### 8. Strict types for closed sets, strings for genuinely open extension points

Default to strict typing. Union types, branded types, template literals — use them.
Only reach for `string` when the set is **externally extensible** at runtime and you
cannot enumerate values at compile time.

```typescript
// Closed set — union is correct, strictness is a feature
type Mutation = "readonly" | "write"

// Genuinely open — MCPs, plugins, and user code define arbitrary capabilities
// at runtime; you cannot enumerate them. string is the right call here.
readonly capabilities: ReadonlyArray<string>
```

The test: **who controls the set of values?**
- You do, now and forever → union type
- External callers / plugins / MCP servers add values at runtime → `string`

For string fields that have internal structure, use template literal types or branded
strings rather than bare `string`:

```typescript
// Better than bare string — communicates expected shape
type CapabilityId = `${string}.${string}`   // "fs.read", "shell.exec"
type EventType    = `${string}.${string}`   // "mission.open", "tool.call"
```

`CapsuleEvent.type` is `string` because any agent or plugin can emit events with
arbitrary types — readers parse what they understand and ignore the rest.
HTTP headers are strings for the same reason. These are open protocols, not closed enums.

### 9. Ordered enums over boolean flags

When a concept has a natural ordering, use a single ordered type:

```typescript
// Wrong — booleans that aren't independent
readonly canRead: boolean
readonly canWrite: boolean

// Right — one ordered enum
type Mutation = "readonly" | "write"
```

The Tool primitive carries a `meta.mutation: Mutation` field. A "write" tool implicitly
also reads. Runtime derives confirmation policy, retry safety, and audit trail from this
single value. (The old `"destructive"` tier was collapsed — capabilities like `"fs.delete"`
or `"shell.exec"` on the same tool now carry that signal.)

### 10. No vendor lock-in — inject everything that might change

LLM providers, MCP frameworks, skill formats, storage backends — all injected.
Core primitives contain no import from `openai`, `anthropic`, `@modelcontextprotocol/*`.

```typescript
// LLM is injected, not imported
interface LLMProvider {
  readonly call: (messages, tools) => Effect<LLMResponse, LLMError>
}
```

Swap the provider when the next model drops. Nothing else changes.

---

## Effect v4 patterns (beta.50)

```typescript
// Services — class-style Context.Service (NOT ServiceMap.Service — that was removed)
import { Context } from "effect"
class Capsule extends Context.Service<Capsule, CapsuleShape>()("Capsule") {}
Layer.effect(Capsule)(Effect.gen(...))   // curried Layer

// Errors handling — catch, not catchAll
Effect.catch(fn)             // all typed errors (was Effect.catchAll)
Effect.catchTag("Tag", fn)   // specific tag
Effect.catchTags({ Tag: fn, OtherTag: fn })
Effect.catchCause(fn)        // cause-level (includes defects/interrupts)
Effect.catchDefect(fn)       // defect-only (was Effect.catchAllDefect)

// Queues and deferred
Queue.unbounded<T>()         // explicit type param required
Deferred.make<A, E>() / Deferred.await / Deferred.succeed / Deferred.fail / Deferred.failCause

// Retry
Schedule.exponential("200 millis").pipe(Schedule.jittered)
// Public API: widen input slot to unknown (Schedule input is contravariant)
readonly retry?: Schedule.Schedule<unknown>

// Schema
import { Schema } from "effect"
Schema.optional(Schema.String)                  // not Schema.optionalWith
Schema.Int.annotate({ description: "..." })    // Int, not between(0, 1)
class DelegateFailed extends Schema.TaggedErrorClass<DelegateFailed>()(
  "DelegateFailed",
  { reason: Schema.String }
) {}                                             // NEW: TaggedErrorClass, not TaggedError

// Forking fibers — Effect.fork does NOT exist
Effect.forkDetach(effect)    // detached — fire-and-forget
Effect.forkChild(effect)     // supervised by parent fiber
Effect.forkScoped(effect)    // tied to current Scope
Effect.forkIn(effect, scope)

// Cause — checking interrupt (renamed)
Cause.hasInterruptsOnly(cause)
Cause.hasInterrupts(cause)

// Exit matching
Exit.isSuccess(exit) / Exit.isFailure(exit)
Exit.match(exit, { onSuccess: a => ..., onFailure: cause => ... })

// Fiber
Fiber.await(fiber)      // → Effect<Exit<E, A>> — prefer Deferred over this for cross-fiber results
Fiber.join(fiber)       // → Effect<A, E>
Fiber.interrupt(fiber)  // → Effect<Exit<E, A>>

// Lifecycle hooks
Effect.onExit(exit => ...)   // runs on any exit: success, failure, or interrupt
Effect.ensuring(cleanup)     // runs on any exit, ignores cleanup result

// Queue → Stream bridge
Stream.fromQueue(queue)                          // streams until queue is shut down
  .pipe(Stream.takeUntil(e => e._tag === "Done")) // completes after matching element
Queue.shutdown(queue)                            // terminates any Stream.fromQueue consumer

// Cross-fiber result communication — use Deferred, not Fiber.await
// Deferred works reliably across forkDetach boundaries; Fiber.await may hang
const d = yield* Deferred.make<A, E>()
yield* Effect.forkDetach(
  work.pipe(
    Effect.onExit(exit => Exit.match(exit, {
      onSuccess: a  => Deferred.succeed(d, a),
      onFailure: c  => Cause.hasInterruptsOnly(c)
                       ? Deferred.fail(d, new MyError(...))
                       : Deferred.failCause(d, c),
    }))
  )
)
const result = yield* Deferred.await(d)
```

---

## What to check before finalising any design

- [ ] Does it pass the irreducibility test? Remove it — does the system still work?
- [ ] Does it pass the future-proof test? What breaks when the next model is 10x better?
- [ ] Are all pipeline steps that can fail or be intercepted returning `Effect`?
- [ ] Is there a `*Def` (author-facing) and `*` (runtime-facing) split if authors need ergonomics?
- [ ] Is there a `define*` bridging function?
- [ ] Are errors flat tagged classes with a shared naming prefix?
- [ ] Can any step be overridden via spread without subclassing?
- [ ] Are extension points `string` not union types?
- [ ] Is anything vendor-specific? If yes, is it behind an interface?
- [ ] Are ordered concepts modelled as ordered enums, not boolean flags?
