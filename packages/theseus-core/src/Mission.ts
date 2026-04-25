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
 *   const layer = Mission.CurrentMissionLive({ id, goal: "...", criteria: ["..."] })
 */

// ---------------------------------------------------------------------------
// Primary type
// ---------------------------------------------------------------------------

export type { Mission } from "./mission/index.ts";

// ---------------------------------------------------------------------------
// Types (short aliases — namespaced by `Mission.*`)
// ---------------------------------------------------------------------------

export type { MissionRecord } from "./mission/context.ts";
export type { MissionId } from "./mission/id.ts";
export type { MissionConfig } from "./mission/layer.ts";
export type { MissionStatus } from "./mission/status.ts";
export type { MissionCreate } from "./mission/store.ts";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export { CurrentMission } from "./mission/context.ts";
export { InMemoryMissionStore, MissionStore } from "./mission/store.ts";

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export { CurrentMissionLive, makeMissionRecord } from "./mission/layer.ts";

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export { makeMissionId } from "./mission/id.ts";
export { deriveStatus, isValidTransition } from "./mission/status.ts";

// ---------------------------------------------------------------------------
// Errors (keep prefix)
// ---------------------------------------------------------------------------

export { MissionError, MissionErrorInvalidTransition } from "./mission/index.ts";
