---
name: effect-v4
description: Effect v4 (beta.50) API — curried Layer forms, gen without adapter, Schema in main package, catch (not catchAll), Context.Service (not ServiceMap). Use whenever writing or reviewing Effect code in this repo.
license: MIT
compatibility: opencode
metadata:
  version: effect@beta.50
  scope: theseus-monorepo
---

# Effect v4 (beta.50) — Theseus Monorepo Rules

This project uses **Effect v4 beta.50** with Bun. The API changed significantly from v3 and
continued to drift through beta.33→beta.50 (notably: ServiceMap removed, catchAll renamed,
Schema.TaggedError renamed). All rules below are enforced by GritQL lint plugins (`bunx biome check`).

---

## The Short Rules (memorize these)

| v3 / pre-beta.50 (WRONG — will be flagged) | v4 beta.50 (correct) |
|---|---|
| `Effect.catchAll(fn)` | `Effect.catch(fn)` |
| `Effect.catchAllDefect(fn)` | `Effect.catchDefect(fn)` |
| `Layer.effect(Tag, effect)` | `Layer.effect(Tag)(effect)` |
| `Layer.succeed(Tag, impl)` | `Layer.succeed(Tag)(impl)` |
| `Layer.scoped(Tag, effect)` | `Layer.scoped(Tag)(effect)` |
| `Effect.gen(function*(_) { _(x) })` | `Effect.gen(function*() { yield* x })` |
| `Effect.fork(e)` | `Effect.forkChild(e)` / `forkDetach` / `forkScoped` |
| `import * as ServiceMap from "effect/ServiceMap"` | `import { Context } from "effect"` |
| `class X extends ServiceMap.Service<X, Shape>()("X") {}` | `class X extends Context.Service<X, Shape>()("X") {}` |
| `class E extends Schema.TaggedError("E")<Fields>` | `class E extends Schema.TaggedErrorClass<E>()("E", Fields) {}` |
| `import { Schema } from "@effect/schema"` | `import { Schema } from "effect"` |
| `Cause.isInterruptedOnly(c)` | `Cause.hasInterruptsOnly(c)` |
| `Schema.between(min, max)` | *(removed — document in annotation or validate in Effect)* |
| `Data.TaggedError("E")({...})` | `Data.TaggedError("E")<{...}>` |

`Data.TaggedError` (from `effect/Data`) is still the non-yieldable tagged error class — it's
unchanged. `Schema.TaggedErrorClass` is the new name for the *schema-backed yieldable error*.

---

## Layer Constructors — Curried Form

Every Layer constructor is curried in v4. Always split into two calls.

```typescript
// WRONG (v3 two-arg form — biome check will error)
const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () { ... })
)

// CORRECT (v4 curried)
const DatabaseLive = Layer.effect(Database)(
  Effect.gen(function* () {
    const config = yield* Config
    return {
      query: (sql) => Effect.tryPromise(() => runQuery(sql, config))
    }
  })
)

// WRONG
const DatabaseTest = Layer.succeed(Database, { query: () => Effect.succeed(mock) })

// CORRECT
const DatabaseTest = Layer.succeed(Database)({ query: () => Effect.succeed(mock) })

// Scoped resources
const BrokerLive = Layer.scoped(Broker)(
  Effect.gen(function* () {
    const conn = yield* Effect.acquireRelease(connect(), disconnect)
    return { publish: (msg) => send(conn, msg) }
  })
)
```

---

## Effect.gen — No Adapter

The `_` adapter parameter was removed in v4. Use `yield*` directly.

```typescript
// WRONG (v3 adapter pattern — biome check will error)
const program = Effect.gen(function* (_) {
  const value = _(someEffect)
  return value
})

// CORRECT
const program = Effect.gen(function* () {
  const value = yield* someEffect
  return value
})
```

---

## Error Handling — `catch`, not `catchAll`

`Effect.catchAll` was renamed to `Effect.catch` in beta.50. `catchAllDefect` became
`catchDefect`. For typed error matching prefer `catchTag` / `catchTags`.

```typescript
// All typed errors (replaces catchAll)
const handled = program.pipe(
  Effect.catch((e) => Effect.succeed(fallback))
)

// Catch a specific tagged error
const handled2 = program.pipe(
  Effect.catchTag("NotFoundError", (e) => Effect.succeed(fallback)),
  Effect.catchTag("NetworkError", (e) => Effect.retry(policy))
)

// Catch multiple tags at once
const handled3 = program.pipe(
  Effect.catchTags({
    NotFoundError: (e) => Effect.succeed(fallback),
    NetworkError: (e) => Effect.retry(policy)
  })
)

// Cause-level (includes defects, interrupts)
const handled4 = program.pipe(
  Effect.catchCause((cause) => Effect.logError("Unexpected", cause))
)

// Defect-only (replaces catchAllDefect)
const handled5 = program.pipe(
  Effect.catchDefect((d) => Effect.logError("Bug", d))
)
```

---

## Tagged Errors — Two Flavours

```typescript
// 1) Data.TaggedError — plain yieldable tagged error (unchanged since v3)
import { Data } from "effect"

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  id: string
}> {}

// 2) Schema.TaggedErrorClass — schema-backed yieldable error (NEW name)
import { Schema } from "effect"

class DelegateFailed extends Schema.TaggedErrorClass<DelegateFailed>()(
  "DelegateFailed",
  { reason: Schema.String }
) {}

// Usage (identical for both)
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* repo.find(id)
    if (!user) yield* Effect.fail(new NotFoundError({ id }))
    return user
  })
```

