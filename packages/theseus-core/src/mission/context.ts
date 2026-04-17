/**
 * MissionContext — Effect service providing mission identity and lifecycle.
 *
 * The `mission` field reads from a Ref (changes as transitions happen).
 * The `transition` method enforces the state machine.
 *
 * Capsule access is separate — MissionContext provides lifecycle, Capsule provides logging.
 * They compose via the Layer.
 */

import { Context, Effect } from "effect";
import type { Mission } from "./index.ts";
import type { MissionErrorInvalidTransition } from "./index.ts";
import type { MissionStatus } from "./status.ts";

export class MissionContext extends Context.Service<
  MissionContext,
  {
    /** Read the current mission record (status may have changed). */
    readonly mission: Effect.Effect<Mission>;
    /** Transition to a new status. Validates the state machine. */
    readonly transition: (to: MissionStatus) => Effect.Effect<void, MissionErrorInvalidTransition>;
  }
>()("MissionContext") {}
