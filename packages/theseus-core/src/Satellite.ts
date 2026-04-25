/**
 * Satellite — namespace barrel for `import * as Satellite from "@theseus.run/core/Satellite"`
 *
 * Middleware/observation/policy substrate for the dispatch loop. Satellites
 * intercept at well-defined phases and can transform, block, recover, or abort
 * the pipeline.
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
  AfterCall,
  AfterCallDecision,
  AfterTool,
  AfterToolDecision,
  BeforeCall,
  BeforeCallDecision,
  BeforeTool,
  BeforeToolDecision,
  CheckpointDecision,
  Satellite,
  SatelliteAny,
  SatelliteCheckpoint,
  SatelliteContext,
  SatelliteDecision,
  SatelliteScope,
  SatelliteStartContext,
  ToolError,
  ToolErrorDecision,
} from "./satellite/index.ts";

// ---------------------------------------------------------------------------
// Service + Layers
// ---------------------------------------------------------------------------

export {
  DefaultSatelliteRing,
  EmptySatelliteRing,
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
  ReplaceToolResult,
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
