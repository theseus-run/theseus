/**
 * MissionStatus — lifecycle state machine.
 *
 * pending → running  (approval gate: plan reviewed, execution begins)
 * pending → cancelled (user abandons before starting)
 * running → done | failed | cancelled
 * failed → running  (retry)
 * done, cancelled → terminal
 *
 * Status is derivable from Capsule events — the Ref is a cache,
 * the event log is truth (Sisyphus boulder.json pattern).
 */

import { Match } from "effect";
import type { CapsuleEvent } from "../capsule/index.ts";

// ---------------------------------------------------------------------------
// MissionStatus type
// ---------------------------------------------------------------------------

export type MissionStatus = "pending" | "running" | "done" | "failed" | "cancelled";

// ---------------------------------------------------------------------------
// State machine — valid transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<MissionStatus, ReadonlyArray<MissionStatus>> = {
  pending:   ["running", "cancelled"],
  running:   ["done", "failed", "cancelled"],
  failed:    ["running"],  // retry
  done:      [],           // terminal
  cancelled: [],           // terminal
};

/** Check if a transition from → to is valid. */
export const isValidTransition = (from: MissionStatus, to: MissionStatus): boolean =>
  VALID_TRANSITIONS[from]?.includes(to) ?? false;

// ---------------------------------------------------------------------------
// deriveStatus — reconstruct status from Capsule events
//
// Scans for "mission.transition" events, returns last known status.
// Falls back to "pending" if no transition events found.
// ---------------------------------------------------------------------------

/** Derive the current MissionStatus from a Capsule event log. */
export const deriveStatus = (events: ReadonlyArray<CapsuleEvent>): MissionStatus =>
  events.reduce<MissionStatus>(
    (status, event) =>
      Match.value(event.type).pipe(
        Match.when("mission.transition", () => {
          const to = (event.data as { to?: string })?.to;
          return isValidStatus(to) ? to : status;
        }),
        Match.orElse(() => status),
      ),
    "pending",
  );

/** Type guard for MissionStatus. */
const isValidStatus = (s: unknown): s is MissionStatus =>
  typeof s === "string" && ["pending", "running", "done", "failed", "cancelled"].includes(s);
