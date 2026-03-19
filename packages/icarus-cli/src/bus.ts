/**
 * InkRuntimeBusLive — allocates the RuntimeBus queues for icarus-cli.
 *
 * This layer is provided by icarus-cli so that when the runtime is wired
 * in, both sides share the same queue instances.
 *
 * The runtime package also exports RuntimeBusLive as a standalone fallback
 * for headless / test use.
 */

import type { RuntimeCommand, UIEvent } from "@theseus.run/runtime";
import { RuntimeBus } from "@theseus.run/runtime";
import { Effect, Layer, Queue } from "effect";

export const InkRuntimeBusLive: Layer.Layer<RuntimeBus> = Layer.effect(RuntimeBus)(
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<UIEvent>();
    const commands = yield* Queue.unbounded<RuntimeCommand>();
    return RuntimeBus.of({ events, commands });
  }),
);
