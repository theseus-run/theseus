/**
 * DispatchDefaults — pre-composed layer providing Cortex + SatelliteRing + DispatchStore.
 *
 * dispatch() requires LanguageModelGateway | Cortex | SatelliteRing | DispatchStore.
 * Model selection is caller-provided because it varies by runtime.
 *
 * Usage:
 *   // Just need defaults:
 *   Effect.provide(program, Layer.merge(myLmLayer, DispatchDefaults))
 *
 *   // Custom satellites, still default store:
 *   const ring = SatelliteRingLive([tokenBudget(50_000)])
 *   Effect.provide(program, Layer.mergeAll(myLmLayer, NoopCortex, ring, InMemoryDispatchStore))
 */

import { Layer } from "effect";
import type { SatelliteRing } from "../satellite/ring.ts";
import { DefaultSatelliteRing } from "../satellite/ring.ts";
import { type Cortex, NoopCortex } from "./cortex.ts";
import { type DispatchStore, InMemoryDispatchStore } from "./store.ts";

export const DispatchDefaults: Layer.Layer<Cortex | SatelliteRing | DispatchStore> = Layer.mergeAll(
  NoopCortex,
  DefaultSatelliteRing,
  InMemoryDispatchStore,
);
