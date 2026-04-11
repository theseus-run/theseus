/**
 * Satellite — pipeline middleware for the dispatch loop.
 *
 * Internal barrel. Prefer namespace import:
 *   import * as Satellite from "@theseus.run/core/Satellite"
 */

export type { Action, Phase, Satellite, SatelliteAny, SatelliteContext } from "./types.ts";
export { SatelliteAbort } from "./types.ts";
export { SatelliteRing, DefaultSatelliteRing, SatelliteRingLive, makeSatelliteRing } from "./ring.ts";
export { toolRecovery } from "./tool-recovery.ts";
