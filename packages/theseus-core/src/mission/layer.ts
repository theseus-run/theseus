/**
 * CurrentMissionLive — Layer that provisions CurrentMission.
 *
 * Requires CurrentCapsule in the environment (capsule-first architecture).
 * Creates CurrentMission with Ref-backed status, auto-logs lifecycle events.
 *
 * Usage:
 *   const layers = Layer.merge(CurrentCapsuleLive("slug"), CurrentMissionLive(config))
 *   Effect.provide(program, layers)
 */

import { Clock, Effect, Layer, Ref } from "effect";
import { CurrentCapsule } from "../capsule/index.ts";
import { CurrentMission, type MissionRecord } from "./context.ts";
import type { MissionId } from "./id.ts";
import type { Mission } from "./index.ts";
import { MissionErrorInvalidTransition } from "./index.ts";
import type { MissionStatus } from "./status.ts";
import { isValidTransition } from "./status.ts";

// ---------------------------------------------------------------------------
// MissionConfig — what you pass to create a Mission
// ---------------------------------------------------------------------------

export interface MissionConfig {
  readonly id: MissionId;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// CurrentMissionLive — Layer<CurrentMission> (requires CurrentCapsule)
// ---------------------------------------------------------------------------

/**
 * Create a Mission Layer that provides CurrentMission.
 * Requires CurrentCapsule already in scope (capsule-first architecture).
 *
 * The Mission starts in "pending" status. Transition to "running"
 * is the approval gate where the human reviews the plan.
 */
export const makeMissionRecord = (
  config: MissionConfig,
): Effect.Effect<MissionRecord, never, CurrentCapsule> =>
  Effect.gen(function* () {
    const capsule = yield* CurrentCapsule;
    const now = yield* Clock.currentTimeMillis;
    const createdAt = new Date(now).toISOString();
    const statusRef = yield* Ref.make<MissionStatus>("pending");

    // Auto-log mission creation
    yield* capsule.log({
      type: "mission.create",
      by: "runtime",
      data: { id: config.id, goal: config.goal, criteria: config.criteria },
    });

    return {
      mission: Effect.gen(function* () {
        const status = yield* Ref.get(statusRef);
        return {
          id: config.id,
          goal: config.goal,
          criteria: config.criteria,
          status,
          createdAt,
        } satisfies Mission;
      }),

      transition: (to: MissionStatus) =>
        Effect.gen(function* () {
          const from = yield* Ref.get(statusRef);
          if (!isValidTransition(from, to)) {
            return yield* new MissionErrorInvalidTransition({ mission: config.id, from, to });
          }
          yield* Ref.set(statusRef, to);
          yield* capsule.log({
            type: "mission.transition",
            by: "runtime",
            data: { from, to },
          });
        }),
    };
  });

export const CurrentMissionLive = (
  config: MissionConfig,
): Layer.Layer<CurrentMission, never, CurrentCapsule> =>
  Layer.effect(CurrentMission)(makeMissionRecord(config));