Use `Schema.TaggedErrorClass` when the error needs to ride through a typed channel
(e.g. a Tool's `failure: Schema.Schema<F>` slot), since the class *is* the Schema.

---

## Schema — In Main Package

`@effect/schema` merged into `effect` in v4. All schema imports come from `"effect"`.

```typescript
// WRONG (v3 — biome check will flag this import)
import { Schema, JSONSchema } from "@effect/schema"

// CORRECT
import { Schema } from "effect"

// Usage unchanged
const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  age: Schema.Int,                                  // Schema.Int ∈ Schema.Number
})

const decoded = Schema.decodeUnknownSync(User)(raw)
const encoded = Schema.encodeSync(User)(user)
```

Note: `Schema.between(min, max)` does not exist in beta.50. Either document ranges in
annotations (`Schema.Int.annotate({ description: "..." })`) or validate in Effect after decode.

---

## Services — Context.Service (not ServiceMap)

`effect/ServiceMap` was removed in beta.50. Services are defined via `Context.Service`
class-style from the main `effect` package.

```typescript
// WRONG
import * as ServiceMap from "effect/ServiceMap"
class Capsule extends ServiceMap.Service<Capsule, CapsuleShape>()("Capsule") {}

// CORRECT
import { Context } from "effect"

class Capsule extends Context.Service<Capsule, {
  log: (e: CapsuleEvent) => Effect.Effect<void, CapsuleError>
}>()("Capsule") {}

// Access in gen (unchanged)
const program = Effect.gen(function* () {
  const capsule = yield* Capsule
  yield* capsule.log({...})
})
```

Call-site syntax (`yield* ServiceClass`) is unchanged — only the base-class import/name drifted.

---

## Queue — Explicit Type Parameters

`Queue.unbounded()` requires an explicit type parameter in v4.

```typescript
// WRONG — infers Queue<never>
const q = yield* Queue.unbounded()

// CORRECT
const q = yield* Queue.unbounded<AgentResponse>()
const bounded = yield* Queue.bounded<Message>(100)
```

---

## Concurrency Primitives

`Effect.fork` was removed in v4. Pick the right variant:

```typescript
// Race — first wins, loser interrupted
const result = yield* Effect.race(fetchFromCache, fetchFromDatabase)

// Parallel with concurrency limit
const results = yield* Effect.all(items.map(process), { concurrency: 5 })

// Forking — choose lifecycle:
Effect.forkDetach(effect)    // detached — fire-and-forget
Effect.forkChild(effect)     // supervised by parent fiber
Effect.forkScoped(effect)    // tied to current Scope (adds Scope to R)
Effect.forkIn(effect, scope) // fork in a specific scope

// Interrupt
yield* Fiber.interrupt(fiber)
```

---

## Cause / Exit / Fiber

```typescript
// Cause — checking interrupt (renamed)
Cause.hasInterruptsOnly(cause)  // not Cause.isInterruptedOnly
Cause.hasInterrupts(cause)
Cause.hasFails(cause)
Cause.hasDies(cause)

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
```

---

## Queue → Stream bridge

```typescript
Stream.fromQueue(queue)                          // streams until queue is shut down
  .pipe(Stream.takeUntil(e => e._tag === "Done")) // completes after matching element
Queue.shutdown(queue)                            // terminates any Stream.fromQueue consumer
```

---

## Cross-fiber result communication — use Deferred

Deferred works reliably across forkDetach boundaries; Fiber.await may hang.

```typescript
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

## Tracing / Spans

```typescript
const traced = Effect.withSpan("operation-name")(myEffect)

const traced2 = Effect.withSpan("operation-name", {
  attributes: { "agent.id": agentId }
})(myEffect)

yield* Effect.log("message")
yield* Effect.logError("error message")
```

---

## Schedule — Contravariant Input

`Schedule.Schedule<out Output, in Input = unknown, out Error, out Env>` — the `Input`
parameter is **contravariant**, so typed retry schedules in public APIs should widen the
input slot to `unknown`:

```typescript
// Too narrow — won't accept schedules whose input is a supertype
readonly retry?: Schedule.Schedule<unknown, F>

// Use this in public/exported types
readonly retry?: Schedule.Schedule<unknown>

// At definition site, cast if the schedule's inferred type is narrower
retry: Schedule.recurs(3) as unknown as Schedule.Schedule<unknown>
```

---

## GritQL Lint Rules Active in This Repo

Running `bunx biome check` enforces these rules via `plugins/`:

- `no-effect-v3-catchall` — flags `Effect.catchAll` (→ `Effect.catch`)
- `no-effect-v3-catchall-defect` — flags `Effect.catchAllDefect` (→ `Effect.catchDefect`)
- `no-effect-v3-cause-interrupted` — flags `Cause.isInterruptedOnly` (→ `hasInterruptsOnly`)
- `no-effect-v3-fork` — flags `Effect.fork` (→ `forkDetach/forkChild/forkScoped`)
- `no-effect-v3-gen-adapter` — flags `function*(_)` adapter
- `no-effect-v3-layer-constructors` — flags two-arg `Layer.effect/succeed/scoped`
- `no-effect-v3-schema-import` — flags `@effect/schema` imports
- `no-effect-v3-schema-tagged-error` — flags `Schema.TaggedError` (→ `TaggedErrorClass`)
- `no-effect-v3-service-map` — flags `ServiceMap.Service/Tag` (→ `Context.Service`)
- `no-effect-v3-service-map-import` — flags `effect/ServiceMap` imports

Fix all flagged code before committing. CI runs `biome check` as part of `bun run check`.
