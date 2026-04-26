---
name: effect-concurrency-lifecycle
description: Use when working with Effect Fiber, Deferred, Scope, Queue, PubSub, Stream, interruption, background loops, graceful shutdown, backpressure, races, or bounded concurrency in Theseus.
---

# Effect Concurrency And Lifecycle

Use this skill for concurrent work, background processes, and resource lifecycles.

## Fiber Ownership

Pick the lifecycle intentionally.

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
- Background work must have an owner: scope, registry, runtime service, or explicit detached lifecycle.

## Bounded Work

- Limit parallelism with `Effect.all(..., { concurrency: n })` or `Effect.forEach(..., { concurrency: n })`.
- Use `"unbounded"` only when the collection and cost are bounded by design.
- `Effect.race` interrupts the losing effect. Make sure both sides are interruption-safe.
- Prefer deterministic shutdown signals over sleeps.

## Queues, PubSub, Streams

Queues encode pressure policy. Choose it deliberately:

- `Queue.bounded<A>(n)` - backpressure; producer waits when full.
- `Queue.sliding<A>(n)` - keep latest, drop oldest.
- `Queue.dropping<A>(n)` - keep current, drop new when full.
- `Queue.unbounded<A>()` - only when memory growth is impossible or bounded elsewhere.

Rules:

- Use explicit type parameters for queues.
- Use `PubSub` when one event must be broadcast to multiple subscribers.
- Bridge queues to streams with `Stream.fromQueue(queue)`.
- End queue-backed streams by offering a terminal event plus `Stream.takeUntil(...)`, or by `Queue.shutdown(queue)` when shutdown semantics are correct.
- Do not leave background consumers without interruption or shutdown.

## Checks

- Who owns this fiber?
- What interrupts it?
- Can producers outrun consumers?
- What happens when the consumer fails?
- Are failures logged, surfaced, or intentionally ignored?
