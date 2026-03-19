#!/usr/bin/env bun
/**
 * theseus — headless agentic runtime CLI
 *
 * Runs the runtime without an interface layer — useful for piping commands
 * via stdin in scripts or for debugging. In normal use, icarus-cli drives
 * the runtime via RuntimeBus.
 *
 * Usage: echo "fix X" | bun run bin/theseus.ts
 */
import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Queue } from "effect";
import { AppLayer, main, RuntimeBusLive } from "../src/runtime.ts";
import type { UIEvent } from "../src/runtime-bus.ts";
import { RuntimeBus } from "../src/runtime-bus.ts";

// Drain events to stdout so headless mode still produces output
const StdoutDrainLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* RuntimeBus;
    yield* Effect.forkDetach(
      Effect.forever(
        Queue.take(bus.events).pipe(
          Effect.andThen((event: UIEvent) =>
            Effect.sync(() => {
              if (event._tag === "Log") {
                const lvl =
                  event.level === "error" ? "[ERR]" : event.level === "warn" ? "[WRN]" : "[INF]";
                process.stdout.write(`${lvl} [${event.agent}] ${event.message}\n`);
              } else if (event._tag === "TheseusResponse") {
                const sep = "─".repeat(72);
                process.stdout.write(`\n${sep}\ntheseus\n${sep}\n${event.content}\n${sep}\n\n`);
              } else if (event._tag === "AgentResponse") {
                const sep = "─".repeat(72);
                process.stdout.write(
                  `\n${sep}\n${event.agentId} › ${event.taskId}\n${sep}\n${event.content}\n${sep}\n\n`,
                );
              }
            }),
          ),
        ),
      ),
    );
  }),
);

// Pump stdin into RuntimeBus.commands
const StdinPumpLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* RuntimeBus;
    yield* Effect.forkDetach(
      Effect.gen(function* () {
        const reader = Bun.stdin.stream().getReader();
        const decoder = new TextDecoder();
        let leftover = "";
        while (true) {
          const chunk = yield* Effect.tryPromise({
            try: () => reader.read() as Promise<{ done: boolean; value: Uint8Array | undefined }>,
            catch: () => new Error("stdin read failed"),
          }).pipe(
            Effect.catchCause(() => Effect.succeed({ done: true as const, value: undefined })),
          );
          if (chunk.done) break;
          leftover += decoder.decode(chunk.value, { stream: true });
          const lines = leftover.split("\n");
          leftover = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) {
              yield* Queue.offer(bus.commands, { _tag: "Dispatch", instruction: line.trim() });
            }
          }
        }
      }) as Effect.Effect<void, never, never>,
    );
  }),
);

const HeadlessLayer = Layer.mergeAll(
  AppLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        RuntimeBusLive,
        StdoutDrainLive.pipe(Layer.provide(RuntimeBusLive)),
        StdinPumpLive.pipe(Layer.provide(RuntimeBusLive)),
      ),
    ),
  ),
  RuntimeBusLive,
);

BunRuntime.runMain(Effect.provide(main, HeadlessLayer));
