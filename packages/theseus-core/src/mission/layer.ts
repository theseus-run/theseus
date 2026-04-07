/**
 * MissionLive — scoped Layer that provisions MissionContext + Capsule.
 *
 * Creates a Mission in "pending" status, provisions an in-memory Capsule,
 * and auto-logs a "mission.create" event. Dispatch/Grunt run inside
 * via Effect.provide — they don't know they're in a Mission.
 *
 * Transitions auto-log "mission.transition" events to the Capsule,
 * making status derivable from the event log (resumability).
 */

import { Effect, Layer, Ref } from "effect";
import { Capsule } from "../capsule/index.ts";
import { InMemoryCapsuleLive } from "../capsule/memory.ts";
import type { MissionId } from "./id.ts";
import type { Mission } from "./index.ts";
import { MissionErrorInvalidTransition } from "./index.ts";
import type { MissionStatus } from "./status.ts";
import { isValidTransition } from "./status.ts";
import { MissionContext } from "./context.ts";

// ---------------------------------------------------------------------------
// MissionConfig — what you pass to create a Mission
// ---------------------------------------------------------------------------

export interface MissionConfig {
  readonly id: MissionId;
  readonly goal: string;
  readonly criteria: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// MissionLive — Layer<MissionContext | Capsule>
// ---------------------------------------------------------------------------

/**
 * Create a Mission Layer that provides MissionContext + Capsule.
 *
 * The Mission starts in "pending" status. The approval gate (pending → running)
 * is the checkpoint where the human reviews the plan.
 */
export const MissionLive = (config: MissionConfig): Layer.Layer<MissionContext | Capsule> => {
  const capsuleLayer = InMemoryCapsuleLive(config.id);

  const contextLayer = Layer.effect(MissionContext)(
    Effect.gen(function* () {
      const capsule = yield* Capsule;
      const createdAt = new Date().toISOString();
      const statusRef = yield* Ref.make<MissionStatus>("pending");

      // Auto-log mission creation
      yield* capsule.log({
        type: "mission.create",
        by: "runtime",
        data: { id: config.id, goal: config.goal, criteria: config.criteria },
      });

      return MissionContext.of({
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
              return yield* Effect.fail(
                new MissionErrorInvalidTransition({ mission: config.id, from, to }),
              );
            }
            yield* Ref.set(statusRef, to);
            // Auto-log transition for derivability
            yield* capsule.log({
              type: "mission.transition",
              by: "runtime",
              data: { from, to },
            });
          }),
      });
    }),
  );

  // Capsule must be provided first (contextLayer depends on it)
  return Layer.merge(capsuleLayer, Layer.provide(contextLayer, capsuleLayer));
};
