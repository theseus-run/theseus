/**
 * TuiLogger — structured log emitter.
 *
 * All log output goes through RuntimeBus as UIEvent{ _tag: "Log" } events.
 * The interface layer (icarus-cli) drains the events queue and renders them.
 *
 * No direct process.stdout.write — the runtime is headless.
 *
 * Layer requirements: RuntimeBus
 */
import { Effect, Layer, Queue, ServiceMap } from "effect";
import type { UIEvent } from "./runtime-bus.ts";
import { RuntimeBus } from "./runtime-bus.ts";

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class TuiLogger extends ServiceMap.Service<
  TuiLogger,
  {
    /** A sends to B: [from] → [to]  content */
    message: (from: string, to: string, content: string) => Effect.Effect<void>;

    /** Runtime info line */
    info: (content: string) => Effect.Effect<void>;

    /** Runtime warning */
    warn: (content: string) => Effect.Effect<void>;

    /** Runtime error */
    error: (content: string) => Effect.Effect<void>;
  }
>()("TuiLogger") {}

// ---------------------------------------------------------------------------
// Live implementation — closes over RuntimeBus at construction time
// ---------------------------------------------------------------------------

export const TuiLoggerLive: Layer.Layer<TuiLogger, never, RuntimeBus> = Layer.effect(TuiLogger)(
  Effect.gen(function* () {
    const bus = yield* RuntimeBus;

    const push = (event: UIEvent): Effect.Effect<void> => Queue.offer(bus.events, event);

    return TuiLogger.of({
      message: (from, to, content) =>
        push({
          _tag: "Log",
          level: "info",
          agent: from,
          message: `→ [${to}]  ${content}`,
          ts: Date.now(),
        }),

      info: (content) =>
        push({ _tag: "Log", level: "info", agent: "theseus", message: content, ts: Date.now() }),

      warn: (content) =>
        push({ _tag: "Log", level: "warn", agent: "theseus", message: content, ts: Date.now() }),

      error: (content) =>
        push({ _tag: "Log", level: "error", agent: "theseus", message: content, ts: Date.now() }),
    });
  }),
);
