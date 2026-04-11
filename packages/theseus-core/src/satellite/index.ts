/**
 * Satellite — pipeline middleware for the dispatch loop.
 *
 * Internal barrel. Prefer namespace import:
 *   import * as Satellite from "@theseus.run/core/Satellite"
 */

export type { Action, Phase, Satellite, SatelliteAny, SatelliteContext } from "./types.ts";
export { SatelliteAbort, Pass, TransformMessages, TransformStepResult, ModifyArgs, BlockTool, ReplaceResult, RecoverToolError } from "./types.ts";
export { SatelliteRing, DefaultSatelliteRing, SatelliteRingLive, makeSatelliteRing } from "./ring.ts";
export { toolRecovery } from "./tool-recovery.ts";
export { tokenBudget } from "./token-budget.ts";
export { toolGuard } from "./tool-guard.ts";
