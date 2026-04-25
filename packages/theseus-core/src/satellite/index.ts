/**
 * Satellite — pipeline middleware for the dispatch loop.
 *
 * Internal barrel. Prefer namespace import:
 *   import * as Satellite from "@theseus.run/core/Satellite"
 */

export type { BackgroundSatelliteConfig } from "./background.ts";
export { backgroundSatellite } from "./background.ts";
export type { SatelliteActionCallback } from "./ring.ts";
export {
  DefaultSatelliteRing,
  makeSatelliteRing,
  SatelliteRing,
  SatelliteRingLive,
} from "./ring.ts";
export { tokenBudget } from "./token-budget.ts";
export { toolGuard } from "./tool-guard.ts";
export { toolRecovery } from "./tool-recovery.ts";
export type { Action, Phase, Satellite, SatelliteAny, SatelliteContext } from "./types.ts";
export {
  BlockTool,
  Complete,
  ModifyArgs,
  Pass,
  RecoverToolError,
  ReplaceResult,
  SatelliteAbort,
  TransformMessages,
  TransformStepResult,
} from "./types.ts";
