/**
 * SatelliteRing — ordered dispatch middleware composition.
 *
 * The ring is static configuration. `openScope` creates one live
 * SatelliteScope per dispatch; all satellite state is scoped to that dispatch.
 */

import { Context, Effect, Layer, Ref } from "effect";
import {
  applyAfterCallDecision,
  applyAfterToolDecision,
  applyBeforeCallDecision,
  applyBeforeToolDecision,
  applyCheckpointDecision,
  applyToolErrorDecision,
  isAfterCallDecision,
  isAfterToolDecision,
  isBeforeCallDecision,
  isBeforeToolDecision,
  isCheckpointDecision,
  isTerminalDecision,
  isToolErrorDecision,
} from "./decisions.ts";
import { toolRecovery } from "./tool-recovery.ts";
import type {
  AfterCallDecision,
  AfterToolDecision,
  BeforeCallDecision,
  BeforeToolDecision,
  CheckpointDecision,
  SatelliteAbort,
  SatelliteAny,
  SatelliteContext,
  SatelliteDecision,
  SatelliteRequirements,
  SatelliteScope,
  SatelliteStartContext,
  ToolErrorDecision,
} from "./types.ts";
import { Pass, SatelliteAbort as SatelliteAbortError } from "./types.ts";

export type SatelliteActionCallback = (
  satellite: string,
  phase: string,
  action: string,
) => Effect.Effect<void>;

export interface SatelliteRingService<R = never> {
  readonly openScope: (ctx: SatelliteStartContext) => Effect.Effect<SatelliteScope<R>, never, R>;
}

export class SatelliteRing extends Context.Service<SatelliteRing, SatelliteRingService<unknown>>()(
  "SatelliteRing",
) {}

const phaseName = (phase: string) => phase;

type StateCell = {
  readonly name: string;
  readonly ref: Ref.Ref<unknown>;
  readonly satellite: SatelliteAny;
};

const closeCells = (cells: ReadonlyArray<StateCell>): Effect.Effect<void, never, unknown> =>
  Effect.forEach(
    cells,
    (cell) =>
      Effect.gen(function* () {
        if (!cell.satellite.close) return;
        const state = yield* Ref.get(cell.ref);
        yield* cell.satellite.close(state);
      }),
    { discard: true },
  );

const runHook = <Phase, Decision extends SatelliteDecision>(
  cells: ReadonlyArray<StateCell>,
  phase: Phase,
  phaseLabel: string,
  ctx: SatelliteContext,
  getHook: (
    satellite: SatelliteAny,
  ) =>
    | ((
        phase: Phase,
        ctx: SatelliteContext,
        state: unknown,
      ) => Effect.Effect<
        { readonly decision: Decision; readonly state: unknown },
        SatelliteAbort,
        unknown
      >)
    | undefined,
  isDecision: (decision: SatelliteDecision) => decision is Decision,
  applyDecision: (phase: Phase, decision: Decision) => Phase,
  onAction?: SatelliteActionCallback,
): Effect.Effect<Decision, SatelliteAbort, unknown> =>
  Effect.gen(function* () {
    let currentPhase = phase;
    let lastDecision: Decision = Pass as Decision;

    for (const cell of cells) {
      const hook = getHook(cell.satellite);
      if (!hook) continue;

      const state = yield* Ref.get(cell.ref);
      const { decision, state: nextState } = yield* hook(currentPhase, ctx, state);
      yield* Ref.set(cell.ref, nextState);

      if (!isDecision(decision)) {
        return yield* Effect.fail(
          new SatelliteAbortError({
            satellite: cell.name,
            reason: `Invalid ${phaseLabel} decision: ${decision._tag}`,
          }),
        );
      }

      if (decision._tag === "Pass") continue;
      if (onAction) yield* onAction(cell.name, phaseName(phaseLabel), decision._tag);

      lastDecision = decision;
      if (isTerminalDecision(decision)) break;
      currentPhase = applyDecision(currentPhase, decision);
    }

    return lastDecision;
  });

export const makeSatelliteRing = <const Satellites extends ReadonlyArray<SatelliteAny>>(
  satellites: Satellites,
): Effect.Effect<
  SatelliteRingService<SatelliteRequirements<Satellites[number]>>,
  never,
  SatelliteRequirements<Satellites[number]>
> =>
  Effect.succeed({
    openScope: (startContext) =>
      Effect.gen(function* () {
        const cells = yield* Effect.forEach(satellites, (satellite) =>
          Effect.gen(function* () {
            const state = yield* satellite.open(startContext);
            const ref = yield* Ref.make<unknown>(state);
            return { name: satellite.name, ref, satellite };
          }),
        );

        const scope: SatelliteScope<SatelliteRequirements<Satellites[number]>> = {
          checkpoint: (checkpoint, ctx, onAction) =>
            runHook(
              cells,
              checkpoint,
              `checkpoint:${checkpoint}`,
              ctx,
              (satellite) => satellite.checkpoint,
              isCheckpointDecision,
              applyCheckpointDecision,
              onAction,
            ) as Effect.Effect<
              CheckpointDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          beforeCall: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "beforeCall",
              ctx,
              (satellite) => satellite.beforeCall,
              isBeforeCallDecision,
              applyBeforeCallDecision,
              onAction,
            ) as Effect.Effect<
              BeforeCallDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          afterCall: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "afterCall",
              ctx,
              (satellite) => satellite.afterCall,
              isAfterCallDecision,
              applyAfterCallDecision,
              onAction,
            ) as Effect.Effect<
              AfterCallDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          beforeTool: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "beforeTool",
              ctx,
              (satellite) => satellite.beforeTool,
              isBeforeToolDecision,
              applyBeforeToolDecision,
              onAction,
            ) as Effect.Effect<
              BeforeToolDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          afterTool: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "afterTool",
              ctx,
              (satellite) => satellite.afterTool,
              isAfterToolDecision,
              applyAfterToolDecision,
              onAction,
            ) as Effect.Effect<
              AfterToolDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          toolError: (phase, ctx, onAction) =>
            runHook(
              cells,
              phase,
              "toolError",
              ctx,
              (satellite) => satellite.toolError,
              isToolErrorDecision,
              applyToolErrorDecision,
              onAction,
            ) as Effect.Effect<
              ToolErrorDecision,
              SatelliteAbort,
              SatelliteRequirements<Satellites[number]>
            >,

          close: closeCells(cells) as Effect.Effect<
            void,
            never,
            SatelliteRequirements<Satellites[number]>
          >,
        };

        return scope;
      }) as Effect.Effect<
        SatelliteScope<SatelliteRequirements<Satellites[number]>>,
        never,
        SatelliteRequirements<Satellites[number]>
      >,
  });

export const EmptySatelliteRing = Layer.effect(SatelliteRing)(makeSatelliteRing([]));

/** Default ring — explicit preset with built-in tool error recovery. */
export const DefaultSatelliteRing = Layer.effect(SatelliteRing)(makeSatelliteRing([toolRecovery]));

/** Build exactly the requested ring. Append built-ins explicitly at the call site if needed. */
export const SatelliteRingLive = <const Satellites extends ReadonlyArray<SatelliteAny>>(
  satellites: Satellites,
): Layer.Layer<SatelliteRing, never, SatelliteRequirements<Satellites[number]>> =>
  Layer.effect(SatelliteRing)(makeSatelliteRing(satellites));
