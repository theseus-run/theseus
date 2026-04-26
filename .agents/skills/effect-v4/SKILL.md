---
name: effect-v4
description: Use when writing, reviewing, or debugging Effect v4 beta code in Theseus, including Context.Service, Layer composition, typed errors, Schema, Schedule, Queue, Stream, Deferred, Fiber, Scope, logging, tracing, and migration from Effect v3 examples.
---

# Effect v4

Use this skill for Effect mechanics. For Theseus product/domain choices, use the Theseus design skill.

## Operating Model

Effect code is explicit about:

- what succeeds
- what can fail
- what services are required
- what resources must be acquired and released
- what runs concurrently and how it is interrupted

Good Effect code keeps these facts in the type signature until a deliberate boundary handles them.

## Workflow

Effect APIs move. Before using an unfamiliar API:

1. Search current repo usage.
2. Search installed Effect v4 types under `node_modules/.bun/effect@4.0.0-beta.50/node_modules/effect/dist/`.
3. Prefer patterns already used in `packages/theseus-core` and `packages/theseus-server`.
4. Treat web examples as v3 unless verified against local v4 types.

Useful searches:

```bash
rg "Context.Service|Layer.mergeAll|Layer.provideMerge|Effect.catchTag|Effect.forkDetach" packages
rg "export declare const catch|forkDetach|TaggedErrorClass" node_modules/.bun/effect@4.0.0-beta.50/node_modules/effect/dist
```

The repo already has `@effect/language-service` configured in root `tsconfig.json`. Trust its diagnostics when Effect types look strange.

## Type Shape

`Effect.Effect<A, E, R>` means:

- `A` - success value
- `E` - expected typed failure
- `R` - required services/environment

Expected failures belong in `E`. Defects are bugs, thrown exceptions, rejected promise defects, or violated invariants; handle them only at boundaries.

## Core Constructors

Use the constructor that matches the boundary:

```typescript
Effect.succeed(value)        // pure success value
Effect.fail(error)           // expected typed failure
Effect.sync(() => value)     // sync, non-throwing side effect
Effect.try(() => risky())    // sync code that may throw
Effect.promise(() => p)      // promise that cannot usefully map rejection
Effect.tryPromise({          // promise with rejection normalized to typed failure
  try: () => fetchThing(),
  catch: (cause) => new FetchFailed({ cause }),
})
```

Rules:

- Use `Effect.try` / `Effect.tryPromise` at foreign boundaries.
- Normalize foreign exceptions into typed errors as early as possible.
- Do not wrap already-effectful code in `tryPromise`.
- Do not use `Effect.runPromise` as a composition tool.

## Composition

Prefer `Effect.gen` for sequential business logic and pipe combinators for local transformations.

```typescript
const program = Effect.gen(function* () {
  const user = yield* Users.find(userId)
  const account = yield* Accounts.find(user.accountId)
  yield* Audit.log({ type: "account.viewed", userId })
  return account
})
```

Rules:

- Use `Effect.map` for success-value transformation.
- Use `Effect.flatMap` when the next step returns an Effect.
- Use `Effect.tap` for effectful observation without changing the value.
- Use `Effect.all` for independent effects; set `concurrency` when work is unbounded or expensive.
- Use `Effect.partition` when partial success is a valid outcome.
- Use validation mode on collection operations only when the caller needs all failures, not fail-fast behavior.
- Keep `Effect.gen` blocks linear; extract named effects when nesting grows.
- Use `Effect.fn("Name")` for important service methods or runtime operations where tracing and better diagnostic names matter.

## Pattern Matching

Use `Match` for tagged unions or multi-branch domain logic when chained conditionals obscure exhaustiveness.

```typescript
import { Match } from "effect"

const render = Match.type<Event>().pipe(
  Match.tag("Started", (event) => `started ${event.id}`),
  Match.tag("Done", (event) => `done ${event.id}`),
  Match.exhaustive,
)
```

Rules:

- Prefer `Match.tag` / `Match.tags` for `_tag` unions.
- Prefer exhaustive matching when the input union is closed.
- Keep simple two-branch cases as normal conditionals when that is clearer.

## v4 Translation Table

Common v3 or stale examples need translation:

| Stale pattern | Theseus v4 pattern |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Context.Tag` for services | `Context.Service<Service, Shape>()("Name")` |
| uncurried `Layer.effect(Tag, effect)` | `Layer.effect(Tag)(effect)` |
| `ServiceMap.Service` | removed; use `Context.Service` |
| `Schema.TaggedError` | `Schema.TaggedErrorClass` for schema-backed failures |
| bare millisecond numbers for time | `Duration.millis`, `Duration.seconds`, or accepted duration strings when verified |
| `throw` in `Effect.gen` | `return yield* Effect.fail(error)` or `return yield* error` for yieldable errors |

Do not cargo-cult `Effect.Service` unless local v4 types and repo patterns support it for the case at hand. This repo currently uses `Context.Service`.

## Services And Layers

Use services for replaceable dependencies. Keep construction in layers and business methods as effects.

```typescript
import { Context, Effect, Layer } from "effect"

