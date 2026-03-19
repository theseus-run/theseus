/**
 * AgentRegistry — spawn agents as Effect fibers and route point-to-point messages.
 */
import { Cause, Effect, Fiber, HashMap, Layer, Queue, Ref, ServiceMap } from "effect";
import type { AgentId, AgentInfo, BaseAgent } from "./agent.ts";
import { MessageBus } from "./bus.ts";
import { TuiLogger } from "./tui.ts";

// ---------------------------------------------------------------------------
// Internal entry
// ---------------------------------------------------------------------------

interface AgentEntry {
  readonly id: AgentId;
  // biome-ignore lint/suspicious/noExplicitAny: inbox erases message type at registry boundary
  readonly inbox: Queue.Queue<any>;
  readonly fiber: Fiber.Fiber<void, never>;
  readonly messagesHandled: Ref.Ref<number>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentRegistry extends ServiceMap.Service<
  AgentRegistry,
  {
    spawn: <M, S>(agent: BaseAgent<M, S>) => Effect.Effect<void>;
    send: (agentId: AgentId, msg: unknown) => Effect.Effect<boolean>;
    list: () => Effect.Effect<ReadonlyArray<AgentInfo>>;
    stop: (agentId: AgentId) => Effect.Effect<void>;
  }
>()("AgentRegistry") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const AgentRegistryLive = Layer.effect(AgentRegistry)(
  Effect.gen(function* () {
    const tui = yield* TuiLogger;
    const bus = yield* MessageBus;

    const entriesRef = yield* Ref.make(HashMap.empty<AgentId, AgentEntry>());

    const sendToAgent = (agentId: AgentId, msg: unknown): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        const entries = yield* Ref.get(entriesRef);
        const maybeEntry = HashMap.get(entries, agentId);
        if (maybeEntry._tag === "None") return false;
        yield* Queue.offer(maybeEntry.value.inbox, msg);
        yield* Ref.update(maybeEntry.value.messagesHandled, (n) => n + 1);
        return true;
      });

    return AgentRegistry.of({
      spawn: <M, S>(agent: BaseAgent<M, S>) =>
        Effect.gen(function* () {
          const inbox = yield* Queue.unbounded<M>();
          const stateRef = yield* Ref.make<S>(agent.initialState);
          const msgCount = yield* Ref.make(0);

          // Inject runtime context via the public _initRuntime hook
          agent._inbox = inbox;
          agent._stateRef = stateRef;
          agent._initRuntime({
            send: (targetId, msg) =>
              Effect.gen(function* () {
                const ok = yield* sendToAgent(targetId, msg);
                if (!ok) yield* tui.warn(`send failed — no agent "${targetId}" registered`);
              }),
            publish: (topic, msg) => bus.publish(topic, agent.id, msg),
            log: (content) => tui.info(`[${agent.id}] ${content}`),
          });

          // Main loop: take → handle → update state → repeat
          // If the agent defines run(), use that instead (allows custom yield points).
          const loop: Effect.Effect<void, never, never> = agent.run
            ? (agent.run() as Effect.Effect<void, never, never>)
            : (Effect.gen(function* () {
                while (true) {
                  const msg = yield* Queue.take(inbox);
                  const state = yield* Ref.get(stateRef);
                  const next = yield* agent.handle(msg, state);
                  yield* Ref.set(stateRef, next);
                }
              }) as Effect.Effect<void, never, never>);

          // Wrap with catchCause so crashes are logged rather than silently swallowed
          const supervisedLoop = loop.pipe(
            Effect.catchCause((cause) =>
              tui.error(`[${agent.id}] agent crashed: ${Cause.pretty(cause)}`),
            ),
          );
          const fiber = yield* Effect.forkDetach(supervisedLoop);
          agent._fiber = fiber;

          yield* Ref.update(entriesRef, (m) =>
            HashMap.set(m, agent.id, {
              id: agent.id,
              inbox,
              fiber,
              messagesHandled: msgCount,
            }),
          );

          yield* tui.info(`agent "${agent.id}" spawned`);
        }),

      send: sendToAgent,

      list: () =>
        Effect.gen(function* () {
          const entries = yield* Ref.get(entriesRef);
          const infos: AgentInfo[] = [];
          for (const [id, entry] of entries) {
            const handled = yield* Ref.get(entry.messagesHandled);
            infos.push({ id, status: "running", messagesHandled: handled });
          }
          return infos;
        }),

      stop: (agentId) =>
        Effect.gen(function* () {
          const entries = yield* Ref.get(entriesRef);
          const maybeEntry = HashMap.get(entries, agentId);
          if (maybeEntry._tag === "Some") {
            yield* Fiber.interrupt(maybeEntry.value.fiber);
            yield* Ref.update(entriesRef, (m) => HashMap.remove(m, agentId));
            yield* tui.info(`agent "${agentId}" stopped`);
          }
        }),
    });
  }),
);
