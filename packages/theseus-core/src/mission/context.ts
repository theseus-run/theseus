/**
 * CurrentMission — Effect service providing mission identity and lifecycle.
 *
 * The `mission` field reads from a Ref (changes as transitions happen).
 * The `transition` method enforces the state machine.
 *
 * CurrentCapsule access is separate — CurrentMission provides lifecycle,
 * CurrentCapsule provides logging.
 * They compose via the Layer.
 */

import { Context, type Effect } from "effect";
import type { Mission, MissionErrorInvalidTransition } from "./index.ts";
import type { MissionStatus } from "./status.ts";

export interface MissionRecord {
  /** Read the current mission record (status may have changed). */
  readonly mission: Effect.Effect<Mission>;
  /** Transition to a new status. Validates the state machine. */
  readonly transition: (to: MissionStatus) => Effect.Effect<void, MissionErrorInvalidTransition>;
}

export class CurrentMission extends Context.Service<CurrentMission, MissionRecord>()(
  "CurrentMission",
) {}