interface UsersService {
  readonly find: (id: UserId) => Effect.Effect<User, UserNotFound>
}

export class Users extends Context.Service<Users, UsersService>()("Users") {}

export const UsersLive = Layer.effect(Users)(
  Effect.gen(function* () {
    const db = yield* Db
    return Users.of({
      find: (id) => db.queryUser(id),
    })
  }),
)
```

Rules:

- Declare service requirements in return types; do not hide them with `any`.
- Compose same-level layers with `Layer.mergeAll`.
- Use `Layer.provideMerge` when wiring dependencies into another layer while preserving provided services.
- Use `Layer.succeed(Service)(implementation)` when the implementation already exists.
- Avoid repeated `Effect.provide` inside hot paths; provide layers at composition boundaries.
- Do not call `Effect.runPromise` or `Effect.runSync` inside services. Run effects at process, test, or script edges.
- For test seams, provide alternate layers instead of conditionals inside production services.

## Error Handling

Use explicit domain errors. Do not collapse distinct failures into a generic error unless crossing a boundary that intentionally hides details.

```typescript
import { Data, Effect } from "effect"

class UserNotFound extends Data.TaggedError("UserNotFound")<{
  readonly userId: string
}> {}

const program = getUser(id).pipe(
  Effect.catchTag("UserNotFound", (error) => Effect.succeed(fallback(error.userId))),
)
```

Rules:

- Use `Data.TaggedError` for plain runtime/domain errors.
- Use `Schema.TaggedErrorClass` when the error must be schema-backed or serialized.
- Use `Effect.catchTag` / `Effect.catchTags` for known tagged failures.
- Use `Effect.catch` for all typed failures only when you deliberately collapse the union.
- Use `Effect.catchCause` when interrupts or defects must be inspected.
- Use `Cause.hasInterruptsOnly(cause)` to distinguish pure interruption from failure.
- Use `Effect.catchDefect` only for defect conversion at a boundary.
- Do not use try/catch inside `Effect.gen` to catch Effect failures; they are not thrown.
- Do not throw expected failures.
- Do not erase error unions with `any`, `unknown`, or generic wrappers.

## Boundary Pattern

At every external boundary, normalize once:

- raw input -> Schema decode -> typed input
- foreign exception -> tagged typed failure
- domain failure -> explicit response or presentation
- defect -> logged/crashed/interrupted according to boundary policy

Examples of boundaries: tool calls, RPC handlers, SQLite calls, filesystem, subprocesses, model provider calls, WebSocket messages.

Inside the domain, keep typed values and typed failures. Do not repeatedly decode or stringify internal data.

## Schema

Use Schema at external boundaries: tool inputs/outputs, RPC, persistence serialization, and config.

```typescript
import { Schema } from "effect"

export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = Schema.Schema.Type<typeof UserId>

export class RpcError extends Schema.TaggedErrorClass<RpcError>()("RpcError", {
  code: Schema.String,
  message: Schema.String,
}) {}
```

Rules:

- Use `Schema.Struct`, `Schema.Union`, `Schema.Literal`, and `Schema.Literals` for wire contracts.
- Use `Schema.optional(...)` for optional fields in this repo.
- Use branded schemas for IDs that cross service/package boundaries.
- Decode unknown inputs with `Schema.decodeUnknownEffect(schema)(raw)` when failures should stay typed.
- Keep schemas near the boundary they protect unless they are shared API contracts.
- Prefer narrow schemas for commands and events. Avoid `Schema.Unknown` except for explicitly open extension points.

## State, Cache, And Shared Mutable Cells

Use the narrowest primitive for shared state:

- `Ref` for small in-memory mutable state inside an Effect runtime.
- `Cache` for memoized effectful lookups with capacity and TTL.
- A service/store when state has domain meaning, persistence, or test seams.

```typescript
import { Cache, Duration, Ref } from "effect"

const counter = yield* Ref.make(0)
yield* Ref.update(counter, (n) => n + 1)

