/**
 * SatelliteRing — composed middleware chain for the dispatch loop.
 *
 * The ring is an Effect service. The dispatch loop calls it at each phase.
 * Individual satellites compose in order — each satellite's output feeds
 * the next. SatelliteAbort short-circuits the chain via Effect error channel.
 *
 * Usage:
 *   const ring = makeSatelliteRing([tokenBudget(50_000), toolGuard(["shell"])])
 *   const layer = Layer.succeed(SatelliteRing, ring)
 *   // provide to dispatch
 */

import { Effect, Layer, Match, Ref } from "effect";
import * as ServiceMap from "effect/ServiceMap";
import type { Action, Phase, SatelliteAny, SatelliteContext } from "./types.ts";
import type { SatelliteAbort } from "./types.ts";
import { toolRecovery } from "./tool-recovery.ts";

// ---------------------------------------------------------------------------
// SatelliteRing — service definition
// ---------------------------------------------------------------------------

export class SatelliteRing extends ServiceMap.Service<
  SatelliteRing,
  {
    /** Run all satellites for a phase, returning the final action. */
    readonly run: (
      phase: Phase,
      ctx: SatelliteContext,
    ) => Effect.Effect<Action, SatelliteAbort>;
  }
>()("SatelliteRing") {}

// ---------------------------------------------------------------------------
// applyAction — fold an action back into the phase for the next satellite
// ---------------------------------------------------------------------------

const applyActionToPhase = (phase: Phase, action: Action): Phase =>
  Match.value(action).pipe(
    Match.tag("Pass", () => phase),
    Match.tag("TransformMessages", (a) =>
      phase._tag === "BeforeCall" ? { ...phase, messages: a.messages } : phase,
    ),
    Match.tag("TransformStepResult", (a) =>
      phase._tag === "AfterCall" ? { ...phase, stepResult: a.stepResult } : phase,
    ),
    Match.tag("ModifyArgs", (a) =>
      phase._tag === "BeforeTool"
        ? { ...phase, tool: { ...phase.tool, arguments: JSON.stringify(a.args) } }
        : phase,
    ),
    Match.tag("BlockTool", () => phase),
    Match.tag("ReplaceResult", (a) =>
      phase._tag === "AfterTool" ? { ...phase, result: { ...phase.result, content: a.content } } : phase,
    ),
    Match.tag("RecoverToolError", () => phase),
    Match.exhaustive,
  );

// ---------------------------------------------------------------------------
// isTerminalAction — actions that short-circuit the chain
// ---------------------------------------------------------------------------

const isTerminalAction = (action: Action): boolean =>
  action._tag === "BlockTool" || action._tag === "RecoverToolError";

// ---------------------------------------------------------------------------
// makeSatelliteRing — compose satellites into a ring
// ---------------------------------------------------------------------------

export const makeSatelliteRing = (
  satellites: ReadonlyArray<SatelliteAny>,
): Effect.Effect<{
  readonly run: (phase: Phase, ctx: SatelliteContext) => Effect.Effect<Action, SatelliteAbort>;
}> =>
  Effect.gen(function* () {
    // Each satellite gets its own Ref for state persistence across iterations
    const stateRefs = yield* Effect.all(
      satellites.map((s) => Ref.make(s.initial)),
    );

    const run = (phase: Phase, ctx: SatelliteContext): Effect.Effect<Action, SatelliteAbort> =>
      Effect.gen(function* () {
        let currentPhase = phase;
        let lastAction: Action = { _tag: "Pass" };

        for (let i = 0; i < satellites.length; i++) {
          const satellite = satellites[i]!;
          const ref = stateRefs[i]!;
          const state = yield* Ref.get(ref);

          const { action, state: nextState } = yield* satellite.handle(
            currentPhase,
            ctx,
            state,
          );

          yield* Ref.set(ref, nextState);

          if (action._tag !== "Pass") {
            lastAction = action;
            if (isTerminalAction(action)) break;
            currentPhase = applyActionToPhase(currentPhase, action);
          }
        }

        return lastAction;
      });

    return { run };
  });

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** Default ring — includes tool error recovery. */
export const DefaultSatelliteRing = Layer.effect(SatelliteRing)(
  makeSatelliteRing([toolRecovery]),
);

/** Build a ring Layer from a list of satellites. */
export const SatelliteRingLive = (
  satellites: ReadonlyArray<SatelliteAny>,
): Layer.Layer<SatelliteRing> =>
  Layer.effect(SatelliteRing)(
    makeSatelliteRing(satellites),
  );
