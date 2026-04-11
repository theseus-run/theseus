/**
 * Satellite — namespace barrel for `import * as Satellite from "@theseus.run/core/Satellite"`
 *
 * Pipeline middleware for the dispatch loop. Satellites intercept at
 * well-defined phases (BeforeCall, AfterCall, BeforeTool, AfterTool, ToolError)
 * and can transform, block, or abort the pipeline.
 *
 * Usage:
 *   import * as Satellite from "@theseus.run/core/Satellite"
 *
 *   const ring = Satellite.RingLive([myBudget, myGuard])
 *   // provide ring layer to dispatch
 */

// ---------------------------------------------------------------------------
// Primary types
// ---------------------------------------------------------------------------

export type { Satellite, SatelliteAny as Any } from "./satellite/index.ts";
export type { Phase, Action, SatelliteContext as Context } from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Service + Layers
// ---------------------------------------------------------------------------

export { SatelliteRing as Ring } from "./satellite/index.ts";
export { DefaultSatelliteRing as DefaultRing, SatelliteRingLive as RingLive } from "./satellite/index.ts";
export { makeSatelliteRing as makeRing } from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export { SatelliteAbort } from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Built-in satellites
// ---------------------------------------------------------------------------

export { toolRecovery } from "./satellite/index.ts";
