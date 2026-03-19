---
name: effect-v4
description: Effect v4 (beta.33) API — curried Layer forms, gen without adapter, Schema in main package, no catchAll. Use whenever writing or reviewing Effect code in this repo.
license: MIT
compatibility: opencode
metadata:
  version: effect@beta.33
  scope: theseus-monorepo
---

# Effect v4 (beta.33) — Theseus Monorepo Rules

This project uses **Effect v4 beta.33** with Bun. The API changed significantly from v3.
All rules below are enforced by GritQL lint plugins (`bunx biome check`).

---

## The Short Rules (memorize these)

| v3 (WRONG — will be flagged) | v4 (correct) |
|---|---|
| `Layer.effect(Tag, effect)` | `Layer.effect(Tag)(effect)` |
| `Layer.succeed(Tag, impl)` | `Layer.succeed(Tag)(impl)` |
| `Layer.scoped(Tag, effect)` | `Layer.scoped(Tag)(effect)` |
| `Effect.gen(function*(_) { _(x) })` | `Effect.gen(function*() { yield* x })` |
| `Effect.catchAll(e, fn)` | `Effect.catchAllCause(e, fn)` |
| `import { Schema } from "@effect/schema"` | `import { Schema } from "effect"` |
| `Queue.unbounded()` | `Queue.unbounded<T>()` — needs explicit type param |
| `Data.TaggedError("E")({...})` | `Data.TaggedError("E")<{...}>` |

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

## Error Handling

`Effect.catchAll` in v4 operates differently. For cause-level error handling use `catchAllCause`. For typed error matching prefer `catchTag` / `catchTags`.

```typescript
// Catch a specific tagged error
const handled = program.pipe(
  Effect.catchTag("NotFoundError", (e) => Effect.succeed(fallback)),
  Effect.catchTag("NetworkError", (e) => Effect.retry(policy))
)

// Catch multiple tags at once
const handled2 = program.pipe(
  Effect.catchTags({
    NotFoundError: (e) => Effect.succeed(fallback),
    NetworkError: (e) => Effect.retry(policy)
  })
)

// Catch all cause (replaces catchAll for cause-level)
const handled3 = program.pipe(
  Effect.catchAllCause((cause) => Effect.logError("Unexpected", cause))
)
```

---

## Tagged Errors

```typescript
// CORRECT v4 form
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  id: string
}> {}

class NetworkError extends Data.TaggedError("NetworkError")<{
  url: string
  statusCode: number
}> {}

// Usage in gen
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* repo.find(id)
    if (!user) yield* Effect.fail(new NotFoundError({ id }))
    return user
  })
```

---

## Schema — In Main Package

`@effect/schema` was merged into `effect` in v4. All schema imports come from `"effect"`.

```typescript
// WRONG (v3 — biome check will flag this import)
import { Schema, JSONSchema } from "@effect/schema"

// CORRECT
import { Schema } from "effect"

// Usage unchanged
const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  age: Schema.Number
})

const decoded = Schema.decodeUnknownSync(User)(raw)
const encoded = Schema.encodeSync(User)(user)
```

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

## Context.Tag — Service Definition Pattern

```typescript
// Standard service definition
class MyService extends Context.Tag("MyService")<
  MyService,
  {
    doThing: (input: string) => Effect.Effect<Result, MyError>
  }
>() {}

// Access in gen
const program = Effect.gen(function* () {
  const svc = yield* MyService
  const result = yield* svc.doThing("hello")
  return result
})
```

---

## Concurrency Primitives

These are unchanged from v3 in terms of API surface:

```typescript
// Race — first wins, loser interrupted
const result = yield* Effect.race(fetchFromCache, fetchFromDatabase)

// Parallel with concurrency limit
const results = yield* Effect.all(items.map(process), { concurrency: 5 })

// Fork + interrupt
const fiber = yield* Effect.fork(longRunning)
yield* Fiber.interrupt(fiber)

// Daemon fiber (outlives parent)
yield* Effect.forkDaemon(backgroundTask)
```

---

## Queue patterns used in this repo

The `Bus` in `theseus-runtime` uses `Queue.unbounded<AgentResponse>()`:

```typescript
// runtime-bus.ts pattern
const queue = yield* Queue.unbounded<AgentResponse>()
yield* Queue.offer(queue, event)
const event = yield* Queue.take(queue)
```

---

## Tracing / Spans

```typescript
// Wrap an effect in a span
const traced = Effect.withSpan("operation-name")(myEffect)

// With attributes
const traced2 = Effect.withSpan("operation-name", {
  attributes: { "agent.id": agentId }
})(myEffect)

// Logging with context
yield* Effect.log("message")
yield* Effect.logError("error message")
```

---

## GritQL Lint Rules Active in This Repo

Running `bunx biome check` enforces these rules via `plugins/`:

- `no-effect-v3-catchall` — flags `Effect.catchAll`
- `no-effect-v3-gen-adapter` — flags `function*(_)` adapter
- `no-effect-v3-layer-constructors` — flags two-arg `Layer.effect/succeed/scoped`
- `no-effect-v3-schema-import` — flags `@effect/schema` imports

Fix all flagged code before committing. The CI runs `biome check` as part of `bun run check`.
