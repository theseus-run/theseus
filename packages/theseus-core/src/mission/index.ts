/**
 * Mission — the unit of work.
 *
 * Without a goal there is nowhere to go. Without completion criteria
 * there is no landing. Everything else — crew, capsule, workspace —
 * is provisioned for a Mission.
 *
 * Ship metaphor: the vessel. Hull number, flight plan, destination criteria.
 */

import { Data } from "effect";
import type { MissionId } from "./id.ts";
import type { MissionStatus } from "./status.ts";

// ---------------------------------------------------------------------------
// Mission — the type
// ---------------------------------------------------------------------------

export interface Mission {
  readonly id: MissionId;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
  readonly status: MissionStatus;
  readonly createdAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** General mission failure. */
export class MissionError extends Data.TaggedError("MissionError")<{
  readonly mission: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Invalid state transition (e.g. done → running). */
export class MissionErrorInvalidTransition extends Data.TaggedError(
  "MissionErrorInvalidTransition",
)<{
  readonly mission: string;
  readonly from: MissionStatus;
  readonly to: MissionStatus;
}> {}

// Re-exports for convenience
export type { MissionRecord } from "./context.ts";
export { CurrentMission } from "./context.ts";
export type { MissionId } from "./id.ts";
export { makeMissionId } from "./id.ts";
export type { MissionConfig } from "./layer.ts";
export { CurrentMissionLive, makeMissionRecord } from "./layer.ts";
export type { MissionStatus } from "./status.ts";
export { deriveStatus, isValidTransition } from "./status.ts";
export type { MissionCreate } from "./store.ts";
export { InMemoryMissionStore, MissionStore } from "./store.ts";