const users = yield* Cache.make({
  capacity: 500,
  timeToLive: Duration.minutes(5),
  lookup: (id: UserId) => Users.fetch(id),
})
```

Rules:

- Do not invent `Effect.cachedWithTTL`; use `Cache.make`.
- Avoid global mutable module state for runtime state.
- Keep cache keys typed and cache invalidation explicit.
- Do not use `Ref` as a hidden dependency; put meaningful shared state behind a service.

## Concurrency And Lifecycle

Pick the fiber lifecycle intentionally.

```typescript
const fiber = yield* Effect.forkDetach({ startImmediately: true })(work)
yield* Fiber.interrupt(fiber)
```

Rules:

- Use `Effect.forkScoped` for work that must stop when the current scope closes.
- Use `Effect.forkIn(effect, scope)` when scope ownership is explicit.
- Use `Effect.forkDetach({ startImmediately: true })(effect)` only when work must outlive the parent fiber.
- Use `Deferred` for cross-fiber result delivery, especially from detached work.
- Use `Effect.onExit` or `Effect.ensuring` for cleanup that must run on success, failure, or interrupt.
- Use `Effect.acquireUseRelease` or scoped layers for real resources.
- Limit parallelism with `Effect.all(..., { concurrency: n })` or `Effect.forEach(..., { concurrency: n })`; use `"unbounded"` only when the collection and cost are bounded by design.
- `Effect.race` interrupts the losing effect. Make sure both sides are interruption-safe.
- Background work must have an owner: scope, registry, runtime service, or explicit detached lifecycle.

## Queues, Streams, And Backpressure

Queues encode pressure policy. Choose it deliberately:

- `Queue.bounded<A>(n)` - backpressure; producer waits when full.
- `Queue.sliding<A>(n)` - keep latest, drop oldest.
- `Queue.dropping<A>(n)` - keep current, drop new when full.
- `Queue.unbounded<A>()` - only when memory growth is impossible or bounded elsewhere.

Rules:

- Use explicit type parameters for queues.
- Bridge queues to streams with `Stream.fromQueue(queue)`.
- End queue-backed streams by offering a terminal event plus `Stream.takeUntil(...)`, or by `Queue.shutdown(queue)` when shutdown semantics are correct.
- Do not leave background consumers without interruption or shutdown.

## Time, Retry, Logging, Tracing

Use Effect primitives instead of ad hoc timers and console output.

```typescript
import { Duration, Effect, Schedule } from "effect"

const guarded = operation.pipe(Effect.timeout(Duration.seconds(5)))

const retryPolicy = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
)
```

Rules:

- Use `Duration` helpers for time units when clarity matters.
- Use `Effect.timeout` around external calls that can hang.
- Use `Schedule` for retry; gate retry by failure shape when only some errors are retryable.
- Public retry fields should usually accept `Schedule.Schedule<unknown>` because schedule input is contravariant.
- Use `Effect.logInfo`, `Effect.logDebug`, `Effect.logError`, and `Effect.annotateLogs`.
- Use `Effect.withSpan("name", { attributes })` around meaningful runtime boundaries.
- Use `Metric.counter`, `Metric.gauge`, or `Metric.histogram` when a value is operationally useful across runs, not just useful for local debugging.
- Avoid `console.log` in Effect runtime code.

## Configuration

- Use Effect `Config` for runtime configuration when code needs typed environment values.
- Do not read `process.env` throughout domain code.
- Read config once through a service/layer, then inject the parsed values.
- Keep secrets redacted in logs and errors.
- Use `ConfigProvider` in tests or alternate runtimes when config should come from a map/object rather than the process environment.
- Use `Redacted` for secrets and unwrap only at the final foreign boundary that needs the raw value.

## Option And Null

- Prefer explicit `Option.match` or `Option.getOrElse`.
- Do not use `Option.getOrThrow` in runtime code.
- Use `Option` internally when absence is expected.
- Convert to `null` / `undefined` only at wire or UI boundaries that require it.

## Testing

- Test Effect code by running the effect at the test boundary with `Effect.runPromise`.
- Prefer test layers over mocks embedded in production services.
- Test typed failures directly; do not assert on stringified defects unless the boundary contract is string output.
- For streams, test completion semantics as well as emitted values.
- For background fibers, test interruption or shutdown behavior.

## Anti-Patterns

Avoid these unless the file is explicitly a process/test/script boundary:

- `Effect.runPromise` or `Effect.runSync` inside services or domain functions.
- `throw` for expected failures inside `Effect.gen`.
- `try/catch` around `yield*` expecting to catch typed Effect failures.
- `console.log` in runtime code.
- direct `process.env` access outside config boundaries.
- `Option.getOrThrow` in runtime code.
- unbounded queues or concurrency without an explicit bounding argument.
- type assertions that erase `E` or `R` (`as any`, `as never`) instead of fixing the layer/error model.

## Theseus Checks

Before finalizing Effect changes:

- Search for matching local patterns.
- Re-read the involved service/layer/error signatures.
- Check whether the code is at a boundary or inside the domain; choose schemas/errors accordingly.
- Run the narrow package test when behavior changed.
- Run `bun run typecheck` after service, layer, schema, or error-channel changes.
- If an API was inferred from external material, verify it in local Effect v4 `.d.ts` files before committing the pattern.
