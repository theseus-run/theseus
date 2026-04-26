/**
 * backgroundSatellite — helper for scoped lazy satellite work.
 *
 * Work starts from a normal hook/checkpoint and does not block dispatch.
 * Later checkpoints can apply the completed result. The fork is scoped to
 * the dispatch-owned SatelliteScope and is interrupted on close.
 */

import { Deferred, Effect, Fiber, Option } from "effect";
import type {
  CheckpointDecision,
  Satellite,
  SatelliteAbort,
  SatelliteCheckpoint,
  SatelliteContext,
} from "./types.ts";
import { Pass, SatelliteAbort as SatelliteAbortError } from "./types.ts";

export interface BackgroundSatelliteConfig<I, O, E = never, R = never> {
  readonly name: string;
  readonly shouldStart: (checkpoint: SatelliteCheckpoint, ctx: SatelliteContext) => I | null;
  readonly work: (input: I) => Effect.Effect<O, E, R>;
  readonly toDecision: (result: O, checkpoint: SatelliteCheckpoint) => CheckpointDecision;
  readonly onFailure?: (
    error: E,
    checkpoint: SatelliteCheckpoint,
  ) => Effect.Effect<CheckpointDecision, SatelliteAbort, R>;
}

interface BgState<O, E> {
  readonly deferred: Deferred.Deferred<O, E> | null;
  readonly fiber: Fiber.Fiber<unknown, unknown> | null;
}

export const backgroundSatellite = <I, O, E = never, R = never>(
  config: BackgroundSatelliteConfig<I, O, E, R>,
): Satellite<BgState<O, E>, R> => ({
  name: config.name,
  open: () => Effect.succeed({ deferred: null, fiber: null }),
  close: (state) =>
    state.fiber === null ? Effect.void : Fiber.interrupt(state.fiber).pipe(Effect.asVoid),
  checkpoint: (
    checkpoint,
    ctx,
    state,
  ): Effect.Effect<
    { readonly decision: CheckpointDecision; readonly state: BgState<O, E> },
    SatelliteAbort,
    R
  > =>
    Effect.gen(function* () {
      if (state.deferred !== null) {
        const poll = yield* Deferred.poll(state.deferred);
        if (Option.isSome(poll)) {
          return yield* poll.value.pipe(
            Effect.map((value) => ({
              decision: config.toDecision(value, checkpoint),
              state: { deferred: null, fiber: null },
            })),
            Effect.catch((error: E) =>
              (config.onFailure
                ? config.onFailure(error, checkpoint)
                : Effect.fail(
                    new SatelliteAbortError({
                      satellite: config.name,
                      reason: `Background work failed: ${String(error)}`,
                    }),
                  )
              ).pipe(
                Effect.map((decision) => ({
                  decision,
                  state: { deferred: null, fiber: null },
                })),
              ),
            ),
            Effect.catchDefect((cause) =>
              Effect.fail(
                new SatelliteAbortError({
                  satellite: config.name,
                  reason: `Background work defect: ${String(cause)}`,
                }),
              ),
            ),
            Effect.mapError((abort: SatelliteAbort) => abort),
          );
        }
        return { decision: Pass, state };
      }

      const input = config.shouldStart(checkpoint, ctx);
      if (input === null) return { decision: Pass, state };

      const deferred = yield* Deferred.make<O, E>();
      const fiber = yield* Deferred.into(deferred)(config.work(input)).pipe(Effect.forkChild);
      return { decision: Pass, state: { deferred, fiber } };
    }),
});
