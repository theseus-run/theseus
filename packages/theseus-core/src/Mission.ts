/**
 * Mission — namespace barrel for `import * as Mission from "@theseus.run/core/Mission"`
 *
 * The unit of work. Without a goal there is nowhere to go. Without completion
 * criteria there is no landing. Everything else is provisioned for a Mission.
 *
 * Usage:
 *   import * as Mission from "@theseus.run/core/Mission"
 *
 *   const id = yield* Mission.makeMissionId("my-mission")
 *   const layer = Mission.MissionLive({ id, goal: "...", criteria: ["..."] })
 */

// ---------------------------------------------------------------------------
// Primary type
// ---------------------------------------------------------------------------

export type { Mission } from "./mission/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Mission.*`)
// ---------------------------------------------------------------------------

export type { MissionId } from "./mission/id.ts";
export type { MissionConfig } from "./mission/layer.ts";
export type { MissionStatus } from "./mission/status.ts";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export { MissionContext } from "./mission/context.ts";

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export { MissionLive } from "./mission/layer.ts";

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export { makeMissionId } from "./mission/id.ts";
export { deriveStatus, isValidTransition } from "./mission/status.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix)
// ---------------------------------------------------------------------------

export { MissionError, MissionErrorInvalidTransition } from "./mission/index.ts";
