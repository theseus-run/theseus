/**
 * MessageBus — broadcast pub/sub for cross-agent events.
 *
 * Uses a single PubSub<BusEnvelope> for all topics.
 * `subscribe(topic)` returns a filtered Stream.
 * `subscribeAll()` returns the raw PubSub.Subscription for all events.
 */
import {
  Effect,
  Layer,
  PubSub,
  Stream,
  type Scope,
  ServiceMap,
} from "effect"

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface BusEnvelope {
  readonly topic: string
  readonly from: string
  readonly payload: unknown
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
      payload: unknown,
    ) => Effect.Effect<void>

    /**
     * Subscribe to a specific topic.
     * Returns a Stream<BusEnvelope> filtered to the given topic.
     */
    subscribe: (topic: string) => Stream.Stream<BusEnvelope>

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
        Stream.fromPubSub(ps).pipe(Stream.filter((e) => e.topic === topic)),

      subscribeAll: () => PubSub.subscribe(ps),
    })
  }),
)
