/**
 * icarus — Icarus CLI entry point.
 *
 * Single fiber tree:
 *   1. Allocate RuntimeBus (via InkRuntimeBusLive)
 *   2. Create EventStore (plain JS — React's data source)
 *   3. Render <App> (Ink takes over the terminal)
 *   4. Fork drain fiber — takes UIEvents from bus.events, pushes into store
 *   5. Run Theseus main (blocks forever, reads RuntimeCommands from bus.commands)
 *
 * The onCommand callback uses Effect.runFork directly — Queue.offer on a
 * concrete queue has R=never so no runtime handle is needed.
 */

import { BunRuntime } from "@effect/platform-bun";
import type { RuntimeCommand } from "@theseus.run/runtime";
import { AppLayer, main, RuntimeBus } from "@theseus.run/runtime";
import { Effect, Layer, Queue } from "effect";
import { render } from "ink";
import { App } from "../src/app.tsx";
import { InkRuntimeBusLive } from "../src/bus.ts";
import { EventStore } from "../src/store.ts";

// ---------------------------------------------------------------------------
// Full layer stack — InkRuntimeBusLive provides RuntimeBus to everything else
// AppLayer's internals (TuiLoggerLive) need RuntimeBus, and main needs it too.
// We merge InkRuntimeBusLive into the output so main's RuntimeBus requirement
// is also satisfied.
// ---------------------------------------------------------------------------

const FullLayer = Layer.mergeAll(
  AppLayer.pipe(Layer.provide(InkRuntimeBusLive)),
  InkRuntimeBusLive,
);

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

BunRuntime.runMain(
  Effect.gen(function* () {
    const bus = yield* RuntimeBus;

    // Plain JS store — React renders from this
    const store = new EventStore();

    // React callback: fire-and-forget queue offer.
    // Queue.offer(concreteQueue, value) has R=never — safe to runFork directly.
    const onCommand = (cmd: RuntimeCommand): void => {
      Effect.runFork(Queue.offer(bus.commands, cmd));
    };

    // Render the Ink UI
    render(<App store={store} onCommand={onCommand} />);

    // Drain fiber — takes UIEvents from the bus and dispatches to the store
    yield* Effect.forkDetach(
      Effect.forever(
        Queue.take(bus.events).pipe(
          Effect.andThen((event) =>
            Effect.sync(() => {
              if (event._tag === "StatusChange") {
                store.updateAgent(event.agentId, event.status, event.currentTask);
              } else {
                store.push(event);
              }
            }),
          ),
        ),
      ),
    );

    // Run the Theseus runtime — blocks until Stop command or interrupt
    yield* main;
  }).pipe(Effect.provide(FullLayer)),
);
