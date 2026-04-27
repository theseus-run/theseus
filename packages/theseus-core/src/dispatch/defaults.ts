/**
 * DispatchDefaults — pre-composed layer providing SatelliteRing + DispatchStore.
 *
 * dispatch() requires LanguageModelGateway | SatelliteRing | DispatchStore.
 * Model selection is caller-provided because it varies by runtime.
 *
 * Usage:
 *   // Just need defaults:
 *   Effect.provide(program, Layer.merge(myLmLayer, DispatchDefaults))
 *
 *   // Custom satellites, still default store:
 *   const ring = SatelliteRingLive([tokenBudget(50_000)])
 *   Effect.provide(program, Layer.mergeAll(myLmLayer, ring, InMemoryDispatchStore))
 */

import { Layer } from "effect";
import type { SatelliteRing } from "../satellite/ring.ts";
import { DefaultSatelliteRing } from "../satellite/ring.ts";
import { type DispatchStore, InMemoryDispatchStore } from "./store.ts";

export const DispatchDefaults: Layer.Layer<SatelliteRing | DispatchStore> = Layer.mergeAll(
  DefaultSatelliteRing,
  InMemoryDispatchStore,
);
