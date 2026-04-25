/**
 * MissionLive — Layer that provisions MissionContext.
 *
 * Requires Capsule in the environment (capsule-first architecture).
 * Creates MissionContext with Ref-backed status, auto-logs lifecycle events.
 *
 * Usage:
 *   const layers = Layer.merge(CapsuleLive("slug"), MissionLive(config))
 *   Effect.provide(program, layers)
 */

import { Clock, Effect, Layer, Ref } from "effect";
import { Capsule } from "../capsule/index.ts";
import { MissionContext } from "./context.ts";
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
// MissionLive — Layer<MissionContext> (requires Capsule)
// ---------------------------------------------------------------------------

/**
 * Create a Mission Layer that provides MissionContext.
 * Requires Capsule already in scope (capsule-first architecture).
 *
 * The Mission starts in "pending" status. Transition to "running"
 * is the approval gate where the human reviews the plan.
 */
export const MissionLive = (config: MissionConfig): Layer.Layer<MissionContext, never, Capsule> =>
  Layer.effect(MissionContext)(
    Effect.gen(function* () {
      const capsule = yield* Capsule;
      const now = yield* Clock.currentTimeMillis;
      const createdAt = new Date(now).toISOString();
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
            yield* capsule.log({
              type: "mission.transition",
              by: "runtime",
              data: { from, to },
            });
          }),
      });
    }),
  );
