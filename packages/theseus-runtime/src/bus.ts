/**
 * MessageBus — broadcast pub/sub for cross-agent events.
 *
 * Uses a single PubSub<BusEnvelope> for all topics.
 * `subscribe(topic)` returns a filtered Queue scoped to the caller's Scope.
 * `subscribeAll()` returns the raw PubSub.Subscription for all events.
 */
import {
  Effect,
  Layer,
  PubSub,
  Queue,
  type Scope,
  ServiceMap,
} from "effect"

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface BusEnvelope {
  readonly topic: string
  readonly from: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly payload: any
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class MessageBus extends ServiceMap.Service<
  MessageBus,
  {
    publish: (
      topic: string,
      from: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: any,
    ) => Effect.Effect<void>

    /**
     * Subscribe to a specific topic.
     * Returns a Queue<BusEnvelope> scoped to the caller's Scope — the
     * background filter fiber is cleaned up when the scope closes.
     */
    subscribe: (
      topic: string,
    ) => Effect.Effect<Queue.Dequeue<BusEnvelope>, never, Scope.Scope>

    /**
     * Subscribe to ALL topics (e.g. for a TUI event log).
     * Returns the raw PubSub.Subscription — use PubSub.take(sub) to drain.
     */
    subscribeAll: () => Effect.Effect<
      PubSub.Subscription<BusEnvelope>,
      never,
      Scope.Scope
    >
  }
>()("MessageBus") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const MessageBusLive = Layer.effect(MessageBus)(
  Effect.gen(function* () {
    const ps = yield* PubSub.unbounded<BusEnvelope>()

    return MessageBus.of({
      publish: (topic, from, payload) =>
        PubSub.publish(ps, { topic, from, payload }),

      subscribe: (topic) =>
        Effect.gen(function* () {
          const sub = yield* PubSub.subscribe(ps)
          const filtered = yield* Queue.unbounded<BusEnvelope>()
          yield* Effect.forkScoped(
            Effect.gen(function* () {
              while (true) {
                const env = yield* PubSub.take(sub)
                if (env.topic === topic) {
                  yield* Queue.offer(filtered, env)
                }
              }
            }),
          )
          return filtered as Queue.Dequeue<BusEnvelope>
        }),

      subscribeAll: () => PubSub.subscribe(ps),
    })
  }),
)
