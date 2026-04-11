/**
 * backgroundSatellite — factory for satellites with internal async work.
 *
 * The satellite stays synchronous from the ring's perspective (called at every
 * phase like any other satellite). Internally it forks a detached fiber that
 * resolves a Deferred when done. Each phase invocation polls the Deferred.
 * When the work completes, the result is turned into an Action.
 *
 * The dispatch loop never blocks — if the work isn't ready, the satellite Passes.
 *
 * Usage:
 *   const compactor = backgroundSatellite({
 *     name: "compactor",
 *     shouldStart: (phase) =>
 *       phase._tag === "AfterTool" && phase.result.content.length > 4000
 *         ? phase.result.content
 *         : null,
 *     work: (content) => compactViaLLM(content),
 *     toAction: (compacted) => ReplaceResult(compacted),
 *   })
 */

import { Deferred, Effect, Option } from "effect";
import type { SatelliteAbort } from "./types.ts";
import type { Phase, SatelliteContext, Action, Satellite } from "./types.ts";
import { Pass } from "./types.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BackgroundSatelliteConfig<I, O> {
  /** Satellite name (for tracing / debugging). */
  readonly name: string;
  /**
   * Inspect the current phase. Return non-null to kick off background work.
   * Only called when no work is already in-flight.
   */
  readonly shouldStart: (
    phase: Phase,
    ctx: SatelliteContext,
  ) => I | null;
  /**
   * The async work. Runs as a forked detached fiber — may take arbitrarily long.
   * Errors are silently dropped (deferred resets to idle).
   */
  readonly work: (input: I) => Effect.Effect<O>;
  /**
   * Turn a completed result into a satellite Action.
   * Called at the first phase point after work completes.
   * Receives the current phase so the action can be context-aware.
   */
  readonly toAction: (result: O, phase: Phase) => Action;
}

// ---------------------------------------------------------------------------
// State — internal to the returned Satellite
// ---------------------------------------------------------------------------

interface BgState<O> {
  readonly deferred: Deferred.Deferred<O> | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const backgroundSatellite = <I, O>(
  config: BackgroundSatelliteConfig<I, O>,
): Satellite<BgState<O>> => ({
  name: config.name,
  initial: { deferred: null },
  handle: (phase: Phase, ctx: SatelliteContext, state: BgState<O>): Effect.Effect<
    { readonly action: Action; readonly state: BgState<O> },
    SatelliteAbort
  > =>
    Effect.gen(function* () {
      // 1. Poll: did previous work complete?
      if (state.deferred !== null) {
        const poll = yield* Deferred.poll(state.deferred);
        if (Option.isSome(poll)) {
          // poll.value is an Effect<O, E> — run it to get the result
          const result = yield* poll.value.pipe(
            Effect.map((value) => ({
              action: config.toAction(value, phase),
              state: { deferred: null },
            }) as const),
            Effect.sandbox,
            Effect.orElseSucceed(() => ({
              action: Pass,
              state: { deferred: null },
            }) as const),
          );
          return result;
        }
        // Still running — pass through
        return { action: Pass, state } as const;
      }

      // 2. No work in-flight — check whether to start
      const input = config.shouldStart(phase, ctx);
      if (input !== null) {
        const deferred = yield* Deferred.make<O>();
        yield* Effect.forkDetach({ startImmediately: true })(
          Deferred.into(deferred)(config.work(input)),
        );
        return { action: Pass, state: { deferred } } as const;
      }

      return { action: Pass, state } as const;
    }),
});
