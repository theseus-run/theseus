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
 *   const ring = Satellite.SatelliteRingLive([myBudget, myGuard])
 *   // provide ring layer to dispatch
 */

// ---------------------------------------------------------------------------
// Primary types
// ---------------------------------------------------------------------------

export type {
  Action,
  Phase,
  Satellite,
  SatelliteAny,
  SatelliteContext,
} from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Service + Layers
// ---------------------------------------------------------------------------

export {
  DefaultSatelliteRing,
  makeSatelliteRing,
  SatelliteRing,
  SatelliteRingLive,
} from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Action constructors
// ---------------------------------------------------------------------------

export {
  BlockTool,
  ModifyArgs,
  Pass,
  RecoverToolError,
  ReplaceResult,
  TransformMessages,
  TransformStepResult,
} from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export { SatelliteAbort } from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Built-in satellites
// ---------------------------------------------------------------------------

export { tokenBudget, toolGuard, toolRecovery } from "./satellite/index.ts";
